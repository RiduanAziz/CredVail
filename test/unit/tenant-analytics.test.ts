import { describe, it, expect, beforeEach } from "vitest";
import { TenantRepository, inMemoryTenantStore } from "@/lib/repositories/tenant-repository";
import { UserRepository, inMemoryUserStore } from "@/lib/repositories/user-repository";
import { TenantService } from "@/lib/services/tenant-service";
import { SessionPayload } from "@/lib/auth/session";

describe("Tenant Dashboard Analytics Engine", () => {
  let tenantRepo: TenantRepository;
  let userRepo: UserRepository;
  let tenantService: TenantService;

  beforeEach(() => {
    inMemoryTenantStore.clear();
    inMemoryUserStore.clear();
    tenantRepo = new TenantRepository(true);
    userRepo = new UserRepository(true);
    tenantService = new TenantService(tenantRepo, userRepo);
  });

  const mockSession = (userId: string, tenantId: string, slug: string): SessionPayload => ({
    sub: userId,
    email: "owner@mit.edu",
    fullName: "MIT Registrar",
    platformRole: "USER",
    tenants: [{ tenantId, slug, name: "MIT", role: "ORG_OWNER" }],
    currentTenantId: tenantId,
    currentTenantRole: "ORG_OWNER",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    jti: "test-nonce",
  });

  it("should calculate baseline analytics for a newly created organization", async () => {
    const ownerId = "usr_mit_owner";
    const tenant = await tenantRepo.createTenant({
      name: "Massachusetts Institute of Technology",
      legalEntityName: "MIT Inc.",
      websiteUrl: "https://mit.edu",
      slug: "mit-edu",
      didUri: "did:web:credvail.io:tenants:mit-edu",
      ownerUserId: ownerId,
    });

    const session = mockSession(ownerId, tenant.id, tenant.slug);
    const analytics = await tenantService.getAnalyticsOverview("mit-edu", session);

    expect(analytics.totalCredentials).toBe(0);
    expect(analytics.activeCredentials).toBe(0);
    expect(analytics.revokedCredentials).toBe(0);
    expect(analytics.totalBatches).toBe(0);
    expect(analytics.anchoredBatches).toBe(0);
    expect(analytics.totalMembers).toBe(1); // The creator/owner
    expect(analytics.verificationSuccessRate).toBe(100);
    expect(Array.isArray(analytics.recentActivity)).toBe(true);
  });

  it("should reflect mock credential metrics and recent activity", async () => {
    const ownerId = "usr_stanford_owner";
    const tenant = await tenantRepo.createTenant({
      name: "Stanford University",
      legalEntityName: "Leland Stanford Junior University",
      websiteUrl: "https://stanford.edu",
      slug: "stanford",
      didUri: "did:web:credvail.io:tenants:stanford",
      ownerUserId: ownerId,
    });

    // Inject simulated metric counters
    inMemoryTenantStore.setMockStats(tenant.id, {
      totalCredentials: 1250,
      activeCredentials: 1242,
      revokedCredentials: 8,
      suspendedCredentials: 0,
      totalBatches: 15,
      anchoredBatches: 15,
      totalTemplates: 4,
      verificationRequests: 320,
      verificationSuccessRate: 99.4,
    });

    const session = mockSession(ownerId, tenant.id, tenant.slug);
    const analytics = await tenantService.getAnalyticsOverview("stanford", session);

    expect(analytics.totalCredentials).toBe(1250);
    expect(analytics.activeCredentials).toBe(1242);
    expect(analytics.revokedCredentials).toBe(8);
    expect(analytics.totalBatches).toBe(15);
    expect(analytics.anchoredBatches).toBe(15);
    expect(analytics.totalTemplates).toBe(4);
    expect(analytics.totalMembers).toBe(1);
    expect(analytics.verificationRequests).toBe(320);
    expect(analytics.verificationSuccessRate).toBe(99.4);
  });

  it("should prevent non-members from viewing tenant analytics", async () => {
    const ownerId = "usr_mit_owner";
    await tenantRepo.createTenant({
      name: "MIT",
      legalEntityName: "MIT Inc",
      websiteUrl: "https://mit.edu",
      slug: "mit-edu",
      didUri: "did:web:credvail.io:tenants:mit-edu",
      ownerUserId: ownerId,
    });

    // Outsider user session with no membership in mit-edu
    const outsiderSession: SessionPayload = {
      sub: "usr_outsider",
      email: "hacker@other.edu",
      fullName: "Outsider User",
      platformRole: "USER",
      tenants: [],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: "hacker-nonce",
    };

    await expect(
      tenantService.getAnalyticsOverview("mit-edu", outsiderSession)
    ).rejects.toThrow(/Forbidden: You do not possess access to organization 'mit-edu'/);
  });
});
