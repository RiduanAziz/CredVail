import { describe, it, expect, beforeEach } from "vitest";
import { BatchRepository } from "@/lib/repositories/batch-repository";
import { CredentialRepository } from "@/lib/repositories/credential-repository";
import { TemplateRepository } from "@/lib/repositories/template-repository";
import { TenantRepository } from "@/lib/repositories/tenant-repository";
import { BatchProcessingService } from "@/lib/services/batch-processing-service";
import { SessionPayload } from "@/lib/auth/session";
import { TEMPLATE_PRESETS } from "@/lib/templates/presets";
import { unzipSync } from "fflate";

describe("Phase 6: Batch Processing & Certificate Generation Flow", () => {
  const tenantRepo = new TenantRepository();
  const templateRepo = new TemplateRepository();

  let testTenant: any;
  let otherTenant: any;
  let testTemplate: any;
  let adminSession: SessionPayload;
  let otherSession: SessionPayload;

  beforeEach(async () => {
    BatchRepository.resetInMemoryStore();
    CredentialRepository.resetInMemoryStore();

    testTenant = await tenantRepo.createTenant({
      slug: `inst-test-${Date.now()}`,
      name: "Global Technology University",
      legalEntityName: "GTU Inc.",
      websiteUrl: "https://gtu.edu",
      didUri: `did:web:gtu-${Date.now()}.edu`,
      brandingConfig: { primaryColor: "#1e3a8a" },
      ownerUserId: "usr_admin_1",
    });

    otherTenant = await tenantRepo.createTenant({
      slug: `inst-other-${Date.now()}`,
      name: "Other Academy",
      legalEntityName: "Other Academy Corp",
      websiteUrl: "https://other.edu",
      didUri: `did:web:other-${Date.now()}.edu`,
      ownerUserId: "usr_other_1",
    });

    testTemplate = await templateRepo.createTemplate({
      tenantId: testTenant.id,
      title: "Master of Science in Cybersecurity",
      category: "COURSE_COMPLETION",
      layoutConfig: TEMPLATE_PRESETS.COURSE_COMPLETION.layoutConfig,
      isDefault: true,
    });

    adminSession = {
      sub: "usr_admin_1",
      email: "admin@gtu.edu",
      fullName: "GTU Administrator",
      platformRole: "USER",
      tenants: [{ tenantId: testTenant.id, slug: testTenant.slug, name: testTenant.name, role: "ORG_OWNER" }],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: "jti_admin_1",
    };

    otherSession = {
      sub: "usr_other_1",
      email: "user@other.edu",
      fullName: "Other User",
      platformRole: "USER",
      tenants: [{ tenantId: otherTenant.id, slug: otherTenant.slug, name: otherTenant.name, role: "READ_ONLY_STAFF" }],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: "jti_other_1",
    };
  });

  it("processes a staged batch, generating collision-safe certificates, PDFs, QRs, and bulk ZIP", async () => {
    // 1. Stage a batch of 3 recipients
    const stagedBatch = await BatchRepository.createBatch({
      tenantId: testTenant.id,
      templateId: testTemplate.id,
      title: "Fall 2026 Honors Cohort",
      stagedRecipients: [
        {
          fullName: "Katherine Johnson",
          email: "kjohnson@nasa.gov",
          certificateNumberPreview: "GTU-2026-000001",
          courseName: "Advanced Astrodynamics",
          issueDate: "November 15, 2026",
          status: "VALID",
        },
        {
          fullName: "Dorothy Vaughan",
          email: "dvaughan@nasa.gov",
          certificateNumberPreview: "GTU-2026-000002",
          courseName: "Advanced Astrodynamics",
          issueDate: "November 15, 2026",
          status: "VALID",
        },
        {
          fullName: "Mary Jackson",
          email: "mjackson@nasa.gov",
          certificateNumberPreview: "GTU-2026-000003",
          courseName: "Advanced Astrodynamics",
          issueDate: "November 15, 2026",
          status: "VALID",
        },
      ],
    });

    expect(stagedBatch.status).toBe("DRAFT");
    expect(stagedBatch.validCount).toBe(3);

    // 2. Process batch
    const result = await BatchProcessingService.processBatch(
      testTenant.slug,
      stagedBatch.id,
      adminSession,
      "https://credvail.com"
    );

    expect(result.status).toBe("GENERATED");
    expect(result.totalProcessed).toBe(3);
    expect(result.credentials.length).toBe(3);
    expect(result.zipSize).toBeGreaterThan(500);

    // Check certificate uniqueness
    const certNumbers = result.credentials.map((c) => c.certificateNumber);
    const uniqueCerts = new Set(certNumbers);
    expect(uniqueCerts.size).toBe(3);

    // Check credential IDs and hashes
    for (const cred of result.credentials) {
      expect(cred.credentialId.startsWith("urn:uuid:")).toBe(true);
      expect(cred.leafHash.startsWith("0x")).toBe(true);
      expect(cred.verificationUrl.includes("/verify/")).toBe(true);
    }

    // 3. Verify individual PDF download
    const firstCred = result.credentials[0];
    const { pdfBytes, certificateNumber } = await BatchProcessingService.getCredentialPdf(
      testTenant.slug,
      firstCred.credentialId,
      adminSession
    );

    expect(certificateNumber).toBe(firstCred.certificateNumber);
    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(1000);
    expect(Buffer.from(pdfBytes.slice(0, 5)).toString()).toBe("%PDF-");

    // 4. Verify bulk ZIP download
    const { zipBytes, batchNumber } = await BatchProcessingService.getBatchZip(
      testTenant.slug,
      stagedBatch.id,
      adminSession
    );

    expect(batchNumber).toBe(stagedBatch.batchNumber);
    expect(zipBytes).toBeInstanceOf(Uint8Array);
    expect(zipBytes[0]).toBe(0x50); // 'P'
    expect(zipBytes[1]).toBe(0x4b); // 'K'

    // Verify unzipping archive yields all 3 PDFs
    const unzipped = unzipSync(zipBytes);
    expect(Object.keys(unzipped).length).toBe(3);
  });

  it("prevents double-processing an already generated batch", async () => {
    const staged = await BatchRepository.createBatch({
      tenantId: testTenant.id,
      templateId: testTemplate.id,
      stagedRecipients: [
        {
          fullName: "Alan Turing",
          email: "aturing@bletchley.gov.uk",
          certificateNumberPreview: "GTU-2026-000099",
          issueDate: "2026-11-15",
          status: "VALID",
        },
      ],
    });

    await BatchProcessingService.processBatch(testTenant.slug, staged.id, adminSession);

    // Second call must fail
    await expect(
      BatchProcessingService.processBatch(testTenant.slug, staged.id, adminSession)
    ).rejects.toThrow("already been processed");
  });

  it("strictly enforces tenant isolation during batch processing and certificate download", async () => {
    const staged = await BatchRepository.createBatch({
      tenantId: testTenant.id,
      templateId: testTemplate.id,
      stagedRecipients: [
        {
          fullName: "Alice Smith",
          email: "alice@gtu.edu",
          certificateNumberPreview: "GTU-2026-000077",
          issueDate: "2026-11-15",
          status: "VALID",
        },
      ],
    });

    // Other tenant user cannot process testTenant's batch
    await expect(
      BatchProcessingService.processBatch(testTenant.slug, staged.id, otherSession)
    ).rejects.toThrow("Forbidden");

    // Generate with admin
    const result = await BatchProcessingService.processBatch(testTenant.slug, staged.id, adminSession);

    // Other tenant cannot download testTenant's ZIP
    await expect(
      BatchProcessingService.getBatchZip(testTenant.slug, staged.id, otherSession)
    ).rejects.toThrow("Forbidden");

    // Other tenant cannot download testTenant's PDF
    await expect(
      BatchProcessingService.getCredentialPdf(testTenant.slug, result.credentials[0].id, otherSession)
    ).rejects.toThrow("Forbidden");
  });
});
