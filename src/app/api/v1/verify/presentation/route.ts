import { NextRequest, NextResponse } from "next/server";
import { VerificationService } from "@/lib/services/verification-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { credential, presentation, nonce } = body || {};

    if (!credential && !presentation) {
      return NextResponse.json(
        {
          error: "BAD_REQUEST",
          message: "Request body must contain either a 'credential' or 'presentation' JSON object.",
        },
        { status: 400 }
      );
    }

    let result;
    if (presentation) {
      result = await VerificationService.verifyPresentation(presentation, nonce);
    } else {
      result = await VerificationService.verifyRawCredential(credential);
    }

    return NextResponse.json(
      {
        success: true,
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
    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: error.message || "Failed to verify presentation.",
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
