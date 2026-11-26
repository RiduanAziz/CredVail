import { NextRequest, NextResponse } from "next/server";
import { AuthService, EmailNotVerifiedError } from "@/lib/services/auth-service";
import { getSessionCookieHeader } from "@/lib/auth/session";
import {
  getClientIp,
  checkApiRateLimit,
  createRateLimitResponse,
  RATE_LIMIT_PROFILES,
} from "@/lib/services/api-rate-limiter";

const authService = new AuthService();

const SECURITY_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "Referrer-Policy": "no-referrer",
};

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = await checkApiRateLimit({
      identifier: ip,
      ...RATE_LIMIT_PROFILES.AUTH_LOGIN,
    });

    if (!allowed) {
      return createRateLimitResponse(retryAfter, "login");
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

    const result = await authService.login(body);

    const response = NextResponse.json(
      {
        success: true,
        data: result.user,
      },
      { status: 200, headers: SECURITY_HEADERS }
    );

    response.headers.set("Set-Cookie", getSessionCookieHeader(result.token));

    return response;
  } catch (error: any) {
    if (error instanceof EmailNotVerifiedError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "EMAIL_NOT_VERIFIED",
            message: error.message,
            requiresEmailVerification: true,
            email: error.email,
          },
        },
        { status: 403, headers: SECURITY_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "AUTHENTICATION_FAILED",
          message: error.message || "Invalid credentials",
        },
      },
      { status: 401, headers: SECURITY_HEADERS }
    );
  }
}
