import { NextRequest, NextResponse } from "next/server";
import {
  WalletService,
  WalletStorageUnavailableError,
} from "@/lib/wallet/wallet-service";
import { VerificationService } from "@/lib/services/verification-service";
import { extractSession } from "@/lib/auth/tenant-context";

/**
 * POST /api/v1/wallet/present
 *
 * Authenticated endpoint for presenting a client-signed Verifiable Presentation.
 * Requires:
 * 1. Active user session (session.sub).
 * 2. Client-signed W3C Verifiable Presentation (generated in browser via Web Crypto).
 * 3. Valid, unexpired single-use verifier challenge nonce.
 *
 * Security Architecture (H1.3.3 / H1.3.3.1):
 * 1. MANDATORY OWNERSHIP PRE-CHECK: The server validates that the authenticated holder (session.sub)
 *    durably owns all presented credentials in PostgreSQL BEFORE invoking cryptographic verification.
 * 2. REPLAY PROTECTION INTEGRITY: By rejecting unowned credentials before cryptographic verification,
 *    an attacker presenting an unauthorized credential cannot burn or consume the verifier's challenge nonce.
 * 3. FAIL-CLOSED RELIABILITY: If database storage is unreachable during ownership evaluation,
 *    the request fails closed with HTTP 503 (WALLET_STORAGE_UNAVAILABLE).
 * 4. The server NEVER holds or signs with a holder private key.
 * 5. Wildcard CORS is explicitly prohibited.
 */
export async function POST(request: NextRequest) {
  try {
    let session;
    try {
      session = extractSession(request);
    } catch (authErr: any) {
      return NextResponse.json(
        {
          error: "UNAUTHORIZED",
          message: authErr.message || "Authentication is required to present credentials.",
        },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { presentation, challengeNonce } = body || {};

    // Reject invalid presentation structures
    if (!presentation || typeof presentation !== "object") {
      return NextResponse.json(
        {
          error: "BAD_REQUEST",
          message:
            "A client-signed 'presentation' object is required. Server-side holder presentation generation has been deprecated and removed for security.",
        },
        { status: 400 }
      );
    }

    const nonceToVerify = challengeNonce || presentation.proof?.challenge;
    if (!nonceToVerify || typeof nonceToVerify !== "string") {
      return NextResponse.json(
        {
          error: "BAD_REQUEST",
          message:
            "A verifier 'challengeNonce' is required for replay-resistant presentation verification.",
        },
        { status: 400 }
      );
    }

    // Extract and validate embedded verifiable credentials
    const rawVcs = presentation.verifiableCredential || presentation.verifiableCredentials;
    const vcs = Array.isArray(rawVcs) ? rawVcs : (rawVcs ? [rawVcs] : []);
    if (vcs.length === 0) {
      return NextResponse.json(
        {
          error: "BAD_REQUEST",
          message: "Presentation must contain at least one verifiable credential.",
        },
        { status: 400 }
      );
    }

    // MANDATORY OWNERSHIP PRE-CHECK:
    // Verify that every credential in the presentation is durably claimed by session.sub.
    // This MUST occur BEFORE verifyPresentation() to prevent unowned presentations
    // from consuming single-use verifier challenge nonces.
    for (const vc of vcs) {
      if (!vc || typeof vc !== "object") {
        return NextResponse.json(
          {
            error: "BAD_REQUEST",
            message: "Presented credential must be a valid Verifiable Credential object.",
          },
          { status: 400 }
        );
      }

      const vcId = typeof vc.id === "string" && vc.id.trim().length > 0 ? vc.id.trim() : undefined;
      if (!vcId) {
        return NextResponse.json(
          {
            error: "BAD_REQUEST",
            message: "Presented credential must include a valid credential identifier ('id').",
          },
          { status: 400 }
        );
      }

      const certNumber =
        typeof vc.credentialSubject?.certificateNumber === "string" &&
        vc.credentialSubject.certificateNumber.trim().length > 0
          ? vc.credentialSubject.certificateNumber.trim()
          : undefined;

      let ownsCred = false;
      try {
        ownsCred = await WalletService.userOwnsCredential(session.sub, vcId, certNumber);
      } catch (storageErr: any) {
        if (
          storageErr instanceof WalletStorageUnavailableError ||
          storageErr?.code === "WALLET_STORAGE_UNAVAILABLE"
        ) {
          return NextResponse.json(
            {
              error: "SERVICE_UNAVAILABLE",
              code: "WALLET_STORAGE_UNAVAILABLE",
              message: "Wallet data is temporarily unavailable. Please retry shortly.",
            },
            { status: 503 }
          );
        }
        throw storageErr;
      }

      if (!ownsCred) {
        return NextResponse.json(
          {
            error: "FORBIDDEN",
            message:
              "Ownership verification failed: Presented credential does not belong to the authenticated holder.",
          },
          { status: 403 }
        );
      }
    }

    // Cryptographic verification and atomic challenge nonce consumption
    const verificationResult = await VerificationService.verifyPresentation(
      presentation,
      nonceToVerify
    );

    if (!verificationResult.isValid) {
      return NextResponse.json(
        {
          error: "BAD_REQUEST",
          message: "Presentation verification failed.",
          data: verificationResult,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Client-signed Verifiable Presentation verified successfully.",
        data: {
          presentation,
          verificationResult,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    if (
      error instanceof WalletStorageUnavailableError ||
      error?.code === "WALLET_STORAGE_UNAVAILABLE"
    ) {
      return NextResponse.json(
        {
          error: "SERVICE_UNAVAILABLE",
          code: "WALLET_STORAGE_UNAVAILABLE",
          message: "Wallet data is temporarily unavailable. Please retry shortly.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to process presentation.",
      },
      { status: 500 }
    );
  }
}
