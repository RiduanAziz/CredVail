import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { assertTenantPermission } from "@/lib/auth/rbac";
import { CredentialRepository } from "@/lib/repositories/credential-repository";
import { TenantRepository } from "@/lib/repositories/tenant-repository";
import { CredentialIssuanceService } from "@/lib/services/credential-issuance-service";
import { checkApiRateLimit, createRateLimitResponse } from "@/lib/services/api-rate-limiter";
import { CredentialState } from "@/types";

const tenantRepo = new TenantRepository();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
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

    const { searchParams } = request.nextUrl;
    const batchId = searchParams.get("batchId") || undefined;
    const state = (searchParams.get("state") as CredentialState) || undefined;
    const search = searchParams.get("search") || undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const offset = (page - 1) * limit;

    const { items, total } = await CredentialRepository.listCredentials(tenant.id, {
      batchId,
      state,
      search,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: items,
      meta: {
        page,
        limit,
        total,
      },
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : "CREDENTIALS_FETCH_FAILED",
          message: error.message || "Failed to list credentials",
        },
      },
      { status: isForbidden ? 403 : 400 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ctx = extractTenantContext(request, slug, "batches:create");

    const rateLimit = await checkApiRateLimit({
      identifier: `${ctx.session.sub}:${slug}`,
      scope: "credentials:issue-single",
      maxAttempts: 30,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.retryAfter || 60);
    }

    const body = await request.json();
    const result = await CredentialIssuanceService.issueSingleCredential(
      slug,
      body,
      ctx.session,
      request.nextUrl.origin
    );

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 201 }
    );
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isNotFound = error.message?.includes("not found");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : isNotFound ? "NOT_FOUND" : "ISSUANCE_FAILED",
          message: error.message || "Failed to issue single credential",
        },
      },
      { status: isForbidden ? 403 : isNotFound ? 404 : 400 }
    );
  }
}
