import { NextRequest, NextResponse } from "next/server";
import { WalletService } from "@/lib/wallet/wallet-service";
import { extractSession, AuthenticationError } from "@/lib/auth/tenant-context";
import { checkClaimRateLimit } from "@/lib/services/claim-rate-limiter";

/**
 * POST /api/v1/wallet/claim
 *
 * Authenticated endpoint for claiming an issued credential into a holder's wallet.
 * Requires:
 * 1. Valid user session (session.sub, session.email).
 * 2. High-entropy single-use claim invitation token.
 * 3. Matching certificate number and recipient identity.
 *
 * Rate limiting is enforced against the verified session identity.
 * Wildcard CORS is explicitly prohibited on this authenticated endpoint.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Enforce active user session
    let session;
    try {
      session = extractSession(request);
    } catch (authErr: any) {
      return NextResponse.json(
        {
          error: "UNAUTHORIZED",
          message: authErr.message || "Authentication is required to claim a verifiable credential.",
        },
        { status: 401 }
      );
    }

    // 2. Enforce abuse protection rate limiting keyed to authenticated user
    const rateLimitKey = `user:${session.sub}`;
    const { allowed, retryAfter } = checkClaimRateLimit(rateLimitKey);
    if (!allowed) {
      return NextResponse.json(
        {
          error: "TOO_MANY_REQUESTS",
          message: "Claim rate limit exceeded. Please wait before attempting further claims.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter || 60),
            "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
            "Referrer-Policy": "no-referrer",
          },
        }
      );
    }

    // 3. Parse and validate request payload
    // Note: client-supplied userId or userEmail from body is strictly ignored;
    // only the verified session payload is authoritative for recipient binding.
    const body = await request.json().catch(() => ({}));
    const { certificateNumber, claimToken, holderDid } = body || {};

    if (!certificateNumber || typeof certificateNumber !== "string" || !certificateNumber.trim()) {
      return NextResponse.json(
        {
          error: "BAD_REQUEST",
          message: "Field 'certificateNumber' is required.",
        },
        { status: 400 }
      );
    }

    if (!claimToken || typeof claimToken !== "string" || !claimToken.trim()) {
      return NextResponse.json(
        {
          error: "BAD_REQUEST",
          message: "A single-use high-entropy 'claimToken' is required. Email matching alone is prohibited.",
        },
        { status: 400 }
      );
    }

    // 4. Claim credential bound strictly to the authenticated user and verified session email.
    // Fail-closed enforcement: ONLY session.emailVerified === true establishes verified ownership.
    // Any request-body email or verification parameters (e.g. userEmailVerified: true) are strictly ignored.
    const isEmailVerified = session.emailVerified === true;

    const claimed = await WalletService.claimCredential(
      {
        certificateNumber: certificateNumber.trim(),
        claimToken: claimToken.trim(),
        userId: session.sub,
        userEmail: session.email,
        holderDid,
        userEmailVerified: isEmailVerified,
      },
      session.sub
    );

    return NextResponse.json(
      {
        success: true,
        message: `Certificate "${certificateNumber}" successfully claimed into authenticated wallet.`,
        data: claimed,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
          "Pragma": "no-cache",
          "Referrer-Policy": "no-referrer",
        },
      }
    );
  } catch (error: any) {
    const msg = error.message || "Failed to claim credential.";
    let status = 500;
    let code = "INTERNAL_SERVER_ERROR";

    if (
      msg.includes("not found") ||
      msg.includes("Invalid or unverified") ||
      msg.includes("invalid")
    ) {
      status = 404;
      code = "NOT_FOUND";
    } else if (
      msg.includes("Ownership verification failed") ||
      msg.includes("Access denied") ||
      msg.includes("not verified")
    ) {
      status = 403;
      code = "FORBIDDEN";
    } else if (msg.includes("already been consumed") || msg.includes("expired")) {
      status = 410;
      code = "GONE";
    } else if (msg.includes("required") || msg.includes("mismatch") || msg.includes("permitted")) {
      status = 400;
      code = "BAD_REQUEST";
    }

    return NextResponse.json(
      {
        error: code,
        message: msg,
      },
      {
        status,
        headers: {
          "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
          "Referrer-Policy": "no-referrer",
        },
      }
    );
  }
}
