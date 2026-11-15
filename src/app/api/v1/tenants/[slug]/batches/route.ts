import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { BatchService } from "@/lib/services/batch-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ctx = extractTenantContext(request, slug);

    const batches = await BatchService.listBatches(slug, ctx.session);

    return NextResponse.json({
      success: true,
      data: batches,
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isNotFound = error.message?.includes("not found");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : isNotFound ? "NOT_FOUND" : "REQUEST_FAILED",
          message: error.message || "Failed to list batches",
        },
      },
      { status: isForbidden ? 403 : isNotFound ? 404 : 400 }
    );
  }
}
