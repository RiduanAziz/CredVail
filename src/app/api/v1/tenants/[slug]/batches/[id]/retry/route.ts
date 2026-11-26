import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { BatchProcessingService } from "@/lib/services/batch-processing-service";
import {
  checkApiRateLimit,
  createRateLimitResponse,
  RATE_LIMIT_PROFILES,
} from "@/lib/services/api-rate-limiter";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const ctx = extractTenantContext(request, slug, "batches:issue");

    const { allowed, retryAfter } = await checkApiRateLimit({
      identifier: `tenant:${ctx.tenantId}`,
      ...RATE_LIMIT_PROFILES.BATCH_PROCESS,
    });

    if (!allowed) {
      return createRateLimitResponse(retryAfter, "batch retry");
    }

    const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const result = await BatchProcessingService.retryFailedBatchItems(
      slug,
      id,
      ctx.session,
      baseUrl
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isNotFound = error.message?.includes("not found");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : isNotFound ? "NOT_FOUND" : "BATCH_RETRY_FAILED",
          message: error.message || "Failed to retry batch items",
        },
      },
      { status: isForbidden ? 403 : isNotFound ? 404 : 400 }
    );
  }
}
