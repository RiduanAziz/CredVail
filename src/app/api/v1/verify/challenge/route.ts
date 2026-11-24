import { NextRequest, NextResponse } from "next/server";
import { VerificationService } from "@/lib/services/verification-service";
import {
  getClientIp,
  checkApiRateLimit,
  createRateLimitResponse,
  RATE_LIMIT_PROFILES,
} from "@/lib/services/api-rate-limiter";
import { audienceOriginSchema } from "@/lib/validation/api-validators";

/**
 * Creates a one-use challenge bound to the verifier origin.
 * The audience must be an origin (scheme + host + optional port), not an arbitrary URL.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = await checkApiRateLimit({
      identifier: ip,
      ...RATE_LIMIT_PROFILES.VERIFY_CHALLENGE,
    });

    if (!allowed) {
      return createRateLimitResponse(retryAfter, "challenge creation");
    }

    const body = await request.json().catch(() => ({}));
    const audienceInput = typeof body?.audience === "string" ? body.audience : "";

    const validationResult = audienceOriginSchema.safeParse(audienceInput);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "A valid verifier audience origin is required." },
        { status: 400 }
      );
    }

    const parsedAudience = new URL(validationResult.data);
    const challenge = await VerificationService.createChallengeNonce(300, parsedAudience.origin);

    return NextResponse.json(
      { success: true, data: challenge },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch {
    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to generate challenge nonce.",
      },
      { status: 500 }
    );
  }
}
