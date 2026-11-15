import { NextRequest, NextResponse } from "next/server";
import { WalletService } from "@/lib/wallet/wallet-service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const holderId = searchParams.get("holderId") || "default_holder";

    const identity = WalletService.getOrCreateHolderIdentity(holderId);
    const credentials = WalletService.listCredentials(holderId);

    return NextResponse.json(
      {
        success: true,
        data: {
          holder: {
            holderId: identity.holderId,
            did: identity.did,
          },
          credentials,
          total: credentials.length,
        },
      },
      {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: error.message || "Failed to retrieve wallet credentials.",
      },
      { status: 500 }
    );
  }
}
