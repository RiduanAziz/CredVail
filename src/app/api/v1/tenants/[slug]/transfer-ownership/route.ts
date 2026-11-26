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
    const ctx = extractTenantContext(request, slug, "tenant:manage");
    const body = await request.json();

    if (!body?.targetUserId || typeof body.targetUserId !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_INPUT", message: "targetUserId is required" },
        },
        { status: 400 }
      );
    }

    const success = await tenantService.transferOwnership(
      slug,
      body.targetUserId,
      ctx.session
    );

    return NextResponse.json({
      success,
      data: { message: "Organization ownership transferred successfully" },
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : "OWNERSHIP_TRANSFER_FAILED",
          message: error.message || "Failed to transfer organization ownership",
        },
      },
      { status: isForbidden ? 403 : 400 }
    );
  }
}
