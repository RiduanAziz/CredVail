import { NextRequest, NextResponse } from "next/server";
import { WalletService } from "@/lib/wallet/wallet-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { certificateNumber, recipientEmail, holderDid, holderId } = body || {};

    if (!certificateNumber || !recipientEmail) {
      return NextResponse.json(
        {
          error: "BAD_REQUEST",
          message: "Both 'certificateNumber' and 'recipientEmail' are required to claim a credential.",
        },
        { status: 400 }
      );
    }

    const claimed = await WalletService.claimCredential(
      {
        certificateNumber,
        recipientEmail,
        holderDid,
      },
      holderId || "default_holder"
    );

    return NextResponse.json(
      {
        success: true,
        message: `Certificate "${certificateNumber}" successfully claimed into holder wallet.`,
        data: claimed,
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
    const status = error.message?.includes("not found") ? 404 : error.message?.includes("Email verification") ? 403 : 500;
    return NextResponse.json(
      {
        error: status === 404 ? "NOT_FOUND" : status === 403 ? "FORBIDDEN" : "INTERNAL_SERVER_ERROR",
        message: error.message || "Failed to claim credential.",
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
