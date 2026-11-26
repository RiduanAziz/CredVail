import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { TenantRepository } from "@/lib/repositories/tenant-repository";
import {
  PlanEntitlementService,
  SAAS_PLANS,
  type PlanTier,
} from "@/lib/services/plan-entitlement-service";

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
        { success: false, error: { code: "NOT_FOUND", message: `Tenant '${slug}' not found` } },
        { status: 404 }
      );
    }

    const subscription = await PlanEntitlementService.getSubscription(tenant.id);
    return NextResponse.json({
      success: true,
      data: {
        subscription,
        availablePlans: Object.values(SAAS_PLANS),
      },
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : "BILLING_FETCH_FAILED",
          message: error.message || "Failed to load billing overview",
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
    const ctx = extractTenantContext(request, slug, "tenant:manage");
    const tenant = await tenantRepo.findBySlug(slug);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: `Tenant '${slug}' not found` } },
        { status: 404 }
      );
    }

    const body = await request.json();
    const tier = String(body?.tier || "").toUpperCase() as PlanTier;
    const updated = await PlanEntitlementService.changePlan(tenant.id, tier, ctx.session);

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : "PLAN_UPDATE_FAILED",
          message: error.message || "Failed to update subscription plan",
        },
      },
      { status: isForbidden ? 403 : 400 }
    );
  }
}
