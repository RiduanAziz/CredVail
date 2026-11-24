import { NextRequest, NextResponse } from "next/server";
import { VerificationService } from "@/lib/services/verification-service";
import {
  getClientIp,
  checkApiRateLimit,
  createRateLimitResponse,
  RATE_LIMIT_PROFILES,
} from "@/lib/services/api-rate-limiter";
import { verifyPresentationSchema } from "@/lib/validation/api-validators";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = await checkApiRateLimit({
      identifier: ip,
      ...RATE_LIMIT_PROFILES.VERIFY_PRESENTATION,
    });

    if (!allowed) {
      return createRateLimitResponse(retryAfter, "presentation verification");
    }

    const rawBody = await request.json().catch(() => ({}));
    const parseResult = verifyPresentationSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "BAD_REQUEST",
          message: parseResult.error.errors[0]?.message || "Request body must contain either a 'credential' or 'presentation' JSON object.",
        },
        { status: 400 }
      );
    }

    const { credential, presentation, nonce } = parseResult.data;

    let result;
    if (presentation) {
      result = await VerificationService.verifyPresentation(presentation, nonce);
    } else if (credential) {
      result = await VerificationService.verifyRawCredential(credential);
    } else {
      return NextResponse.json(
        {
          error: "BAD_REQUEST",
          message: "Request body must contain either a 'credential' or 'presentation' JSON object.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: error.message || "Failed to verify presentation.",
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
