/**
 * CREDVAIL Ingestion & Batch Ingestion Service
 * 
 * Orchestrates:
 * - Spreadsheet file parsing (CSV, TSV, OpenXML XLSX)
 * - SEC-07 Formula Injection Neutralization
 * - Template placeholder column mapping
 * - Recipient validation and duplicate detection
 * - Batch draft staging with collision-safe certificate numbering
 * - RBAC permission verification and tenant audit logging
 */

import { z } from "zod";
import { parseSpreadsheet, ParsedSpreadsheet } from "../csv/spreadsheet-parser.ts";
import {
  ColumnMappingConfig,
  suggestColumnMappings,
  validateSpreadsheetBatch,
  BatchDiagnosticReport,
} from "./batch-validation-service.ts";
import { BatchRepository, IssuanceBatchRecord, StagedRecipientData } from "../repositories/batch-repository.ts";
import { TemplateRepository } from "../repositories/template-repository.ts";
import { TenantRepository } from "../repositories/tenant-repository.ts";
import { assertTenantPermission } from "../auth/rbac.ts";
import { SessionPayload } from "../auth/session.ts";

export const uploadSpreadsheetInputSchema = z.object({
  filename: z.string().min(1, "Filename is required"),
  fileBase64: z.string().min(1, "File content is required"),
});

export const validateBatchInputSchema = z.object({
  templateId: z.string().min(1, "Template selection is required"),
  headers: z.array(z.string()).min(1, "Spreadsheet headers are required"),
  rows: z.array(z.record(z.string())).min(1, "At least one recipient row is required"),
  columnMapping: z.object({
    recipient_name: z.string().min(1, "Recipient name column mapping is required"),
    recipient_email: z.string().min(1, "Recipient email column mapping is required"),
    external_id: z.string().optional(),
    certificate_number: z.string().optional(),
    course_name: z.string().optional(),
    issue_date: z.string().optional(),
    completion_date: z.string().optional(),
    grade: z.string().optional(),
    instructor_name: z.string().optional(),
    customFields: z.record(z.string()).optional(),
  }),
});

export const stageBatchInputSchema = z.object({
  templateId: z.string().min(1, "Template ID is required"),
  title: z.string().optional(),
  stagedRecipients: z.array(
    z.object({
      fullName: z.string().min(1),
      email: z.string().min(1),
      externalIdentifier: z.string().optional(),
      certificateNumberPreview: z.string(),
      courseName: z.string().optional(),
      issueDate: z.string(),
      completionDate: z.string().optional(),
      grade: z.string().optional(),
      instructorName: z.string().optional(),
      customData: z.record(z.string()).optional(),
      status: z.enum(["VALID", "INVALID", "DUPLICATE"]),
      errors: z.array(z.any()).optional(),
    })
  ).min(1, "At least one recipient must be staged"),
});

export class BatchService {
  private static tenantRepo = new TenantRepository();
  private static templateRepo = new TemplateRepository();

  /**
   * Resolves tenant ID from slug and asserts caller membership.
   */
  private static async resolveTenantContext(slug: string, session?: SessionPayload) {
    const tenant = await this.tenantRepo.findBySlug(slug);
    if (!tenant) {
      throw new Error(`Tenant with slug "${slug}" not found.`);
    }

    if (session) {
      const membership = session.tenants?.find((t) => t.slug === slug || t.tenantId === tenant.id);

      if (!membership && session.platformRole !== "SUPER_ADMIN") {
        throw new Error("Forbidden: User is not a member of this tenant.");
      }
      return { tenant, role: membership?.role || "READ_ONLY_STAFF" };
    }

    return { tenant, role: "ORG_OWNER" as const };
  }

  /**
   * Parses an uploaded spreadsheet file, sanitizes DDE injections, and returns sample preview rows.
   */
  static async parseUploadedSpreadsheet(
    tenantSlug: string,
    fileBuffer: Buffer,
    filename: string,
    session?: SessionPayload
  ) {
    const { tenant, role } = await this.resolveTenantContext(tenantSlug, session);
    assertTenantPermission(role, "batches:create");

    // File size check: 15MB max limit
    if (fileBuffer.length > 15 * 1024 * 1024) {
      throw new Error("File exceeds maximum allowable size of 15MB.");
    }

    const parsed = parseSpreadsheet(fileBuffer, filename, {
      sanitizeFormulas: true,
      maxRows: 10000,
    });

    if (parsed.headers.length === 0 || parsed.rowCount === 0) {
      throw new Error("Spreadsheet contains no readable header or recipient data rows.");
    }

    const suggestedMapping = suggestColumnMappings(parsed.headers);
    const sampleRows = parsed.rows.slice(0, 10);

    return {
      filename,
      detectedType: parsed.detectedType,
      rowCount: parsed.rowCount,
      headers: parsed.headers,
      suggestedMapping,
      sampleRows,
      formulaInjections: parsed.formulaInjections,
      rawRows: parsed.rows,
    };
  }

