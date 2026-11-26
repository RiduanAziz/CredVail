import crypto from "node:crypto";
import { db } from "../db.ts";
import { handleRepositoryError, isInMemoryFallbackPermissible } from "../db/persistence-policy.ts";
import { assertTenantPermission } from "../auth/rbac.ts";
import type { SessionPayload } from "../auth/session.ts";
import { AuthorizationError } from "../auth/tenant-context.ts";

export type PlanTier = "STARTER" | "INSTITUTION_PRO" | "ENTERPRISE";
export type SubscriptionStatus = "ACTIVE" | "PAST_DUE" | "CANCELED";

export interface PlanDefinition {
  tier: PlanTier;
  displayName: string;
  monthlyUsd: number;
  monthlyCredentialLimit: number;
  maxTeamSeats: number;
  features: string[];
}

export const SAAS_PLANS: Record<PlanTier, PlanDefinition> = {
  STARTER: {
    tier: "STARTER",
    displayName: "Starter Campus",
    monthlyUsd: 0,
    monthlyCredentialLimit: 500,
    maxTeamSeats: 5,
    features: ["500 credentials/mo", "5 institutional staff seats", "Sepolia Merkle anchoring"],
  },
  INSTITUTION_PRO: {
    tier: "INSTITUTION_PRO",
    displayName: "Institution Pro",
    monthlyUsd: 199,
    monthlyCredentialLimit: 10000,
    maxTeamSeats: 25,
    features: ["10,000 credentials/mo", "25 staff seats", "CSV/PDF/JSON compliance reports"],
  },
  ENTERPRISE: {
    tier: "ENTERPRISE",
    displayName: "Enterprise Registrar",
    monthlyUsd: 999,
    monthlyCredentialLimit: 250000,
    maxTeamSeats: 1000,
    features: ["250,000 credentials/mo", "Unlimited seats", "Dedicated SLA & DR support"],
  },
};

export interface TenantSubscriptionRecord {
  tenantId: string;
  tier: PlanTier;
  status: SubscriptionStatus;
  monthlyIssuedCount: number;
  monthlyCredentialLimit: number;
  maxTeamSeats: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  updatedAt: string;
}

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export class PlanEntitlementService {
  private static subscriptions = new Map<string, TenantSubscriptionRecord>();

  static resetForTesting(): void {
    this.subscriptions.clear();
  }

  private static createDefaultSubscription(tenantId: string): TenantSubscriptionRecord {
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return {
      tenantId,
      tier: "STARTER",
      status: "ACTIVE",
      monthlyIssuedCount: 0,
      monthlyCredentialLimit: SAAS_PLANS.STARTER.monthlyCredentialLimit,
      maxTeamSeats: SAAS_PLANS.STARTER.maxTeamSeats,
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: end.toISOString(),
      updatedAt: now.toISOString(),
    };
  }

  static async getSubscription(tenantId: string): Promise<TenantSubscriptionRecord> {
    const cached = this.subscriptions.get(tenantId);
    if (cached) return cached;

    if (!isInMemoryFallbackPermissible() || (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost:5432"))) {
      try {
        const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
        const branding = (tenant?.brandingConfig || {}) as Record<string, unknown>;
        if (branding._subscription && typeof branding._subscription === "object") {
          const persisted = branding._subscription as TenantSubscriptionRecord;
          this.subscriptions.set(tenantId, persisted);
          return persisted;
        }
      } catch (err) {
        handleRepositoryError("PlanEntitlementService.getSubscription", err);
      }
    }

    const def = this.createDefaultSubscription(tenantId);
    this.subscriptions.set(tenantId, def);
    return def;
  }

  static async changePlan(
    tenantId: string,
    tier: PlanTier,
    session?: SessionPayload
  ): Promise<TenantSubscriptionRecord> {
    if (session) {
      const membership = session.tenants.find((t) => t.tenantId === tenantId);
      if (session.platformRole !== "SUPER_ADMIN") {
        assertTenantPermission(membership?.role, "tenant:manage");
        if (membership?.role !== "ORG_OWNER" && membership?.role !== "INSTITUTION_ADMIN") {
          throw new AuthorizationError("Only Organization Owners or Institution Admins can change billing plans.");
        }
      }
    }

    const plan = SAAS_PLANS[tier];
    if (!plan) {
      throw new Error(`Unsupported subscription tier '${tier}'`);
    }

    const current = await this.getSubscription(tenantId);
    const updated: TenantSubscriptionRecord = {
      ...current,
      tier: plan.tier,
      status: "ACTIVE",
      monthlyCredentialLimit: plan.monthlyCredentialLimit,
      maxTeamSeats: plan.maxTeamSeats,
      updatedAt: new Date().toISOString(),
    };
    this.subscriptions.set(tenantId, updated);

    if (!isInMemoryFallbackPermissible() || (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost:5432"))) {
      try {
        const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
        if (tenant) {
          const branding = (tenant.brandingConfig || {}) as Record<string, unknown>;
          await db.tenant.update({
            where: { id: tenantId },
            data: {
              brandingConfig: {
                ...branding,
                _subscription: updated,
              } as any,
            },
          });
          await db.auditLog.create({
            data: {
              tenantId,
              userId: session?.sub || null,
              action: "SUBSCRIPTION_PLAN_UPDATED",
              resourceType: "TenantSubscription",
              resourceId: tenantId,
              metadata: { tier, monthlyLimit: plan.monthlyCredentialLimit },
              ipHash: crypto.createHash("sha256").update("internal").digest("hex"),
            },
          });
        }
      } catch (err) {
        handleRepositoryError("PlanEntitlementService.changePlan", err);
      }
    }

    return updated;
  }

  static async assertAndConsumeIssuanceQuota(
    tenantId: string,
    requestedCount: number
  ): Promise<TenantSubscriptionRecord> {
    if (requestedCount < 0) {
      throw new Error("Requested quota count must be non-negative.");
    }
    const sub = await this.getSubscription(tenantId);
    if (sub.status !== "ACTIVE") {
      throw new QuotaExceededError(`Subscription is ${sub.status}; credential issuance is paused.`);
    }
    if (sub.monthlyIssuedCount + requestedCount > sub.monthlyCredentialLimit) {
      throw new QuotaExceededError(
        `Monthly credential quota exceeded (${sub.monthlyIssuedCount}/${sub.monthlyCredentialLimit} used; requested ${requestedCount}). Upgrade plan to issue more credentials.`
      );
    }

    const updated: TenantSubscriptionRecord = {
      ...sub,
      monthlyIssuedCount: sub.monthlyIssuedCount + requestedCount,
      updatedAt: new Date().toISOString(),
    };
    this.subscriptions.set(tenantId, updated);
    return updated;
  }

  static async assertSeatQuota(tenantId: string, currentSeatCount: number): Promise<void> {
    const sub = await this.getSubscription(tenantId);
    if (currentSeatCount >= sub.maxTeamSeats) {
      throw new QuotaExceededError(
        `Team seat quota reached (${currentSeatCount}/${sub.maxTeamSeats}). Upgrade plan to invite additional staff.`
      );
    }
  }
}
