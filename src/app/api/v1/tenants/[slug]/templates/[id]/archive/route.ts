import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { TemplateService } from "@/lib/services/template-service";
import { checkApiRateLimit, createRateLimitResponse } from "@/lib/services/api-rate-limiter";

const templateService = new TemplateService();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const ctx = extractTenantContext(request, slug, "templates:update");

    // Rate limiting on template archival
    const rateLimit = await checkApiRateLimit({
      identifier: `${ctx.session.sub}:${slug}`,
      scope: "templates:mutation",
      maxAttempts: 30,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.retryAfter || 60);
    }

    const archived = await templateService.archiveTemplate(slug, id, ctx.session);

    return NextResponse.json({
      success: true,
      data: archived,
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isNotFound = error.message?.includes("not found");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : isNotFound ? "NOT_FOUND" : "ARCHIVE_FAILED",
          message: error.message || "Failed to archive template",
        },
      },
      { status: isForbidden ? 403 : isNotFound ? 404 : 400 }
    );
  }
}
