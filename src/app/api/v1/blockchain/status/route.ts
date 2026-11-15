import { NextResponse } from "next/server";
import { BlockchainService } from "@/lib/blockchain/blockchain-service";

/**
 * GET /api/v1/blockchain/status
 * Public endpoint exposing connected Ethereum Sepolia network status,
 * CredvailRegistry smart contract address, and explorer URL.
 */
export async function GET() {
  try {
    const status = BlockchainService.getNetworkStatus();
    return NextResponse.json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "BLOCKCHAIN_STATUS_ERROR",
          message: error.message || "Failed to retrieve blockchain network status",
        },
      },
      { status: 500 }
    );
  }
}
