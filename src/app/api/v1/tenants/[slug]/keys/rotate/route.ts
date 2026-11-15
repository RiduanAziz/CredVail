import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { KeyManagementService } from "@/lib/services/key-management-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ctx = extractTenantContext(request, slug, "keys:rotate");

    const newKey = await KeyManagementService.rotateKey(slug, ctx.session);

    return NextResponse.json({
      success: true,
      data: newKey,
      message: `Successfully rotated to Key Epoch ${newKey.keyEpoch}.`,
    });
  } catch (error: any) {
    const status =
      error.name === "AuthenticationError"
        ? 401
        : error.name === "AuthorizationError"
        ? 403
        : 500;
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.name || "KEY_ROTATION_ERROR",
          message: error.message || "Failed to rotate issuer key",
        },
      },
      { status }
    );
  }
}
