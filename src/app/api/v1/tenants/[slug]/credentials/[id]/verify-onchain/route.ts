import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { CredentialRepository } from "@/lib/repositories/credential-repository";
import { TenantRepository } from "@/lib/repositories/tenant-repository";
import { BlockchainService } from "@/lib/blockchain/blockchain-service";

const tenantRepo = new TenantRepository();

/**
 * POST /api/v1/tenants/:slug/credentials/:id/verify-onchain
 * Cryptographically verifies a credential's Merkle inclusion proof directly
 * against the Sepolia smart contract registry.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    extractTenantContext(request, slug);

    const tenant = await tenantRepo.findBySlug(slug);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: `Institution "${slug}" not found` } },
        { status: 404 }
      );
    }

    const credential = await CredentialRepository.findCredentialById(tenant.id, id);
    if (!credential) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: `Credential "${id}" not found` } },
        { status: 404 }
      );
    }

    // Retrieve stored Merkle proof
    const proofRecord = await CredentialRepository.getMerkleProof(tenant.id, credential.id);
    if (!proofRecord) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PROOF_NOT_FOUND",
            message: "No cryptographic Merkle inclusion proof found for this credential.",
          },
        },
        { status: 404 }
      );
    }

    // Query on-chain smart contract
    const isVerifiedOnChain = await BlockchainService.verifyCredentialProof(
      slug,
      credential.batchId,
      credential.leafHash,
      proofRecord.proof
    );

    const onChainBatch = await BlockchainService.getBatch(slug, credential.batchId);

    return NextResponse.json({
      success: true,
      data: {
        verified: isVerifiedOnChain,
        credentialId: credential.id,
        certificateNumber: credential.certificateNumber,
        batchId: credential.batchId,
        leafHash: credential.leafHash,
        merkleRoot: proofRecord.root,
        contractAddress: BlockchainService.getContractAddress(),
        chainId: BlockchainService.SEPOLIA_CHAIN_ID,
        isSimulated: BlockchainService.isSimulationMode(),
        onChainBatch: onChainBatch
          ? {
              leafCount: onChainBatch.leafCount,
              anchoredAtBlockTimestamp: onChainBatch.anchoredAtBlockTimestamp,
              anchoredAtDate: new Date(onChainBatch.anchoredAtBlockTimestamp * 1000).toISOString(),
            }
          : null,
        verifiedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const status = error.name === "AuthenticationError" ? 401 : isForbidden ? 403 : 500;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : "ONCHAIN_VERIFY_FAILED",
          message: error.message || "Failed to verify credential on Sepolia",
        },
      },
      { status }
    );
  }
}

/**
 * GET /api/v1/tenants/:slug/credentials/:id/verify-onchain
 * Alias for read-only on-chain verification check.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  return POST(request, { params });
}
