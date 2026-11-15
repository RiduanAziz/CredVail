import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { BatchProcessingService } from "@/lib/services/batch-processing-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const ctx = extractTenantContext(request, slug);

    const { zipBytes, batchNumber } = await BatchProcessingService.getBatchZip(slug, id, ctx.session);

    return new NextResponse(Buffer.from(zipBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${batchNumber}_certificates.zip"`,
        "Content-Length": String(zipBytes.length),
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isNotFound = error.message?.includes("not found");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : isNotFound ? "NOT_FOUND" : "ZIP_DOWNLOAD_FAILED",
          message: error.message || "Failed to download batch ZIP archive",
        },
      },
      { status: isForbidden ? 403 : isNotFound ? 404 : 400 }
    );
  }
}
