import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { RecipientService } from "@/lib/services/recipient-service";
import { checkApiRateLimit, createRateLimitResponse } from "@/lib/services/api-rate-limiter";

const recipientService = new RecipientService();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ctx = extractTenantContext(request, slug, "credentials:read");

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const offset = (page - 1) * limit;

    const result = await recipientService.listRecipients(slug, ctx.session, {
      search,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: result.items,
      meta: {
        page,
        limit,
        total: result.total,
      },
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isNotFound = error.message?.includes("not found");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : isNotFound ? "NOT_FOUND" : "REQUEST_FAILED",
          message: error.message || "Failed to list recipients",
        },
      },
      { status: isForbidden ? 403 : isNotFound ? 404 : 400 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ctx = extractTenantContext(request, slug, "batches:create");

    // Rate limiting
    const rateLimit = await checkApiRateLimit({
      identifier: `${ctx.session.sub}:${slug}`,
      scope: "recipients:create",
      maxAttempts: 60,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.retryAfter || 60);
    }

    const body = await request.json();
    const recipient = await recipientService.createRecipient(slug, body, ctx.session);

    return NextResponse.json(
      {
        success: true,
        data: recipient,
      },
      { status: 201 }
    );
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isConflict = error.message?.includes("already exists");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : isConflict ? "CONFLICT_EMAIL_EXISTS" : "CREATE_FAILED",
          message: error.message || "Failed to create recipient",
        },
      },
      { status: isForbidden ? 403 : isConflict ? 409 : 400 }
    );
  }
}
