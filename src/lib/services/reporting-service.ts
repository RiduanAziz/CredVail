import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { assertTenantPermission } from "../auth/rbac.ts";
import type { SessionPayload } from "../auth/session.ts";
import { AuthorizationError } from "../auth/tenant-context.ts";
import { TenantRepository } from "../repositories/tenant-repository.ts";
import { CredentialRepository } from "../repositories/credential-repository.ts";
import { BatchRepository } from "../repositories/batch-repository.ts";

export type ReportFormat = "csv" | "json" | "pdf";
export type ReportResourceType = "credentials" | "audit_logs" | "batches";

export interface ReportExportOptions {
  tenantSlug: string;
  session: SessionPayload;
  format?: ReportFormat;
  resourceType?: ReportResourceType;
  fromDate?: string;
  toDate?: string;
  actionFilter?: string;
  statusFilter?: string;
}

export interface GeneratedReportResult {
  format: ReportFormat;
  resourceType: ReportResourceType;
  rowCount: number;
  filename: string;
  contentType: string;
  body: string | Uint8Array;
}

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? "");
  // Prevent CSV spreadsheet formula injection
  const safe = /^[=+\-@]/.test(str) ? `'${str}` : str;
  return `"${safe.replace(/"/g, '""')}"`;
}

function withinDateRange(isoOrDate: Date | string, fromMs?: number, toMs?: number): boolean {
  const ts = new Date(isoOrDate).getTime();
  if (Number.isNaN(ts)) return false;
  if (fromMs !== undefined && ts < fromMs) return false;
  if (toMs !== undefined && ts > toMs) return false;
  return true;
}

export class ReportingService {
  private static tenantRepo = new TenantRepository();

  static async generateReport(options: ReportExportOptions): Promise<GeneratedReportResult> {
    const format: ReportFormat = options.format || "csv";
    const resourceType: ReportResourceType = options.resourceType || "credentials";

    const tenant = await this.tenantRepo.findBySlug(options.tenantSlug);
    if (!tenant) {
      throw new Error(`Tenant '${options.tenantSlug}' not found`);
    }

    const membership = options.session.tenants?.find(
      (t) => t.slug === options.tenantSlug || t.tenantId === tenant.id
    );
    const isAdmin = options.session.platformRole === "SUPER_ADMIN";
    if (!membership && !isAdmin) {
      throw new AuthorizationError(`Forbidden: No access to tenant '${options.tenantSlug}'`);
    }

    if (!isAdmin) {
      assertTenantPermission(
        membership?.role,
        resourceType === "audit_logs" ? "audit:read" : "credentials:read"
      );
    }

    const fromMs = options.fromDate ? new Date(options.fromDate).getTime() : undefined;
    const toMs = options.toDate ? new Date(options.toDate).getTime() : undefined;
    if (fromMs !== undefined && Number.isNaN(fromMs)) {
      throw new Error("Invalid fromDate filter");
    }
    if (toMs !== undefined && Number.isNaN(toMs)) {
      throw new Error("Invalid toDate filter");
    }

    let rows: Array<Record<string, unknown>> = [];

    if (resourceType === "credentials") {
      const { items } = await CredentialRepository.listCredentials(tenant.id, { limit: 1000 });
      rows = items
        .filter((c) => withinDateRange(c.createdAt, fromMs, toMs))
        .filter((c) => !options.statusFilter || c.state === options.statusFilter)
        .map((c) => ({
          certificateNumber: c.certificateNumber,
          credentialId: c.credentialId,
          recipientName: c.recipientName,
          recipientEmail: c.recipientEmail,
          state: c.state,
          batchId: c.batchId,
          issuedAt: new Date(c.createdAt).toISOString(),
        }));
    } else if (resourceType === "batches") {
      const batches = await BatchRepository.listBatches(tenant.id);
      rows = batches
        .filter((b) => withinDateRange(b.createdAt, fromMs, toMs))
        .filter((b) => !options.statusFilter || b.status === options.statusFilter)
        .map((b) => ({
          batchId: b.id,
          batchNumber: b.batchNumber,
          status: b.status,
          leafCount: b.leafCount,
          merkleRoot: b.merkleRoot || "",
          onChainTxHash: b.onChainTxHash || "",
          createdAt: new Date(b.createdAt).toISOString(),
        }));
    } else {
      const logs = await this.tenantRepo.listAuditLogs(tenant.id, 1000);
      rows = logs
        .filter((l) => withinDateRange(l.createdAt, fromMs, toMs))
        .filter((l) => !options.actionFilter || l.action === options.actionFilter)
        .map((l) => ({
          id: l.id,
          action: l.action,
          resourceType: l.resourceType,
          resourceId: l.resourceId,
          userId: l.userId || "",
          createdAt: l.createdAt,
        }));
    }

    await this.tenantRepo.recordAuditLog({
      tenantId: tenant.id,
      userId: options.session.sub,
      userEmail: options.session.email,
      action: "REPORT_GENERATED",
      resourceType: "TenantReport",
      resourceId: `${tenant.slug}:${resourceType}`,
      metadata: {
        format,
        resourceType,
        rowCount: rows.length,
        fromDate: options.fromDate || null,
        toDate: options.toDate || null,
      },
    });

    const timestampTag = new Date().toISOString().slice(0, 10);
    const filename = `credvail-${tenant.slug}-${resourceType}-${timestampTag}.${format}`;

    if (format === "json") {
      return {
        format,
        resourceType,
        rowCount: rows.length,
        filename,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(
          {
            tenantSlug: tenant.slug,
            tenantName: tenant.name,
            resourceType,
            generatedAt: new Date().toISOString(),
            totalRows: rows.length,
            rows,
          },
          null,
          2
        ),
      };
    }

    if (format === "csv") {
      const headers = rows.length > 0 ? Object.keys(rows[0]) : ["status"];
      const lines = [
        headers.map((h) => escapeCsvCell(h)).join(","),
        ...rows.map((r) => headers.map((h) => escapeCsvCell(r[h])).join(",")),
      ];
      return {
        format,
        resourceType,
        rowCount: rows.length,
        filename,
        contentType: "text/csv; charset=utf-8",
        body: lines.join("\n"),
      };
    }

    // Vector PDF summary export via pdf-lib
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    page.drawText(`CREDVAIL Audit & Operations Report — ${tenant.name}`, {
      x: 42,
      y: 740,
      size: 14,
      font: bold,
      color: rgb(0.08, 0.14, 0.28),
    });
    page.drawText(
      `Resource: ${resourceType} | Total Rows: ${rows.length} | Generated: ${new Date().toISOString()}`,
      { x: 42, y: 718, size: 9, font: regular, color: rgb(0.3, 0.35, 0.42) }
    );

    let y = 690;
    for (const row of rows.slice(0, 32)) {
      const summaryLine = Object.entries(row)
        .map(([k, v]) => `${k}=${String(v ?? "").slice(0, 28)}`)
        .join(" | ")
        .slice(0, 96);
      page.drawText(summaryLine, {
        x: 42,
        y,
        size: 8,
        font: regular,
        color: rgb(0.15, 0.18, 0.22),
      });
      y -= 18;
      if (y < 48) break;
    }

    const pdfBytes = await pdfDoc.save();
    return {
      format,
      resourceType,
      rowCount: rows.length,
      filename,
      contentType: "application/pdf",
      body: pdfBytes,
    };
  }
}
