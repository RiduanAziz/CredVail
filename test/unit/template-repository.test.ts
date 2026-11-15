import { describe, it, expect, beforeEach } from "vitest";
import {
  TemplateRepository,
  inMemoryTemplateStore,
} from "@/lib/repositories/template-repository";
import { TEMPLATE_PRESETS, DEFAULT_PAGE_DIMENSIONS } from "@/lib/templates/presets";

describe("Certificate Template Repository", () => {
  let templateRepo: TemplateRepository;

  beforeEach(() => {
    inMemoryTemplateStore.clear();
    templateRepo = new TemplateRepository(true);
  });

  it("should create a template and retrieve it by ID", async () => {
    const tenantId = "tnt_oxford_1";
    const preset = TEMPLATE_PRESETS.COURSE_COMPLETION;

    const created = await templateRepo.createTemplate({
      tenantId,
      title: "M.Sc. Computer Science Diploma",
      description: "Postgraduate degree certificate",
      category: "COURSE_COMPLETION",
      dimensions: DEFAULT_PAGE_DIMENSIONS,
      layoutConfig: preset.layoutConfig,
      isDefault: true,
    });

    expect(created.id).toBeDefined();
    expect(created.title).toBe("M.Sc. Computer Science Diploma");
    expect(created.category).toBe("COURSE_COMPLETION");
    expect(created.isDefault).toBe(true);

    const fetched = await templateRepo.getTemplateById(tenantId, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe("M.Sc. Computer Science Diploma");
    expect(fetched?.layoutConfig.fields.length).toBe(preset.layoutConfig.fields.length);
  });

  it("should list templates filtered by category", async () => {
    const tenantId = "tnt_cambridge_2";

    await templateRepo.createTemplate({
      tenantId,
      title: "Course 1",
      category: "COURSE_COMPLETION",
      layoutConfig: TEMPLATE_PRESETS.COURSE_COMPLETION.layoutConfig,
    });

    await templateRepo.createTemplate({
      tenantId,
      title: "Event 1",
      category: "EVENT_PARTICIPATION",
      layoutConfig: TEMPLATE_PRESETS.EVENT_PARTICIPATION.layoutConfig,
    });

    await templateRepo.createTemplate({
      tenantId,
      title: "Course 2",
      category: "COURSE_COMPLETION",
      layoutConfig: TEMPLATE_PRESETS.COURSE_COMPLETION.layoutConfig,
    });

    const all = await templateRepo.listTemplates(tenantId);
    expect(all.length).toBe(3);

    const coursesOnly = await templateRepo.listTemplates(tenantId, "COURSE_COMPLETION");
    expect(coursesOnly.length).toBe(2);

    const eventsOnly = await templateRepo.listTemplates(tenantId, "EVENT_PARTICIPATION");
    expect(eventsOnly.length).toBe(1);
    expect(eventsOnly[0].title).toBe("Event 1");
  });

  it("should update template layout and metadata", async () => {
    const tenantId = "tnt_harvard_3";
    const template = await templateRepo.createTemplate({
      tenantId,
      title: "Original Title",
      category: "CUSTOM",
      layoutConfig: TEMPLATE_PRESETS.CUSTOM.layoutConfig,
    });

    const updated = await templateRepo.updateTemplate(tenantId, template.id, {
      title: "Updated Title",
      layoutConfig: {
        ...template.layoutConfig,
        backgroundColor: "#f0fdf4",
      },
    });

    expect(updated.title).toBe("Updated Title");
    expect(updated.layoutConfig.backgroundColor).toBe("#f0fdf4");

    const reFetched = await templateRepo.getTemplateById(tenantId, template.id);
    expect(reFetched?.title).toBe("Updated Title");
  });

  it("should seed default presets when tenant template store is empty", async () => {
    const tenantId = "tnt_empty_tenant";
    const initialList = await templateRepo.listTemplates(tenantId);
    expect(initialList.length).toBe(0);

    const seeded = await templateRepo.seedPresetsIfEmpty(tenantId, "Empty University");
    expect(seeded.length).toBe(2); // Seeds Course Completion and Achievement presets
    expect(seeded[0].isDefault).toBe(true);

    const reList = await templateRepo.listTemplates(tenantId);
    expect(reList.length).toBe(2);
  });

  it("CRITICAL: should enforce multi-tenant isolation (Tenant A cannot see or delete Tenant B templates)", async () => {
    const tenantA = "tnt_tenant_a";
    const tenantB = "tnt_tenant_b";

    const tmplA = await templateRepo.createTemplate({
      tenantId: tenantA,
      title: "Tenant A Proprietary Template",
      category: "CUSTOM",
      layoutConfig: TEMPLATE_PRESETS.CUSTOM.layoutConfig,
    });

    // Tenant B cannot retrieve Tenant A's template
    const notFoundForB = await templateRepo.getTemplateById(tenantB, tmplA.id);
    expect(notFoundForB).toBeNull();

    // Tenant B cannot delete Tenant A's template
    await expect(templateRepo.deleteTemplate(tenantB, tmplA.id)).rejects.toThrow(
      /Template not found or access denied/
    );

    // Tenant A can still fetch it
    const foundForA = await templateRepo.getTemplateById(tenantA, tmplA.id);
    expect(foundForA).not.toBeNull();
  });

  it("should block template deletion if referenced by issued batches", async () => {
    const tenantId = "tnt_mit_batches";
    const template = await templateRepo.createTemplate({
      tenantId,
      title: "Batched Template",
      category: "COURSE_COMPLETION",
      layoutConfig: TEMPLATE_PRESETS.COURSE_COMPLETION.layoutConfig,
    });

    // Simulate active batch reference
    inMemoryTemplateStore.setBatchReferenceCount(template.id, 3);

    await expect(templateRepo.deleteTemplate(tenantId, template.id)).rejects.toThrow(
      /Cannot delete template: It is actively linked to issued batches/
    );

    // Deletion allowed once batch count is 0
    inMemoryTemplateStore.setBatchReferenceCount(template.id, 0);
    const deleted = await templateRepo.deleteTemplate(tenantId, template.id);
    expect(deleted).toBe(true);
  });
});
