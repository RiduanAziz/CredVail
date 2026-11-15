import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { TenantService } from "@/lib/services/tenant-service";

const tenantService = new TenantService();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; userId: string }> }
) {
  try {
    const { slug, userId } = await params;
    const ctx = extractTenantContext(request, slug, "members:update_role");
    const body = await request.json();

    const success = await tenantService.updateMemberRole(
      slug,
      userId,
      body.role,
      ctx.session
    );

    return NextResponse.json({
      success,
      data: { message: "Member role updated successfully" },
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : "UPDATE_ROLE_FAILED",
          message: error.message || "Failed to update member role",
        },
      },
      { status: isForbidden ? 403 : 400 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; userId: string }> }
) {
  try {
    const { slug, userId } = await params;
    const ctx = extractTenantContext(request, slug, "members:remove");

    const success = await tenantService.removeMember(slug, userId, ctx.session);

    return NextResponse.json({
      success,
      data: { message: "Member removed successfully" },
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : "REMOVE_MEMBER_FAILED",
          message: error.message || "Failed to remove member",
        },
      },
      { status: isForbidden ? 403 : 400 }
    );
  }
}
