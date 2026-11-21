/**
 * CREDVAIL H1.2 Security Hardening & Adversarial Test Suite
 * 
 * Verifies:
 * - H12-01: Batch generation creates invitations for all valid recipients.
 * - H12-02: Authorized issuer retrieves batch claim export (JSON and CSV).
 * - H12-03: Cross-tenant access to claim export is denied (403/404).
 * - H12-04: Only token hashes are persisted; plaintext is never stored in DB.
 * - H12-05: Application logs and audit trails contain no plaintext tokens.
 * - H12-06: Claim with correct token and verified account succeeds.
 * - H12-07: Claim with incorrect token is rejected.
 * - H12-08: Claim with expired token is rejected (410).
 * - H12-09: Reusing a consumed token is rejected (410).
 * - H12-10: Simultaneous concurrent redemption attempts: exactly one succeeds.
 * - H12-11: Two accounts redeeming same invitation: exactly one succeeds.
 * - H12-12: Client-supplied recipientEmail in request body cannot bypass session identity.
 * - H12-13: Unverified account attempting claim fails safely (403).
 * - H12-14: Repeated invalid claim attempts are rate limited (429).
 * - H12-15: Forged X-Forwarded-For IP headers cannot bypass claim rate limiting.
 * - H12-16: Public verification lookup contains no internal tenant UUIDs.
 * - H12-17: Public verification lookup exposes no recipient email or private claims.
 * - H12-18: Normal credential listing contains no raw claim tokens.
 * - H12-19: Batch processing failure cleans up export; no tokens remain accessible.
 * - H12-20: Regression: Issued credentials and Merkle proofs remain cryptographically valid.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { BatchProcessingService } from "@/lib/services/batch-processing-service";
import { ClaimInvitationService } from "@/lib/services/claim-invitation-service";
import { ClaimInvitationRepository } from "@/lib/repositories/claim-invitation-repository";
import { CredentialRepository } from "@/lib/repositories/credential-repository";
import { TenantRepository, inMemoryTenantStore } from "@/lib/repositories/tenant-repository";
import { KeyRepository } from "@/lib/repositories/key-repository";
import { BatchRepository } from "@/lib/repositories/batch-repository";
import { TemplateRepository } from "@/lib/repositories/template-repository";
import { WalletService } from "@/lib/wallet/wallet-service";
import { VerificationService } from "@/lib/services/verification-service";
import { VcService } from "@/lib/crypto/vc-service";
import { createSessionToken } from "@/lib/auth/session";
import { POST as claimRoute } from "@/app/api/v1/wallet/claim/route";
import { resetClaimRateLimiter } from "@/lib/services/claim-rate-limiter";
import {
  ClaimRateLimitRepository,
  InMemoryClaimRateLimitRepository,
} from "@/lib/repositories/claim-rate-limit-repository";
import { GET as claimExportRoute } from "@/app/api/v1/tenants/[slug]/batches/[id]/claim-export/route";
import { GET as publicLookupRoute } from "@/app/api/v1/verify/lookup/[id]/route";

describe("CREDVAIL H1.2: Claim Dispatch, Atomic Redemption & Privacy Hardening", () => {
  const tenantSlugA = "tenant-a-h12";
  const tenantSlugB = "tenant-b-h12";
  let tenantAId: string;
  let tenantBId: string;
  let templateId: string;
  let batchId: string;

  const issuerUserIdA = "usr_issuer_tenant_a";
  const issuerEmailA = "admin@tenant-a.edu";
  let issuerSessionA: string;

  const issuerUserIdB = "usr_issuer_tenant_b";
  const issuerEmailB = "admin@tenant-b.edu";
  let issuerSessionB: string;

  const aliceEmail = "alice@student.h12.edu";
  const aliceUserId = "usr_alice_h12";
  let aliceSession: string;

  const bobEmail = "bob@student.h12.edu";
  const bobUserId = "usr_bob_h12";
  let bobSession: string;

  beforeEach(async () => {
    // Reset all stores
    WalletService.resetInMemoryStore();
    CredentialRepository.resetInMemoryStore();
    ClaimInvitationRepository.resetInMemoryStore();
    KeyRepository.resetInMemoryStore();
    BatchRepository.resetInMemoryStore();
    TemplateRepository.resetInMemoryStore();
    BatchProcessingService.resetExportStore();
    ClaimRateLimitRepository.setTestDouble(new InMemoryClaimRateLimitRepository());
    resetClaimRateLimiter();
    inMemoryTenantStore.clear();

    const tenantRepo = new TenantRepository();

    // 1. Setup Tenant A
    const tenantA = await tenantRepo.createTenant({
      slug: tenantSlugA,
      name: "Tenant A University",
      legalEntityName: "Tenant A University",
      websiteUrl: "https://tenant-a.edu",
      didUri: `did:web:credvail.com:tenants:${tenantSlugA}`,
      ownerUserId: issuerUserIdA,
    });
    tenantAId = tenantA.id;
    await KeyRepository.getOrCreateInitialKey(tenantAId, tenantA.didUri);

    issuerSessionA = createSessionToken({
      id: issuerUserIdA,
      email: issuerEmailA,
      fullName: "Admin Tenant A",
      platformRole: "USER",
      memberships: [
        {
          tenantId: tenantAId,
          role: "INSTITUTION_ADMIN",
          tenant: { slug: tenantSlugA, name: "Tenant A University" },
        },
      ],
    });

    // 2. Setup Tenant B
    const tenantB = await tenantRepo.createTenant({
      slug: tenantSlugB,
      name: "Tenant B University",
      legalEntityName: "Tenant B University",
      websiteUrl: "https://tenant-b.edu",
      didUri: `did:web:credvail.com:tenants:${tenantSlugB}`,
      ownerUserId: issuerUserIdB,
    });
    tenantBId = tenantB.id;
    await KeyRepository.getOrCreateInitialKey(tenantBId, tenantB.didUri);

    issuerSessionB = createSessionToken({
      id: issuerUserIdB,
      email: issuerEmailB,
      fullName: "Admin Tenant B",
      platformRole: "USER",
      memberships: [
        {
          tenantId: tenantBId,
          role: "INSTITUTION_ADMIN",
          tenant: { slug: tenantSlugB, name: "Tenant B University" },
        },
      ],
    });

    // 3. Setup Student Sessions (Verified by default for valid claim test cases)
    aliceSession = createSessionToken({
      id: aliceUserId,
      email: aliceEmail,
      fullName: "Alice Student",
      platformRole: "USER",
      emailVerified: true,
    });

    bobSession = createSessionToken({
      id: bobUserId,
      email: bobEmail,
      fullName: "Bob Student",
      platformRole: "USER",
      emailVerified: true,
    });

    // 4. Setup Template and Staged Batch for Tenant A
    const templateRepo = new TemplateRepository();
    const template = await templateRepo.createTemplate({
      tenantId: tenantAId,
      title: "Cybersecurity Certification",
      category: "COURSE_COMPLETION",
      description: "H1.2 Verified Program",
      layoutConfig: {
        pageSize: "A4_LANDSCAPE",
        qrCode: { x: 50, y: 50, size: 80, errorCorrection: "M" },
      } as any,
    });
    templateId = template.id;

    const staged = await BatchRepository.createBatch({
      tenantId: tenantAId,
      templateId,
      stagedRecipients: [
        {
          fullName: "Alice Student",
          email: aliceEmail,
          courseName: "Zero-Trust Architecture",
          certificateNumberPreview: "TENANT-A-2026-000001",
          issueDate: "2026-11-19",
          status: "VALID",
        },
        {
          fullName: "Bob Student",
          email: bobEmail,
          courseName: "Zero-Trust Architecture",
          certificateNumberPreview: "TENANT-A-2026-000002",
          issueDate: "2026-11-19",
          status: "VALID",
        },
      ],
    });
    batchId = staged.id;
  });

  // =========================================================================
  // Workstream 2 & 7: Batch Claim-Token Dispatch (H12-01 to H12-05)
  // =========================================================================

  it("H12-01: generates batch with multiple recipients and produces one invitation per recipient", async () => {
    const sessionPayload = {
      sub: issuerUserIdA,
      email: issuerEmailA,
      fullName: "Admin Tenant A",
      platformRole: "USER" as const,
      tenants: [
        {
          tenantId: tenantAId,
          slug: tenantSlugA,
          name: "Tenant A University",
          role: "INSTITUTION_ADMIN" as const,
        },
      ],
      currentTenantId: tenantAId,
      currentTenantRole: "INSTITUTION_ADMIN" as const,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: "jti_1",
    };

    const result = await BatchProcessingService.processBatch(
      tenantSlugA,
      batchId,
      sessionPayload,
      "https://credvail.com"
    );

    expect(result.status).toBe("GENERATED");
    expect(result.totalProcessed).toBe(2);
    expect(result.credentials.length).toBe(2);
    expect(result.claimLinks?.length).toBe(2);

    for (const cred of result.credentials) {
      expect(cred.claimUrl).toBeDefined();
      expect(cred.claimUrl).toContain("/claim?cert=");
      expect(cred.claimUrl).toContain("#token=");
      expect(cred.claimToken).toBeDefined();
      expect(cred.claimToken?.length).toBe(64); // 32 bytes hex = 64 chars
    }
  });

  it("H12-02: retrieves batch claim export as authorized issuer in JSON and CSV formats", async () => {
    // 1. Process batch
    const sessionPayload = {
      sub: issuerUserIdA,
      email: issuerEmailA,
      fullName: "Admin Tenant A",
      platformRole: "USER" as const,
      tenants: [
        {
          tenantId: tenantAId,
          slug: tenantSlugA,
          name: "Tenant A University",
          role: "INSTITUTION_ADMIN" as const,
        },
      ],
      currentTenantId: tenantAId,
      currentTenantRole: "INSTITUTION_ADMIN" as const,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: "jti_1",
    };

    await BatchProcessingService.processBatch(tenantSlugA, batchId, sessionPayload, "https://credvail.com");

    // 2. Fetch JSON export via API
    const jsonReq = new NextRequest(
      `https://credvail.com/api/v1/tenants/${tenantSlugA}/batches/${batchId}/claim-export`,
      { headers: { Authorization: `Bearer ${issuerSessionA}` } }
    );
    const jsonRes = await claimExportRoute(jsonReq, {
      params: Promise.resolve({ slug: tenantSlugA, id: batchId }),
    });

    expect(jsonRes.status).toBe(200);
    const body = await jsonRes.json();
    expect(body.success).toBe(true);
    expect(body.data.claimLinks.length).toBe(2);
    expect(body.data.claimLinks[0].claimUrl).toContain("#token=");

    // 3. Fetch CSV export via API
    const csvReq = new NextRequest(
      `https://credvail.com/api/v1/tenants/${tenantSlugA}/batches/${batchId}/claim-export?format=csv`,
      { headers: { Authorization: `Bearer ${issuerSessionA}` } }
    );
    const csvRes = await claimExportRoute(csvReq, {
      params: Promise.resolve({ slug: tenantSlugA, id: batchId }),
    });

    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get("Content-Type")).toContain("text/csv");
    expect(csvRes.headers.get("Cache-Control")).toContain("no-store");
    const csvText = await csvRes.text();
    expect(csvText).toContain("Recipient Name,Recipient Email,Certificate Number,Claim URL");
    expect(csvText).toContain("Alice Student");
    expect(csvText).toContain(aliceEmail);
    expect(csvText).toContain("#token=");
  });

  it("H12-03: rejects cross-tenant access to claim export with 403 or 404", async () => {
    // Tenant A processes batch
    const sessionPayload = {
      sub: issuerUserIdA,
      email: issuerEmailA,
      fullName: "Admin Tenant A",
      platformRole: "USER" as const,
      tenants: [
        {
          tenantId: tenantAId,
          slug: tenantSlugA,
          name: "Tenant A University",
          role: "INSTITUTION_ADMIN" as const,
        },
      ],
      currentTenantId: tenantAId,
      currentTenantRole: "INSTITUTION_ADMIN" as const,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: "jti_1",
    };
    await BatchProcessingService.processBatch(tenantSlugA, batchId, sessionPayload, "https://credvail.com");

    // Tenant B attempts to access Tenant A's batch claim export
    const attackReq = new NextRequest(
      `https://credvail.com/api/v1/tenants/${tenantSlugA}/batches/${batchId}/claim-export`,
      { headers: { Authorization: `Bearer ${issuerSessionB}` } }
    );
    const attackRes = await claimExportRoute(attackReq, {
      params: Promise.resolve({ slug: tenantSlugA, id: batchId }),
    });

    expect([401, 403, 404]).toContain(attackRes.status);
    const attackJson = await attackRes.json();
    expect(attackJson.success).toBe(false);
  });

  it("H12-04: confirms persisted invitation records store only token hashes, never plaintext preimages", async () => {
    const invite = await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:test-cred-123",
      certificateNumber: "CERT-HASH-TEST-001",
      recipientEmail: "hash-test@student.edu",
      tenantId: tenantAId,
    });

    const rawToken = invite.rawToken;
    const expectedHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const record = await ClaimInvitationRepository.findByTokenHash(expectedHash);
    expect(record).toBeDefined();
    expect(record?.tokenHash).toBe(expectedHash);

    // Plaintext token must not exist in any database field
    expect((record as any).rawToken).toBeUndefined();
    expect((record as any).claimToken).toBeUndefined();
    expect((record as any).token).toBeUndefined();
  });

  it("H12-05: confirms application logs and audit trails contain zero raw claim tokens", async () => {
    const sessionPayload = {
      sub: issuerUserIdA,
      email: issuerEmailA,
      fullName: "Admin Tenant A",
      platformRole: "USER" as const,
      tenants: [
        {
          tenantId: tenantAId,
          slug: tenantSlugA,
          name: "Tenant A University",
          role: "INSTITUTION_ADMIN" as const,
        },
      ],
      currentTenantId: tenantAId,
      currentTenantRole: "INSTITUTION_ADMIN" as const,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: "jti_1",
    };

    const result = await BatchProcessingService.processBatch(tenantSlugA, batchId, sessionPayload, "https://credvail.com");
    const rawToken = result.credentials[0].claimToken!;

    const tenantRepo = new TenantRepository();
    const auditLogs = await tenantRepo.listAuditLogs(tenantAId);
    const processLog = auditLogs.find((l) => l.action === "BATCH_PROCESSED");

    expect(processLog).toBeDefined();
    const logString = JSON.stringify(processLog);

    expect(logString.includes(rawToken)).toBe(false);
    expect(logString.includes("#token=")).toBe(false);
  });

  // =========================================================================
  // Workstream 3 & 7: Atomic Single-Use Invitation Redemption (H12-06 to H12-13)
  // =========================================================================

  it("H12-06: claims credential successfully with correct token and verified account", async () => {
    const invite = await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:alice-cred-001",
      certificateNumber: "ALICE-CERT-2026",
      recipientEmail: aliceEmail,
      tenantId: tenantAId,
    });

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:alice-cred-001",
      certificateNumber: "ALICE-CERT-2026",
      tenantId: tenantAId,
      batchId: "batch_h12_01",
      recipientName: "Alice Student",
      recipientEmail: aliceEmail,
      leafHash: "0x1111",
      merkleIndex: 0,
      bitstringIndex: 0,
      claimsData: { course_name: "Cryptography" },
      vcPayloadJson: { id: "urn:uuid:alice-cred-001" } as any,
    });

    const req = new NextRequest("https://credvail.com/api/v1/wallet/claim", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aliceSession}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        certificateNumber: "ALICE-CERT-2026",
        claimToken: invite.rawToken,
      }),
    });

    const res = await claimRoute(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.certificateNumber).toBe("ALICE-CERT-2026");
  });

  it("H12-07: rejects claim with incorrect or corrupted token", async () => {
    await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:alice-cred-001",
      certificateNumber: "ALICE-CERT-2026",
      recipientEmail: aliceEmail,
      tenantId: tenantAId,
    });

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:alice-cred-001",
      certificateNumber: "ALICE-CERT-2026",
      tenantId: tenantAId,
      batchId: "batch_h12_01",
      recipientName: "Alice Student",
      recipientEmail: aliceEmail,
      leafHash: "0x1111",
      merkleIndex: 0,
      bitstringIndex: 0,
      claimsData: { course_name: "Cryptography" },
      vcPayloadJson: { id: "urn:uuid:alice-cred-001" } as any,
    });

    const req = new NextRequest("https://credvail.com/api/v1/wallet/claim", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aliceSession}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        certificateNumber: "ALICE-CERT-2026",
        claimToken: "wrong_corrupted_token_0123456789abcdef0123456789abcdef",
      }),
    });

    const res = await claimRoute(req);
    expect([400, 404]).toContain(res.status);
    const json = await res.json();
    expect(json.error).toMatch(/NOT_FOUND|BAD_REQUEST/);
  });

  it("H12-08: rejects claim with expired token (410 Gone)", async () => {
    // Create an expired invitation (ttl = -1 hour)
    const invite = await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:alice-cred-001",
      certificateNumber: "ALICE-CERT-2026",
      recipientEmail: aliceEmail,
      tenantId: tenantAId,
      ttlHours: -1,
    });

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:alice-cred-001",
      certificateNumber: "ALICE-CERT-2026",
      tenantId: tenantAId,
      batchId: "batch_h12_01",
      recipientName: "Alice Student",
      recipientEmail: aliceEmail,
      leafHash: "0x1111",
      merkleIndex: 0,
      bitstringIndex: 0,
      claimsData: { course_name: "Cryptography" },
      vcPayloadJson: { id: "urn:uuid:alice-cred-001" } as any,
    });

    const req = new NextRequest("https://credvail.com/api/v1/wallet/claim", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aliceSession}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        certificateNumber: "ALICE-CERT-2026",
        claimToken: invite.rawToken,
      }),
    });

    const res = await claimRoute(req);
    expect(res.status).toBe(410);
    const json = await res.json();
    expect(json.error).toBe("GONE");
    expect(json.message).toContain("expired");
  });

  it("H12-09: rejects reusing an already-consumed claim token (410 Gone)", async () => {
    const invite = await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:alice-cred-001",
      certificateNumber: "ALICE-CERT-2026",
      recipientEmail: aliceEmail,
      tenantId: tenantAId,
    });

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:alice-cred-001",
      certificateNumber: "ALICE-CERT-2026",
      tenantId: tenantAId,
      batchId: "batch_h12_01",
      recipientName: "Alice Student",
      recipientEmail: aliceEmail,
      leafHash: "0x1111",
      merkleIndex: 0,
      bitstringIndex: 0,
      claimsData: { course_name: "Cryptography" },
      vcPayloadJson: { id: "urn:uuid:alice-cred-001" } as any,
    });

    // First claim succeeds
    const req1 = new NextRequest("https://credvail.com/api/v1/wallet/claim", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aliceSession}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        certificateNumber: "ALICE-CERT-2026",
        claimToken: invite.rawToken,
      }),
    });
    const res1 = await claimRoute(req1);
    expect(res1.status).toBe(200);

    // Second claim must fail with 410 GONE
    const req2 = new NextRequest("https://credvail.com/api/v1/wallet/claim", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aliceSession}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        certificateNumber: "ALICE-CERT-2026",
        claimToken: invite.rawToken,
      }),
    });
    const res2 = await claimRoute(req2);
    expect(res2.status).toBe(410);
    const json2 = await res2.json();
    expect(json2.error).toBe("GONE");
    expect(json2.message).toContain("already been consumed");
  });

  it("H12-10: ensures atomic single-use redemption: exactly one concurrent request succeeds", async () => {
    const invite = await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:concurrent-001",
      certificateNumber: "CONCURRENT-2026",
      recipientEmail: aliceEmail,
      tenantId: tenantAId,
    });

    // Execute 5 concurrent verification & consumption attempts
    const attempts = Array.from({ length: 5 }, () =>
      ClaimInvitationService.verifyAndConsume({
        certificateNumber: "CONCURRENT-2026",
        claimToken: invite.rawToken,
        userEmail: aliceEmail,
        userId: aliceUserId,
        userEmailVerified: true,
      })
        .then((res) => ({ success: true, res }))
        .catch((err) => ({ success: false, err: err.message }))
    );

    const results = await Promise.all(attempts);

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    // Exactly one must succeed
    expect(successes.length).toBe(1);
    // All 4 concurrent runners must be rejected
    expect(failures.length).toBe(4);
    for (const f of failures) {
      expect((f as any).err).toContain("already been consumed");
    }
  });

  it("H12-11: rejects two different accounts claiming the same invitation concurrently", async () => {
    const invite = await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:double-spend-001",
      certificateNumber: "DOUBLE-SPEND-2026",
      recipientEmail: aliceEmail,
      tenantId: tenantAId,
    });

    // Alice (legitimate recipient) and Bob (intruder) attempt simultaneously
    const aliceAttempt = ClaimInvitationService.verifyAndConsume({
      certificateNumber: "DOUBLE-SPEND-2026",
      claimToken: invite.rawToken,
      userEmail: aliceEmail,
      userId: aliceUserId,
      userEmailVerified: true,
    })
      .then(() => "ALICE_SUCCESS")
      .catch((e) => `ALICE_FAIL: ${e.message}`);

    const bobAttempt = ClaimInvitationService.verifyAndConsume({
      certificateNumber: "DOUBLE-SPEND-2026",
      claimToken: invite.rawToken,
      userEmail: bobEmail,
      userId: bobUserId,
      userEmailVerified: true,
    })
      .then(() => "BOB_SUCCESS")
      .catch((e) => `BOB_FAIL: ${e.message}`);

    const [aliceRes, bobRes] = await Promise.all([aliceAttempt, bobAttempt]);

    expect(aliceRes).toBe("ALICE_SUCCESS");
    expect(bobRes).toMatch(/Ownership verification failed|already been consumed/);
  });

  it("H12-12: client-supplied recipientEmail in request body cannot bypass session identity", async () => {
    // Invitation issued to Bob
    const invite = await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:bob-cred-001",
      certificateNumber: "BOB-CERT-2026",
      recipientEmail: bobEmail,
      tenantId: tenantAId,
    });

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:bob-cred-001",
      certificateNumber: "BOB-CERT-2026",
      tenantId: tenantAId,
      batchId: "batch_h12_01",
      recipientName: "Bob Student",
      recipientEmail: bobEmail,
      leafHash: "0x2222",
      merkleIndex: 1,
      bitstringIndex: 1,
      claimsData: { course_name: "Cryptography" },
      vcPayloadJson: { id: "urn:uuid:bob-cred-001" } as any,
    });

    // Alice is signed in, but tries to send { recipientEmail: bobEmail } in body
    const attackReq = new NextRequest("https://credvail.com/api/v1/wallet/claim", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aliceSession}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        certificateNumber: "BOB-CERT-2026",
        claimToken: invite.rawToken,
        recipientEmail: bobEmail,
        userEmail: bobEmail,
      }),
    });

    const res = await claimRoute(attackReq);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("FORBIDDEN");
    expect(json.message).toContain("Ownership verification failed");
  });

  it("H12-13: unverified account attempting recipient-bound claim fails safely with 403", async () => {
    const invite = await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:alice-cred-001",
      certificateNumber: "ALICE-CERT-2026",
      recipientEmail: aliceEmail,
      tenantId: tenantAId,
    });

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:alice-cred-001",
      certificateNumber: "ALICE-CERT-2026",
      tenantId: tenantAId,
      batchId: "batch_h12_01",
      recipientName: "Alice Student",
      recipientEmail: aliceEmail,
      leafHash: "0x1111",
      merkleIndex: 0,
      bitstringIndex: 0,
      claimsData: { course_name: "Cryptography" },
      vcPayloadJson: { id: "urn:uuid:alice-cred-001" } as any,
    });

    // Unverified Alice session
    const unverifiedSession = createSessionToken({
      id: aliceUserId,
      email: aliceEmail,
      fullName: "Alice Student",
      platformRole: "USER",
      emailVerified: false, // Explicitly unverified
    });

    const req = new NextRequest("https://credvail.com/api/v1/wallet/claim", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${unverifiedSession}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        certificateNumber: "ALICE-CERT-2026",
        claimToken: invite.rawToken,
      }),
    });

    const res = await claimRoute(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("FORBIDDEN");
    expect(json.message).toContain("not verified");
  });

  // =========================================================================
  // Workstream 4 & 7: Claim Endpoint Rate Limiting (H12-14 to H12-15)
  // =========================================================================

  it("H12-14: repeated invalid claim attempts trigger 429 Too Many Requests", async () => {
    for (let i = 0; i < 10; i++) {
      const req = new NextRequest("https://credvail.com/api/v1/wallet/claim", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${aliceSession}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          certificateNumber: "NON-EXISTENT",
          claimToken: `token_attempt_${i}`,
        }),
      });
      const res = await claimRoute(req);
      expect([400, 404]).toContain(res.status);
    }

    // 11th attempt must be rate-limited
    const req11 = new NextRequest("https://credvail.com/api/v1/wallet/claim", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aliceSession}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        certificateNumber: "NON-EXISTENT",
        claimToken: "token_attempt_11",
      }),
    });
    const res11 = await claimRoute(req11);
    expect(res11.status).toBe(429);
    expect(res11.headers.get("Retry-After")).toBeDefined();
    const json = await res11.json();
    expect(json.error).toBe("TOO_MANY_REQUESTS");
  });

  it("H12-15: forged X-Forwarded-For headers cannot bypass claim rate limiting", async () => {
    resetClaimRateLimiter();

    // Attacker rotates X-Forwarded-For IP on every request using Alice's session
    for (let i = 0; i < 10; i++) {
      const req = new NextRequest("https://credvail.com/api/v1/wallet/claim", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${aliceSession}`,
          "Content-Type": "application/json",
          "X-Forwarded-For": `198.51.100.${i + 1}`,
          "X-Real-IP": `198.51.100.${i + 1}`,
        },
        body: JSON.stringify({
          certificateNumber: "NON-EXISTENT",
          claimToken: `token_spoof_${i}`,
        }),
      });
      await claimRoute(req);
    }

    // 11th request with yet another forged IP must still be blocked by session-scoped rate limit
    const req11 = new NextRequest("https://credvail.com/api/v1/wallet/claim", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aliceSession}`,
        "Content-Type": "application/json",
        "X-Forwarded-For": "203.0.113.99",
      },
      body: JSON.stringify({
        certificateNumber: "NON-EXISTENT",
        claimToken: "token_spoof_11",
      }),
    });

    const res11 = await claimRoute(req11);
    expect(res11.status).toBe(429);
    const json = await res11.json();
    expect(json.error).toBe("TOO_MANY_REQUESTS");
  });

  // =========================================================================
  // Workstream 5 & 7: Public Verification Metadata Sanitization (H12-16 to H12-18)
  // =========================================================================

  it("H12-16: confirms public verification lookup exposes zero internal tenant UUIDs", async () => {
    const certNumber = "H12-PRIVACY-CERT-001";
    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:privacy-cred-001",
      certificateNumber: certNumber,
      tenantId: tenantAId,
      batchId: "batch_h12_01",
      recipientName: "Alice Student",
      recipientEmail: aliceEmail,
      leafHash: "0x1111",
      merkleIndex: 0,
      bitstringIndex: 0,
      claimsData: { course_name: "Privacy Engineering", ssn_last4: "9876" },
      vcPayloadJson: { id: "urn:uuid:privacy-cred-001" } as any,
    });

    const req = new NextRequest(`https://credvail.com/api/v1/verify/lookup/${certNumber}`);
    const res = await publicLookupRoute(req, { params: Promise.resolve({ id: certNumber }) });

    expect(res.status).toBe(200);
    const serializedResponse = await res.text();

    // The internal database tenant UUID must NOT exist anywhere in the public response JSON
    expect(serializedResponse.includes(tenantAId)).toBe(false);
  });

  it("H12-17: confirms public verification lookup exposes no recipient email or private claims", async () => {
    const certNumber = "H12-PRIVACY-CERT-002";
    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:privacy-cred-002",
      certificateNumber: certNumber,
      tenantId: tenantAId,
      batchId: "batch_h12_01",
      recipientName: "Alice Student",
      recipientEmail: aliceEmail,
      leafHash: "0x1111",
      merkleIndex: 0,
      bitstringIndex: 0,
      claimsData: { course_name: "Privacy Engineering", ssn_last4: "9876", student_id: "ID-12345" },
      vcPayloadJson: { id: "urn:uuid:privacy-cred-002" } as any,
    });

    const req = new NextRequest(`https://credvail.com/api/v1/verify/lookup/${certNumber}`);
    const res = await publicLookupRoute(req, { params: Promise.resolve({ id: certNumber }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    const cred = json.data.credential;

    expect(cred.certificateNumber).toBe(certNumber);
    expect(cred.recipientName).toBe("Alice Student");
    expect(cred.recipientEmail).toBeUndefined();
    expect(cred.claims).toBeUndefined();
    expect(cred.ssn_last4).toBeUndefined();
    expect(cred.student_id).toBeUndefined();
  });

  it("H12-18: confirms normal credential listing contains no raw claim tokens", async () => {
    const certNumber = "H12-CERT-LIST-001";
    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:list-cred-001",
      certificateNumber: certNumber,
      tenantId: tenantAId,
      batchId: "batch_h12_01",
      recipientName: "Alice Student",
      recipientEmail: aliceEmail,
      leafHash: "0x1111",
      merkleIndex: 0,
      bitstringIndex: 0,
      claimsData: { course_name: "Privacy Engineering" },
      vcPayloadJson: { id: "urn:uuid:list-cred-001" } as any,
    });

    const { items } = await CredentialRepository.listCredentials(tenantAId, { limit: 10 });
    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      expect((item as any).rawToken).toBeUndefined();
      expect((item as any).claimToken).toBeUndefined();
      expect((item as any).claimUrl).toBeUndefined();
    }
  });

  // =========================================================================
  // Workstream 6 & 7: Failure Isolation & Issuance Regression (H12-19 to H12-20)
  // =========================================================================

  it("H12-19: batch processing failure cleans up export; no tokens remain accessible", async () => {
    // Stage a batch with a failing recipient
    const brokenBatch = await BatchRepository.createBatch({
      tenantId: tenantAId,
      templateId,
      stagedRecipients: [
        {
          fullName: "Failing Recipient",
          email: "failing@test.edu",
          certificateNumberPreview: "TENANT-A-2026-000099",
          issueDate: "2026-11-19",
          status: "VALID",
        },
      ],
    });

    // Mock createCredential to fail abruptly midway through batch
    const originalCreate = CredentialRepository.createCredential;
    CredentialRepository.createCredential = () => {
      throw new Error("Simulated disk write failure during batch issuance");
    };

    const sessionPayload = {
      sub: issuerUserIdA,
      email: issuerEmailA,
      fullName: "Admin Tenant A",
      platformRole: "USER" as const,
      tenants: [
        {
          tenantId: tenantAId,
          slug: tenantSlugA,
          name: "Tenant A University",
          role: "INSTITUTION_ADMIN" as const,
        },
      ],
      currentTenantId: tenantAId,
      currentTenantRole: "INSTITUTION_ADMIN" as const,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: "jti_1",
    };

    try {
      await expect(
        BatchProcessingService.processBatch(tenantSlugA, brokenBatch.id, sessionPayload, "https://credvail.com")
      ).rejects.toThrow("Simulated disk write failure");

      // Verify that claim export for the failed batch does NOT exist
      await expect(
        BatchProcessingService.getBatchClaimExport(tenantSlugA, brokenBatch.id, sessionPayload)
      ).rejects.toThrow(/not available|expired/);
    } finally {
      CredentialRepository.createCredential = originalCreate;
    }
  });

  it("H12-20: regression: batch-issued credentials and proofs remain cryptographically valid", async () => {
    const sessionPayload = {
      sub: issuerUserIdA,
      email: issuerEmailA,
      fullName: "Admin Tenant A",
      platformRole: "USER" as const,
      tenants: [
        {
          tenantId: tenantAId,
          slug: tenantSlugA,
          name: "Tenant A University",
          role: "INSTITUTION_ADMIN" as const,
        },
      ],
      currentTenantId: tenantAId,
      currentTenantRole: "INSTITUTION_ADMIN" as const,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: "jti_1",
    };

    const result = await BatchProcessingService.processBatch(
      tenantSlugA,
      batchId,
      sessionPayload,
      "https://credvail.com"
    );

    const firstCred = result.credentials[0];
    expect(firstCred.merkleProof).toBeDefined();

    // Verify against public verification engine
    const publicResult = await VerificationService.verifyByPublicId(firstCred.certificateNumber);
    expect(publicResult.isValid).toBe(true);
    expect(publicResult.status).toBe("VALID");
    expect(publicResult.credential.state).toBe("ISSUED");

    const merkleCheck = publicResult.checks.find((c) => c.code === "MERKLE_INCLUSION_PROOF");
    expect(merkleCheck?.passed).toBe(true);

    const sigCheck = publicResult.checks.find((c) => c.code === "ECDSA_P256_SIGNATURE");
    expect(sigCheck?.passed).toBe(true);
  });

  afterAll(() => {
    ClaimRateLimitRepository.resetTestDouble();
  });
});
