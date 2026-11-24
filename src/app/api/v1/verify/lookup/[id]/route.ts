import { NextRequest, NextResponse } from "next/server";
import { VerificationService } from "@/lib/services/verification-service";
import {
  getClientIp,
  checkApiRateLimit,
  createRateLimitResponse,
  RATE_LIMIT_PROFILES,
} from "@/lib/services/api-rate-limiter";
import { credentialIdSchema, validateParam } from "@/lib/validation/api-validators";

/**
 * GET /api/v1/verify/lookup/[id]
 *
 * Public verification endpoint used by verifiers and QR scanners.
 * Returns ONLY the sanitized PublicVerificationResult DTO.
 * Explicitly strips recipient email and private custom claims.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. IP Rate Limiting (60 requests / 60 seconds)
    const ip = getClientIp(request);
    const { allowed, retryAfter } = await checkApiRateLimit({
      identifier: ip,
      ...RATE_LIMIT_PROFILES.VERIFY_LOOKUP,
    });

    if (!allowed) {
      return createRateLimitResponse(retryAfter, "public verification lookup");
    }

    const { id: rawId } = await params;
    if (!rawId || rawId.trim().length === 0) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "A credential public identifier is required." },
        { status: 400 }
      );
    }

    const id = validateParam(rawId.trim(), credentialIdSchema);

    // 2. Execute public verification with privacy filtering
    const publicResult = await VerificationService.verifyPublicSafe(id);

    return NextResponse.json(
      {
        success: true,
        data: publicResult,
      },
      {
        status: publicResult.status === "NOT_FOUND" ? 404 : 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Cache-Control": "public, max-age=15, stale-while-revalidate=30",
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: error.message || "Failed to execute public verification.",
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
