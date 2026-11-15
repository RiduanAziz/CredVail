import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { assertTenantPermission } from "@/lib/auth/rbac";
import { CredentialRepository } from "@/lib/repositories/credential-repository";
import { TenantRepository } from "@/lib/repositories/tenant-repository";
import { VcService } from "@/lib/crypto/vc-service";

const tenantRepo = new TenantRepository();

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

    let cred = await CredentialRepository.findCredentialById(tenant.id, id);
    if (!cred) {
      cred = await CredentialRepository.findCredentialByCertificateNumber(tenant.id, id);
    }

    if (!cred) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: `Credential "${id}" not found` } },
        { status: 404 }
      );
    }

    const proof = await CredentialRepository.getMerkleProof(tenant.id, cred.id);
    if (!proof) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PROOF_NOT_FOUND",
            message: `Merkle inclusion proof for credential "${id}" has not been computed or anchored.`,
          },
        },
        { status: 404 }
      );
    }

    // Verify proof integrity on the fly to confirm cryptographic correctness
    const isProofValid = VcService.verifyMerkleProof(proof.leafHash, proof.proof, proof.root);

    return NextResponse.json({
      success: true,
      data: {
        ...proof,
        isVerified: isProofValid,
      },
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const status = error.name === "AuthenticationError" ? 401 : isForbidden ? 403 : 500;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : "MERKLE_PROOF_FAILED",
          message: error.message || "Failed to retrieve Merkle proof",
        },
      },
      { status }
    );
  }
}
