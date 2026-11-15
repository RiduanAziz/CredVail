import { NextRequest, NextResponse } from "next/server";
import { WalletService } from "@/lib/wallet/wallet-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      credentialId,
      disclosedKeys,
      challengeNonce,
      verifierDomain,
      holderId,
    } = body || {};

    if (!credentialId || !Array.isArray(disclosedKeys) || !challengeNonce) {
      return NextResponse.json(
        {
          error: "BAD_REQUEST",
          message:
            "Fields 'credentialId', 'disclosedKeys' (string array), and 'challengeNonce' are required.",
        },
        { status: 400 }
      );
    }

    const result = WalletService.createSelectivePresentation(
      credentialId,
      disclosedKeys,
      challengeNonce,
      verifierDomain,
      holderId || "default_holder"
    );

    return NextResponse.json(
      {
        success: true,
        message: "Selective disclosure Verifiable Presentation successfully generated.",
        data: result,
      },
      {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
      }
    );
  } catch (error: any) {
    const status = error.message?.includes("not found") ? 404 : 500;
    return NextResponse.json(
      {
        error: status === 404 ? "NOT_FOUND" : "INTERNAL_SERVER_ERROR",
        message: error.message || "Failed to generate selective presentation.",
      },
      { status }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
