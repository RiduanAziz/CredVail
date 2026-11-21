import { NextRequest, NextResponse } from "next/server";
import { WalletService } from "@/lib/wallet/wallet-service";
import { extractSession, AuthenticationError } from "@/lib/auth/tenant-context";
import { checkClaimRateLimit, ClaimRateLimitUnavailableError } from "@/lib/services/claim-rate-limiter";
import { ClaimError } from "@/lib/repositories/claim-invitation-repository";

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
    try {
      const { allowed, retryAfter } = await checkClaimRateLimit(rateLimitKey);
      if (!allowed) {
        const retryAfterSeconds = typeof retryAfter === "number" && retryAfter > 0 ? retryAfter : 60;
        return NextResponse.json(
          {
            error: "TOO_MANY_REQUESTS",
            message: `Too many claim attempts. Please try again in ${retryAfterSeconds} seconds.`,
            retryAfter: retryAfterSeconds,
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(retryAfterSeconds),
              "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
              "Referrer-Policy": "no-referrer",
            },
          }
        );
      }
    } catch (rateLimitErr: any) {
      // Fail closed with safe HTTP 503 response. Strictly prevent leaking database diagnostics
      // and prevent fallthrough to generic 500 or misclassification as CLAIM_TRANSACTION_BUSY.
      return NextResponse.json(
        {
          error: "SERVICE_UNAVAILABLE",
          code: "CLAIM_RATE_LIMIT_UNAVAILABLE",
          message: "Claim protection is temporarily unavailable. Please retry shortly.",
        },
        {
          status: 503,
          headers: {
            "Retry-After": "5",
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
    if (
      error instanceof ClaimRateLimitUnavailableError ||
      error?.code === "CLAIM_RATE_LIMIT_UNAVAILABLE"
    ) {
      return NextResponse.json(
        {
          error: "SERVICE_UNAVAILABLE",
          code: "CLAIM_RATE_LIMIT_UNAVAILABLE",
          message: "Claim protection is temporarily unavailable. Please retry shortly.",
        },
        {
          status: 503,
          headers: {
            "Retry-After": "5",
            "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
            "Referrer-Policy": "no-referrer",
          },
        }
      );
    }

    const msg = error.message || "Failed to claim credential.";
    let status = 500;

    if (error instanceof ClaimError || (typeof error?.statusCode === "number" && typeof error?.code === "string")) {
      status = error.statusCode;
    } else if (
      msg.includes("already been claimed") ||
      msg.includes("CREDENTIAL_ALREADY_CLAIMED")
    ) {
      status = 409;
    } else if (
      msg.includes("not found") ||
      msg.includes("Invalid or unverified") ||
      msg.includes("invalid")
    ) {
      status = 404;
    } else if (
      msg.includes("Ownership verification failed") ||
      msg.includes("Access denied") ||
      msg.includes("not verified")
    ) {
      status = 403;
    } else if (msg.includes("already been consumed") || msg.includes("expired")) {
      status = 410;
    } else if (msg.includes("required") || msg.includes("mismatch") || msg.includes("permitted")) {
      status = 400;
    }

    const claimCode = error?.code || (
      status === 409 ? "CREDENTIAL_ALREADY_CLAIMED" :
      status === 403 ? (msg.includes("not verified") ? "CLAIM_EMAIL_UNVERIFIED" : "CLAIM_OWNERSHIP_FAILED") :
      status === 410 ? (msg.includes("expired") ? "CLAIM_EXPIRED" : "CLAIM_ALREADY_CONSUMED") :
      status === 404 ? "CLAIM_INVALID" :
      status === 400 ? "CLAIM_INVALID" :
      status === 503 ? "CLAIM_TRANSACTION_BUSY" :
      "CLAIM_ERROR"
    );

    let errorCategory = "INTERNAL_SERVER_ERROR";
    if (status === 400) errorCategory = "BAD_REQUEST";
    else if (status === 403) errorCategory = "FORBIDDEN";
    else if (status === 404) errorCategory = "NOT_FOUND";
    else if (status === 409) errorCategory = "CONFLICT";
    else if (status === 410) errorCategory = "GONE";
    else if (status === 503) errorCategory = "SERVICE_UNAVAILABLE";

    const headers: Record<string, string> = {
      "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
      "Referrer-Policy": "no-referrer",
    };

    if (status === 503 || claimCode === "CLAIM_TRANSACTION_BUSY") {
      headers["Retry-After"] = "1";
    }

    // Never leak raw database error messages or internal diagnostics on 500
    const safeMessage = status === 500 ? "Internal credential claim processing error." : msg;

    return NextResponse.json(
      {
        error: errorCategory,
        code: claimCode,
        message: safeMessage,
      },
      {
        status,
        headers,
      }
    );
  }
}
