import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { RegistrationService } from "@/lib/services/registration-service";
import {
  getClientIp,
  checkApiRateLimit,
  createRateLimitResponse,
  RATE_LIMIT_PROFILES,
} from "@/lib/services/api-rate-limiter";
import { normalizeIpHash } from "@/lib/repositories/tenant-repository";

const registrationService = new RegistrationService();
const resendSchema = z.object({
  email: z.string().trim().email("Valid email address is required"),
});

const SECURITY_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "Referrer-Policy": "no-referrer",
};

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = await checkApiRateLimit({
      identifier: ip,
      ...RATE_LIMIT_PROFILES.AUTH_RESEND_VERIFICATION,
    });
    if (!allowed) {
      return createRateLimitResponse(retryAfter, "resend verification");
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_JSON", message: "Malformed JSON request payload." },
        },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    const validated = resendSchema.parse(body);
    const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const result = await registrationService.resendVerification(validated.email, {
      baseUrl,
      ipHash: normalizeIpHash(ip),
    });

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 200, headers: SECURITY_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "RESEND_VERIFICATION_FAILED",
          message: error.issues?.[0]?.message || "Please provide a valid email address.",
        },
      },
      { status: 400, headers: SECURITY_HEADERS }
    );
  }
}
