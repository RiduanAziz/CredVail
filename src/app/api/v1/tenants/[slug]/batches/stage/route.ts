import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { BatchService, stageBatchInputSchema } from "@/lib/services/batch-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ctx = extractTenantContext(request, slug, "batches:create");

    const body = await request.json();
    const validatedInput = stageBatchInputSchema.parse(body);

    const batch = await BatchService.stageBatch(
      slug,
      validatedInput,
      ctx.session
    );

    return NextResponse.json({
      success: true,
      data: batch,
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isNotFound = error.message?.includes("not found");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : isNotFound ? "NOT_FOUND" : "STAGE_FAILED",
          message: error.message || "Failed to stage batch",
          details: error.errors || undefined,
        },
      },
      { status: isForbidden ? 403 : isNotFound ? 404 : 400 }
    );
  }
}
