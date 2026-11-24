import { describe, it, expect, beforeEach } from "vitest";
import {
  TemplateRepository,
  inMemoryTemplateStore,
} from "@/lib/repositories/template-repository";
import {
  TenantRepository,
  inMemoryTenantStore,
} from "@/lib/repositories/tenant-repository";
import {
  BatchRepository,
} from "@/lib/repositories/batch-repository";
import { TemplateService } from "@/lib/services/template-service";
import { BatchService } from "@/lib/services/batch-service";
import { SessionPayload } from "@/lib/auth/session";
import { TenantRole } from "@/types";
import { TEMPLATE_PRESETS, DEFAULT_PAGE_DIMENSIONS, STANDARD_PLACEHOLDERS } from "@/lib/templates/presets";
import { replacePlaceholders } from "@/lib/pdf/pdf-generator";

describe("Phase 5 Certificate Template Designer & Layout Rendering Engine Hardening", () => {
  let templateRepo: TemplateRepository;
  let tenantRepo: TenantRepository;
  let templateService: TemplateService;

  beforeEach(() => {
    inMemoryTemplateStore.clear();
    inMemoryTenantStore.clear();
    BatchRepository.resetInMemoryStore();
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

  describe("1. Layout Dimensions, Colors, and Bounds Validation", () => {
    it("should reject canvas dimensions outside safe bounds (< 400px or > 4000px)", async () => {
      const tenant = await tenantRepo.createTenant({
        name: "Oxford Institute",
        legalEntityName: "Oxford Inc",
        websiteUrl: "https://oxford.ac.uk",
        slug: "oxford",
        didUri: "did:web:credvail.io:tenants:oxford",
        ownerUserId: "usr_owner_oxford",
      });

      const designerSession = createSession("usr_des_1", tenant.id, "oxford", "TEMPLATE_DESIGNER");
      const preset = TEMPLATE_PRESETS.COURSE_COMPLETION;

      // Width too small (< 400)
      await expect(
        templateService.createTemplate(
          "oxford",
          {
            title: "Micro Certificate",
            category: "COURSE_COMPLETION",
            dimensions: { width: 300, height: 792, orientation: "LANDSCAPE", unit: "PX" },
            layoutConfig: preset.layoutConfig,
          },
          designerSession
        )
      ).rejects.toThrow(/Width must be at least 400/);

      // Height too large (> 4000)
      await expect(
        templateService.createTemplate(
          "oxford",
          {
            title: "Giant Billboard Certificate",
            category: "COURSE_COMPLETION",
            dimensions: { width: 1120, height: 5000, orientation: "LANDSCAPE", unit: "PX" },
            layoutConfig: preset.layoutConfig,
          },
          designerSession
        )
      ).rejects.toThrow(/Height cannot exceed 4000/);
    });

    it("should reject invalid hex color codes in background and borders", async () => {
      const tenant = await tenantRepo.createTenant({
        name: "Cambridge Institute",
        legalEntityName: "Cambridge Inc",
        websiteUrl: "https://cambridge.ac.uk",
        slug: "cambridge",
        didUri: "did:web:credvail.io:tenants:cambridge",
        ownerUserId: "usr_owner_cambridge",
      });

      const designerSession = createSession("usr_des_2", tenant.id, "cambridge", "TEMPLATE_DESIGNER");
      const preset = TEMPLATE_PRESETS.COURSE_COMPLETION;

      await expect(
        templateService.createTemplate(
          "cambridge",
          {
            title: "Invalid Color Certificate",
            category: "ACHIEVEMENT",
            layoutConfig: {
              ...preset.layoutConfig,
              backgroundColor: "red", // not a hex code!
            },
          },
          designerSession
        )
      ).rejects.toThrow(/hex color/);
    });

    it("should reject invalid coordinate percentages (> 100% or < 0%)", async () => {
      const tenant = await tenantRepo.createTenant({
        name: "Princeton Institute",
        legalEntityName: "Princeton Inc",
        websiteUrl: "https://princeton.edu",
        slug: "princeton",
        didUri: "did:web:credvail.io:tenants:princeton",
        ownerUserId: "usr_owner_princeton",
      });

      const designerSession = createSession("usr_des_3", tenant.id, "princeton", "TEMPLATE_DESIGNER");
      const preset = TEMPLATE_PRESETS.COURSE_COMPLETION;

      await expect(
        templateService.createTemplate(
          "princeton",
          {
            title: "Out of Bounds Field Certificate",
            category: "ACHIEVEMENT",
            layoutConfig: {
              ...preset.layoutConfig,
              fields: [
                {
                  id: "f_err",
                  name: "Off Canvas Field",
                  placeholder: "{{recipient.name}}",
                  defaultValue: "John",
                  x: 150, // > 100!
                  y: 50,
                  fontSize: 16,
                  fontFamily: "Inter",
                  fontWeight: "bold",
                  color: "#000000",
                  align: "center",
                },
              ],
            },
          },
          designerSession
        )
      ).rejects.toThrow();
    });
  });

  describe("2. Version Tracking and Template Archiving Lifecycle", () => {
    it("should initialize with version 1 and increment version upon every layout update", async () => {
      const tenant = await tenantRepo.createTenant({
        name: "Harvard University",
        legalEntityName: "Harvard Inc",
        websiteUrl: "https://harvard.edu",
        slug: "harvard",
        didUri: "did:web:credvail.io:tenants:harvard",
        ownerUserId: "usr_owner_harvard",
      });

      const designerSession = createSession("usr_des_4", tenant.id, "harvard", "TEMPLATE_DESIGNER");
      const preset = TEMPLATE_PRESETS.COURSE_COMPLETION;

      const created = await templateService.createTemplate(
        "harvard",
        {
          title: "CS50 Introduction to Computer Science",
          category: "COURSE_COMPLETION",
          layoutConfig: preset.layoutConfig,
        },
        designerSession
      );

      expect(created.version).toBe(1);
      expect(created.status).toBe("PUBLISHED");
      expect(created.isArchived).toBe(false);

      // First update -> increments to version 2
      const updatedV2 = await templateService.updateTemplate(
        "harvard",
        created.id,
        { title: "CS50x Computer Science 2026" },
        designerSession
      );
      expect(updatedV2.version).toBe(2);
      expect(updatedV2.title).toBe("CS50x Computer Science 2026");

      // Second update -> increments to version 3
      const updatedV3 = await templateService.updateTemplate(
        "harvard",
        created.id,
        { description: "Official Harvard CS50 Certificate of Completion" },
        designerSession
      );
      expect(updatedV3.version).toBe(3);
    });

    it("should archive a template and block further modifications", async () => {
      const tenant = await tenantRepo.createTenant({
        name: "Yale University",
        legalEntityName: "Yale Inc",
        websiteUrl: "https://yale.edu",
        slug: "yale",
        didUri: "did:web:credvail.io:tenants:yale",
        ownerUserId: "usr_owner_yale",
      });

      const designerSession = createSession("usr_des_5", tenant.id, "yale", "TEMPLATE_DESIGNER");
      const preset = TEMPLATE_PRESETS.COURSE_COMPLETION;

      const template = await templateService.createTemplate(
        "yale",
        {
          title: "Yale Law Diploma 2025",
          category: "COURSE_COMPLETION",
          layoutConfig: preset.layoutConfig,
        },
        designerSession
      );

      // Archive the template
      const archived = await templateService.archiveTemplate("yale", template.id, designerSession);
      expect(archived.status).toBe("ARCHIVED");
      expect(archived.isArchived).toBe(true);

      // Modifying an archived template must fail
      await expect(
        templateService.updateTemplate(
          "yale",
          template.id,
          { title: "Attempted Modification to Archived" },
          designerSession
        )
      ).rejects.toThrow(/Cannot update an archived template/);

      // List templates by default should omit archived
      const activeList = await templateService.listTemplates("yale", designerSession, undefined, false);
      expect(activeList.some((t) => t.id === template.id)).toBe(false);

      // Listing with includeArchived should include it
      const fullList = await templateService.listTemplates("yale", designerSession, undefined, true);
      expect(fullList.some((t) => t.id === template.id)).toBe(true);
    });
  });

  describe("3. Template Duplication", () => {
    it("should duplicate an existing template into a new independent version", async () => {
      const tenant = await tenantRepo.createTenant({
        name: "Caltech",
        legalEntityName: "Caltech Inc",
        websiteUrl: "https://caltech.edu",
        slug: "caltech",
        didUri: "did:web:credvail.io:tenants:caltech",
        ownerUserId: "usr_owner_caltech",
      });

      const designerSession = createSession("usr_des_6", tenant.id, "caltech", "TEMPLATE_DESIGNER");
      const preset = TEMPLATE_PRESETS.ACHIEVEMENT;

      const original = await templateService.createTemplate(
        "caltech",
        {
          title: "Quantum Physics Excellence",
          description: "Distinguished achievement in theoretical quantum mechanics",
          category: "ACHIEVEMENT",
          layoutConfig: preset.layoutConfig,
        },
        designerSession
      );

      // Duplicate with default copy title
      const copy1 = await templateService.duplicateTemplate("caltech", original.id, designerSession);
      expect(copy1.id).not.toBe(original.id);
      expect(copy1.title).toBe("Quantum Physics Excellence (Copy)");
      expect(copy1.version).toBe(1);
      expect(copy1.layoutConfig.fields.length).toBe(original.layoutConfig.fields.length);

      // Duplicate with custom title
      const copy2 = await templateService.duplicateTemplate(
        "caltech",
        original.id,
        designerSession,
        "Applied Quantum Engineering 2026"
      );
      expect(copy2.id).not.toBe(original.id);
      expect(copy2.title).toBe("Applied Quantum Engineering 2026");
    });
  });

  describe("4. Historical Immutability & Staged Batch Snapshots", () => {
    it("should retain the exact template snapshot when a batch is staged and prevent deletion if linked", async () => {
      const tenant = await tenantRepo.createTenant({
        name: "Columbia University",
        legalEntityName: "Columbia Inc",
        websiteUrl: "https://columbia.edu",
        slug: "columbia",
        didUri: "did:web:credvail.io:tenants:columbia",
        ownerUserId: "usr_owner_columbia",
      });

      const ownerSession = createSession("usr_owner_columbia", tenant.id, "columbia", "ORG_OWNER");
      const preset = TEMPLATE_PRESETS.COURSE_COMPLETION;

      const template = await templateService.createTemplate(
        "columbia",
        {
          title: "Columbia Financial Engineering V1",
          category: "COURSE_COMPLETION",
          layoutConfig: preset.layoutConfig,
        },
        ownerSession
      );

      // Stage a batch using this template
      const stagedBatch = await BatchService.stageBatch(
        "columbia",
        {
          templateId: template.id,
          title: "Class of 2026 Batch",
          stagedRecipients: [
            {
              fullName: "Alice Morgan",
              email: "alice@columbia.edu",
              certificateNumberPreview: "COL-2026-000001",
              issueDate: "2026-11-25",
              status: "VALID",
            },
          ],
        },
        ownerSession
      );

      expect(stagedBatch.templateId).toBe(template.id);
      expect(stagedBatch.templateVersion).toBe(1);
      expect(stagedBatch.templateSnapshot).toBeDefined();
      expect(stagedBatch.templateSnapshot.title).toBe("Columbia Financial Engineering V1");

      // Update the template in place (version increments to 2, title changes)
      await templateService.updateTemplate(
        "columbia",
        template.id,
        { title: "Columbia Financial Engineering V2 Revised" },
        ownerSession
      );

      // Verify the staged batch still has the exact historical snapshot
      const loadedBatch = await BatchService.getBatchById("columbia", stagedBatch.id, ownerSession);
      expect(loadedBatch.templateSnapshot.title).toBe("Columbia Financial Engineering V1");
      expect(loadedBatch.templateSnapshot.version).toBe(1);

      // Attempting to delete a template linked to batches must fail
      templateRepo.setBatchReferenceCount(template.id, 1);
      await expect(
        templateService.deleteTemplate("columbia", template.id, ownerSession)
      ).rejects.toThrow(/linked to issued batches/);
    });

    it("should prevent staging a new batch with an archived template", async () => {
      const tenant = await tenantRepo.createTenant({
        name: "Brown University",
        legalEntityName: "Brown Inc",
        websiteUrl: "https://brown.edu",
        slug: "brown",
        didUri: "did:web:credvail.io:tenants:brown",
        ownerUserId: "usr_owner_brown",
      });

      const ownerSession = createSession("usr_owner_brown", tenant.id, "brown", "ORG_OWNER");
      const preset = TEMPLATE_PRESETS.COURSE_COMPLETION;

      const template = await templateService.createTemplate(
        "brown",
        {
          title: "Deprecated Biology Diploma",
          category: "COURSE_COMPLETION",
          layoutConfig: preset.layoutConfig,
        },
        ownerSession
      );

      // Archive template
      await templateService.archiveTemplate("brown", template.id, ownerSession);

      // Attempting to stage batch with archived template must fail
      await expect(
        BatchService.stageBatch(
          "brown",
          {
            templateId: template.id,
            stagedRecipients: [
              {
                fullName: "Bob Vance",
                email: "bob@brown.edu",
                certificateNumberPreview: "BRN-2026-000001",
                issueDate: "2026-11-25",
                status: "VALID",
              },
            ],
          },
          ownerSession
        )
      ).rejects.toThrow(/archived and cannot be used for new issuance/);
    });
  });

  describe("5. Dynamic Placeholder Resolution (Dot-Notation & Snake-Case)", () => {
    it("should seamlessly resolve both dot-notation and snake_case placeholders in text and preview", async () => {
      const claims = {
        recipient_name: "Dr. Evelyn Wright",
        "recipient.name": "Dr. Evelyn Wright",
        recipient_email: "evelyn@wright.edu",
        course_name: "Advanced Distributed Consensus",
        "credential.title": "Advanced Distributed Consensus",
        certificate_number: "CREDVAIL-2026-9999",
        "credential.certificateNumber": "CREDVAIL-2026-9999",
        organization_name: "MIT CSAIL",
        "issuer.name": "MIT CSAIL",
        verification_url: "https://credvail.io/verify/9999",
        "credential.verificationUrl": "https://credvail.io/verify/9999",
      };

      // Test dot-notation text substitution
      const dotText = "This certifies that {{recipient.name}} completed {{credential.title}} from {{issuer.name}}.";
      const resolvedDot = replacePlaceholders(dotText, claims);
      expect(resolvedDot).toBe("This certifies that Dr. Evelyn Wright completed Advanced Distributed Consensus from MIT CSAIL.");

      // Test snake-case text substitution
      const snakeText = "This certifies that {{recipient_name}} completed {{course_name}} from {{organization_name}}.";
      const resolvedSnake = replacePlaceholders(snakeText, claims);
      expect(resolvedSnake).toBe("This certifies that Dr. Evelyn Wright completed Advanced Distributed Consensus from MIT CSAIL.");

      // Cross-resolution: claims with only snake_case should resolve dot-notation placeholder!
      const claimsSnakeOnly = {
        recipient_name: "Alan Turing",
        course_name: "Turing Machines",
      };
      const crossResolved = replacePlaceholders("Awarded to {{recipient.name}} for {{credential.title}}", claimsSnakeOnly);
      expect(crossResolved).toBe("Awarded to Alan Turing for Turing Machines");
    });
  });

  describe("6. Cross-Tenant Barrier and Preset Gallery", () => {
    it("should strictly forbid cross-tenant access to templates", async () => {
      const tenantA = await tenantRepo.createTenant({
        name: "Institution Alpha",
        legalEntityName: "Alpha Inc",
        websiteUrl: "https://alpha.edu",
        slug: "alpha",
        didUri: "did:web:credvail.io:tenants:alpha",
        ownerUserId: "usr_alpha_owner",
      });

      const tenantB = await tenantRepo.createTenant({
        name: "Institution Beta",
        legalEntityName: "Beta Inc",
        websiteUrl: "https://beta.edu",
        slug: "beta",
        didUri: "did:web:credvail.io:tenants:beta",
        ownerUserId: "usr_beta_owner",
      });

      const sessionA = createSession("usr_alpha_owner", tenantA.id, "alpha", "ORG_OWNER");
      const sessionB = createSession("usr_beta_owner", tenantB.id, "beta", "ORG_OWNER");

      const tmplA = await templateService.createTemplate(
        "alpha",
        {
          title: "Alpha Secret Template",
          category: "ACHIEVEMENT",
          layoutConfig: TEMPLATE_PRESETS.ACHIEVEMENT.layoutConfig,
        },
        sessionA
      );

      // Session B cannot get template of tenant A
      await expect(templateService.getTemplate("alpha", tmplA.id, sessionB)).rejects.toThrow(/Forbidden/);

      // Session B cannot update template of tenant A
      await expect(
        templateService.updateTemplate("alpha", tmplA.id, { title: "Hijacked" }, sessionB)
      ).rejects.toThrow(/Forbidden/);

      // Session B cannot duplicate template of tenant A
      await expect(
        templateService.duplicateTemplate("alpha", tmplA.id, sessionB)
      ).rejects.toThrow(/Forbidden/);

      // Session B cannot archive template of tenant A
      await expect(
        templateService.archiveTemplate("alpha", tmplA.id, sessionB)
      ).rejects.toThrow(/Forbidden/);
    });

    it("should return the full preset gallery with fonts, borders, and standard placeholders", async () => {
      const tenant = await tenantRepo.createTenant({
        name: "Dartmouth College",
        legalEntityName: "Dartmouth Inc",
        websiteUrl: "https://dartmouth.edu",
        slug: "dartmouth",
        didUri: "did:web:credvail.io:tenants:dartmouth",
        ownerUserId: "usr_dartmouth_owner",
      });

      const session = createSession("usr_dartmouth_owner", tenant.id, "dartmouth", "ORG_OWNER");

      const gallery = await templateService.getPresetGallery("dartmouth", session);
      expect(gallery.presets.length).toBeGreaterThan(0);
      expect(gallery.standardPlaceholders.length).toBeGreaterThanOrEqual(10);
      expect(gallery.supportedFonts.length).toBeGreaterThanOrEqual(5);
      expect(gallery.supportedBorders.length).toBeGreaterThanOrEqual(4);
      expect(gallery.defaultDimensions).toEqual(DEFAULT_PAGE_DIMENSIONS);
    });
  });
});
