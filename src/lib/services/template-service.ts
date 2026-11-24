import { z } from "zod";
import QRCode from "qrcode";
import { TemplateRepository } from "@/lib/repositories/template-repository";
import { TenantRepository } from "@/lib/repositories/tenant-repository";
import { assertTenantPermission } from "@/lib/auth/rbac";
import { SessionPayload } from "@/lib/auth/session";
import {
  CertificateTemplateRecord,
  TemplateCategory,
  TemplateLayoutConfig,
  PageDimensions,
} from "@/types/template";
import {
  STANDARD_PLACEHOLDERS,
  DEFAULT_PAGE_DIMENSIONS,
  TEMPLATE_PRESETS,
  SUPPORTED_FONT_FAMILIES,
  SUPPORTED_BORDER_STYLES,
} from "@/lib/templates/presets";
import { PdfGenerator, replacePlaceholders } from "@/lib/pdf/pdf-generator";

const hexColorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Must be a valid 3- or 6-digit hex color");

export const createTemplateInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Template title must be at least 2 characters long")
    .max(120, "Template title must not exceed 120 characters"),
  description: z.string().trim().max(500).optional(),
  category: z.enum([
    "COURSE_COMPLETION",
    "EVENT_PARTICIPATION",
    "INTERNSHIP_COMPLETION",
    "TRAINING_COMPLETION",
    "ACHIEVEMENT",
    "APPRECIATION",
    "MEMBERSHIP",
    "WORKSHOP_ATTENDANCE",
    "COMPETITION_PARTICIPATION",
    "CUSTOM",
  ] as const),
  dimensions: z
    .object({
      width: z.number().min(400, "Width must be at least 400px").max(4000, "Width cannot exceed 4000px"),
      height: z.number().min(400, "Height must be at least 400px").max(4000, "Height cannot exceed 4000px"),
      orientation: z.enum(["LANDSCAPE", "PORTRAIT"]),
      unit: z.enum(["PX", "MM"]),
    })
    .optional(),
  layoutConfig: z.object({
    backgroundColor: hexColorSchema,
    secondaryBackgroundColor: hexColorSchema.optional(),
    border: z.object({
      style: z.enum(["classic", "modern", "ornate", "minimal", "none"]),
      color: hexColorSchema,
      secondaryColor: hexColorSchema.optional(),
      width: z.number().min(0).max(60),
    }),
    logo: z.object({
      url: z.string().optional(),
      x: z.number().min(0).max(100),
      y: z.number().min(0).max(100),
      width: z.number().min(10).max(400),
      height: z.number().min(10).max(400),
    }),
    fields: z.array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        placeholder: z.string().min(1),
        defaultValue: z.string().default(""),
        x: z.number().min(0).max(100),
        y: z.number().min(0).max(100),
        width: z.number().optional(),
        height: z.number().optional(),
        fontSize: z.number().min(6).max(140),
        fontFamily: z.string().min(1),
        fontWeight: z.enum(["normal", "medium", "semibold", "bold"]),
        fontStyle: z.enum(["normal", "italic"]).optional(),
        color: hexColorSchema,
        align: z.enum(["left", "center", "right"]),
        isMandatory: z.boolean().optional(),
      })
    ),
    signatures: z.array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        signatoryName: z.string().min(1),
        signatureImageUrl: z.string().optional(),
        x: z.number().min(0).max(100),
        y: z.number().min(0).max(100),
        width: z.number().min(10).max(500),
        height: z.number().min(10).max(300),
      })
    ),
    qrCode: z.object({
      x: z.number().min(0).max(100),
      y: z.number().min(0).max(100),
      size: z.number().min(48).max(300),
      errorCorrectionLevel: z.enum(["L", "M", "Q", "H"]),
      includeMargin: z.boolean(),
      color: z
        .object({
          dark: hexColorSchema,
          light: hexColorSchema,
        })
        .optional(),
    }),
    customVariables: z.array(z.string()).optional(),
  }),
  backgroundImageUrl: z.string().url("Must be a valid URL").optional(),
  isDefault: z.boolean().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});

export const updateTemplateInputSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  category: z.enum([
    "COURSE_COMPLETION",
    "EVENT_PARTICIPATION",
    "INTERNSHIP_COMPLETION",
    "TRAINING_COMPLETION",
    "ACHIEVEMENT",
    "APPRECIATION",
    "MEMBERSHIP",
    "WORKSHOP_ATTENDANCE",
    "COMPETITION_PARTICIPATION",
    "CUSTOM",
  ] as const).optional(),
  dimensions: z
    .object({
      width: z.number().min(400).max(4000),
      height: z.number().min(400).max(4000),
      orientation: z.enum(["LANDSCAPE", "PORTRAIT"]),
      unit: z.enum(["PX", "MM"]),
    })
    .optional(),
  layoutConfig: z.any().optional(),
  backgroundImageUrl: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});

