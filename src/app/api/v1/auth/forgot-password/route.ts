import { NextRequest, NextResponse } from "next/server";
import { AuthRecoveryService } from "@/lib/services/auth-recovery-service";
import {
  getClientIp,
  checkApiRateLimit,
  createRateLimitResponse,
  RATE_LIMIT_PROFILES,
} from "@/lib/services/api-rate-limiter";

const authRecovery = new AuthRecoveryService();

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = await checkApiRateLimit({
      identifier: ip,
      ...RATE_LIMIT_PROFILES.AUTH_LOGIN,
    });

    if (!allowed) {
      return createRateLimitResponse(retryAfter, "password reset");
    }

    const body = await request.json();
    const result = await authRecovery.requestPasswordReset(body);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "FORGOT_PASSWORD_FAILED",
          message: error.message || "Invalid request",
        },
      },
      { status: 400 }
    );
  }
}
