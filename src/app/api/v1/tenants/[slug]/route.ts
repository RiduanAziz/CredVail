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
    const ctx = extractTenantContext(request, slug);
    const tenant = await tenantService.getOrganization(slug, ctx.session);

    return NextResponse.json({
      success: true,
      data: tenant,
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isNotFound = error.message?.includes("not found");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : isNotFound ? "NOT_FOUND" : "REQUEST_FAILED",
          message: error.message || "Failed to retrieve organization",
        },
      },
      { status: isForbidden ? 403 : isNotFound ? 404 : 400 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ctx = extractTenantContext(request, slug, "tenant:manage");
    const body = await request.json();

    const updated = await tenantService.updateOrganization(slug, body, ctx.session);

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : "UPDATE_FAILED",
          message: error.message || "Failed to update organization",
        },
      },
      { status: isForbidden ? 403 : 400 }
    );
  }
}
