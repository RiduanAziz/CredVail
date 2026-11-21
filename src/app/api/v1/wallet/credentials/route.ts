import { NextRequest, NextResponse } from "next/server";
import {
  WalletService,
  WalletStorageUnavailableError,
} from "@/lib/wallet/wallet-service";
import { extractSession } from "@/lib/auth/tenant-context";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
};

/**
 * GET /api/v1/wallet/credentials
 *
 * Authenticated endpoint retrieving the holder's durable claimed credentials from PostgreSQL.
 * Scoped strictly to the authenticated user's ID (session.sub).
 * Any caller-supplied arbitrary holderId is strictly ignored.
 * Wildcard CORS is explicitly prohibited.
 * Sets Cache-Control: private, no-store, no-cache, max-age=0, must-revalidate.
 */
export async function GET(request: NextRequest) {
  try {
    let session;
    try {
      session = extractSession(request);
    } catch (authErr: any) {
      return NextResponse.json(
        {
          error: "UNAUTHORIZED",
          message: authErr.message || "Authentication is required to access wallet credentials.",
        },
        {
          status: 401,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    const userId = session.sub;
    const credentials = await WalletService.listClaimedCredentials(userId);

    return NextResponse.json(
      {
        success: true,
        data: {
          holder: {
            holderId: userId,
          },
          credentials,
          total: credentials.length,
        },
      },
      {
        status: 200,
        headers: NO_STORE_HEADERS,
      }
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
        {
          status: 503,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to retrieve wallet credentials.",
      },
      {
        status: 500,
        headers: NO_STORE_HEADERS,
      }
    );
  }
}
