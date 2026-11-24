import { describe, it, expect, beforeEach } from "vitest";
import { CredentialIssuanceService } from "@/lib/services/credential-issuance-service";
import { TenantRepository, inMemoryTenantStore } from "@/lib/repositories/tenant-repository";
import { TemplateRepository, inMemoryTemplateStore } from "@/lib/repositories/template-repository";
import { RecipientRepository, inMemoryRecipientStore } from "@/lib/repositories/recipient-repository";
import { CredentialRepository } from "@/lib/repositories/credential-repository";
import { BatchRepository } from "@/lib/repositories/batch-repository";
import { KeyRepository } from "@/lib/repositories/key-repository";
import { SessionPayload } from "@/lib/auth/session";
import { TEMPLATE_PRESETS } from "@/lib/templates/presets";
import { TenantRole } from "@/types";

describe("Phase 7 Individual Credential Issuance Engine (CRV-ISS-01)", () => {
  let tenantRepo: TenantRepository;
  let templateRepo: TemplateRepository;
  let recipientRepo: RecipientRepository;

  beforeEach(() => {
    inMemoryTenantStore.clear();
    inMemoryTemplateStore.clear();
    inMemoryRecipientStore.clear();
    BatchRepository.resetInMemoryStore();
    CredentialRepository.resetInMemoryStore();
    KeyRepository.resetInMemoryStore();

    tenantRepo = new TenantRepository(true);
    templateRepo = new TemplateRepository(true);
    recipientRepo = new RecipientRepository(true);
  });

  const createSession = (
    userId: string,
    tenantId: string,
    slug: string,
    role: TenantRole
  ): SessionPayload => ({
    sub: userId,
    email: `${role.toLowerCase()}@test.edu`,
    fullName: `Test ${role}`,
    platformRole: "USER",
    tenants: [{ tenantId, slug, name: "Oxford University", role }],
    currentTenantId: tenantId,
    currentTenantRole: role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    jti: "test-jti",
  });

  it("should successfully issue an individual credential with PDF, signed VC, and claim link", async () => {
    const tenant = await tenantRepo.createTenant({
      slug: "oxford",
      name: "Oxford University",
      legalEntityName: "Oxford Higher Ed Ltd",
      websiteUrl: "https://oxford.ac.uk",
      didUri: "did:web:oxford.ac.uk",
      ownerUserId: "user-owner-1",
    });

    const template = await templateRepo.createTemplate({
      tenantId: tenant.id,
      title: "Master of Science in Computer Science",
      category: "COURSE_COMPLETION",
      orientation: "LANDSCAPE",
      dimensions: { width: 1120, height: 792, orientation: "LANDSCAPE", unit: "PX" },
      layoutConfig: TEMPLATE_PRESETS.COURSE_COMPLETION.layoutConfig,
    });

    const session = createSession("user-owner-1", tenant.id, tenant.slug, "ORG_OWNER");

    const result = await CredentialIssuanceService.issueSingleCredential(
      tenant.slug,
      {
        templateId: template.id,
        recipient: {
          fullName: "Alice Lovelace",
          email: "ALICE@EXAMPLE.COM",
          externalIdentifier: "STUDENT-2026-001",
        },
        claims: {
          course_name: "Advanced Cryptographic Engineering",
          grade: "Distinction",
        },
      },
      session,
      "https://test.credvail.com"
    );

    // Verify issuance result structure
    expect(result.credential).toBeDefined();
    expect(result.credential.recipientName).toBe("Alice Lovelace");
    expect(result.credential.recipientEmail).toBe("alice@example.com");
    expect(result.credential.certificateNumber).toMatch(/^OXFORD-\d{4}-\d+/);
    expect(result.credential.verificationUrl).toContain("https://test.credvail.com/verify/");
    expect(result.credential.leafHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.credential.state).toBe("ISSUED");

    // Verify claim URL & token
    expect(result.claimUrl).toContain("https://test.credvail.com/claim?cert=");
    expect(result.claimUrl).toContain("#token=");
    expect(result.claimToken).toBeTruthy();

    // Verify PDF output
    expect(result.pdfBase64).toBeTruthy();
    expect(Buffer.from(result.pdfBase64, "base64").toString("ascii", 0, 4)).toBe("%PDF");

    // Verify relational batch creation
    const batch = await BatchRepository.findBatchById(tenant.id, result.batchId);
    expect(batch).toBeDefined();
    expect(batch?.status).toBe("GENERATED");
    expect(batch?.merkleRoot).toBeTruthy();

    // Verify recipient was auto-created in repository
    const storedRecipient = await recipientRepo.findByEmail(tenant.id, "alice@example.com");
    expect(storedRecipient).toBeDefined();
    expect(storedRecipient?.fullName).toBe("Alice Lovelace");
    expect(storedRecipient?.externalIdentifier).toBe("STUDENT-2026-001");

    // Verify audit log recorded
    const logs = await tenantRepo.listAuditLogs(tenant.id);
    const issueLog = logs.find((l) => l.action === "CREDENTIAL_ISSUED_SINGLE");
    expect(issueLog).toBeDefined();
    expect(issueLog?.metadata.certificateNumber).toBe(result.credential.certificateNumber);
  });

  it("should reuse existing recipient profile without duplicate creation", async () => {
    const tenant = await tenantRepo.createTenant({
      slug: "cambridge",
      name: "Cambridge Institute",
      legalEntityName: "Cambridge Ltd",
      websiteUrl: "https://cambridge.org",
      didUri: "did:web:cambridge.org",
      ownerUserId: "user-admin-1",
    });

    const template = await templateRepo.createTemplate({
      tenantId: tenant.id,
      title: "Professional Certificate",
      category: "TRAINING_COMPLETION",
      orientation: "LANDSCAPE",
      dimensions: { width: 1120, height: 792, orientation: "LANDSCAPE", unit: "PX" },
      layoutConfig: TEMPLATE_PRESETS.TRAINING_COMPLETION.layoutConfig,
    });

    // Pre-create recipient
    await recipientRepo.createRecipient({
      tenantId: tenant.id,
      fullName: "Bob Turing",
      email: "bob@example.com",
      externalIdentifier: "CAM-999",
    });

    const session = createSession("user-admin-1", tenant.id, tenant.slug, "INSTITUTION_ADMIN");

    const result = await CredentialIssuanceService.issueSingleCredential(
      tenant.slug,
      {
        templateId: template.id,
        recipient: {
          fullName: "Bob Turing",
          email: "BOB@EXAMPLE.COM", // tests normalization
        },
        claims: {
          course_name: "Quantum Algorithms",
        },
      },
      session
    );

    expect(result.credential.recipientEmail).toBe("bob@example.com");

    // Total recipients in tenant should still be exactly 1
    const { total } = await recipientRepo.listRecipients(tenant.id);
    expect(total).toBe(1);
  });

  it("should reject issuance when template is archived", async () => {
    const tenant = await tenantRepo.createTenant({
      slug: "stanford",
      name: "Stanford University",
      legalEntityName: "Stanford Org",
      websiteUrl: "https://stanford.edu",
      didUri: "did:web:stanford.edu",
      ownerUserId: "user-admin-1",
    });

    const template = await templateRepo.createTemplate({
      tenantId: tenant.id,
      title: "Deprecated Degree Template",
      category: "COURSE_COMPLETION",
      orientation: "LANDSCAPE",
      dimensions: { width: 1120, height: 792, orientation: "LANDSCAPE", unit: "PX" },
      layoutConfig: TEMPLATE_PRESETS.COURSE_COMPLETION.layoutConfig,
    });

    // Archive template
    await templateRepo.archiveTemplate(tenant.id, template.id);

    const session = createSession("user-admin-1", tenant.id, tenant.slug, "INSTITUTION_ADMIN");

    await expect(
      CredentialIssuanceService.issueSingleCredential(
        tenant.slug,
        {
          templateId: template.id,
          recipient: {
            fullName: "Charlie Babbage",
            email: "charlie@example.com",
          },
        },
        session
      )
    ).rejects.toThrow(/is archived/);
  });

  it("should enforce RBAC and reject unauthorized roles (READ_ONLY_STAFF)", async () => {
    const tenant = await tenantRepo.createTenant({
      slug: "mit",
      name: "MIT",
      legalEntityName: "MIT Org",
      websiteUrl: "https://mit.edu",
      didUri: "did:web:mit.edu",
      ownerUserId: "user-owner-1",
    });

    const template = await templateRepo.createTemplate({
      tenantId: tenant.id,
      title: "AI Researcher Certificate",
      category: "COURSE_COMPLETION",
      orientation: "LANDSCAPE",
      dimensions: { width: 1120, height: 792, orientation: "LANDSCAPE", unit: "PX" },
      layoutConfig: TEMPLATE_PRESETS.COURSE_COMPLETION.layoutConfig,
    });

    const readOnlySession = createSession("user-readonly-1", tenant.id, tenant.slug, "READ_ONLY_STAFF");

    await expect(
      CredentialIssuanceService.issueSingleCredential(
        tenant.slug,
        {
          templateId: template.id,
          recipient: {
            fullName: "Diana Prince",
            email: "diana@mit.edu",
          },
        },
        readOnlySession
      )
    ).rejects.toThrow(/Forbidden: Role 'READ_ONLY_STAFF'/);
  });
});
