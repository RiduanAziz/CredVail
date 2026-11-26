import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  PrivilegeEscalationError,
  RegistrationService,
  SlugConflictError,
} from "@/lib/services/registration-service";
import {
  getClientIp,
  checkApiRateLimit,
  createRateLimitResponse,
  RATE_LIMIT_PROFILES,
} from "@/lib/services/api-rate-limiter";
import { normalizeIpHash } from "@/lib/repositories/tenant-repository";

const registrationService = new RegistrationService();

const SECURITY_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "Referrer-Policy": "no-referrer",
};

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = await checkApiRateLimit({
      identifier: ip,
      ...RATE_LIMIT_PROFILES.AUTH_REGISTER_INSTITUTION,
    });
    if (!allowed) {
      return createRateLimitResponse(retryAfter, "institutional registration");
    }

    const rawText = await request.text();
    if (rawText.length > 64 * 1024) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "PAYLOAD_TOO_LARGE", message: "Request body exceeds maximum size limit." },
        },
        { status: 413, headers: SECURITY_HEADERS }
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_JSON", message: "Malformed JSON request payload." },
        },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const result = await registrationService.registerInstitution(body, {
      baseUrl,
      ipHash: normalizeIpHash(ip),
    });

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 201, headers: SECURITY_HEADERS }
    );
  } catch (error: any) {
    if (error instanceof PrivilegeEscalationError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: error.message },
        },
        { status: 403, headers: SECURITY_HEADERS }
      );
    }
    if (error instanceof SlugConflictError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "TENANT_CONFLICT", message: error.message },
        },
        { status: 409, headers: SECURITY_HEADERS }
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: error.issues[0]?.message || "Please review highlighted fields.",
            details: error.issues,
          },
        },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }
    if (error?.name === "DatabasePersistenceError" || error?.name === "ApiRateLimitUnavailableError") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Institutional registration is temporarily unavailable. Please try again shortly.",
          },
        },
        { status: 503, headers: SECURITY_HEADERS }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "REGISTRATION_FAILED",
          message: "Unable to complete institutional registration.",
        },
      },
      { status: 400, headers: SECURITY_HEADERS }
    );
  }
}
