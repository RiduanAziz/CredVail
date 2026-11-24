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
    const ctx = extractTenantContext(request, slug, "templates:create");

    // Protect against automated high-volume duplication
    const rateLimit = await checkApiRateLimit({
      identifier: `${ctx.session.sub}:${slug}`,
      scope: "templates:mutation",
      maxAttempts: 30,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.retryAfter || 60);
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Optional body
    }

    const duplicated = await templateService.duplicateTemplate(
      slug,
      id,
      ctx.session,
      body?.newTitle
    );

    return NextResponse.json(
      {
        success: true,
        data: duplicated,
      },
      { status: 201 }
    );
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isNotFound = error.message?.includes("not found");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : isNotFound ? "NOT_FOUND" : "DUPLICATE_FAILED",
          message: error.message || "Failed to duplicate template",
        },
      },
      { status: isForbidden ? 403 : isNotFound ? 404 : 400 }
    );
  }
}
