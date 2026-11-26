import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PlanEntitlementService, QuotaExceededError } from "@/lib/services/plan-entitlement-service";
import { PlatformAdminService } from "@/lib/services/platform-admin-service";
import { TenantService } from "@/lib/services/tenant-service";
import { AuthService } from "@/lib/services/auth-service";
import { ensureDevSuperAdminSeeded } from "@/lib/auth/dev-super-admin-bootstrap";
import { EmailVerificationRepository } from "@/lib/repositories/email-verification-repository";
import { inMemoryUserStore } from "@/lib/repositories/user-repository";
import { inMemoryTenantStore } from "@/lib/repositories/tenant-repository";
import { verifySessionToken } from "@/lib/auth/session";
import { formatStructuredLog, MetricsRegistry, redactSensitiveFields } from "@/lib/observability/logger";
import { GET as healthGet } from "@/app/api/v1/health/route";

describe("Phase 15 & Phase 16: SaaS Quotas, Admin Governance, Observability & Health", () => {
  const authService = new AuthService();
  const tenantService = new TenantService();
  const originalEnv = { ...process.env };

  beforeEach(() => {
    PlanEntitlementService.resetForTesting();
    MetricsRegistry.reset();
    inMemoryUserStore.clear();
    inMemoryTenantStore.clear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("15.x enforces SaaS plan quotas, upgrades tiers, and restricts platform admin endpoints to SUPER_ADMIN", async () => {
    const owner = await authService.register({
      email: "owner@saas-uni.edu",
      password: "SaasOwnerPassword!123",
      fullName: "SaaS Owner",
    });
    await EmailVerificationRepository.consumeAndVerifyUser(owner.verificationToken);

    const tenant = await tenantService.createOrganization(
      {
        name: "SaaS University",
        legalEntityName: "SaaS University",
        websiteUrl: "https://saas-uni.edu",
        slug: "saas-uni",
      },
      owner.user.id
    );

    const ownerLogin = await authService.login({
      email: "owner@saas-uni.edu",
      password: "SaasOwnerPassword!123",
      targetTenantId: tenant.id,
    });
    const ownerSession = verifySessionToken(ownerLogin.token)!;

    // Default STARTER plan caps at 500 monthly credentials
    await expect(
      PlanEntitlementService.assertAndConsumeIssuanceQuota(tenant.id, 501)
    ).rejects.toThrow(QuotaExceededError);

    // Upgrade to INSTITUTION_PRO increases cap to 10,000
    const upgraded = await PlanEntitlementService.changePlan(
      tenant.id,
      "INSTITUTION_PRO",
      ownerSession
    );
    expect(upgraded.monthlyCredentialLimit).toBe(10000);

    const consumed = await PlanEntitlementService.assertAndConsumeIssuanceQuota(tenant.id, 600);
    expect(consumed.monthlyIssuedCount).toBe(600);

    // Regular tenant owner must be rejected by PlatformAdminService
    await expect(PlatformAdminService.listAllTenants(ownerSession)).rejects.toThrow(/SUPER_ADMIN/i);

    // SUPER_ADMIN can inspect and verify/suspend tenants
    const superAdminSession = { ...ownerSession, platformRole: "SUPER_ADMIN" as const };
    const list = await PlatformAdminService.listAllTenants(superAdminSession);
    expect(list.some((t) => t.slug === "saas-uni")).toBe(true);

    const verifiedTenant = await PlatformAdminService.setTenantVerificationStatus(
      tenant.id,
      "VERIFIED",
      superAdminSession
    );
    expect(verifiedTenant.verificationStatus).toBe("VERIFIED");
  });

  it("16.x redacts sensitive fields in structured JSON logs, tracks latency metrics, and exposes /api/v1/health", async () => {
    const redacted = redactSensitiveFields({
      tenantSlug: "mit-demo",
      privateKeyPem: "-----BEGIN EC PRIVATE KEY-----SECRET",
      kmsMasterKey: "raw-kms-key",
      nested: { password: "pw", token: "tok" },
    }) as Record<string, any>;

    expect(redacted.tenantSlug).toBe("mit-demo");
    expect(redacted.privateKeyPem).toBe("[REDACTED]");
    expect(redacted.kmsMasterKey).toBe("[REDACTED]");
    expect(redacted.nested.password).toBe("[REDACTED]");
    expect(redacted.nested.token).toBe("[REDACTED]");

    const logLine = formatStructuredLog("info", "CREDENTIAL_ISSUED", {
      tenantSlug: "mit-demo",
      sessionToken: "secret-val",
    });
    const parsedLog = JSON.parse(logLine);
    expect(parsedLog.event).toBe("CREDENTIAL_ISSUED");
    expect(parsedLog.context.sessionToken).toBe("[REDACTED]");

    MetricsRegistry.incrementCounter("issuances");
    MetricsRegistry.recordLatencyMs("batch_process", 42);
    const snap = MetricsRegistry.getSnapshot();
    expect(snap.counters.issuances).toBe(1);
    expect(snap.latencies.batch_process.avgMs).toBe(42);

    const healthRes = await healthGet();
    expect(healthRes.status).toBe(200);
    const healthJson = await healthRes.json();
    expect(healthJson.status).toBe("ok");
    expect(healthJson.checks.selectiveDisclosureFailClosed).toBe(true);
  });

  it("never seeds DEV_SUPER_ADMIN credentials outside NODE_ENV=development", async () => {
    (process.env as any).NODE_ENV = "production";
    process.env.DEV_SUPER_ADMIN_EMAIL = "blocked@credvail.local";
    process.env.DEV_SUPER_ADMIN_PASSWORD = "BlockedDevPassword!1234";

    await ensureDevSuperAdminSeeded();
    const user = await inMemoryUserStore.findByEmail("blocked@credvail.local");
    expect(user).toBeNull();
  });
});
