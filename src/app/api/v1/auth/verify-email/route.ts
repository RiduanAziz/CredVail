import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  getSessionCookieHeader,
  verifySessionToken,
} from "@/lib/auth/session";
import { AuthRecoveryService } from "@/lib/services/auth-recovery-service";
import { RegistrationService } from "@/lib/services/registration-service";
import {
  getClientIp,
  checkApiRateLimit,
  createRateLimitResponse,
  RATE_LIMIT_PROFILES,
} from "@/lib/services/api-rate-limiter";
import { normalizeIpHash } from "@/lib/repositories/tenant-repository";

const authRecovery = new AuthRecoveryService();
const registrationService = new RegistrationService();

const SECURITY_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "Referrer-Policy": "no-referrer",
};

async function handleVerifyToken(rawToken: string, ip: string) {
  const ipHash = normalizeIpHash(ip);
  if (rawToken.startsWith("credvail_vrf_")) {
    const legacy = await authRecovery.confirmEmailVerification({ token: rawToken });
    return NextResponse.json({ success: true, data: legacy }, { headers: SECURITY_HEADERS });
  }

  const outcome = await registrationService.verifyEmail(rawToken, { ipHash });
  const response = NextResponse.json(
    {
      success: true,
      data: {
        verified: outcome.verified,
        user: outcome.user,
        redirectPath: outcome.redirectPath,
      },
    },
    { status: 200, headers: SECURITY_HEADERS }
  );
  response.headers.set("Set-Cookie", getSessionCookieHeader(outcome.token));
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = await checkApiRateLimit({
      identifier: ip,
      ...RATE_LIMIT_PROFILES.AUTH_VERIFY_EMAIL,
    });
    if (!allowed) {
      return createRateLimitResponse(retryAfter, "email verification");
    }

    const token = request.nextUrl.searchParams.get("token") || "";
    return await handleVerifyToken(token, ip);
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "EMAIL_VERIFICATION_FAILED",
          message: error.message || "Invalid or expired verification link.",
        },
      },
      { status: 400, headers: SECURITY_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = await checkApiRateLimit({
      identifier: ip,
      ...RATE_LIMIT_PROFILES.AUTH_VERIFY_EMAIL,
    });
    if (!allowed) {
      return createRateLimitResponse(retryAfter, "email verification");
    }

    const rawText = await request.text();
    let body: any = {};
    if (rawText.trim().length > 0) {
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
    }

    if (typeof body?.token === "string" && body.token.trim().length > 0) {
      return await handleVerifyToken(body.token.trim(), ip);
    }

    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = sessionToken ? verifySessionToken(sessionToken) : null;
    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Verification token or active session is required.",
          },
        },
        { status: 401, headers: SECURITY_HEADERS }
      );
    }

    const result = await authRecovery.requestEmailVerification(session.sub);
    return NextResponse.json({ success: true, data: result }, { headers: SECURITY_HEADERS });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "EMAIL_VERIFICATION_FAILED",
          message: error.message || "Email verification failed.",
        },
      },
      { status: 400, headers: SECURITY_HEADERS }
    );
  }
}
