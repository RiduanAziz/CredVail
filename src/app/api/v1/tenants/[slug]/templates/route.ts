import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { TemplateService } from "@/lib/services/template-service";
import { TemplateCategory } from "@/types/template";
import { checkApiRateLimit, createRateLimitResponse } from "@/lib/services/api-rate-limiter";

const templateService = new TemplateService();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ctx = extractTenantContext(request, slug);
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") as TemplateCategory | undefined;
    const includeArchived = searchParams.get("includeArchived") === "true";

    const templates = await templateService.listTemplates(
      slug,
      ctx.session,
      category || undefined,
      includeArchived
    );

    return NextResponse.json({
      success: true,
      data: templates,
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isNotFound = error.message?.includes("not found");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : isNotFound ? "NOT_FOUND" : "REQUEST_FAILED",
          message: error.message || "Failed to list templates",
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
    const ctx = extractTenantContext(request, slug, "templates:create");

    // Rate limiting on template creation
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
    const template = await templateService.createTemplate(slug, body, ctx.session);

    return NextResponse.json(
      {
        success: true,
        data: template,
      },
      { status: 201 }
    );
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : "CREATE_FAILED",
          message: error.message || "Failed to create certificate template",
        },
      },
      { status: isForbidden ? 403 : 400 }
    );
  }
}
