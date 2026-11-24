import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { TemplateService } from "@/lib/services/template-service";
import { checkApiRateLimit, createRateLimitResponse } from "@/lib/services/api-rate-limiter";

const templateService = new TemplateService();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const ctx = extractTenantContext(request, slug);

    const template = await templateService.getTemplate(slug, id, ctx.session);

    return NextResponse.json({
      success: true,
      data: template,
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isNotFound = error.message?.includes("not found");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : isNotFound ? "NOT_FOUND" : "REQUEST_FAILED",
          message: error.message || "Failed to retrieve template",
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
    const ctx = extractTenantContext(request, slug, "templates:update");

    // Rate limiting on template modification
    const rateLimit = await checkApiRateLimit({
      identifier: `${ctx.session.sub}:${slug}`,
      scope: "templates:mutation",
      maxAttempts: 30,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.retryAfter || 60);
    }

    const body = await request.json();
    const updated = await templateService.updateTemplate(slug, id, body, ctx.session);

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isArchived = error.message?.includes("archived");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : isArchived ? "TEMPLATE_ARCHIVED" : "UPDATE_FAILED",
          message: error.message || "Failed to update template",
        },
      },
      { status: isForbidden ? 403 : isArchived ? 400 : 400 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const ctx = extractTenantContext(request, slug, "templates:delete");

    // Rate limiting on template deletion
    const rateLimit = await checkApiRateLimit({
      identifier: `${ctx.session.sub}:${slug}`,
      scope: "templates:mutation",
      maxAttempts: 30,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.retryAfter || 60);
    }

    const success = await templateService.deleteTemplate(slug, id, ctx.session);

    return NextResponse.json({
      success,
      data: { message: "Template deleted successfully" },
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isConflict = error.message?.includes("linked to issued batches");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : isConflict ? "CONFLICT_LINKED_BATCHES" : "DELETE_FAILED",
          message: error.message || "Failed to delete template",
        },
      },
      { status: isForbidden ? 403 : isConflict ? 409 : 400 }
    );
  }
}
