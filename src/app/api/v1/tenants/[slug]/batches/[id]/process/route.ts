import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { BatchProcessingService } from "@/lib/services/batch-processing-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const ctx = extractTenantContext(request, slug);

    const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const result = await BatchProcessingService.processBatch(slug, id, ctx.session, baseUrl);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isNotFound = error.message?.includes("not found");
    const isConflict = error.message?.includes("already been processed");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden
            ? "FORBIDDEN"
            : isNotFound
            ? "NOT_FOUND"
            : isConflict
            ? "BATCH_ALREADY_PROCESSED"
            : "BATCH_PROCESSING_FAILED",
          message: error.message || "Failed to process batch and generate certificates",
        },
      },
      { status: isForbidden ? 403 : isNotFound ? 404 : isConflict ? 409 : 400 }
    );
  }
}
