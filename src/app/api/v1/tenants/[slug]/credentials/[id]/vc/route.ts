import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { assertTenantPermission } from "@/lib/auth/rbac";
import { CredentialRepository } from "@/lib/repositories/credential-repository";
import { TenantRepository } from "@/lib/repositories/tenant-repository";

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

    // Return the signed W3C Verifiable Credential 2.0 object
    return NextResponse.json(cred.vcPayloadJson, {
      headers: {
        "Content-Type": "application/credential+ld+json; charset=utf-8",
        "Cache-Control": "public, max-age=60, s-maxage=60",
      },
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const status = error.name === "AuthenticationError" ? 401 : isForbidden ? 403 : 500;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : "VC_EXPORT_FAILED",
          message: error.message || "Failed to retrieve Verifiable Credential",
        },
      },
      { status }
    );
  }
}
