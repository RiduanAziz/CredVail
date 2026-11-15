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
    const members = await tenantService.listMembers(slug, ctx.session);

    return NextResponse.json({
      success: true,
      data: members,
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : "REQUEST_FAILED",
          message: error.message || "Failed to list members",
        },
      },
      { status: isForbidden ? 403 : 400 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ctx = extractTenantContext(request, slug, "members:invite");
    const body = await request.json();

    const newMember = await tenantService.inviteMember(slug, body, ctx.session);

    return NextResponse.json(
      {
        success: true,
        data: newMember,
      },
      { status: 201 }
    );
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : "INVITATION_FAILED",
          message: error.message || "Failed to invite member",
        },
      },
      { status: isForbidden ? 403 : 400 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ctx = extractTenantContext(request, slug, "members:update_role");
    const body = await request.json();

    const success = await tenantService.updateMemberRole(
      slug,
      body.userId,
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
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ctx = extractTenantContext(request, slug, "members:remove");
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "BAD_REQUEST", message: "userId query parameter is required" },
        },
        { status: 400 }
      );
    }

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
