import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { assertTenantPermission } from "@/lib/auth/rbac";
import { BatchRepository } from "@/lib/repositories/batch-repository";
import { TenantRepository } from "@/lib/repositories/tenant-repository";
import { BlockchainService } from "@/lib/blockchain/blockchain-service";

const tenantRepo = new TenantRepository();

/**
 * POST /api/v1/tenants/:slug/batches/:id/anchor
 * Anchors a generated batch Merkle root to the Ethereum Sepolia smart contract registry.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const ctx = extractTenantContext(request, slug);

    const tenant = await tenantRepo.findBySlug(slug);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: `Institution "${slug}" not found` } },
        { status: 404 }
      );
    }

    if (ctx.session) {
      const membership = ctx.session.tenants?.find((t) => t.slug === slug || t.tenantId === tenant.id);
      if (!membership && ctx.session.platformRole !== "SUPER_ADMIN") {
        return NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "Forbidden" } },
          { status: 403 }
        );
      }
      assertTenantPermission(membership?.role || "READ_ONLY_STAFF", "batches:issue");
    }

    const batch = await BatchRepository.findBatchById(tenant.id, id);
    if (!batch) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: `Batch "${id}" not found` } },
        { status: 404 }
      );
    }

    if (!batch.merkleRoot) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "BATCH_NOT_READY",
            message: "Batch has not completed cryptographic generation and Merkle root calculation yet.",
          },
        },
        { status: 400 }
      );
    }

    if (batch.status === "ANCHORED" && batch.onChainTxHash) {
      return NextResponse.json({
        success: true,
        message: "Batch is already anchored on Ethereum Sepolia.",
        data: {
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          merkleRoot: batch.merkleRoot,
          leafCount: batch.leafCount,
          onChainTxHash: batch.onChainTxHash,
          blockchainBlockNumber: batch.blockchainBlockNumber ? Number(batch.blockchainBlockNumber) : null,
          status: batch.status,
          explorerUrl: `${BlockchainService.EXPLORER_URL}/tx/${batch.onChainTxHash}`,
        },
      });
    }

    // Anchor to Ethereum Sepolia via BlockchainService
    const result = await BlockchainService.anchorBatch(
      slug,
      batch.id,
      batch.merkleRoot,
      batch.leafCount
    );

    // Update batch status to ANCHORED
    const updated = await BatchRepository.updateBatchStatus(tenant.id, batch.id, "ANCHORED", {
      onChainTxHash: result.txHash,
      blockchainBlockNumber: result.blockNumber,
    });

    // Record audit log
    await tenantRepo.recordAuditLog({
      tenantId: tenant.id,
      userId: ctx.session?.sub,
      userEmail: ctx.session?.email,
      action: "BATCH_ANCHORED",
      resourceType: "IssuanceBatch",
      resourceId: batch.id,
      metadata: {
        batchNumber: batch.batchNumber,
        merkleRoot: batch.merkleRoot,
        leafCount: batch.leafCount,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Batch ${batch.batchNumber} successfully anchored on Ethereum Sepolia.`,
      data: {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        merkleRoot: batch.merkleRoot,
        leafCount: batch.leafCount,
        onChainTxHash: result.txHash,
        blockchainBlockNumber: result.blockNumber,
        timestamp: result.timestamp,
        status: updated?.status || "ANCHORED",
        explorerUrl: result.explorerUrl,
      },
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const status = error.name === "AuthenticationError" ? 401 : isForbidden ? 403 : 500;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : "BATCH_ANCHOR_FAILED",
          message: error.message || "Failed to anchor batch on Sepolia",
        },
      },
      { status }
    );
  }
}

/**
 * GET /api/v1/tenants/:slug/batches/:id/anchor
 * Retrieves on-chain anchor details for a batch directly from the smart contract.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const ctx = extractTenantContext(request, slug);

    const tenant = await tenantRepo.findBySlug(slug);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: `Institution "${slug}" not found` } },
        { status: 404 }
      );
    }

    if (ctx.session) {
      const membership = ctx.session.tenants?.find((t) => t.slug === slug || t.tenantId === tenant.id);
      if (!membership && ctx.session.platformRole !== "SUPER_ADMIN") {
        return NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "Forbidden" } },
          { status: 403 }
        );
      }
      assertTenantPermission(membership?.role || "READ_ONLY_STAFF", "credentials:read");
    }

    const batch = await BatchRepository.findBatchById(tenant.id, id);
    if (!batch) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: `Batch "${id}" not found` } },
        { status: 404 }
      );
    }

    const onChainRecord = await BlockchainService.getBatch(slug, batch.id);

    return NextResponse.json({
      success: true,
      data: {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        status: batch.status,
        dbMerkleRoot: batch.merkleRoot,
        dbTxHash: batch.onChainTxHash,
        isAnchored: Boolean(onChainRecord?.exists),
        onChainRecord: onChainRecord
          ? {
              merkleRoot: onChainRecord.merkleRoot,
              leafCount: onChainRecord.leafCount,
              anchoredAtBlockTimestamp: onChainRecord.anchoredAtBlockTimestamp,
              anchoredAtDate: new Date(onChainRecord.anchoredAtBlockTimestamp * 1000).toISOString(),
            }
          : null,
        explorerUrl: batch.onChainTxHash ? `${BlockchainService.EXPLORER_URL}/tx/${batch.onChainTxHash}` : null,
      },
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const status = error.name === "AuthenticationError" ? 401 : isForbidden ? 403 : 500;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : "BATCH_ANCHOR_LOOKUP_FAILED",
          message: error.message || "Failed to retrieve on-chain batch anchor",
        },
      },
      { status }
    );
  }
}
