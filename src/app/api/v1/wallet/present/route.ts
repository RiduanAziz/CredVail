import { NextRequest, NextResponse } from "next/server";
import { WalletService } from "@/lib/wallet/wallet-service";
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
 * The server NEVER holds or signs with a holder private key.
 * Wildcard CORS is explicitly prohibited.
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

    // Reject legacy server-side presentation generation requests
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

    // Verify presentation cryptographically against the verifier engine
    const verificationResult = await VerificationService.verifyPresentation(
      presentation,
      nonceToVerify
    );

    // Verify ownership against user's claimed wallet credentials
    const vcs = presentation.verifiableCredential || presentation.verifiableCredentials;
    if (Array.isArray(vcs) && vcs.length > 0) {
      const vc = vcs[0];
      const certNumber = vc.credentialSubject?.certificateNumber || vc.id;
      const userCreds = WalletService.listCredentials(session.sub);

      if (userCreds.length > 0) {
        const ownsCred = userCreds.some(
          (c) => c.credentialId === vc.id || c.certificateNumber === certNumber
        );
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
    }

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
    const msg = error.message || "Failed to process presentation.";
    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: msg,
      },
      { status: 500 }
    );
  }
}
