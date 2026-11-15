import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { KeyManagementService } from "@/lib/services/key-management-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ctx = extractTenantContext(request, slug, "keys:compromise");

    const body = await request.json().catch(() => ({}));
    const epoch = typeof body.epoch === "number" ? body.epoch : parseInt(body.epoch, 10);

    if (isNaN(epoch) || epoch < 1) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "A valid positive numeric key epoch is required.",
          },
        },
        { status: 400 }
      );
    }

    const compromisedKey = await KeyManagementService.flagCompromised(slug, epoch, ctx.session);

    return NextResponse.json({
      success: true,
      data: compromisedKey,
      message: `Key Epoch ${epoch} has been flagged as COMPROMISED and immediately revoked.`,
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
          code: error.name || "KEY_COMPROMISE_ERROR",
          message: error.message || "Failed to report key compromise",
        },
      },
      { status }
    );
  }
}
