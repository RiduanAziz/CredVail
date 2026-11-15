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
import { STANDARD_PLACEHOLDERS, DEFAULT_PAGE_DIMENSIONS } from "@/lib/templates/presets";
import { PdfGenerator } from "@/lib/pdf/pdf-generator";

export const createTemplateInputSchema = z.object({
  title: z.string().min(2, "Template title must be at least 2 characters long"),
  description: z.string().optional(),
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
      width: z.number().positive(),
      height: z.number().positive(),
      orientation: z.enum(["LANDSCAPE", "PORTRAIT"]),
      unit: z.enum(["PX", "MM"]),
    })
    .optional(),
  layoutConfig: z.object({
    backgroundColor: z.string(),
    secondaryBackgroundColor: z.string().optional(),
    border: z.object({
      style: z.enum(["classic", "modern", "ornate", "minimal", "none"]),
      color: z.string(),
      secondaryColor: z.string().optional(),
      width: z.number(),
    }),
    logo: z.object({
      url: z.string().optional(),
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }),
    fields: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        placeholder: z.string(),
        defaultValue: z.string(),
        x: z.number(),
        y: z.number(),
        width: z.number().optional(),
        height: z.number().optional(),
        fontSize: z.number(),
        fontFamily: z.string(),
        fontWeight: z.enum(["normal", "medium", "semibold", "bold"]),
        fontStyle: z.enum(["normal", "italic"]).optional(),
        color: z.string(),
        align: z.enum(["left", "center", "right"]),
        isMandatory: z.boolean().optional(),
      })
    ),
    signatures: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        signatoryName: z.string(),
        signatureImageUrl: z.string().optional(),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      })
    ),
    qrCode: z.object({
      x: z.number(),
      y: z.number(),
      size: z.number(),
      errorCorrectionLevel: z.enum(["L", "M", "Q", "H"]),
      includeMargin: z.boolean(),
      color: z
        .object({
          dark: z.string(),
          light: z.string(),
        })
        .optional(),
    }),
    customVariables: z.array(z.string()).optional(),
  }),
  backgroundImageUrl: z.string().url("Must be a valid URL").optional(),
  isDefault: z.boolean().optional(),
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
    category?: TemplateCategory
  ): Promise<CertificateTemplateRecord[]> {
    const { tenant } = await this.getAuthorizedTenant(slug, session);

    // Auto-seed presets if first time
    await this.templateRepo.seedPresetsIfEmpty(tenant.id, tenant.name);

    return await this.templateRepo.listTemplates(tenant.id, category);
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

    const updated = await this.templateRepo.updateTemplate(tenant.id, templateId, input);

    await this.tenantRepo.recordAuditLog({
      tenantId: tenant.id,
      userId: session.sub,
      userEmail: session.email,
      action: "TEMPLATE_UPDATED",
      resourceType: "CertificateTemplate",
      resourceId: templateId,
      metadata: { changedFields: Object.keys(input) },
    });

    return updated;
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

    // Build replacement dictionary
    const replacements: Record<string, string> = {
      "{{recipient_name}}": "Dr. Eleanor Vance",
      "{{certificate_number}}": "CREDVAIL-2026-000001",
      "{{course_name}}": "Advanced Cryptographic Engineering",
      "{{organization_name}}": tenant.name,
      "{{issue_date}}": new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      "{{completion_date}}": new Date(Date.now() - 86400000 * 15).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      "{{grade}}": "First Class with Distinction",
      "{{instructor_name}}": "Prof. Alan Turing, FRS",
      "{{verification_url}}": `https://credvail.io/verify/CREDVAIL-2026-000001`,
      ...(sampleOverrides || {}),
    };

    // Resolve text fields
    const resolvedFields = template.layoutConfig.fields.map((field) => {
      let text = field.placeholder;
      for (const [key, value] of Object.entries(replacements)) {
        text = text.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), value);
      }

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
    const verificationUrl = replacements["{{verification_url}}"] || `https://credvail.io/verify/CREDVAIL-2026-000001`;
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
      "{{recipient_name}}": "Dr. Eleanor Vance",
      "{{certificate_number}}": "CREDVAIL-2026-000001",
      "{{course_name}}": "Advanced Cryptographic Engineering",
      "{{organization_name}}": tenant.name,
      "{{issue_date}}": new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      "{{completion_date}}": new Date(Date.now() - 86400000 * 15).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      "{{grade}}": "First Class with Distinction",
      "{{instructor_name}}": "Prof. Alan Turing, FRS",
      "{{verification_url}}": `https://credvail.io/verify/CREDVAIL-2026-000001`,
      ...(sampleOverrides || {}),
    };

    const verificationUrl = replacements["{{verification_url}}"] || `https://credvail.io/verify/CREDVAIL-2026-000001`;

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
