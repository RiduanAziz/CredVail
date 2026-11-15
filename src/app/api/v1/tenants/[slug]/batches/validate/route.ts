import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { BatchService, validateBatchInputSchema } from "@/lib/services/batch-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ctx = extractTenantContext(request, slug);

    const body = await request.json();
    const validatedInput = validateBatchInputSchema.parse(body);

    const report = await BatchService.validateSpreadsheetData(
      slug,
      validatedInput,
      ctx.session
    );

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isNotFound = error.message?.includes("not found");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : isNotFound ? "NOT_FOUND" : "VALIDATION_FAILED",
          message: error.message || "Failed to validate batch data",
          details: error.errors || undefined,
        },
      },
      { status: isForbidden ? 403 : isNotFound ? 404 : 400 }
    );
  }
}
