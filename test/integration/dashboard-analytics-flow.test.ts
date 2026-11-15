import { describe, it, expect, beforeEach } from "vitest";
import { AuthService } from "@/lib/services/auth-service";
import { TenantService } from "@/lib/services/tenant-service";
import { UserRepository, inMemoryUserStore } from "@/lib/repositories/user-repository";
import { TenantRepository, inMemoryTenantStore } from "@/lib/repositories/tenant-repository";
import { verifySessionToken } from "@/lib/auth/session";

describe("Phase 3 End-to-End Dashboard, Branding, and Analytics Flow", () => {
  let userRepo: UserRepository;
  let tenantRepo: TenantRepository;
  let authService: AuthService;
  let tenantService: TenantService;

  beforeEach(() => {
    inMemoryUserStore.clear();
    inMemoryTenantStore.clear();
    userRepo = new UserRepository(true);
    tenantRepo = new TenantRepository(true);
    authService = new AuthService(userRepo);
    tenantService = new TenantService(tenantRepo, userRepo);
  });

  it("should complete the full institutional dashboard lifecycle: setup, branding, member invitations, role management, analytics, audit log verification, and cross-tenant barrier enforcement", async () => {
    // 1. Dean registers and creates Quantum Computing Institute
    const deanReg = await authService.register({
      email: "dean@qci.edu",
      password: "QuantumDeanPassword!2026",
      fullName: "Dean John Preskill",
    });

    const qciTenant = await tenantService.createOrganization(
      {
        name: "Quantum Computing Institute",
        legalEntityName: "QCI Foundation Inc.",
        websiteUrl: "https://qci.edu",
        slug: "qci",
      },
      deanReg.user.id
    );

    expect(qciTenant.slug).toBe("qci");
    expect(qciTenant.didUri).toBe("did:web:credvail.io:tenants:qci");

    // 2. Dean logs in to get active session with qci tenant context
    const deanLogin = await authService.login({
      email: "dean@qci.edu",
      password: "QuantumDeanPassword!2026",
      targetTenantId: qciTenant.id,
    });
    const deanSession = verifySessionToken(deanLogin.token)!;
    expect(deanSession.currentTenantId).toBe(qciTenant.id);
    expect(deanSession.currentTenantRole).toBe("ORG_OWNER");

    // 3. Dean customizes institutional profile and branding
    const updatedTenant = await tenantService.updateOrganization(
      "qci",
      {
        name: "Quantum Computing Institute (QCI)",
        websiteUrl: "https://www.qci.edu",
        logoUrl: "https://www.qci.edu/brand/logo.svg",
        brandingConfig: {
          primaryColor: "#0f172a",
          secondaryColor: "#f59e0b",
          accentColor: "#3b82f6",
          tagline: "Advancing Quantum Frontiers",
        },
      },
      deanSession
    );

    expect(updatedTenant.name).toBe("Quantum Computing Institute (QCI)");
    const branding = updatedTenant.brandingConfig as any;
    expect(branding.primaryColor).toBe("#0f172a");
    expect(branding.secondaryColor).toBe("#f59e0b");
    expect(branding.tagline).toBe("Advancing Quantum Frontiers");

    // 4. Dean invites staff members with distinct RBAC roles
    // Invite Alice as INSTITUTION_ADMIN
    const aliceMember = await tenantService.inviteMember(
      "qci",
      {
        email: "alice@qci.edu",
        fullName: "Dr. Alice Quantum",
        role: "INSTITUTION_ADMIN",
      },
      deanSession
    );

    // Invite Bob as CERTIFICATE_ISSUER
    const bobMember = await tenantService.inviteMember(
      "qci",
      {
        email: "bob@qci.edu",
        fullName: "Bob Register",
        role: "CERTIFICATE_ISSUER",
      },
      deanSession
    );

    // Invite Charlie as TEMPLATE_DESIGNER
    const charlieMember = await tenantService.inviteMember(
      "qci",
      {
        email: "charlie@qci.edu",
        fullName: "Charlie Artist",
        role: "TEMPLATE_DESIGNER",
      },
      deanSession
    );

    // 5. Query staff roster and verify 4 total members
    const members = await tenantService.listMembers("qci", deanSession);
    expect(members.length).toBe(4);
    expect(members.map((m) => m.role)).toEqual(
      expect.arrayContaining(["ORG_OWNER", "INSTITUTION_ADMIN", "CERTIFICATE_ISSUER", "TEMPLATE_DESIGNER"])
    );

    // 6. Query Dashboard Analytics
    const analytics = await tenantService.getAnalyticsOverview("qci", deanSession);
    expect(analytics.totalMembers).toBe(4);
    expect(analytics.totalCredentials).toBe(0);
    expect(analytics.totalBatches).toBe(0);
    expect(analytics.recentActivity.length).toBeGreaterThanOrEqual(3);

    // 7. Verify Audit Log Trail
    const auditLogs = await tenantService.getAuditLogs("qci", deanSession);
    const actions = auditLogs.map((l) => l.action);
    expect(actions).toContain("TENANT_CREATED");
    expect(actions).toContain("TENANT_METADATA_UPDATED");
    expect(actions).toContain("MEMBER_INVITED");

    // 8. Register Eve (outsider) with Competitor Lab
    const eveReg = await authService.register({
      email: "eve@comp-lab.org",
      password: "EveCompetitorPassword!2026",
      fullName: "Eve Hacker",
    });
    const compTenant = await tenantService.createOrganization(
      {
        name: "Competitor Lab",
        legalEntityName: "Comp Lab Inc.",
        websiteUrl: "https://comp-lab.org",
        slug: "comp-lab",
      },
      eveReg.user.id
    );
    const eveLogin = await authService.login({
      email: "eve@comp-lab.org",
      password: "EveCompetitorPassword!2026",
      targetTenantId: compTenant.id,
    });
    const eveSession = verifySessionToken(eveLogin.token)!;

    // 9. CROSS-TENANT ISOLATION BARRIER:
    // Eve cannot read QCI analytics
    await expect(
      tenantService.getAnalyticsOverview("qci", eveSession)
    ).rejects.toThrow(/Forbidden: You do not possess access to organization 'qci'/);

    // Eve cannot read QCI members
    await expect(
      tenantService.listMembers("qci", eveSession)
    ).rejects.toThrow(/Forbidden: You do not possess access to organization 'qci'/);

    // Eve cannot read QCI audit logs
    await expect(
      tenantService.getAuditLogs("qci", eveSession)
    ).rejects.toThrow(/Forbidden: You do not possess access to organization 'qci'/);

    // Dean cannot read Competitor Lab's analytics
    await expect(
      tenantService.getAnalyticsOverview("comp-lab", deanSession)
    ).rejects.toThrow(/Forbidden: You do not possess access to organization 'comp-lab'/);
  });
});
