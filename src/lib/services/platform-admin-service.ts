import { db } from "../db.ts";
import { AuthorizationError } from "../auth/tenant-context.ts";
import type { SessionPayload } from "../auth/session.ts";
import { handleRepositoryError, isInMemoryFallbackPermissible } from "../db/persistence-policy.ts";
import {
  TenantRepository,
  inMemoryTenantStore,
  type TenantRecord,
} from "../repositories/tenant-repository.ts";
import type { VerificationStatus } from "../../types/index.ts";
import { PlanEntitlementService, type PlanTier } from "./plan-entitlement-service.ts";

export interface PlatformTenantSummary {
  id: string;
  slug: string;
  name: string;
  legalEntityName: string;
  websiteUrl: string | null;
  organizationType?: string | null;
  countryCode?: string | null;
  didUri: string;
  verificationStatus: VerificationStatus;
  planTier: PlanTier;
  monthlyIssuedCount: number;
  monthlyCredentialLimit: number;
  createdAt: string;
}

export class PlatformAdminService {
  private static tenantRepo = new TenantRepository();

  private static assertSuperAdmin(session: SessionPayload): void {
    if (session.platformRole !== "SUPER_ADMIN") {
      throw new AuthorizationError(
        "Forbidden: SUPER_ADMIN platform privileges are required."
      );
    }
  }

  private static get useMemoryOnly(): boolean {
    if (!isInMemoryFallbackPermissible()) return false;
    return !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("localhost:5432");
  }

  static async listAllTenants(session: SessionPayload): Promise<PlatformTenantSummary[]> {
    this.assertSuperAdmin(session);

    let tenants: TenantRecord[] = [];
    if (this.useMemoryOnly) {
      tenants = inMemoryTenantStore.listAllTenants();
    } else {
      try {
        const rows = await db.tenant.findMany({
          orderBy: { createdAt: "desc" },
        });
        tenants = rows as unknown as TenantRecord[];
      } catch (err) {
        handleRepositoryError("PlatformAdminService.listAllTenants", err);
        tenants = inMemoryTenantStore.listAllTenants();
      }
    }

    const summaries: PlatformTenantSummary[] = [];
    for (const t of tenants) {
      const sub = await PlanEntitlementService.getSubscription(t.id);
      summaries.push({
        id: t.id,
        slug: t.slug,
        name: t.name,
        legalEntityName: t.legalEntityName,
        websiteUrl: t.websiteUrl,
        didUri: t.didUri,
        verificationStatus: t.verificationStatus,
        planTier: sub.tier,
        monthlyIssuedCount: sub.monthlyIssuedCount,
        monthlyCredentialLimit: sub.monthlyCredentialLimit,
        createdAt: new Date(t.createdAt).toISOString(),
      });
    }

    return summaries;
  }

  static async setTenantVerificationStatus(
    tenantId: string,
    status: VerificationStatus,
    session: SessionPayload
  ): Promise<TenantRecord> {
    this.assertSuperAdmin(session);

    const updated = await this.tenantRepo.updateTenant(tenantId, {
      verificationStatus: status,
    });

    await this.tenantRepo.recordAuditLog({
      tenantId: updated.id,
      userId: session.sub,
      userEmail: session.email,
      action: "PLATFORM_TENANT_STATUS_UPDATED",
      resourceType: "Tenant",
      resourceId: updated.id,
      metadata: { verificationStatus: status },
    });

    return updated;
  }
}
