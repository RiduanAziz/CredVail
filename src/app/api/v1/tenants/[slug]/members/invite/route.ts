import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { TenantService } from "@/lib/services/tenant-service";

const tenantService = new TenantService();

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
