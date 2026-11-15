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

    const { pdfBytes, certificateNumber } = await BatchProcessingService.getCredentialPdf(
      slug,
      id,
      ctx.session
    );

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${certificateNumber}.pdf"`,
        "Content-Length": String(pdfBytes.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isNotFound = error.message?.includes("not found");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : isNotFound ? "NOT_FOUND" : "PDF_DOWNLOAD_FAILED",
          message: error.message || "Failed to download certificate PDF",
        },
      },
      { status: isForbidden ? 403 : isNotFound ? 404 : 400 }
    );
  }
}