  /**
   * Validates mapped spreadsheet data against the selected template, detecting duplicates and errors.
   */
  static async validateSpreadsheetData(
    tenantSlug: string,
    input: z.infer<typeof validateBatchInputSchema>,
    session?: SessionPayload
  ): Promise<BatchDiagnosticReport> {
    const { tenant, role } = await this.resolveTenantContext(tenantSlug, session);
    assertTenantPermission(role, "batches:create");

    // Verify template exists and belongs to this tenant
    const template = await this.templateRepo.getTemplateById(tenant.id, input.templateId);
    if (!template) {
      throw new Error(`Template with ID "${input.templateId}" not found for this institution.`);
    }

    // Fetch existing tenant recipient emails and cert numbers for duplicate detection
    const existingEmails = await BatchRepository.getExistingRecipientEmails(tenant.id);
    const existingCerts = await BatchRepository.getExistingCertificateNumbers(tenant.id);

    const parsedMock: ParsedSpreadsheet = {
      headers: input.headers,
      rows: input.rows,
      rawGrid: [],
      rowCount: input.rows.length,
      detectedType: "CSV",
      formulaInjections: [],
    };

    const tenantPrefix = tenant.slug.toUpperCase().slice(0, 8);

    const report = validateSpreadsheetBatch(parsedMock, input.columnMapping as ColumnMappingConfig, {
      tenantPrefix,
      year: new Date().getFullYear(),
      existingEmailsInBatch: existingEmails,
      existingCertNumbers: existingCerts,
    });

    return report;
  }

  /**
   * Stages a validated batch into draft status.
   */
  static async stageBatch(
    tenantSlug: string,
    input: z.infer<typeof stageBatchInputSchema>,
    session?: SessionPayload
  ): Promise<IssuanceBatchRecord> {
    const { tenant, role } = await this.resolveTenantContext(tenantSlug, session);
    assertTenantPermission(role, "batches:create");

    // Verify template
    const template = await this.templateRepo.getTemplateById(tenant.id, input.templateId);
    if (!template) {
      throw new Error(`Template with ID "${input.templateId}" does not exist.`);
    }

    if (template.isArchived) {
      throw new Error(`Cannot stage batch: Template "${template.title}" is archived and cannot be used for new issuance.`);
    }

    const validRecipients = input.stagedRecipients.filter((r) => r.status === "VALID");
    if (validRecipients.length === 0) {
      throw new Error("Cannot stage batch: No valid recipient records provided.");
    }

    const batch = await BatchRepository.createBatch({
      tenantId: tenant.id,
      templateId: input.templateId,
      templateVersion: template.version || 1,
      templateSnapshot: template,
      title: input.title,
      stagedRecipients: input.stagedRecipients as StagedRecipientData[],
    });

    // Record audit log
    await this.tenantRepo.recordAuditLog({
      tenantId: tenant.id,
      userId: session?.sub,
      action: "BATCH_STAGED",
      resourceType: "BATCH",
      resourceId: batch.id,
      metadata: {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        validCount: batch.validCount,
        invalidCount: batch.invalidCount,
        templateId: input.templateId,
      },
    });

    return batch;
  }

  /**
   * Lists batches for tenant dashboard.
   */
  static async listBatches(tenantSlug: string, session?: SessionPayload): Promise<IssuanceBatchRecord[]> {
    const { tenant, role } = await this.resolveTenantContext(tenantSlug, session);
    assertTenantPermission(role, "credentials:read");

    return BatchRepository.listBatches(tenant.id);
  }

  /**
   * Retrieves batch details and staged recipients.
   */
  static async getBatchById(
    tenantSlug: string,
    batchId: string,
    session?: SessionPayload
  ): Promise<IssuanceBatchRecord> {
    const { tenant, role } = await this.resolveTenantContext(tenantSlug, session);
    assertTenantPermission(role, "credentials:read");

    const batch = await BatchRepository.findBatchById(tenant.id, batchId);
    if (!batch) {
      throw new Error(`Batch with ID "${batchId}" not found for this institution.`);
    }

    return batch;
  }

  /**
   * Deletes a draft batch.
   */
  static async deleteBatch(
    tenantSlug: string,
    batchId: string,
    session?: SessionPayload
  ): Promise<boolean> {
    const { tenant, role } = await this.resolveTenantContext(tenantSlug, session);
    assertTenantPermission(role, "batches:create");

    const deleted = await BatchRepository.deleteBatch(tenant.id, batchId);

    if (deleted) {
      await this.tenantRepo.recordAuditLog({
        tenantId: tenant.id,
        userId: session?.sub,
        action: "BATCH_DELETED",
        resourceType: "BATCH",
        resourceId: batchId,
      });
    }

    return deleted;
  }
}