export const duplicateTemplateInputSchema = z.object({
  newTitle: z.string().trim().min(2).max(120).optional(),
});

export interface RenderedTemplatePreview {
  templateId: string;
  title: string;
  dimensions: PageDimensions;
  backgroundColor: string;
  secondaryBackgroundColor?: string;
  border: {
    style: string;
    color: string;
    secondaryColor?: string;
    width: number;
  };
  logo: {
    url?: string;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  resolvedFields: Array<{
    id: string;
    name: string;
    text: string;
    x: number;
    y: number;
    fontSize: number;
    fontFamily: string;
    fontWeight: string;
    fontStyle?: string;
    color: string;
    align: string;
  }>;
  signatures: Array<{
    id: string;
    title: string;
    signatoryName: string;
    signatureImageUrl?: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  qrCode: {
    x: number;
    y: number;
    size: number;
    dataUrl: string;
    verificationUrl: string;
  };
  pdfBase64?: string;
}

export class TemplateService {
  private templateRepo: TemplateRepository;
  private tenantRepo: TenantRepository;

  constructor(templateRepo?: TemplateRepository, tenantRepo?: TenantRepository) {
    this.templateRepo = templateRepo || new TemplateRepository();
    this.tenantRepo = tenantRepo || new TenantRepository();
  }

  private async getAuthorizedTenant(slug: string, session: SessionPayload) {
    const tenant = await this.tenantRepo.findBySlug(slug);
    if (!tenant) throw new Error(`Tenant '${slug}' not found`);

    const callerMembership = session.tenants.find((t) => t.slug === slug || t.tenantId === tenant.id);
    const isPlatformAdmin = session.platformRole === "SUPER_ADMIN";

    if (!callerMembership && !isPlatformAdmin) {
      throw new Error(`Forbidden: You do not possess access to organization '${slug}'`);
    }

    return { tenant, callerMembership, isPlatformAdmin };
  }

  /**
   * Creates a new certificate template with layout coordinates and dynamic placeholders.
   */
  async createTemplate(
    slug: string,
    input: z.infer<typeof createTemplateInputSchema>,
    session: SessionPayload
  ): Promise<CertificateTemplateRecord> {
    const { tenant, callerMembership, isPlatformAdmin } = await this.getAuthorizedTenant(slug, session);

    if (!isPlatformAdmin) {
      assertTenantPermission(callerMembership?.role, "templates:create");
    }

    const validated = createTemplateInputSchema.parse(input);

    const template = await this.templateRepo.createTemplate({
      tenantId: tenant.id,
      title: validated.title,
      description: validated.description,
      category: validated.category,
      dimensions: validated.dimensions || DEFAULT_PAGE_DIMENSIONS,
      layoutConfig: validated.layoutConfig,
      backgroundImageUrl: validated.backgroundImageUrl,
      isDefault: validated.isDefault || false,
    });

    await this.tenantRepo.recordAuditLog({
      tenantId: tenant.id,
      userId: session.sub,
      userEmail: session.email,
      action: "TEMPLATE_CREATED",
      resourceType: "CertificateTemplate",
      resourceId: template.id,
      metadata: { title: template.title, category: template.category },
    });

    return template;
  }

  /**
   * Lists all certificate templates for an institution.
   * Auto-seeds standard presets if none exist.
   */
  async listTemplates(
    slug: string,
    session: SessionPayload,
    category?: TemplateCategory,
    includeArchived?: boolean
  ): Promise<CertificateTemplateRecord[]> {
    const { tenant } = await this.getAuthorizedTenant(slug, session);

    // Auto-seed presets if first time
    await this.templateRepo.seedPresetsIfEmpty(tenant.id, tenant.name);

    return await this.templateRepo.listTemplates(tenant.id, category, includeArchived);
  }

  /**
   * Retrieves a single template by ID.
   */
  async getTemplate(
    slug: string,
    templateId: string,
    session: SessionPayload
  ): Promise<CertificateTemplateRecord> {
    const { tenant } = await this.getAuthorizedTenant(slug, session);

    const template = await this.templateRepo.getTemplateById(tenant.id, templateId);
    if (!template) {
      throw new Error(`Template '${templateId}' not found`);
    }

    return template;
  }

  /**
   * Updates an existing template layout, coordinates, and typography.
   */
  async updateTemplate(
    slug: string,
    templateId: string,
    input: Partial<z.infer<typeof createTemplateInputSchema>>,
    session: SessionPayload
  ): Promise<CertificateTemplateRecord> {
    const { tenant, callerMembership, isPlatformAdmin } = await this.getAuthorizedTenant(slug, session);

    if (!isPlatformAdmin) {
      assertTenantPermission(callerMembership?.role, "templates:update");
    }

    const validated = updateTemplateInputSchema.parse(input);
    const updated = await this.templateRepo.updateTemplate(tenant.id, templateId, validated);

    await this.tenantRepo.recordAuditLog({
      tenantId: tenant.id,
      userId: session.sub,
      userEmail: session.email,
      action: "TEMPLATE_UPDATED",
      resourceType: "CertificateTemplate",
      resourceId: templateId,
      metadata: { changedFields: Object.keys(input), version: updated.version },
    });

    return updated;
  }

  /**
   * Duplicates an existing certificate template into a new independent version.
   */
  async duplicateTemplate(
    slug: string,
    templateId: string,
    session: SessionPayload,
    newTitle?: string
  ): Promise<CertificateTemplateRecord> {
    const { tenant, callerMembership, isPlatformAdmin } = await this.getAuthorizedTenant(slug, session);

    if (!isPlatformAdmin) {
      assertTenantPermission(callerMembership?.role, "templates:create");
    }

    const duplicated = await this.templateRepo.duplicateTemplate(tenant.id, templateId, newTitle);

    await this.tenantRepo.recordAuditLog({
      tenantId: tenant.id,
      userId: session.sub,
      userEmail: session.email,
      action: "TEMPLATE_DUPLICATED",
      resourceType: "CertificateTemplate",
      resourceId: duplicated.id,
      metadata: { originalTemplateId: templateId, title: duplicated.title },
    });

    return duplicated;
  }

  /**
   * Archives a certificate template, preventing new issuances while preserving historical integrity.
   */
  async archiveTemplate(
    slug: string,
    templateId: string,
    session: SessionPayload
  ): Promise<CertificateTemplateRecord> {
    const { tenant, callerMembership, isPlatformAdmin } = await this.getAuthorizedTenant(slug, session);

    if (!isPlatformAdmin) {
      assertTenantPermission(callerMembership?.role, "templates:update");
    }

    const archived = await this.templateRepo.archiveTemplate(tenant.id, templateId);

    await this.tenantRepo.recordAuditLog({
      tenantId: tenant.id,
      userId: session.sub,
      userEmail: session.email,
      action: "TEMPLATE_ARCHIVED",
      resourceType: "CertificateTemplate",
      resourceId: templateId,
      metadata: { templateId, title: archived.title },
    });

    return archived;
  }

  /**
   * Retrieves the system preset gallery, standard placeholders, default dimensions, and typography options.
   */
  async getPresetGallery(slug: string, session: SessionPayload) {
    await this.getAuthorizedTenant(slug, session);

    return {
      presets: Object.values(TEMPLATE_PRESETS),
      standardPlaceholders: STANDARD_PLACEHOLDERS,
      defaultDimensions: DEFAULT_PAGE_DIMENSIONS,
      supportedFonts: SUPPORTED_FONT_FAMILIES,
      supportedBorders: SUPPORTED_BORDER_STYLES,
    };
  }

  /**
   * Deletes a template if not actively referenced by issued certificate batches.
   */
  async deleteTemplate(
    slug: string,
    templateId: string,
    session: SessionPayload
  ): Promise<boolean> {
    const { tenant, callerMembership, isPlatformAdmin } = await this.getAuthorizedTenant(slug, session);

    if (!isPlatformAdmin) {
      assertTenantPermission(callerMembership?.role, "templates:delete");
    }

    const success = await this.templateRepo.deleteTemplate(tenant.id, templateId);

    if (success) {
      await this.tenantRepo.recordAuditLog({
        tenantId: tenant.id,
        userId: session.sub,
        userEmail: session.email,
        action: "TEMPLATE_DELETED",
        resourceType: "CertificateTemplate",
        resourceId: templateId,
        metadata: { templateId },
      });
    }

    return success;
  }

  /**
   * Generates a real-time vector preview of a template with sample data and dynamic QR code.
   */
  async generatePreview(
    slug: string,
    templateId: string,
    session: SessionPayload,
    sampleOverrides?: Record<string, string>
  ): Promise<RenderedTemplatePreview> {
    const { tenant } = await this.getAuthorizedTenant(slug, session);
    const template = await this.templateRepo.getTemplateById(tenant.id, templateId);
    if (!template) throw new Error(`Template '${templateId}' not found`);

    // Build replacement dictionary supporting dot-notation and snake_case
    const replacements: Record<string, string> = {
      recipient_name: "Dr. Eleanor Vance",
      certificate_number: "CREDVAIL-2026-000001",
      course_name: "Advanced Cryptographic Engineering",
      organization_name: tenant.name,
      issue_date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      completion_date: new Date(Date.now() - 86400000 * 15).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      expiry_date: new Date(Date.now() + 86400000 * 730).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      grade: "First Class with Distinction",
      instructor_name: "Prof. Alan Turing, FRS",
      description: template.description || "In recognition of outstanding achievement and verified competency.",
      verification_url: `https://credvail.io/verify/CREDVAIL-2026-000001`,
      ...(sampleOverrides || {}),
    };

    // Resolve text fields using comprehensive placeholder normalization
    const resolvedFields = template.layoutConfig.fields.map((field) => {
      const rawText = field.placeholder || field.defaultValue || "";
      const text = replacePlaceholders(rawText, replacements);

      return {
        id: field.id,
        name: field.name,
        text,
        x: field.x,
        y: field.y,
        fontSize: field.fontSize,
        fontFamily: field.fontFamily,
        fontWeight: field.fontWeight,
        fontStyle: field.fontStyle,
        color: field.color,
        align: field.align,
      };
    });

    // Generate real QR Code data URL
    const verificationUrl =
      replacements["verification_url"] ||
      replacements["credential.verificationUrl"] ||
      `https://credvail.io/verify/CREDVAIL-2026-000001`;

    const qrDataUrl = await QRCode.toDataURL(verificationUrl, {
      errorCorrectionLevel: template.layoutConfig.qrCode.errorCorrectionLevel || "M",
      margin: template.layoutConfig.qrCode.includeMargin ? 1 : 0,
      color: {
        dark: template.layoutConfig.qrCode.color?.dark || "#0f172a",
        light: template.layoutConfig.qrCode.color?.light || "#ffffff",
      },
      width: template.layoutConfig.qrCode.size || 88,
    });

    let pdfBase64: string | undefined;
    try {
      const pdfBytes = await PdfGenerator.generateCertificate({
        template,
        claims: replacements,
        verificationUrl,
        tenantName: tenant.name,
        tenantLogoUrl: tenant.logoUrl,
      });
      pdfBase64 = Buffer.from(pdfBytes).toString("base64");
    } catch (err) {
      console.warn("[TemplateService] Could not generate preview PDF:", err);
    }

    return {
      templateId: template.id,
      title: template.title,
      dimensions: template.dimensions,
      backgroundColor: template.layoutConfig.backgroundColor,
      secondaryBackgroundColor: template.layoutConfig.secondaryBackgroundColor,
      border: template.layoutConfig.border,
      logo: {
        ...template.layoutConfig.logo,
        url: template.layoutConfig.logo.url || tenant.logoUrl || undefined,
      },
      resolvedFields,
      signatures: template.layoutConfig.signatures,
      qrCode: {
        x: template.layoutConfig.qrCode.x,
        y: template.layoutConfig.qrCode.y,
        size: template.layoutConfig.qrCode.size,
        dataUrl: qrDataUrl,
        verificationUrl,
      },
      pdfBase64,
    };
  }

  /**
   * Generates a raw vector PDF preview buffer for direct streaming.
   */
  async generatePreviewPdf(
    slug: string,
    templateId: string,
    session: SessionPayload,
    sampleOverrides?: Record<string, string>
  ): Promise<{ pdfBytes: Uint8Array; templateTitle: string }> {
    const { tenant } = await this.getAuthorizedTenant(slug, session);
    const template = await this.templateRepo.getTemplateById(tenant.id, templateId);
    if (!template) throw new Error(`Template '${templateId}' not found`);

    const replacements: Record<string, string> = {
      recipient_name: "Dr. Eleanor Vance",
      certificate_number: "CREDVAIL-2026-000001",
      course_name: "Advanced Cryptographic Engineering",
      organization_name: tenant.name,
      issue_date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      completion_date: new Date(Date.now() - 86400000 * 15).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      expiry_date: new Date(Date.now() + 86400000 * 730).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      grade: "First Class with Distinction",
      instructor_name: "Prof. Alan Turing, FRS",
      description: template.description || "In recognition of outstanding achievement and verified competency.",
      verification_url: `https://credvail.io/verify/CREDVAIL-2026-000001`,
      ...(sampleOverrides || {}),
    };

    const verificationUrl =
      replacements["verification_url"] ||
      replacements["credential.verificationUrl"] ||
      `https://credvail.io/verify/CREDVAIL-2026-000001`;

    const pdfBytes = await PdfGenerator.generateCertificate({
      template,
      claims: replacements,
      verificationUrl,
      tenantName: tenant.name,
      tenantLogoUrl: tenant.logoUrl,
    });

    return { pdfBytes, templateTitle: template.title };
  }
}
