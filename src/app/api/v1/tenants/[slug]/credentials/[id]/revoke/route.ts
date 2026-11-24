import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { RevocationFreshnessService } from "@/lib/services/revocation-freshness-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const context = extractTenantContext(request, slug, "credentials:revoke");

    const body = await request.json().catch(() => ({}));
    const reason = body.reason || "Revoked by institutional authority";

    const outcome = await RevocationFreshnessService.revokeCredential({
      tenantId: context.tenantId,
      credentialIdOrCertNumber: id,
      reason,
      actorUserId: context.userId,
      actorEmail: context.session.email,
      anchorOnChain: true,
    });

    return NextResponse.json({
      success: true,
      message: `Credential "${outcome.credential.certificateNumber}" has been successfully revoked.`,
      data: outcome.credential,
      snapshot: {
        epoch: outcome.snapshot.epoch,
        digestSha256: outcome.snapshot.digestSha256,
        onChainTxHash: outcome.txHash,
        blockNumber: outcome.blockNumber,
      },
    });
  } catch (error: any) {
    const status = error.name === "AuthorizationError" ? 403 : error.name === "AuthenticationError" ? 401 : error.message?.includes("not found") ? 404 : 500;
    return NextResponse.json(
      {
        error: status === 403 ? "FORBIDDEN" : status === 401 ? "UNAUTHORIZED" : status === 404 ? "NOT_FOUND" : "INTERNAL_SERVER_ERROR",
        message: error.message || "Failed to revoke credential.",
      },
      { status }
    );
  }
}
