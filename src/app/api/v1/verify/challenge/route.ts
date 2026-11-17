import { NextRequest, NextResponse } from "next/server";
import { VerificationService } from "@/lib/services/verification-service";

/**
 * Creates a one-use challenge bound to the verifier origin.
 * The audience must be an origin (scheme + host + optional port), not an arbitrary URL.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const audience = typeof body?.audience === "string" ? body.audience : "";

    let parsedAudience: URL;
    try {
      parsedAudience = new URL(audience);
    } catch {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "A valid verifier audience origin is required." },
        { status: 400 }
      );
    }

    const isLocalDevelopment =
      parsedAudience.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(parsedAudience.hostname);
    if (
      (parsedAudience.protocol !== "https:" && !isLocalDevelopment) ||
      parsedAudience.origin !== audience ||
      parsedAudience.username ||
      parsedAudience.password
    ) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "Audience must be an HTTPS origin (HTTP is allowed only for localhost development)." },
        { status: 400 }
      );
    }

    const challenge = VerificationService.createChallengeNonce(300, parsedAudience.origin);

    return NextResponse.json(
      { success: true, data: challenge },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: error.message || "Failed to generate challenge nonce.",
      },
      { status: 500 }
    );
  }
}
