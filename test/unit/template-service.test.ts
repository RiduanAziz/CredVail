import { describe, it, expect, beforeEach } from "vitest";
import {
  TemplateRepository,
  inMemoryTemplateStore,
} from "@/lib/repositories/template-repository";
import {
  TenantRepository,
  inMemoryTenantStore,
} from "@/lib/repositories/tenant-repository";
import { TemplateService } from "@/lib/services/template-service";
import { SessionPayload } from "@/lib/auth/session";
import { TenantRole } from "@/types";
import { TEMPLATE_PRESETS } from "@/lib/templates/presets";

describe("Certificate Template Service & RBAC Governance", () => {
  let templateRepo: TemplateRepository;
  let tenantRepo: TenantRepository;
  let templateService: TemplateService;

  beforeEach(() => {
    inMemoryTemplateStore.clear();
    inMemoryTenantStore.clear();
    templateRepo = new TemplateRepository(true);
    tenantRepo = new TenantRepository(true);
    templateService = new TemplateService(templateRepo, tenantRepo);
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
    tenants: [{ tenantId, slug, name: "Test University", role }],
    currentTenantId: tenantId,
    currentTenantRole: role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    jti: "nonce",
  });

  it("should allow TEMPLATE_DESIGNER to create, update, and list templates", async () => {
    const tenant = await tenantRepo.createTenant({
      name: "Stanford University",
      legalEntityName: "Stanford Inc",
      websiteUrl: "https://stanford.edu",
      slug: "stanford",
      didUri: "did:web:credvail.io:tenants:stanford",
      ownerUserId: "usr_owner_1",
    });

    const designerSession = createSession("usr_designer_1", tenant.id, "stanford", "TEMPLATE_DESIGNER");
    const preset = TEMPLATE_PRESETS.COURSE_COMPLETION;

    const created = await templateService.createTemplate(
      "stanford",
      {
        title: "CS251 Blockchain Technology",
        description: "Official Stanford online course certificate",
        category: "COURSE_COMPLETION",
        layoutConfig: preset.layoutConfig,
      },
      designerSession
    );

    expect(created.id).toBeDefined();
    expect(created.title).toBe("CS251 Blockchain Technology");

    // Update
    const updated = await templateService.updateTemplate(
      "stanford",
      created.id,
      { title: "CS251 Advanced Cryptography & Blockchain" },
      designerSession
    );
    expect(updated.title).toBe("CS251 Advanced Cryptography & Blockchain");

    // List
    const templates = await templateService.listTemplates("stanford", designerSession);
    expect(templates.length).toBeGreaterThanOrEqual(1);
    expect(templates.some((t) => t.id === created.id)).toBe(true);

    // Verify audit logs
    const logs = await tenantRepo.listAuditLogs(tenant.id);
    const actions = logs.map((l) => l.action);
    expect(actions).toContain("TEMPLATE_CREATED");
    expect(actions).toContain("TEMPLATE_UPDATED");
  });

  it("should block READ_ONLY_STAFF from creating templates", async () => {
    const tenant = await tenantRepo.createTenant({
      name: "MIT",
      legalEntityName: "MIT Inc",
      websiteUrl: "https://mit.edu",
      slug: "mit-edu",
      didUri: "did:web:credvail.io:tenants:mit-edu",
      ownerUserId: "usr_owner_2",
    });

    const readOnlySession = createSession("usr_ro_1", tenant.id, "mit-edu", "READ_ONLY_STAFF");
    const preset = TEMPLATE_PRESETS.WORKSHOP_ATTENDANCE;

    await expect(
      templateService.createTemplate(
        "mit-edu",
        {
          title: "Unauthorized Workshop",
          category: "WORKSHOP_ATTENDANCE",
          layoutConfig: preset.layoutConfig,
        },
        readOnlySession
      )
    ).rejects.toThrow(/Forbidden: Role 'READ_ONLY_STAFF' lacks permission 'templates:create'/);
  });

  it("should generate a real-time vector preview with dynamic QR code and placeholder substitutions", async () => {
    const tenant = await tenantRepo.createTenant({
      name: "Berkeley University",
      legalEntityName: "UC Berkeley",
      websiteUrl: "https://berkeley.edu",
      slug: "berkeley",
      didUri: "did:web:credvail.io:tenants:berkeley",
      ownerUserId: "usr_owner_3",
    });

    const designerSession = createSession("usr_designer_3", tenant.id, "berkeley", "TEMPLATE_DESIGNER");
    const preset = TEMPLATE_PRESETS.COURSE_COMPLETION;

    const template = await templateService.createTemplate(
      "berkeley",
      {
        title: "Data 8 Foundations",
        category: "COURSE_COMPLETION",
        layoutConfig: preset.layoutConfig,
      },
      designerSession
    );

    const preview = await templateService.generatePreview("berkeley", template.id, designerSession, {
      "{{recipient_name}}": "Ada Lovelace",
      "{{course_name}}": "Data 8 Foundations of Data Science",
    });

    expect(preview.templateId).toBe(template.id);
    expect(preview.title).toBe(template.title);

    // Verify placeholder substitution
    const recipientField = preview.resolvedFields.find((f) => f.name === "Recipient Name");
    expect(recipientField?.text).toBe("Ada Lovelace");

    const courseField = preview.resolvedFields.find((f) => f.name === "Program / Course Title");
    expect(courseField?.text).toBe("Data 8 Foundations of Data Science");

    // Verify QR code generation
    expect(preview.qrCode.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(preview.qrCode.verificationUrl).toContain("https://credvail.io/verify/");
    expect(preview.signatures.length).toBeGreaterThanOrEqual(2);
  });
});
