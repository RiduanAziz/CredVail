import { NextRequest, NextResponse } from "next/server";
import { VerificationService } from "@/lib/services/verification-service";

/**
 * In-memory sliding-window rate limiter for public verification lookups.
 * Limits each client IP to 60 lookups per 60-second window to prevent mass enumeration.
 */
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (record.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  record.count++;
  return { allowed: true };
}

function resetPublicLookupRateLimiter(): void {
  rateLimitMap.clear();
}

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
    // 1. IP Rate Limiting
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";

    const { allowed, retryAfter } = checkRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        {
          error: "TOO_MANY_REQUESTS",
          message: "Public verification rate limit exceeded. Please try again later.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter || 60),
          },
        }
      );
    }

    const { id } = await params;
    if (!id || id.trim().length === 0) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "A credential public identifier is required." },
        { status: 400 }
      );
    }

    // 2. Execute public verification with privacy filtering
    const publicResult = await VerificationService.verifyPublicSafe(id.trim());

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
