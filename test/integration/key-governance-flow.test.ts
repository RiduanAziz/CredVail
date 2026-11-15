import { describe, it, expect, beforeEach } from "vitest";
import { KeyRepository } from "@/lib/repositories/key-repository";
import { TenantRepository } from "@/lib/repositories/tenant-repository";
import { KeyManagementService } from "@/lib/services/key-management-service";
import { KeyService } from "@/lib/crypto/key-service";
import { SessionPayload } from "@/lib/auth/session";

describe("Institutional Key Governance & Epoch Lifecycle Flow", () => {
  const tenantRepo = new TenantRepository();

  let tenantA: any;
  let tenantB: any;

  let ownerSessionA: SessionPayload;
  let issuerSessionA: SessionPayload;
  let staffSessionA: SessionPayload;
  let ownerSessionB: SessionPayload;

  beforeEach(async () => {
    KeyRepository.resetInMemoryStore();

    const slugA = `csi-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    tenantA = await tenantRepo.createTenant({
      name: "Cyber Security Institute",
      slug: slugA,
      legalEntityName: "Cyber Security Institute Inc.",
      websiteUrl: `https://${slugA}.edu`,
      didUri: `did:web:credvail.com:tenants:${slugA}`,
      ownerUserId: "usr_owner_a",
    });

    const slugB = `gqa-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    tenantB = await tenantRepo.createTenant({
      name: "Global Quantum Academy",
      slug: slugB,
      legalEntityName: "Global Quantum Academy Inc.",
      websiteUrl: `https://${slugB}.edu`,
      didUri: `did:web:credvail.com:tenants:${slugB}`,
      ownerUserId: "usr_owner_b",
    });

    ownerSessionA = {
      sub: "usr_owner_a",
      email: "owner@csi.edu",
      fullName: "CSI Owner",
      platformRole: "USER",
      currentTenantId: tenantA.id,
      currentTenantRole: "ORG_OWNER",
      tenants: [
        {
          tenantId: tenantA.id,
          role: "ORG_OWNER",
          slug: tenantA.slug,
          name: tenantA.name,
        },
      ],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: "jti_1",
    };

    issuerSessionA = {
      ...ownerSessionA,
      sub: "usr_issuer_a",
      email: "issuer@csi.edu",
      currentTenantRole: "CERTIFICATE_ISSUER",
      tenants: [
        {
          tenantId: tenantA.id,
          role: "CERTIFICATE_ISSUER",
          slug: tenantA.slug,
          name: tenantA.name,
        },
      ],
    };

    staffSessionA = {
      ...ownerSessionA,
      sub: "usr_staff_a",
      email: "staff@csi.edu",
      currentTenantRole: "READ_ONLY_STAFF",
      tenants: [
        {
          tenantId: tenantA.id,
          role: "READ_ONLY_STAFF",
          slug: tenantA.slug,
          name: tenantA.name,
        },
      ],
    };

    ownerSessionB = {
      sub: "usr_owner_b",
      email: "owner@gqa.edu",
      fullName: "GQA Owner",
      platformRole: "USER",
      currentTenantId: tenantB.id,
      currentTenantRole: "ORG_OWNER",
      tenants: [
        {
          tenantId: tenantB.id,
          role: "ORG_OWNER",
          slug: tenantB.slug,
          name: tenantB.name,
        },
      ],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: "jti_2",
    };
  });

  it("should auto-provision Key Epoch 1 upon first listing", async () => {
    const result = await KeyManagementService.listKeys(tenantA.slug, ownerSessionA);

    expect(result.activeKey).toBeDefined();
    expect(result.activeKey?.keyEpoch).toBe(1);
    expect(result.activeKey?.isActive).toBe(true);
    expect(result.activeKey?.isCompromised).toBe(false);
    expect(result.activeKey?.algorithm).toBe("ECDSA-P256");
    expect(result.activeKey?.publicKeyMultibase.startsWith("z")).toBe(true);
    expect(result.didUri).toBe(tenantA.didUri);
    expect(result.allEpochs.length).toBe(1);
  });

  it("should rotate key epoch gracefully: deactivate Epoch 1 and activate Epoch 2", async () => {
    // 1. Initial list provisions Epoch 1
    await KeyManagementService.listKeys(tenantA.slug, ownerSessionA);

    // 2. Perform key rotation
    const newEpoch = await KeyManagementService.rotateKey(tenantA.slug, ownerSessionA);

    expect(newEpoch.keyEpoch).toBe(2);
    expect(newEpoch.isActive).toBe(true);
    expect(newEpoch.isCompromised).toBe(false);

    // 3. Verify state of all epochs
    const updated = await KeyManagementService.listKeys(tenantA.slug, ownerSessionA);
    expect(updated.allEpochs.length).toBe(2);

    const epoch1 = updated.allEpochs.find((k) => k.keyEpoch === 1);
    const epoch2 = updated.allEpochs.find((k) => k.keyEpoch === 2);

    expect(epoch1?.isActive).toBe(false); // Gracefully rotated
    expect(epoch1?.isCompromised).toBe(false);
    expect(epoch1?.validTo).toBeDefined();

    expect(epoch2?.isActive).toBe(true);
    expect(updated.activeKey?.keyEpoch).toBe(2);

    // 4. Verify audit log entry was created
    const auditLogs = await tenantRepo.listAuditLogs(tenantA.id);
    const rotationLog = auditLogs.find((l) => l.action === "KEY_ROTATED");
    expect(rotationLog).toBeDefined();
    expect(rotationLog?.metadata.newEpoch).toBe(2);
  });

  it("should flag key compromise: immediately revoke and deactivate the target epoch (SEC-09)", async () => {
    // Provision Epoch 1 and rotate to Epoch 2
    await KeyManagementService.listKeys(tenantA.slug, ownerSessionA);
    await KeyManagementService.rotateKey(tenantA.slug, ownerSessionA);

    // Compromise historical Epoch 1
    const compromised = await KeyManagementService.flagCompromised(tenantA.slug, 1, ownerSessionA);

    expect(compromised.keyEpoch).toBe(1);
    expect(compromised.isCompromised).toBe(true);
    expect(compromised.isActive).toBe(false);
    expect(compromised.revokedAt).toBeDefined();

    // Verify DID Document excludes Epoch 1 from assertionMethod
    const didDoc = await KeyManagementService.getTenantDidDocument(tenantA.slug);
    expect(didDoc.assertionMethod).not.toContain(`${tenantA.didUri}#key-1`);
    expect(didDoc.assertionMethod).toContain(`${tenantA.didUri}#key-2`);

    // Verify audit log entry
    const auditLogs = await tenantRepo.listAuditLogs(tenantA.id);
    const compromiseLog = auditLogs.find((l) => l.action === "KEY_COMPROMISED");
    expect(compromiseLog).toBeDefined();
    expect(compromiseLog?.metadata.compromisedEpoch).toBe(1);
  });

  it("should provide active signing key with decrypted private key for VC issuance", async () => {
    const { key, decryptedPrivateKey } = await KeyManagementService.getActiveSigningKey(
      tenantA.slug,
      ownerSessionA
    );

    expect(key.keyEpoch).toBe(1);
    expect(decryptedPrivateKey).toContain("-----BEGIN PRIVATE KEY-----");

    // Sign test data and verify with public key
    const payload = "Credential Batch Root: 0xabcdef123456";
    const signature = KeyService.signData(decryptedPrivateKey, payload);
    const isValid = KeyService.verifySignature(key.publicKeyPem, payload, signature);
    expect(isValid).toBe(true);
  });

  it("should enforce RBAC authorization permissions", async () => {
    // READ_ONLY_STAFF cannot manage or rotate keys
    await expect(KeyManagementService.listKeys(tenantA.slug, staffSessionA)).rejects.toThrow("Forbidden");
    await expect(KeyManagementService.rotateKey(tenantA.slug, staffSessionA)).rejects.toThrow("Forbidden");

    // CERTIFICATE_ISSUER cannot rotate or compromise keys
    await expect(KeyManagementService.rotateKey(tenantA.slug, issuerSessionA)).rejects.toThrow("Forbidden");
    await expect(KeyManagementService.flagCompromised(tenantA.slug, 1, issuerSessionA)).rejects.toThrow(
      "Forbidden"
    );
  });

  it("should strictly enforce cross-tenant isolation barriers", async () => {
    // Provision keys for Tenant A and Tenant B
    await KeyManagementService.listKeys(tenantA.slug, ownerSessionA);
    await KeyManagementService.listKeys(tenantB.slug, ownerSessionB);

    // Owner of Tenant B cannot access Tenant A's keys
    await expect(KeyManagementService.listKeys(tenantA.slug, ownerSessionB)).rejects.toThrow("Forbidden");

    // Owner of Tenant B cannot rotate Tenant A's keys
    await expect(KeyManagementService.rotateKey(tenantA.slug, ownerSessionB)).rejects.toThrow("Forbidden");

    // Direct repository checks
    const keysA = await KeyRepository.listKeys(tenantA.id);
    const keysB = await KeyRepository.listKeys(tenantB.id);

    expect(keysA.every((k) => k.tenantId === tenantA.id)).toBe(true);
    expect(keysB.every((k) => k.tenantId === tenantB.id)).toBe(true);
    expect(keysA[0].id).not.toBe(keysB[0].id);
  });
});
