import { NextRequest, NextResponse } from "next/server";
import { extractSession } from "@/lib/auth/tenant-context";
import { TenantService } from "@/lib/services/tenant-service";

const tenantService = new TenantService();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const session = extractSession(request);
    const body = await request.json();

    if (!body.token || typeof body.token !== "string" || !body.token.trim()) {
      return NextResponse.json(
        { success: false, error: { code: "BAD_REQUEST", message: "Valid invitation token is required" } },
        { status: 400 }
      );
    }

    const member = await tenantService.acceptInvitation(slug, body.token.trim(), session.sub);

    return NextResponse.json({
      success: true,
      data: member,
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isConflict = error.message?.includes("already been accepted");
    const isExpired = error.message?.includes("expired");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden
            ? "FORBIDDEN"
            : isConflict
            ? "INVITATION_ALREADY_ACCEPTED"
            : isExpired
            ? "INVITATION_EXPIRED"
            : "ACCEPT_FAILED",
          message: error.message || "Failed to accept member invitation",
        },
      },
      { status: isForbidden ? 403 : isConflict ? 409 : isExpired ? 410 : 400 }
    );
  }
}
