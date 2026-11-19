import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { BatchProcessingService } from "@/lib/services/batch-processing-service";

/**
 * GET /api/v1/tenants/:slug/batches/:id/claim-export
 *
 * Authenticated endpoint for tenant administrators/issuers to export recipient claim links.
 * Requires:
 * 1. Active user session belonging to this tenant.
 * 2. 'batches:create' or tenant administrator permission.
 *
 * Security controls:
 * - Cross-tenant access is strictly denied (403/404).
 * - Claim links are never exposed via unauthenticated endpoints.
 * - Cache-Control: private, no-store, no-cache is enforced.
 * - Referrer-Policy: no-referrer prevents claim URL fragment leakage.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const ctx = extractTenantContext(request, slug, "batches:create");

    const exportData = await BatchProcessingService.getBatchClaimExport(
      slug,
      id,
      ctx.session
    );

    const format = request.nextUrl.searchParams.get("format");
    if (format === "csv") {
      return new NextResponse(exportData.exportCsv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${exportData.batchNumber}_claim_links.csv"`,
          "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
          "Pragma": "no-cache",
          "Referrer-Policy": "no-referrer",
          "X-CredVail-Delivery": "transient-process-local",
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: exportData,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
          "Pragma": "no-cache",
          "Referrer-Policy": "no-referrer",
          "X-CredVail-Delivery": "transient-process-local",
        },
      }
    );
  } catch (error: any) {
    const isForbidden =
      error.name === "AuthorizationError" ||
      error.message?.includes("Forbidden") ||
      error.message?.includes("Unauthorized") ||
      error.message?.includes("Access denied");
    const isNotFound =
      error.message?.includes("not found") ||
      error.message?.includes("not available") ||
      error.message?.includes("expired");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : isNotFound ? "NOT_FOUND" : "CLAIM_EXPORT_FAILED",
          message: error.message || "Failed to retrieve batch claim export",
        },
      },
      {
        status: isForbidden ? 403 : isNotFound ? 404 : 400,
        headers: {
          "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
          "Referrer-Policy": "no-referrer",
        },
      }
    );
  }
}
