import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { assertTenantPermission } from "@/lib/auth/rbac";
import { BatchRepository } from "@/lib/repositories/batch-repository";
import { CredentialRepository } from "@/lib/repositories/credential-repository";
import { TenantRepository } from "@/lib/repositories/tenant-repository";

const tenantRepo = new TenantRepository();

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

    const { items } = await CredentialRepository.listCredentials(tenant.id, {
      batchId: batch.id,
      limit: 1000,
    });

    const sortedCredentials = items.sort((a, b) => a.merkleIndex - b.merkleIndex);
    const leaves = sortedCredentials.map((c) => c.leafHash);

    return NextResponse.json({
      success: true,
      data: {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        status: batch.status,
        merkleRoot: batch.merkleRoot,
        leafCount: leaves.length,
        leaves,
        isAnchored: batch.status === "ANCHORED",
        onChainTxHash: batch.onChainTxHash,
      },
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const status = error.name === "AuthenticationError" ? 401 : isForbidden ? 403 : 500;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : "BATCH_MERKLE_FAILED",
          message: error.message || "Failed to retrieve batch Merkle tree",
        },
      },
      { status }
    );
  }
}
