import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { TemplateService } from "@/lib/services/template-service";
import { checkApiRateLimit, createRateLimitResponse, getClientIp } from "@/lib/services/api-rate-limiter";

const templateService = new TemplateService();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const ctx = extractTenantContext(request, slug);

    // Rate limit vector previews
    const clientIp = getClientIp(request);
    const rateLimit = await checkApiRateLimit({
      identifier: `${clientIp}:${slug}`,
      scope: "templates:preview",
      maxAttempts: 60,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.retryAfter || 60);
    }

    const isPdfFormat =
      request.nextUrl.searchParams.get("format") === "pdf" ||
      request.headers.get("accept")?.includes("application/pdf");

    let sampleOverrides: Record<string, string> | undefined;
    try {
      const body = await request.json();
      sampleOverrides = body.sampleOverrides;
    } catch {
      // Body is optional
    }

    if (isPdfFormat) {
      const { pdfBytes, templateTitle } = await templateService.generatePreviewPdf(
        slug,
        id,
        ctx.session,
        sampleOverrides
      );

      return new NextResponse(Buffer.from(pdfBytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="preview_${templateTitle.replace(/[^a-zA-Z0-9]/g, "_")}.pdf"`,
          "Content-Length": String(pdfBytes.length),
          "Cache-Control": "no-cache",
        },
      });
    }

    const preview = await templateService.generatePreview(slug, id, ctx.session, sampleOverrides);

    return NextResponse.json({
      success: true,
      data: preview,
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isNotFound = error.message?.includes("not found");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : isNotFound ? "NOT_FOUND" : "PREVIEW_FAILED",
          message: error.message || "Failed to generate template preview",
        },
      },
      { status: isForbidden ? 403 : isNotFound ? 404 : 400 }
    );
  }
}
