import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import {
  ReportingService,
  type ReportFormat,
  type ReportResourceType,
} from "@/lib/services/reporting-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const sp = request.nextUrl.searchParams;
    const format = (sp.get("format") || "csv").toLowerCase() as ReportFormat;
    const resourceType = (sp.get("type") || "credentials").toLowerCase() as ReportResourceType;

    if (!["csv", "json", "pdf"].includes(format)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_FORMAT", message: "Format must be csv, json, or pdf" } },
        { status: 400 }
      );
    }
    if (!["credentials", "audit_logs", "batches"].includes(resourceType)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_RESOURCE_TYPE",
            message: "Type must be credentials, audit_logs, or batches",
          },
        },
        { status: 400 }
      );
    }

    const ctx = extractTenantContext(
      request,
      slug,
      resourceType === "audit_logs" ? "audit:read" : "credentials:read"
    );

    const report = await ReportingService.generateReport({
      tenantSlug: slug,
      session: ctx.session,
      format,
      resourceType,
      fromDate: sp.get("from") || undefined,
      toDate: sp.get("to") || undefined,
      actionFilter: sp.get("action") || undefined,
      statusFilter: sp.get("status") || undefined,
    });

    const responseBody =
      typeof report.body === "string"
        ? report.body
        : Buffer.from(report.body);

    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        "Content-Type": report.contentType,
        "Content-Disposition": `attachment; filename="${report.filename}"`,
        "X-Credvail-Report-Rows": String(report.rowCount),
      },
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : "REPORT_EXPORT_FAILED",
          message: error.message || "Failed to generate report",
        },
      },
      { status: isForbidden ? 403 : 400 }
    );
  }
}
