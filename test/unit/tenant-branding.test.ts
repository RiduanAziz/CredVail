import { describe, it, expect, beforeEach } from "vitest";
import { TenantRepository, inMemoryTenantStore } from "@/lib/repositories/tenant-repository";
import { UserRepository, inMemoryUserStore } from "@/lib/repositories/user-repository";
import { TenantService } from "@/lib/services/tenant-service";
import { SessionPayload } from "@/lib/auth/session";
import { TenantRole } from "@/types";

describe("Organization Profile & Branding Management", () => {
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

  const createTestSession = (
    userId: string,
    tenantId: string,
    slug: string,
    role: TenantRole
  ): SessionPayload => ({
    sub: userId,
    email: "user@institution.edu",
    fullName: "Staff User",
    platformRole: "USER",
    tenants: [{ tenantId, slug, name: "Institution", role }],
    currentTenantId: tenantId,
    currentTenantRole: role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    jti: "test-nonce",
  });

  it("should allow ORG_OWNER to update organization metadata and custom brand colors", async () => {
    const ownerId = "usr_owner_1";
    const tenant = await tenantRepo.createTenant({
      name: "Oxford University",
      legalEntityName: "Chancellor Masters and Scholars of the University of Oxford",
      websiteUrl: "https://ox.ac.uk",
      slug: "oxford",
      didUri: "did:web:credvail.io:tenants:oxford",
      ownerUserId: ownerId,
    });

    const ownerSession = createTestSession(ownerId, tenant.id, "oxford", "ORG_OWNER");

    const updated = await tenantService.updateOrganization(
      "oxford",
      {
        name: "University of Oxford",
        websiteUrl: "https://www.ox.ac.uk",
        logoUrl: "https://www.ox.ac.uk/brand/logo.png",
        brandingConfig: {
          primaryColor: "#002147", // Oxford Blue
          secondaryColor: "#d4af37", // Heraldic Gold
          accentColor: "#1d4ed8",
          tagline: "Dominus Illuminatio Mea",
        },
      },
      ownerSession
    );

    expect(updated.name).toBe("University of Oxford");
    expect(updated.websiteUrl).toBe("https://www.ox.ac.uk");
    expect(updated.logoUrl).toBe("https://www.ox.ac.uk/brand/logo.png");

    const branding = updated.brandingConfig as any;
    expect(branding.primaryColor).toBe("#002147");
    expect(branding.secondaryColor).toBe("#d4af37");
    expect(branding.tagline).toBe("Dominus Illuminatio Mea");

    // Verify audit log entry was created
    const logs = await tenantService.getAuditLogs("oxford", ownerSession);
    const updateLog = logs.find((l) => l.action === "TENANT_METADATA_UPDATED");
    expect(updateLog).toBeDefined();
    expect(updateLog?.resourceId).toBe(tenant.id);
  });

  it("should reject updates from staff roles that lack tenant:manage permission", async () => {
    const ownerId = "usr_owner_1";
    const staffId = "usr_readonly_2";

    const tenant = await tenantRepo.createTenant({
      name: "Cambridge University",
      legalEntityName: "The Chancellor Masters and Scholars of the University of Cambridge",
      websiteUrl: "https://cam.ac.uk",
      slug: "cambridge",
      didUri: "did:web:credvail.io:tenants:cambridge",
      ownerUserId: ownerId,
    });

    const staffSession = createTestSession(staffId, tenant.id, "cambridge", "READ_ONLY_STAFF");

    await expect(
      tenantService.updateOrganization(
        "cambridge",
        {
          name: "Cambridge Altered Name",
        },
        staffSession
      )
    ).rejects.toThrow(/Forbidden: Role 'READ_ONLY_STAFF' lacks permission 'tenant:manage'/);
  });

  it("should validate input schema and reject invalid website URLs", async () => {
    const ownerId = "usr_owner_1";
    const tenant = await tenantRepo.createTenant({
      name: "Harvard University",
      legalEntityName: "President and Fellows of Harvard College",
      websiteUrl: "https://harvard.edu",
      slug: "harvard",
      didUri: "did:web:credvail.io:tenants:harvard",
      ownerUserId: ownerId,
    });

    const ownerSession = createTestSession(ownerId, tenant.id, "harvard", "ORG_OWNER");

    await expect(
      tenantService.updateOrganization(
        "harvard",
        {
          websiteUrl: "not-a-valid-url",
        },
        ownerSession
      )
    ).rejects.toThrow();
  });
});
