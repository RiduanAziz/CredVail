import { db } from "../db.ts";
import type {
  CertificateTemplateRecord,
  TemplateCategory,
  PageDimensions,
  PageOrientation,
  TemplateLayoutConfig,
} from "../../types/template.ts";
import { TEMPLATE_PRESETS, DEFAULT_PAGE_DIMENSIONS } from "../templates/presets.ts";

class InMemoryTemplateStore {
  private templates: Map<string, CertificateTemplateRecord> = new Map();
  private batchReferences: Map<string, number> = new Map(); // templateId => batchCount

  async create(data: {
    tenantId: string;
    title?: string;
    name?: string;
    description?: string;
    category?: TemplateCategory;
    dimensions?: PageDimensions;
    canvasWidth?: number;
    canvasHeight?: number;
    orientation?: PageOrientation;
    layoutConfig: TemplateLayoutConfig;
    backgroundImageUrl?: string;
    isDefault?: boolean;
  }): Promise<CertificateTemplateRecord> {
    const id = `tmpl_${crypto.randomUUID()}`;
    const title = data.title || data.name || "Default Template";
    const dimensions: PageDimensions = data.dimensions || (data.canvasWidth && data.canvasHeight ? {
      width: data.canvasWidth,
      height: data.canvasHeight,
      orientation: data.orientation || "LANDSCAPE",
      unit: "PX",
    } : DEFAULT_PAGE_DIMENSIONS);

    const record: CertificateTemplateRecord = {
      id,
      tenantId: data.tenantId,
      title,
      name: title,
      description: data.description || null,
      category: data.category || "ACHIEVEMENT",
      dimensions,
      layoutConfig: data.layoutConfig,
      backgroundImageUrl: data.backgroundImageUrl || null,
      isDefault: data.isDefault || false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.templates.set(id, record);
    return record;
  }

  async list(tenantId: string, category?: TemplateCategory): Promise<CertificateTemplateRecord[]> {
    const results: CertificateTemplateRecord[] = [];
    for (const t of this.templates.values()) {
      if (t.tenantId === tenantId) {
        if (!category || t.category === category) {
          t.name = t.title;
          results.push(t);
        }
      }
    }
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findById(tenantId: string, templateId: string): Promise<CertificateTemplateRecord | null> {
    const t = this.templates.get(templateId);
    if (!t || t.tenantId !== tenantId) return null;
    t.name = t.title;
    return t;
  }

  async update(
    tenantId: string,
    templateId: string,
    data: Partial<{
      title: string;
      name?: string;
      description: string | null;
      category: TemplateCategory;
      dimensions: PageDimensions;
      layoutConfig: TemplateLayoutConfig;
      backgroundImageUrl: string | null;
      isDefault: boolean;
    }>
  ): Promise<CertificateTemplateRecord> {
    const existing = await this.findById(tenantId, templateId);
    if (!existing) throw new Error("Template not found or access denied");

    const title = data.title || data.name || existing.title;
    const updated: CertificateTemplateRecord = {
      ...existing,
      ...data,
      title,
      name: title,
      dimensions: data.dimensions || existing.dimensions,
      layoutConfig: data.layoutConfig || existing.layoutConfig,
      updatedAt: new Date(),
    };
    this.templates.set(templateId, updated);
    return updated;
  }

  async delete(tenantId: string, templateId: string): Promise<boolean> {
    const existing = await this.findById(tenantId, templateId);
    if (!existing) throw new Error("Template not found or access denied");

    const batchCount = this.batchReferences.get(templateId) || 0;
    if (batchCount > 0) {
      throw new Error("Cannot delete template: It is actively linked to issued batches");
    }

    this.templates.delete(templateId);
    return true;
  }

  setBatchReferenceCount(templateId: string, count: number) {
    this.batchReferences.set(templateId, count);
  }

  clear() {
    this.templates.clear();
    this.batchReferences.clear();
  }
}

export const inMemoryTemplateStore = new InMemoryTemplateStore();

export class TemplateRepository {
  private useMemory: boolean;

  static resetInMemoryStore(): void {
    inMemoryTemplateStore.clear();
  }

  static async findTemplateById(param1: string, param2: string): Promise<CertificateTemplateRecord | null> {
    const repo = new TemplateRepository();
    let result = await repo.getTemplateById(param1, param2);
    if (!result) {
      result = await repo.getTemplateById(param2, param1);
    }
    return result;
  }

  static async listTemplatesByTenant(tenantId: string): Promise<CertificateTemplateRecord[]> {
    const repo = new TemplateRepository();
    return repo.listTemplates(tenantId);
  }

  static async listTemplates(tenantId: string, category?: TemplateCategory): Promise<CertificateTemplateRecord[]> {
    const repo = new TemplateRepository();
    return repo.listTemplates(tenantId, category);
  }

  static async createTemplate(data: any): Promise<CertificateTemplateRecord> {
    const repo = new TemplateRepository();
    return repo.createTemplate(data);
  }

  static async updateTemplate(param1: string, param2: string, data: any): Promise<CertificateTemplateRecord | null> {
    const repo = new TemplateRepository();
    const tenantId = param1.startsWith("tmpl_") ? param2 : param1;
    const templateId = param1.startsWith("tmpl_") ? param1 : param2;
    try {
      return await repo.updateTemplate(tenantId, templateId, {
        title: data.title || data.name,
        ...data,
      });
    } catch {
      return null;
    }
  }

  static async deleteTemplate(param1: string, param2: string): Promise<boolean> {
    const repo = new TemplateRepository();
    const tenantId = param1.startsWith("tmpl_") ? param2 : param1;
    const templateId = param1.startsWith("tmpl_") ? param1 : param2;
    try {
      return await repo.deleteTemplate(tenantId, templateId);
    } catch {
      return false;
    }
  }

  constructor(forceMemory: boolean = false) {
    this.useMemory =
      forceMemory ||
      (process.env.REQUIRE_POSTGRES_INTEGRATION === "true"
        ? false
        : !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("localhost:5432"));
  }

  async createTemplate(data: {
    tenantId: string;
    title?: string;
    name?: string;
    description?: string;
    category?: TemplateCategory;
    dimensions?: PageDimensions;
    canvasWidth?: number;
    canvasHeight?: number;
    orientation?: PageOrientation;
    layoutConfig: TemplateLayoutConfig;
    backgroundImageUrl?: string;
    isDefault?: boolean;
  }): Promise<CertificateTemplateRecord> {
    const title = data.title || data.name || "Default Template";
    const category = data.category || "ACHIEVEMENT";
    const dimensions = data.dimensions || (data.canvasWidth && data.canvasHeight ? {
      width: data.canvasWidth,
      height: data.canvasHeight,
      orientation: data.orientation || "LANDSCAPE",
      unit: "PX",
    } : DEFAULT_PAGE_DIMENSIONS);

    if (this.useMemory) {
      return inMemoryTemplateStore.create({
        ...data,
        title,
        category,
        dimensions,
      });
    }
    try {
      const created = await db.certificateTemplate.create({
        data: {
          tenantId: data.tenantId,
          title,
          description: data.description || null,
          category,
          dimensions: dimensions as any,
          layoutConfig: data.layoutConfig as any,
          backgroundImageUrl: data.backgroundImageUrl || null,
          isDefault: data.isDefault || false,
        },
      });
      const record = created as unknown as CertificateTemplateRecord;
      record.name = record.title;
      return record;
    } catch {
      return inMemoryTemplateStore.create({
        ...data,
        title,
        category,
        dimensions,
      });
    }
  }

  async listTemplates(tenantId: string, category?: TemplateCategory): Promise<CertificateTemplateRecord[]> {
    if (this.useMemory) {
      return inMemoryTemplateStore.list(tenantId, category);
    }
    try {
      const templates = await db.certificateTemplate.findMany({
        where: {
          tenantId,
          ...(category ? { category } : {}),
        },
        orderBy: { createdAt: "desc" },
      });
      return templates as unknown as CertificateTemplateRecord[];
    } catch {
      return inMemoryTemplateStore.list(tenantId, category);
    }
  }

  async getTemplateById(tenantId: string, templateId: string): Promise<CertificateTemplateRecord | null> {
    if (this.useMemory) {
      return inMemoryTemplateStore.findById(tenantId, templateId);
    }
    try {
      const template = await db.certificateTemplate.findFirst({
        where: {
          id: templateId,
          tenantId,
        },
      });
      return (template as unknown as CertificateTemplateRecord) || null;
    } catch {
      return inMemoryTemplateStore.findById(tenantId, templateId);
    }
  }

  async updateTemplate(
    tenantId: string,
    templateId: string,
    data: Partial<{
      title: string;
      description: string | null;
      category: TemplateCategory;
      dimensions: PageDimensions;
      layoutConfig: TemplateLayoutConfig;
      backgroundImageUrl: string | null;
      isDefault: boolean;
    }>
  ): Promise<CertificateTemplateRecord> {
    if (this.useMemory) {
      return inMemoryTemplateStore.update(tenantId, templateId, data);
    }
    try {
      const updateData: any = {};
      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.category !== undefined) updateData.category = data.category;
      if (data.dimensions !== undefined) updateData.dimensions = data.dimensions;
      if (data.layoutConfig !== undefined) updateData.layoutConfig = data.layoutConfig;
      if (data.backgroundImageUrl !== undefined) updateData.backgroundImageUrl = data.backgroundImageUrl;
      if (data.isDefault !== undefined) updateData.isDefault = data.isDefault;

      const updated = await db.certificateTemplate.update({
        where: { id: templateId, tenantId },
        data: updateData,
      });
      return updated as unknown as CertificateTemplateRecord;
    } catch {
      return inMemoryTemplateStore.update(tenantId, templateId, data);
    }
  }

  async deleteTemplate(tenantId: string, templateId: string): Promise<boolean> {
    if (this.useMemory) {
      return inMemoryTemplateStore.delete(tenantId, templateId);
    }
    try {
      // Check if linked to any batches
      const batchCount = await db.issuanceBatch.count({
        where: { templateId },
      });

      if (batchCount > 0) {
        throw new Error("Cannot delete template: It is actively linked to issued batches");
      }

      await db.certificateTemplate.delete({
        where: { id: templateId, tenantId },
      });
      return true;
    } catch (err: any) {
      if (err.message?.includes("linked to issued batches")) {
        throw err;
      }
      return inMemoryTemplateStore.delete(tenantId, templateId);
    }
  }

  async seedPresetsIfEmpty(tenantId: string, tenantName?: string): Promise<CertificateTemplateRecord[]> {
    const existing = await this.listTemplates(tenantId);
    if (existing.length > 0) return existing;

    // Seed initial Course Completion and Achievement presets
    const coursePreset = TEMPLATE_PRESETS.COURSE_COMPLETION;
    const seededCourse = await this.createTemplate({
      tenantId,
      title: coursePreset.title,
      description: coursePreset.description,
      category: coursePreset.category,
      dimensions: DEFAULT_PAGE_DIMENSIONS,
      layoutConfig: {
        ...coursePreset.layoutConfig,
        fields: coursePreset.layoutConfig.fields.map((f) => {
          if (f.placeholder === "{{organization_name}}" && tenantName) {
            return { ...f, defaultValue: tenantName.toUpperCase() };
          }
          return f;
        }),
      },
      isDefault: true,
    });

    const achievementPreset = TEMPLATE_PRESETS.ACHIEVEMENT;
    const seededAchievement = await this.createTemplate({
      tenantId,
      title: achievementPreset.title,
      description: achievementPreset.description,
      category: achievementPreset.category,
      dimensions: DEFAULT_PAGE_DIMENSIONS,
      layoutConfig: achievementPreset.layoutConfig,
      isDefault: false,
    });

    return [seededCourse, seededAchievement];
  }
}
