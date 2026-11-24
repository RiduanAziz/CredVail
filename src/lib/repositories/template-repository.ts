import { db } from "../db.ts";
import type {
  CertificateTemplateRecord,
  TemplateCategory,
  PageDimensions,
  PageOrientation,
  TemplateLayoutConfig,
} from "../../types/template.ts";
import { TEMPLATE_PRESETS, DEFAULT_PAGE_DIMENSIONS } from "../templates/presets.ts";
import { handleRepositoryError, isInMemoryFallbackPermissible } from "../db/persistence-policy.ts";

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
    status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
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
      version: 1,
      status: data.status || "PUBLISHED",
      isArchived: data.status === "ARCHIVED",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.templates.set(id, record);
    return record;
  }

  async list(tenantId: string, category?: TemplateCategory, includeArchived: boolean = false): Promise<CertificateTemplateRecord[]> {
    const results: CertificateTemplateRecord[] = [];
    for (const t of this.templates.values()) {
      if (t.tenantId === tenantId) {
        if (!includeArchived && t.isArchived) {
          continue;
        }
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
      status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    }>
  ): Promise<CertificateTemplateRecord> {
    const existing = await this.findById(tenantId, templateId);
    if (!existing) throw new Error("Template not found or access denied");
    if (existing.isArchived) throw new Error("Cannot update an archived template");

    const title = data.title || data.name || existing.title;
    const nextVersion = (existing.version || 1) + 1;
    const nextStatus = data.status || existing.status || "PUBLISHED";
    const updated: CertificateTemplateRecord = {
      ...existing,
      ...data,
      title,
      name: title,
      dimensions: data.dimensions || existing.dimensions,
      layoutConfig: data.layoutConfig || existing.layoutConfig,
      version: nextVersion,
      status: nextStatus,
      isArchived: nextStatus === "ARCHIVED",
      updatedAt: new Date(),
    };
    this.templates.set(templateId, updated);
    return updated;
  }

  async duplicate(tenantId: string, templateId: string, newTitle?: string): Promise<CertificateTemplateRecord> {
    const existing = await this.findById(tenantId, templateId);
    if (!existing) throw new Error("Template not found or access denied");

    const title = newTitle || `${existing.title} (Copy)`;
    const duplicated = await this.create({
      tenantId,
      title,
      description: existing.description || undefined,
      category: existing.category,
      dimensions: JSON.parse(JSON.stringify(existing.dimensions)),
      layoutConfig: JSON.parse(JSON.stringify(existing.layoutConfig)),
      backgroundImageUrl: existing.backgroundImageUrl || undefined,
      isDefault: false,
      status: "PUBLISHED",
    });
    return duplicated;
  }

  async archive(tenantId: string, templateId: string): Promise<CertificateTemplateRecord> {
    const existing = await this.findById(tenantId, templateId);
    if (!existing) throw new Error("Template not found or access denied");

    const updated: CertificateTemplateRecord = {
      ...existing,
      status: "ARCHIVED",
      isArchived: true,
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
  setBatchReferenceCount(templateId: string, count: number) {
    inMemoryTemplateStore.setBatchReferenceCount(templateId, count);
  }

  static setBatchReferenceCount(templateId: string, count: number) {
    inMemoryTemplateStore.setBatchReferenceCount(templateId, count);
  }

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
    } catch (err) {
      handleRepositoryError("TemplateRepository.static.updateTemplate", err);
      return null;
    }
  }

  static async deleteTemplate(param1: string, param2: string): Promise<boolean> {
    const repo = new TemplateRepository();
    const tenantId = param1.startsWith("tmpl_") ? param2 : param1;
    const templateId = param1.startsWith("tmpl_") ? param1 : param2;
    try {
      return await repo.deleteTemplate(tenantId, templateId);
    } catch (err) {
      handleRepositoryError("TemplateRepository.static.deleteTemplate", err);
      return false;
    }
  }

  private forceMemory: boolean;

  constructor(forceMemory: boolean = false) {
    this.forceMemory = forceMemory;
  }

  private get useMemory(): boolean {
    if (!isInMemoryFallbackPermissible()) return false;
    if (this.forceMemory) return true;
    return !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("localhost:5432");
  }

  private mapDbToRecord(created: any): CertificateTemplateRecord {
    const layout = (created.layoutConfig || {}) as any;
    const meta = layout._meta || {};
    const version = typeof meta.version === "number" ? meta.version : 1;
    const status = meta.status || "PUBLISHED";
    const isArchived = Boolean(meta.isArchived || status === "ARCHIVED");

    const record: CertificateTemplateRecord = {
      id: created.id,
      tenantId: created.tenantId,
      title: created.title,
      name: created.title,
      description: created.description || null,
      category: created.category as TemplateCategory,
      dimensions: created.dimensions as PageDimensions,
      layoutConfig: created.layoutConfig as TemplateLayoutConfig,
      backgroundImageUrl: created.backgroundImageUrl || null,
      isDefault: created.isDefault || false,
      version,
      status,
      isArchived,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
    return record;
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
    status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  }): Promise<CertificateTemplateRecord> {
    const title = data.title || data.name || "Default Template";
    const category = data.category || "ACHIEVEMENT";
    const dimensions = data.dimensions || (data.canvasWidth && data.canvasHeight ? {
      width: data.canvasWidth,
      height: data.canvasHeight,
      orientation: data.orientation || "LANDSCAPE",
      unit: "PX",
    } : DEFAULT_PAGE_DIMENSIONS);
    const status = data.status || "PUBLISHED";

    if (this.useMemory) {
      return inMemoryTemplateStore.create({
        ...data,
        title,
        category,
        dimensions,
        status,
      });
    }
    try {
      const layoutWithMeta = {
        ...data.layoutConfig,
        _meta: {
          version: 1,
          status,
          isArchived: status === "ARCHIVED",
        },
      };

      const created = await db.certificateTemplate.create({
        data: {
          tenantId: data.tenantId,
          title,
          description: data.description || null,
          category,
          dimensions: dimensions as any,
          layoutConfig: layoutWithMeta as any,
          backgroundImageUrl: data.backgroundImageUrl || null,
          isDefault: data.isDefault || false,
        },
      });
      return this.mapDbToRecord(created);
    } catch (err) {
      handleRepositoryError("TemplateRepository.createTemplate", err);
      return inMemoryTemplateStore.create({
        ...data,
        title,
        category,
        dimensions,
        status,
      });
    }
  }

  async listTemplates(
    tenantId: string,
    category?: TemplateCategory,
    includeArchived: boolean = false
  ): Promise<CertificateTemplateRecord[]> {
    if (this.useMemory) {
      return inMemoryTemplateStore.list(tenantId, category, includeArchived);
    }
    try {
      const templates = await db.certificateTemplate.findMany({
        where: {
          tenantId,
          ...(category ? { category } : {}),
        },
        orderBy: { createdAt: "desc" },
      });
      const records = templates.map((t) => this.mapDbToRecord(t));
      if (!includeArchived) {
        return records.filter((r) => !r.isArchived);
      }
      return records;
    } catch (err) {
      handleRepositoryError("TemplateRepository.listTemplates", err);
      return inMemoryTemplateStore.list(tenantId, category, includeArchived);
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
      return template ? this.mapDbToRecord(template) : null;
    } catch (err) {
      handleRepositoryError("TemplateRepository.getTemplateById", err);
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
      status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    }>
  ): Promise<CertificateTemplateRecord> {
    if (this.useMemory) {
      return inMemoryTemplateStore.update(tenantId, templateId, data);
    }
    try {
      const existing = await this.getTemplateById(tenantId, templateId);
      if (!existing) throw new Error("Template not found or access denied");
      if (existing.isArchived) throw new Error("Cannot update an archived template");

      const nextVersion = (existing.version || 1) + 1;
      const nextStatus = data.status || existing.status || "PUBLISHED";
      const nextLayout = data.layoutConfig || existing.layoutConfig;
      const layoutWithMeta = {
        ...nextLayout,
        _meta: {
          version: nextVersion,
          status: nextStatus,
          isArchived: nextStatus === "ARCHIVED",
        },
      };

      const updateData: any = {
        layoutConfig: layoutWithMeta as any,
      };
      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.category !== undefined) updateData.category = data.category;
      if (data.dimensions !== undefined) updateData.dimensions = data.dimensions;
      if (data.backgroundImageUrl !== undefined) updateData.backgroundImageUrl = data.backgroundImageUrl;
      if (data.isDefault !== undefined) updateData.isDefault = data.isDefault;

      const updated = await db.certificateTemplate.update({
        where: { id: templateId, tenantId },
        data: updateData,
      });
      return this.mapDbToRecord(updated);
    } catch (err: any) {
      if (err.message?.includes("Cannot update an archived template")) {
        throw err;
      }
      handleRepositoryError("TemplateRepository.updateTemplate", err);
      return inMemoryTemplateStore.update(tenantId, templateId, data);
    }
  }

  async duplicateTemplate(
    tenantId: string,
    templateId: string,
    newTitle?: string
  ): Promise<CertificateTemplateRecord> {
    if (this.useMemory) {
      return inMemoryTemplateStore.duplicate(tenantId, templateId, newTitle);
    }
    const existing = await this.getTemplateById(tenantId, templateId);
    if (!existing) throw new Error("Template not found or access denied");

    const title = newTitle || `${existing.title} (Copy)`;
    return this.createTemplate({
      tenantId,
      title,
      description: existing.description || undefined,
      category: existing.category,
      dimensions: JSON.parse(JSON.stringify(existing.dimensions)),
      layoutConfig: JSON.parse(JSON.stringify(existing.layoutConfig)),
      backgroundImageUrl: existing.backgroundImageUrl || undefined,
      isDefault: false,
      status: "PUBLISHED",
    });
  }

  async archiveTemplate(tenantId: string, templateId: string): Promise<CertificateTemplateRecord> {
    if (this.useMemory) {
      return inMemoryTemplateStore.archive(tenantId, templateId);
    }
    const existing = await this.getTemplateById(tenantId, templateId);
    if (!existing) throw new Error("Template not found or access denied");

    const layoutWithMeta = {
      ...existing.layoutConfig,
      _meta: {
        version: existing.version || 1,
        status: "ARCHIVED",
        isArchived: true,
      },
    };

    const updated = await db.certificateTemplate.update({
      where: { id: templateId, tenantId },
      data: {
        layoutConfig: layoutWithMeta as any,
      },
    });
    return this.mapDbToRecord(updated);
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
      handleRepositoryError("TemplateRepository.deleteTemplate", err);
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
