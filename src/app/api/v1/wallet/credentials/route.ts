import { NextRequest, NextResponse } from "next/server";
import { WalletService } from "@/lib/wallet/wallet-service";
import { extractSession } from "@/lib/auth/tenant-context";

/**
 * GET /api/v1/wallet/credentials
 *
 * Authenticated endpoint retrieving the holder's claimed credentials.
 * Scoped strictly to the authenticated user's ID (session.sub).
 * Any caller-supplied arbitrary holderId is strictly ignored.
 * Wildcard CORS is explicitly prohibited.
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
        { status: 401 }
      );
    }

    const userId = session.sub;
    const credentials = WalletService.listCredentials(userId);

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
      { status: 200 }
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
