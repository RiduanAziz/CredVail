import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { RevocationFreshnessService } from "@/lib/services/revocation-freshness-service";

/**
 * POST /api/v1/tenants/[slug]/status/snapshots/anchor
 * Institutional endpoint to trigger on-demand anchoring of the current status snapshot to Sepolia.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const context = extractTenantContext(request, slug, "batches:issue");

    const result = await RevocationFreshnessService.anchorStatusSnapshot(context.tenantId);

    return NextResponse.json({
      success: true,
      message: `Status snapshot epoch #${result.snapshot.epoch} anchored successfully on Ethereum Sepolia.`,
      data: {
        epoch: result.snapshot.epoch,
        digestSha256: result.snapshot.digestSha256,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        anchoredAt: result.snapshot.anchoredAt,
      },
    });
  } catch (error: any) {
    const status = error.name === "AuthorizationError" ? 403 : error.name === "AuthenticationError" ? 401 : 500;
    return NextResponse.json(
      {
        error: status === 403 ? "FORBIDDEN" : status === 401 ? "UNAUTHORIZED" : "INTERNAL_SERVER_ERROR",
        message: error.message || "Failed to anchor status snapshot.",
      },
      { status }
    );
  }
}
