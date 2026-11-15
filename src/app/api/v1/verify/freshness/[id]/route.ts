import { NextRequest, NextResponse } from "next/server";
import { RevocationFreshnessService } from "@/lib/services/revocation-freshness-service";

/**
 * GET /api/v1/verify/freshness/[id]
 * Public endpoint evaluating the 5-state freshness-aware verification outcome for a credential:
 * VALID_CURRENT | REVOKED | AUTHENTICITY_ONLY | STATUS_UNKNOWN | INVALID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const ttlParam = url.searchParams.get("ttl");
    const maxSnapshotAgeSeconds = ttlParam ? parseInt(ttlParam, 10) : undefined;
    const simulateNetworkFailure = url.searchParams.get("simulate_offline") === "true";

    const result = await RevocationFreshnessService.evaluateFreshness(id, {
      maxSnapshotAgeSeconds,
      simulateNetworkFailure,
    });

    return NextResponse.json({
      success: true,
      data: result,
    }, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: error.message || "Failed to evaluate credential freshness.",
      },
      { status: 500 }
    );
  }
}
