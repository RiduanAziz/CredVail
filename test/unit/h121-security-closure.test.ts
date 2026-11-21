/**
 * CREDVAIL H1.2.1 Security Closure & Concurrency Verification Test Suite
 * 
 * Workstream 1: Fail-Closed Verified-Email Enforcement
 * - H121-01: Verified email session permits claim.
 * - H121-02: Missing email verification field (undefined) in session fails closed (403).
 * - H121-03: Null email verification field in session fails closed (403).
 * - H121-04: Explicitly unverified email (false) in session fails closed (403).
 * - H121-05: Forged request-body userEmailVerified: true cannot override unverified session (403).
 * - H121-06: Request-body email substitution cannot bypass authenticated session identity (403).
 * 
 * Workstream 2: Atomic Redemption & Transactional Consistency
 * - H121-07: Downstream credential association failure rolls back entire claim transaction.
 * - H121-08: Five concurrent simultaneous claim requests: exactly one succeeds, four fail.
 * - H121-09: Ten concurrent simultaneous claim requests: exactly one succeeds, nine fail.
 * - H121-10: Two distinct authenticated accounts racing for one invitation: exactly one succeeds.
 * - H121-11: Consumed invitation cannot be consumed again (anti-replay).
 * - H121-12: Expired invitation cannot be consumed (anti-expiration).
 * 
 * Workstream 3: Claim-Export Lifecycle & Authoritative Delivery (Option A)
 * - H121-13: Authoritative batch processing response delivers complete claimLinks in response body.
 * - H121-14: Secondary GET export route enforces 15-minute TTL retention limit.
 * - H121-15: Process restart simulation clears secondary cache (404), while primary delivery remains unaffected.
 * - H121-16: Batch processing failure cleans up export cache; no artifact remains.
 * - H121-17: Cross-tenant access to claim export is strictly forbidden (403/404).
 * 
 * Workstream 4: Claim Rate-Limiter Scoping & Process Boundaries
 * - H121-18: Rate limiter is scoped to session.sub; multiple accounts maintain independent buckets.
 * - H121-19: Process-level reset restores rate-limiter bucket capacity.
 * 
 * Workstream 5: Cryptographic & Privacy Regressions (H1.1 & H1.2)
 * - H121-20: Public verification sanitization exposes zero internal tenant UUIDs or batch IDs.
 * - H121-21: Browser wallet engine generates valid NIST P-256 did:key and signs presentations.
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
import { BrowserWalletEngine } from "@/lib/wallet/browser-wallet";
import { createSessionToken } from "@/lib/auth/session";
import { POST as claimRoute } from "@/app/api/v1/wallet/claim/route";
import { GET as claimExportRoute } from "@/app/api/v1/tenants/[slug]/batches/[id]/claim-export/route";
import { GET as publicLookupRoute } from "@/app/api/v1/verify/lookup/[id]/route";
import { checkClaimRateLimit, resetClaimRateLimiter } from "@/lib/services/claim-rate-limiter";
import {
  ClaimRateLimitRepository,
  InMemoryClaimRateLimitRepository,
} from "@/lib/repositories/claim-rate-limit-repository";

describe("CREDVAIL H1.2.1: Security Closure & Concurrency Verification", () => {
  const tenantSlug = "univ-h121-alpha";
  let tenantId: string;
  let templateId: string;
  const adminUserId = "usr_admin_h121_01";
  const studentEmail = "verified.student@alpha.edu";
  const studentUserId = "usr_student_h121_02";
  let adminSession: string;
  let verifiedStudentSession: string;

  beforeEach(async () => {
    ClaimInvitationRepository.resetInMemoryStore();
    CredentialRepository.resetInMemoryStore();
    WalletService.resetInMemoryStore();
    ClaimRateLimitRepository.setTestDouble(new InMemoryClaimRateLimitRepository());
    resetClaimRateLimiter();
    inMemoryTenantStore.clear();

    const tenantRepo = new TenantRepository();
    const tenant = await tenantRepo.createTenant({
      slug: tenantSlug,
      name: "Alpha University",
      legalEntityName: "Alpha University Higher Education Inc.",
      websiteUrl: "https://alpha.edu",
      didUri: `did:web:credvail.com:tenants:${tenantSlug}`,
      ownerUserId: adminUserId,
    });
    tenantId = tenant.id;
    await KeyRepository.getOrCreateInitialKey(tenantId, tenant.didUri);

    adminSession = createSessionToken({
      id: adminUserId,
      email: "admin@alpha.edu",
      fullName: "Dean Administrator",
      platformRole: "USER",
      emailVerified: true,
      memberships: [
        {
          tenantId,
          role: "INSTITUTION_ADMIN",
          tenant: { slug: tenantSlug, name: "Alpha University" },
        },
      ],
    });

    verifiedStudentSession = createSessionToken({
      id: studentUserId,
      email: studentEmail,
      fullName: "Verified Student",
      platformRole: "USER",
      emailVerified: true,
    });

    const templateRepo = new TemplateRepository();
    const template = await templateRepo.createTemplate({
      tenantId,
      title: "Bachelor of Science in Computer Science",
      category: "COURSE_COMPLETION",
      description: "Official University Degree",
      layoutConfig: {
        pageSize: "A4_LANDSCAPE",
        qrCode: { x: 50, y: 50, size: 80, errorCorrection: "M" },
      } as any,
    });
    templateId = template.id;
  });

  // =========================================================================
  // Workstream 1: Fail-Closed Verified-Email Enforcement (H121-01 to H121-06)
  // =========================================================================

  it("H121-01: verified email session (emailVerified === true) permits claim", async () => {
    const certNumber = "ALPHA-2026-000101";
    const invite = await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:cred-h121-01",
      certificateNumber: certNumber,
      recipientEmail: studentEmail,
      tenantId,
    });

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:cred-h121-01",
      certificateNumber: certNumber,
      tenantId,
      batchId: "batch_h121_01",
      recipientName: "Verified Student",
      recipientEmail: studentEmail,
      leafHash: "0x1111",
      merkleIndex: 0,
      bitstringIndex: 0,
      claimsData: { course_name: "Computer Science" },
      vcPayloadJson: { id: "urn:uuid:cred-h121-01" } as any,
    });

    const req = new NextRequest("https://credvail.com/api/v1/wallet/claim", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${verifiedStudentSession}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        certificateNumber: certNumber,
        claimToken: invite.rawToken,
      }),
    });

    const res = await claimRoute(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.certificateNumber).toBe(certNumber);
  });

  it("H121-02: missing email verification field (undefined) in session fails closed (403)", async () => {
    const certNumber = "ALPHA-2026-000102";
    const invite = await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:cred-h121-02",
      certificateNumber: certNumber,
      recipientEmail: studentEmail,
      tenantId,
    });

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:cred-h121-02",
      certificateNumber: certNumber,
      tenantId,
      batchId: "batch_h121_01",
      recipientName: "Verified Student",
      recipientEmail: studentEmail,
      leafHash: "0x1112",
      merkleIndex: 1,
      bitstringIndex: 1,
      claimsData: { course_name: "Computer Science" },
      vcPayloadJson: { id: "urn:uuid:cred-h121-02" } as any,
    });

    // Session where emailVerified was omitted/undefined
    const sessionWithMissing = createSessionToken({
      id: studentUserId,
      email: studentEmail,
      fullName: "Student Missing Verification",
      platformRole: "USER",
      // emailVerified omitted -> fail-closed to false
    });

    const req = new NextRequest("https://credvail.com/api/v1/wallet/claim", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionWithMissing}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        certificateNumber: certNumber,
        claimToken: invite.rawToken,
      }),
    });

    const res = await claimRoute(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("FORBIDDEN");
    expect(json.message).toContain("not verified");
  });

  it("H121-03: null email verification field in session fails closed (403)", async () => {
    const certNumber = "ALPHA-2026-000103";
    const invite = await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:cred-h121-03",
      certificateNumber: certNumber,
      recipientEmail: studentEmail,
      tenantId,
    });

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:cred-h121-03",
      certificateNumber: certNumber,
      tenantId,
      batchId: "batch_h121_01",
      recipientName: "Verified Student",
      recipientEmail: studentEmail,
      leafHash: "0x1113",
      merkleIndex: 2,
      bitstringIndex: 2,
      claimsData: { course_name: "Computer Science" },
      vcPayloadJson: { id: "urn:uuid:cred-h121-03" } as any,
    });

    // Session where emailVerified was explicitly null
    const sessionWithNull = createSessionToken({
      id: studentUserId,
      email: studentEmail,
      fullName: "Student Null Verification",
      platformRole: "USER",
      emailVerified: null as any,
    });

    const req = new NextRequest("https://credvail.com/api/v1/wallet/claim", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionWithNull}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        certificateNumber: certNumber,
        claimToken: invite.rawToken,
      }),
    });

    const res = await claimRoute(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("FORBIDDEN");
    expect(json.message).toContain("not verified");
  });

  it("H121-04: explicit emailVerified: false in session fails closed (403)", async () => {
    const certNumber = "ALPHA-2026-000104";
    const invite = await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:cred-h121-04",
      certificateNumber: certNumber,
      recipientEmail: studentEmail,
      tenantId,
    });

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:cred-h121-04",
      certificateNumber: certNumber,
      tenantId,
      batchId: "batch_h121_01",
      recipientName: "Verified Student",
      recipientEmail: studentEmail,
      leafHash: "0x1114",
      merkleIndex: 3,
      bitstringIndex: 3,
      claimsData: { course_name: "Computer Science" },
      vcPayloadJson: { id: "urn:uuid:cred-h121-04" } as any,
    });

    const sessionUnverified = createSessionToken({
      id: studentUserId,
      email: studentEmail,
      fullName: "Unverified Student",
      platformRole: "USER",
      emailVerified: false,
    });

    const req = new NextRequest("https://credvail.com/api/v1/wallet/claim", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionUnverified}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        certificateNumber: certNumber,
        claimToken: invite.rawToken,
      }),
    });

    const res = await claimRoute(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("FORBIDDEN");
    expect(json.message).toContain("not verified");
  });

  it("H121-05: forged request-body userEmailVerified: true cannot override unverified session", async () => {
    const certNumber = "ALPHA-2026-000105";
    const invite = await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:cred-h121-05",
      certificateNumber: certNumber,
      recipientEmail: studentEmail,
      tenantId,
    });

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:cred-h121-05",
      certificateNumber: certNumber,
      tenantId,
      batchId: "batch_h121_01",
      recipientName: "Verified Student",
      recipientEmail: studentEmail,
      leafHash: "0x1115",
      merkleIndex: 4,
      bitstringIndex: 4,
      claimsData: { course_name: "Computer Science" },
      vcPayloadJson: { id: "urn:uuid:cred-h121-05" } as any,
    });

    // Unverified session
    const unverifiedSession = createSessionToken({
      id: studentUserId,
      email: studentEmail,
      fullName: "Unverified Student",
      platformRole: "USER",
      emailVerified: false,
    });

    // Attacker crafts JSON body containing userEmailVerified: true and emailVerified: true
    const req = new NextRequest("https://credvail.com/api/v1/wallet/claim", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${unverifiedSession}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        certificateNumber: certNumber,
        claimToken: invite.rawToken,
        userEmailVerified: true,
        emailVerified: true,
      }),
    });

    const res = await claimRoute(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("FORBIDDEN");
    expect(json.message).toContain("not verified");
  });

  it("H121-06: request-body email substitution cannot bypass authenticated session identity", async () => {
    const certNumber = "ALPHA-2026-000106";
    const invite = await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:cred-h121-06",
      certificateNumber: certNumber,
      recipientEmail: studentEmail,
      tenantId,
    });

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:cred-h121-06",
      certificateNumber: certNumber,
      tenantId,
      batchId: "batch_h121_01",
      recipientName: "Verified Student",
      recipientEmail: studentEmail,
      leafHash: "0x1116",
      merkleIndex: 5,
      bitstringIndex: 5,
      claimsData: { course_name: "Computer Science" },
      vcPayloadJson: { id: "urn:uuid:cred-h121-06" } as any,
    });

    // Attacker session with different email
    const attackerSession = createSessionToken({
      id: "usr_attacker_99",
      email: "attacker@evil.corp",
      fullName: "Eve Attacker",
      platformRole: "USER",
      emailVerified: true,
    });

    // Attacker supplies victim's email in request body
    const req = new NextRequest("https://credvail.com/api/v1/wallet/claim", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${attackerSession}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        certificateNumber: certNumber,
        claimToken: invite.rawToken,
        userEmail: studentEmail,
        recipientEmail: studentEmail,
      }),
    });

    const res = await claimRoute(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("FORBIDDEN");
    expect(json.message).toContain("Ownership verification failed");
  });

  // =========================================================================
  // Workstream 2: Atomic Redemption & Transactional Consistency (H121-07 to H121-12)
  // =========================================================================

  it("H121-07: downstream credential association failure rolls back entire claim transaction", async () => {
    const certNumber = "ALPHA-2026-000107";
    const invite = await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:cred-h121-07",
      certificateNumber: certNumber,
      recipientEmail: studentEmail,
      tenantId,
    });

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:cred-h121-07",
      certificateNumber: certNumber,
      tenantId,
      batchId: "batch_h121_01",
      recipientName: "Verified Student",
      recipientEmail: studentEmail,
      leafHash: "0x1117",
      merkleIndex: 6,
      bitstringIndex: 6,
      claimsData: { course_name: "Computer Science" },
      vcPayloadJson: { id: "urn:uuid:cred-h121-07" } as any,
    });

    // 1. Attempt claim with simulated downstream association failure
    await expect(
      WalletService.claimCredential(
        {
          certificateNumber: certNumber,
          claimToken: invite.rawToken,
          recipientEmail: studentEmail,
          userId: studentUserId,
          userEmail: studentEmail,
          userEmailVerified: true,
        },
        studentUserId,
        { simulatePostConsumeFailure: true }
      )
    ).rejects.toThrow(/Simulated downstream credential association failure/i);

    // 2. Verify that the invitation was ROLLED BACK and NOT consumed, and holder vault was NOT modified
    const pendingInv = await ClaimInvitationRepository.findByTokenHash(
      ClaimInvitationService.hashToken(invite.rawToken)
    );
    expect(pendingInv).not.toBeNull();
    expect(pendingInv?.consumedAt).toBeNull();
    expect(pendingInv?.claimedByUserId).toBeNull();
    expect(WalletService.getCredential(certNumber, studentUserId)).toBeNull();

    // 3. Verify that a subsequent normal claim succeeds cleanly using the same token
    const successfulClaim = await WalletService.claimCredential(
      {
        certificateNumber: certNumber,
        claimToken: invite.rawToken,
        recipientEmail: studentEmail,
        userId: studentUserId,
        userEmail: studentEmail,
        userEmailVerified: true,
      },
      studentUserId
    );
    expect(successfulClaim.certificateNumber).toBe(certNumber);
    expect(successfulClaim.claimedByUserId).toBe(studentUserId);
  });

  it("H121-08: five concurrent simultaneous claim requests: exactly one succeeds, four fail", async () => {
    const certNumber = "ALPHA-2026-000108";
    const invite = await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:cred-h121-08",
      certificateNumber: certNumber,
      recipientEmail: studentEmail,
      tenantId,
    });

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:cred-h121-08",
      certificateNumber: certNumber,
      tenantId,
      batchId: "batch_h121_01",
      recipientName: "Verified Student",
      recipientEmail: studentEmail,
      leafHash: "0x1118",
      merkleIndex: 7,
      bitstringIndex: 7,
      claimsData: { course_name: "Computer Science" },
      vcPayloadJson: { id: "urn:uuid:cred-h121-08" } as any,
    });

    const attempts = 5;
    const promises = Array.from({ length: attempts }, () =>
      claimRoute(
        new NextRequest("https://credvail.com/api/v1/wallet/claim", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${verifiedStudentSession}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            certificateNumber: certNumber,
            claimToken: invite.rawToken,
          }),
        })
      )
    );

    const responses = await Promise.all(promises);
    const successCount = responses.filter((r) => r.status === 200).length;
    const failureCount = responses.filter((r) => r.status === 410 || r.status === 400).length;

    expect(successCount).toBe(1);
    expect(failureCount).toBe(attempts - 1);
  });

  it("H121-09: ten concurrent simultaneous claim requests: exactly one succeeds, nine fail", async () => {
    const certNumber = "ALPHA-2026-000109";
    const invite = await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:cred-h121-09",
      certificateNumber: certNumber,
      recipientEmail: studentEmail,
      tenantId,
    });

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:cred-h121-09",
      certificateNumber: certNumber,
      tenantId,
      batchId: "batch_h121_01",
      recipientName: "Verified Student",
      recipientEmail: studentEmail,
      leafHash: "0x1119",
      merkleIndex: 8,
      bitstringIndex: 8,
      claimsData: { course_name: "Computer Science" },
      vcPayloadJson: { id: "urn:uuid:cred-h121-09" } as any,
    });

    const attempts = 10;
    const promises = Array.from({ length: attempts }, () =>
      claimRoute(
        new NextRequest("https://credvail.com/api/v1/wallet/claim", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${verifiedStudentSession}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            certificateNumber: certNumber,
            claimToken: invite.rawToken,
          }),
        })
      )
    );

    const responses = await Promise.all(promises);
    const successCount = responses.filter((r) => r.status === 200).length;
    const failureCount = responses.filter((r) => r.status === 410 || r.status === 400).length;

    expect(successCount).toBe(1);
    expect(failureCount).toBe(attempts - 1);
  });

  it("H121-10: two distinct authenticated accounts racing for one invitation: exactly one succeeds", async () => {
    const certNumber = "ALPHA-2026-000110";
    const invite = await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:cred-h121-10",
      certificateNumber: certNumber,
      recipientEmail: studentEmail,
      tenantId,
    });

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:cred-h121-10",
      certificateNumber: certNumber,
      tenantId,
      batchId: "batch_h121_01",
      recipientName: "Verified Student",
      recipientEmail: studentEmail,
      leafHash: "0x111A",
      merkleIndex: 9,
      bitstringIndex: 9,
      claimsData: { course_name: "Computer Science" },
      vcPayloadJson: { id: "urn:uuid:cred-h121-10" } as any,
    });

    // Session 1: Alice (authorized recipient)
    const aliceReq = claimRoute(
      new NextRequest("https://credvail.com/api/v1/wallet/claim", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${verifiedStudentSession}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          certificateNumber: certNumber,
          claimToken: invite.rawToken,
        }),
      })
    );

    // Session 2: Bob (interloper trying to claim the same invitation)
    const bobSession = createSessionToken({
      id: "usr_bob_h121",
      email: "bob@alpha.edu",
      fullName: "Bob Interloper",
      platformRole: "USER",
      emailVerified: true,
    });

    const bobReq = claimRoute(
      new NextRequest("https://credvail.com/api/v1/wallet/claim", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bobSession}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          certificateNumber: certNumber,
          claimToken: invite.rawToken,
        }),
      })
    );

    const [aliceRes, bobRes] = await Promise.all([aliceReq, bobReq]);
    expect(aliceRes.status).toBe(200);
    // Bob must fail either with 403 (ownership mismatch) or 410 (already consumed)
    expect([403, 410]).toContain(bobRes.status);
  });

  it("H121-11: consumed invitation cannot be consumed again (anti-replay)", async () => {
    const certNumber = "ALPHA-2026-000111";
    const invite = await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:cred-h121-11",
      certificateNumber: certNumber,
      recipientEmail: studentEmail,
      tenantId,
    });

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:cred-h121-11",
      certificateNumber: certNumber,
      tenantId,
      batchId: "batch_h121_01",
      recipientName: "Verified Student",
      recipientEmail: studentEmail,
      leafHash: "0x111B",
      merkleIndex: 10,
      bitstringIndex: 10,
      claimsData: { course_name: "Computer Science" },
      vcPayloadJson: { id: "urn:uuid:cred-h121-11" } as any,
    });

    const res1 = await claimRoute(
      new NextRequest("https://credvail.com/api/v1/wallet/claim", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${verifiedStudentSession}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          certificateNumber: certNumber,
          claimToken: invite.rawToken,
        }),
      })
    );
    expect(res1.status).toBe(200);

    // Replay attempt
    const res2 = await claimRoute(
      new NextRequest("https://credvail.com/api/v1/wallet/claim", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${verifiedStudentSession}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          certificateNumber: certNumber,
          claimToken: invite.rawToken,
        }),
      })
    );
    expect(res2.status).toBe(410);
    const json2 = await res2.json();
    expect(json2.message).toContain("already been consumed");
  });

  it("H121-12: expired invitation cannot be consumed (anti-expiration)", async () => {
    const certNumber = "ALPHA-2026-000112";
    const invite = await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:cred-h121-12",
      certificateNumber: certNumber,
      recipientEmail: studentEmail,
      tenantId,
      ttlHours: -1, // Expired 1 hour ago
    });

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:cred-h121-12",
      certificateNumber: certNumber,
      tenantId,
      batchId: "batch_h121_01",
      recipientName: "Verified Student",
      recipientEmail: studentEmail,
      leafHash: "0x111C",
      merkleIndex: 11,
      bitstringIndex: 11,
      claimsData: { course_name: "Computer Science" },
      vcPayloadJson: { id: "urn:uuid:cred-h121-12" } as any,
    });

    const res = await claimRoute(
      new NextRequest("https://credvail.com/api/v1/wallet/claim", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${verifiedStudentSession}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          certificateNumber: certNumber,
          claimToken: invite.rawToken,
        }),
      })
    );
    expect(res.status).toBe(410);
    const json = await res.json();
    expect(json.message).toContain("expired");
  });

  // =========================================================================
  // Workstream 3: Claim-Export Lifecycle & Delivery Architecture (H121-13 to H121-17)
  // =========================================================================

  it("H121-13: authoritative batch processing response delivers complete claimLinks in response body", async () => {
    const batch = await BatchRepository.createBatch({
      tenantId,
      templateId,
      stagedRecipients: [
        {
          fullName: "Recipient One",
          email: "one@alpha.edu",
          certificateNumberPreview: "ALPHA-2026-REC-01",
          courseName: "Security 101",
          issueDate: "2026-11-19",
          status: "VALID",
        },
        {
          fullName: "Recipient Two",
          email: "two@alpha.edu",
          certificateNumberPreview: "ALPHA-2026-REC-02",
          courseName: "Security 102",
          issueDate: "2026-11-19",
          status: "VALID",
        },
      ],
    });

    const result = await BatchProcessingService.processBatch(
      tenantSlug,
      batch.id,
      {
        sub: adminUserId,
        email: "admin@alpha.edu",
        fullName: "Dean Admin",
        platformRole: "USER",
        emailVerified: true,
        tenants: [
          {
            tenantId,
            slug: tenantSlug,
            name: "Alpha University",
            role: "INSTITUTION_ADMIN",
          },
        ],
        iat: Date.now(),
        exp: Date.now() + 3600,
        jti: "test",
      },
      "https://credvail.com"
    );

    // Primary Authoritative Delivery Channel (Option A):
    // Response payload includes full claim links directly
    expect(result.claimLinks).toBeDefined();
    expect(result.claimLinks!.length).toBe(2);
    expect(result.claimLinks![0].claimUrl).toContain("/claim?cert=");
    expect(result.claimLinks![0].claimUrl).toContain("#token=");
    expect(result.claimLinks![0].claimToken.length).toBe(64); // 256 bits hex
  });

  it("H121-14: secondary GET export route enforces 15-minute TTL retention limit", async () => {
    const batch = await BatchRepository.createBatch({
      tenantId,
      templateId,
      stagedRecipients: [
        {
          fullName: "TTL Recipient",
          email: "ttl@alpha.edu",
          certificateNumberPreview: "ALPHA-2026-TTL-01",
          courseName: "Security TTL",
          issueDate: "2026-11-19",
          status: "VALID",
        },
      ],
    });

    await BatchProcessingService.processBatch(
      tenantSlug,
      batch.id,
      {
        sub: adminUserId,
        email: "admin@alpha.edu",
        fullName: "Dean Admin",
        platformRole: "USER",
        emailVerified: true,
        tenants: [
          {
            tenantId,
            slug: tenantSlug,
            name: "Alpha University",
            role: "INSTITUTION_ADMIN",
          },
        ],
        iat: Date.now(),
        exp: Date.now() + 3600,
        jti: "test",
      },
      "https://credvail.com"
    );

    // 1. Immediately: Secondary GET export succeeds
    const req1 = new NextRequest(
      `https://credvail.com/api/v1/tenants/${tenantSlug}/batches/${batch.id}/claim-export`,
      {
        headers: { Authorization: `Bearer ${adminSession}` },
      }
    );
    const res1 = await claimExportRoute(req1, {
      params: Promise.resolve({ slug: tenantSlug, id: batch.id }),
    });
    expect(res1.status).toBe(200);
    expect(res1.headers.get("X-CredVail-Delivery")).toBe("transient-process-local");

    // 2. Simulate expiration by aging the export timestamp beyond 15 minutes
    const exportMap = (BatchProcessingService as any).batchClaimExports as Map<string, any>;
    const cached = exportMap.get(batch.id);
    if (cached) {
      cached.createdAt = Date.now() - 16 * 60 * 1000; // 16 minutes ago
    }

    const req2 = new NextRequest(
      `https://credvail.com/api/v1/tenants/${tenantSlug}/batches/${batch.id}/claim-export`,
      {
        headers: { Authorization: `Bearer ${adminSession}` },
      }
    );
    const res2 = await claimExportRoute(req2, {
      params: Promise.resolve({ slug: tenantSlug, id: batch.id }),
    });
    expect(res2.status).toBe(404);
    const json2 = await res2.json();
    expect(json2.error.message).toContain("expired");
  });

  it("H121-15: process restart simulation clears secondary cache (404), while primary delivery remains unaffected", async () => {
    const batch = await BatchRepository.createBatch({
      tenantId,
      templateId,
      stagedRecipients: [
        {
          fullName: "Restart Recipient",
          email: "restart@alpha.edu",
          certificateNumberPreview: "ALPHA-2026-RST-01",
          courseName: "Fault Tolerance",
          issueDate: "2026-11-19",
          status: "VALID",
        },
      ],
    });

    const processResult = await BatchProcessingService.processBatch(
      tenantSlug,
      batch.id,
      {
        sub: adminUserId,
        email: "admin@alpha.edu",
        fullName: "Dean Admin",
        platformRole: "USER",
        emailVerified: true,
        tenants: [
          {
            tenantId,
            slug: tenantSlug,
            name: "Alpha University",
            role: "INSTITUTION_ADMIN",
          },
        ],
        iat: Date.now(),
        exp: Date.now() + 3600,
        jti: "test",
      },
      "https://credvail.com"
    );

    // Primary delivery already safely in hand
    expect(processResult.claimLinks!.length).toBe(1);

    // Simulate process restart: process-local memory is wiped
    BatchProcessingService.clearBatchClaimExport(batch.id);

    // Secondary GET export returns 404 with guidance
    const req = new NextRequest(
      `https://credvail.com/api/v1/tenants/${tenantSlug}/batches/${batch.id}/claim-export`,
      {
        headers: { Authorization: `Bearer ${adminSession}` },
      }
    );
    const res = await claimExportRoute(req, {
      params: Promise.resolve({ slug: tenantSlug, id: batch.id }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.message).toContain("not available or has expired");
  });

  it("H121-16: batch processing failure cleans up export cache; no artifact remains", async () => {
    const batch = await BatchRepository.createBatch({
      tenantId,
      templateId,
      stagedRecipients: [
        {
          fullName: "Fail Recipient",
          email: "fail@alpha.edu",
          certificateNumberPreview: "ALPHA-2026-FAIL-01",
          courseName: "Failure Mode",
          issueDate: "2026-11-19",
          status: "VALID",
        },
      ],
    });

    // Induce failure by passing invalid baseUrl or corrupting key state
    await expect(
      BatchProcessingService.processBatch(
        "invalid-slug",
        batch.id,
        undefined,
        "https://credvail.com"
      )
    ).rejects.toThrow();

    // Cache must be clean
    const exportMap = (BatchProcessingService as any).batchClaimExports as Map<string, any>;
    expect(exportMap.has(batch.id)).toBe(false);
  });

  it("H121-17: cross-tenant access to claim export is strictly forbidden (403/404)", async () => {
    const tenantRepo = new TenantRepository();
    const rogueTenant = await tenantRepo.createTenant({
      slug: "rogue-tenant",
      name: "Rogue College",
      legalEntityName: "Rogue College LLC",
      websiteUrl: "https://rogue.edu",
      didUri: "did:web:credvail.com:tenants:rogue-tenant",
      ownerUserId: "usr_rogue_99",
    });

    const rogueSession = createSessionToken({
      id: "usr_rogue_99",
      email: "rogue@rogue.edu",
      fullName: "Rogue Admin",
      platformRole: "USER",
      emailVerified: true,
      memberships: [
        {
          tenantId: rogueTenant.id,
          role: "INSTITUTION_ADMIN",
          tenant: { slug: "rogue-tenant", name: "Rogue College" },
        },
      ],
    });

    const batch = await BatchRepository.createBatch({
      tenantId,
      templateId,
      stagedRecipients: [
        {
          fullName: "Protected Recipient",
          email: "protected@alpha.edu",
          certificateNumberPreview: "ALPHA-2026-PROT-01",
          courseName: "Data Protection",
          issueDate: "2026-11-19",
          status: "VALID",
        },
      ],
    });

    await BatchProcessingService.processBatch(
      tenantSlug,
      batch.id,
      {
        sub: adminUserId,
        email: "admin@alpha.edu",
        fullName: "Dean Admin",
        platformRole: "USER",
        emailVerified: true,
        tenants: [
          {
            tenantId,
            slug: tenantSlug,
            name: "Alpha University",
            role: "INSTITUTION_ADMIN",
          },
        ],
        iat: Date.now(),
        exp: Date.now() + 3600,
        jti: "test",
      },
      "https://credvail.com"
    );

    // Rogue tenant tries to access Alpha University's claim export
    const req = new NextRequest(
      `https://credvail.com/api/v1/tenants/${tenantSlug}/batches/${batch.id}/claim-export`,
      {
        headers: { Authorization: `Bearer ${rogueSession}` },
      }
    );
    const res = await claimExportRoute(req, {
      params: Promise.resolve({ slug: tenantSlug, id: batch.id }),
    });

    expect([403, 404]).toContain(res.status);
  });

  // =========================================================================
  // Workstream 4: Claim Rate-Limiter Scoping & Process Boundaries (H121-18 to H121-19)
  // =========================================================================

  it("H121-18: rate limiter is scoped to session.sub; multiple accounts maintain independent buckets", async () => {
    resetClaimRateLimiter();

    // Account A consumes 10 attempts
    for (let i = 0; i < 10; i++) {
      const res = await checkClaimRateLimit("user:account-A");
      expect(res.allowed).toBe(true);
    }
    // 11th attempt for Account A is blocked
    const blockedA = await checkClaimRateLimit("user:account-A");
    expect(blockedA.allowed).toBe(false);
    expect(blockedA.retryAfter).toBeGreaterThan(0);

    // Account B is NOT blocked; it has an independent bucket
    const allowedB = await checkClaimRateLimit("user:account-B");
    expect(allowedB.allowed).toBe(true);
  });

  it("H121-19: process-level reset restores rate-limiter bucket capacity", async () => {
    resetClaimRateLimiter();

    // Exhaust bucket
    for (let i = 0; i < 10; i++) {
      await checkClaimRateLimit("user:account-exhausted");
    }
    expect((await checkClaimRateLimit("user:account-exhausted")).allowed).toBe(false);

    // Reset rate limiter (simulating process restart)
    resetClaimRateLimiter();

    // Immediate recovery
    expect((await checkClaimRateLimit("user:account-exhausted")).allowed).toBe(true);
  });

  // =========================================================================
  // Workstream 5: Cryptographic & Privacy Regressions (H121-20 to H121-21)
  // =========================================================================

  it("H121-20: public verification safe lookup retains zero internal tenant UUIDs or batch IDs", async () => {
    const certNumber = "ALPHA-2026-PRIV-01";
    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:cred-priv-01",
      certificateNumber: certNumber,
      tenantId,
      batchId: "batch_secret_uuid_12345",
      recipientId: "recipient_secret_uuid_67890",
      recipientName: "Jane Doe",
      recipientEmail: "jane@alpha.edu",
      leafHash: "0x3333",
      merkleIndex: 0,
      bitstringIndex: 0,
      claimsData: { course_name: "Privacy Engineering" },
      vcPayloadJson: { id: "urn:uuid:cred-priv-01" } as any,
    });

    const req = new NextRequest(`https://credvail.com/api/v1/verify/lookup/${certNumber}`);
    const res = await publicLookupRoute(req, {
      params: Promise.resolve({ id: certNumber }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    const rawBody = JSON.stringify(json);

    // Zero internal UUID leakage
    expect(rawBody.includes(tenantId)).toBe(false);
    expect(rawBody.includes("batch_secret_uuid_12345")).toBe(false);
    expect(rawBody.includes("recipient_secret_uuid_67890")).toBe(false);
    expect(rawBody.includes("jane@alpha.edu")).toBe(false);
  });

  it("H121-21: browser wallet engine generates valid NIST P-256 did:key and signs presentations", async () => {
    const identity = await BrowserWalletEngine.getOrCreateBrowserIdentity();
    expect(identity.did).toMatch(/^did:key:zDna[1-9A-HJ-NP-Za-km-z]+$/);

    const signedPresentation = await BrowserWalletEngine.createAndSignPresentation({
      credential: {
        credentialId: "urn:uuid:test-vc-01",
        certificateNumber: "ALPHA-2026-H11",
        recipientName: "Verified Student",
        recipientEmail: studentEmail,
        courseName: "Cryptography",
        issuerName: "Alpha University",
        issuerDid: "did:web:credvail.com:tenants:alpha",
        claims: { course: "Cryptography" },
        rawVc: {
          "@context": ["https://www.w3.org/ns/credentials/v2"],
          type: ["VerifiableCredential"],
          id: "urn:uuid:test-vc-01",
          issuer: "did:web:credvail.com:tenants:alpha",
          validFrom: new Date().toISOString(),
          credentialSubject: { id: identity.did, course: "Cryptography" },
          proof: {
            type: "JsonWebSignature2020",
            proofPurpose: "assertionMethod",
            verificationMethod: "did:web:credvail.com:tenants:alpha#key-1",
            jws: "mock.sig.jws",
          },
        },
        claimedAt: new Date().toISOString(),
      },
      challengeNonce: "verifier-challenge-nonce-h121",
      verifierDomain: "https://verifier.org",
    });

    expect(signedPresentation.type).toContain("VerifiablePresentation");
    expect(signedPresentation.holder).toBe(identity.did);
    expect(signedPresentation.proof.type).toBe("JsonWebSignature2020");
    expect(signedPresentation.proof.jws).toBeDefined();
    // Verify IEEE P1363 64-byte signature encoding (86 base64url characters)
    const sigBuffer = Buffer.from(signedPresentation.proof.jws, "base64url");
    expect(sigBuffer.length).toBe(64);
    expect(signedPresentation.proof.jws.length).toBe(86);
  });

  afterAll(() => {
    ClaimRateLimitRepository.resetTestDouble();
  });
});
