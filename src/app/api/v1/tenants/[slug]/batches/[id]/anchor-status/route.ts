import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { assertTenantPermission } from "@/lib/auth/rbac";
import { BatchRepository } from "@/lib/repositories/batch-repository";
import { TenantRepository } from "@/lib/repositories/tenant-repository";
import { BlockchainService } from "@/lib/blockchain/blockchain-service";

const tenantRepo = new TenantRepository();

/**
 * GET /api/v1/tenants/:slug/batches/:id/anchor-status
 * Checks live or simulated transaction receipt status and confirmation count for a batch.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const ctx = extractTenantContext(request, slug, "credentials:read");
    const tenant = await tenantRepo.findBySlug(slug);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: `Institution "${slug}" not found` } },
        { status: 404 }
      );
    }

    const batch = await BatchRepository.findBatchById(tenant.id, id);
    if (!batch) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: `Batch "${id}" not found` } },
        { status: 404 }
      );
    }

    const onChainBatch = await BlockchainService.getBatch(slug, batch.id);
    const receiptStatus = batch.onChainTxHash
      ? await BlockchainService.getTransactionReceiptStatus(batch.onChainTxHash)
      : null;

    return NextResponse.json({
      success: true,
      data: {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        status: batch.status,
        merkleRoot: batch.merkleRoot,
        onChainTxHash: batch.onChainTxHash,
        blockchainBlockNumber: batch.blockchainBlockNumber ? Number(batch.blockchainBlockNumber) : null,
        onChainVerified: Boolean(onChainBatch?.exists),
        receiptStatus,
      },
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : "ANCHOR_STATUS_ERROR",
          message: error.message || "Failed to inspect anchor status",
        },
      },
      { status: isForbidden ? 403 : 400 }
    );
  }
}

/**
 * POST /api/v1/tenants/:slug/batches/:id/anchor-status
 * Reconciles or safely retries anchoring if a batch transaction was not yet confirmed.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const ctx = extractTenantContext(request, slug, "batches:issue");
    const tenant = await tenantRepo.findBySlug(slug);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: `Institution "${slug}" not found` } },
        { status: 404 }
      );
    }

    const membership = ctx.session.tenants?.find((t) => t.slug === slug || t.tenantId === tenant.id);
    assertTenantPermission(membership?.role || "READ_ONLY_STAFF", "batches:issue");

    const batch = await BatchRepository.findBatchById(tenant.id, id);
    if (!batch || !batch.merkleRoot) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "BATCH_NOT_READY",
            message: "Batch does not exist or has no generated Merkle root yet.",
          },
        },
        { status: 400 }
      );
    }

    const anchorRes = await BlockchainService.anchorBatchWithRetry(
      slug,
      batch.id,
      batch.merkleRoot,
      batch.leafCount,
      { existingTxHash: batch.onChainTxHash }
    );

    await BatchRepository.updateBatchStatus(tenant.id, batch.id, "ANCHORED", {
      onChainTxHash: anchorRes.txHash,
      blockchainBlockNumber: anchorRes.blockNumber,
    });

    await tenantRepo.recordAuditLog({
      tenantId: tenant.id,
      userId: ctx.session.sub,
      userEmail: ctx.session.email,
      action: "BATCH_ANCHOR_RECONCILED",
      resourceType: "IssuanceBatch",
      resourceId: batch.id,
      metadata: {
        txHash: anchorRes.txHash,
        blockNumber: anchorRes.blockNumber,
        alreadyAnchored: anchorRes.alreadyAnchored,
        attemptCount: anchorRes.attemptCount,
      },
    });

    return NextResponse.json({
      success: true,
      data: anchorRes,
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : "ANCHOR_RETRY_FAILED",
          message: error.message || "Failed to reconcile anchor status",
        },
      },
      { status: isForbidden ? 403 : 400 }
    );
  }
}
