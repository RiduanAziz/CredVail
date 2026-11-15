import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { TenantService } from "@/lib/services/tenant-service";

const tenantService = new TenantService();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ctx = extractTenantContext(request, slug, "audit:read");
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const logs = await tenantService.getAuditLogs(slug, ctx.session, limit);

    return NextResponse.json({
      success: true,
      data: logs,
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : "REQUEST_FAILED",
          message: error.message || "Failed to retrieve audit logs",
        },
      },
      { status: isForbidden ? 403 : 400 }
    );
  }
}
