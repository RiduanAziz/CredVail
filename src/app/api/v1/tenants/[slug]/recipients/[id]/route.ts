import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { RecipientService } from "@/lib/services/recipient-service";
import { checkApiRateLimit, createRateLimitResponse } from "@/lib/services/api-rate-limiter";

const recipientService = new RecipientService();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const ctx = extractTenantContext(request, slug, "credentials:read");

    const recipient = await recipientService.getRecipient(slug, id, ctx.session);

    return NextResponse.json({
      success: true,
      data: recipient,
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isNotFound = error.message?.includes("not found");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : isNotFound ? "NOT_FOUND" : "REQUEST_FAILED",
          message: error.message || "Failed to retrieve recipient",
        },
      },
      { status: isForbidden ? 403 : isNotFound ? 404 : 400 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const ctx = extractTenantContext(request, slug, "batches:create");

    const rateLimit = await checkApiRateLimit({
      identifier: `${ctx.session.sub}:${slug}`,
      scope: "recipients:update",
      maxAttempts: 60,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.retryAfter || 60);
    }

    const body = await request.json();
    const updated = await recipientService.updateRecipient(slug, id, body, ctx.session);

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isNotFound = error.message?.includes("not found");
    const isConflict = error.message?.includes("already exists");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : isNotFound ? "NOT_FOUND" : isConflict ? "CONFLICT_EMAIL_EXISTS" : "UPDATE_FAILED",
          message: error.message || "Failed to update recipient",
        },
      },
      { status: isForbidden ? 403 : isNotFound ? 404 : isConflict ? 409 : 400 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const ctx = extractTenantContext(request, slug, "batches:create");

    const success = await recipientService.deleteRecipient(slug, id, ctx.session);

    return NextResponse.json({
      success,
      data: { message: "Recipient deleted successfully" },
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isConflict = error.message?.includes("linked to issued credentials");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : isConflict ? "CONFLICT_LINKED_CREDENTIALS" : "DELETE_FAILED",
          message: error.message || "Failed to delete recipient",
        },
      },
      { status: isForbidden ? 403 : isConflict ? 409 : 400 }
    );
  }
}
