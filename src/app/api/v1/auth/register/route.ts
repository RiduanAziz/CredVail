import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  PrivilegeEscalationError,
  RegistrationService,
} from "@/lib/services/registration-service";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from "@/lib/validation/registration";
import {
  getClientIp,
  checkApiRateLimit,
  createRateLimitResponse,
  RATE_LIMIT_PROFILES,
} from "@/lib/services/api-rate-limiter";
import { sanitizeDatabaseErrorMessage } from "@/lib/db/persistence-policy";
import { normalizeIpHash } from "@/lib/repositories/tenant-repository";

const registrationService = new RegistrationService();

/**
 * Legacy registration route kept compatible as a wallet-registration wrapper
 * without ever bypassing email verification or issuing an unverified session cookie.
 */
export async function POST(request: NextRequest) {
  const securityHeaders = {
    "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
    "Referrer-Policy": "no-referrer",
  };

  try {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = await checkApiRateLimit({
      identifier: ip,
      ...RATE_LIMIT_PROFILES.AUTH_REGISTER,
    });
    if (!allowed) {
      return createRateLimitResponse(retryAfter, "registration");
    }

    const rawText = await request.text();
    if (rawText.length > 32 * 1024) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "PAYLOAD_TOO_LARGE", message: "Request payload exceeds limit." },
        },
        { status: 413, headers: securityHeaders }
      );
    }

    let body: any;
    try {
      body = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_JSON", message: "Malformed JSON request payload." },
        },
        { status: 400, headers: securityHeaders }
      );
    }

    const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const enrichedPayload = {
      ...body,
      confirmPassword: body?.confirmPassword ?? body?.password,
      termsAccepted: body?.termsAccepted ?? true,
      privacyAccepted: body?.privacyAccepted ?? true,
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
    };

    const result = await registrationService.registerWallet(enrichedPayload, {
      baseUrl,
      ipHash: normalizeIpHash(ip),
    });

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 201, headers: securityHeaders }
    );
  } catch (error: any) {
    if (error instanceof PrivilegeEscalationError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: error.message },
        },
        { status: 403, headers: securityHeaders }
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: error.issues[0]?.message || "Invalid registration details.",
            details: error.issues,
          },
        },
        { status: 400, headers: securityHeaders }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "REGISTRATION_FAILED",
          message: sanitizeDatabaseErrorMessage(error?.message) || "Failed to register account.",
        },
      },
      { status: 400, headers: securityHeaders }
    );
  }
}
