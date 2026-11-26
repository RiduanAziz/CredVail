import { describe, it, expect, beforeEach } from "vitest";
import { AuthService } from "@/lib/services/auth-service";
import { TenantService } from "@/lib/services/tenant-service";
import { UserRepository, inMemoryUserStore } from "@/lib/repositories/user-repository";
import { EmailVerificationRepository } from "@/lib/repositories/email-verification-repository";
import { TenantRepository, inMemoryTenantStore } from "@/lib/repositories/tenant-repository";
import { verifySessionToken } from "@/lib/auth/session";

describe("End-to-End Authentication and Multi-Tenancy Flow", () => {
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

  it("should complete the full lifecycle: user registration, login, tenant creation, membership invitation, role updates, and cross-tenant barrier enforcement", async () => {
    // 1. Register User 1: Alice
    const aliceRegistration = await authService.register({
      email: "alice@apex.edu",
      password: "CorrectHorseBatteryStaple!2026",
      fullName: "Alice Turing",
    });
    await EmailVerificationRepository.consumeAndVerifyUser(aliceRegistration.verificationToken);

    expect(aliceRegistration.user.id).toBeDefined();
    expect(aliceRegistration.user.email).toBe("alice@apex.edu");
    expect(aliceRegistration.user.fullName).toBe("Alice Turing");
    expect(aliceRegistration.token).toBeDefined();

    // Verify session token
    const aliceSession = verifySessionToken(aliceRegistration.token);
    expect(aliceSession).not.toBeNull();
    expect(aliceSession?.sub).toBe(aliceRegistration.user.id);

    // 2. Prevent duplicate user registration
    await expect(
      authService.register({
        email: "alice@apex.edu",
        password: "AnotherPassword123!",
        fullName: "Duplicate Alice",
      })
    ).rejects.toThrow(/already exists/);

    // 3. User Login
    const aliceLogin = await authService.login({
      email: "alice@apex.edu",
      password: "CorrectHorseBatteryStaple!2026",
    });
    expect(aliceLogin.user.id).toBe(aliceRegistration.user.id);
    expect(aliceLogin.token).toBeDefined();

    // 4. Invalid Password Login
    await expect(
      authService.login({
        email: "alice@apex.edu",
        password: "WrongPassword!",
      })
    ).rejects.toThrow(/Invalid email or password/);

    // 5. Alice creates Organization "Apex Institute"
    const aliceUpdatedSession = verifySessionToken(aliceLogin.token)!;
    const apexTenant = await tenantService.createOrganization(
      {
        name: "Apex Institute of Technology",
        legalEntityName: "Apex Institute Inc.",
        websiteUrl: "https://apex.edu",
        slug: "apex-tech",
      },
      aliceRegistration.user.id
    );

    expect(apexTenant.id).toBeDefined();
    expect(apexTenant.slug).toBe("apex-tech");
    expect(apexTenant.didUri).toBe("did:web:credvail.io:tenants:apex-tech");
    expect(apexTenant.verificationStatus).toBe("PENDING");

    // 6. Prevent duplicate organization slug
    await expect(
      tenantService.createOrganization(
        {
          name: "Apex Tech Duplicate",
          legalEntityName: "Apex Tech Duplicate LLC",
          websiteUrl: "https://apex-tech.com",
          slug: "apex-tech",
        },
        aliceRegistration.user.id
      )
    ).rejects.toThrow(/already exists/);

    // 7. Refresh Alice's session to include her new organization
    const aliceTenantLogin = await authService.login({
      email: "alice@apex.edu",
      password: "CorrectHorseBatteryStaple!2026",
      targetTenantId: apexTenant.id,
    });
    const aliceActiveSession = verifySessionToken(aliceTenantLogin.token)!;
    expect(aliceActiveSession.tenants.length).toBe(1);
    expect(aliceActiveSession.tenants[0].slug).toBe("apex-tech");
    expect(aliceActiveSession.tenants[0].role).toBe("ORG_OWNER");

    // 8. Register User 2: Bob
    const bobRegistration = await authService.register({
      email: "bob@apex.edu",
      password: "BobPasswordSecure!2026",
      fullName: "Bob Lovelace",
    });
    await EmailVerificationRepository.consumeAndVerifyUser(bobRegistration.verificationToken);

    // 9. Alice invites Bob to Apex Institute as TEMPLATE_DESIGNER
    const bobMember = await tenantService.inviteMember(
      "apex-tech",
      {
        email: "bob@apex.edu",
        fullName: "Bob Lovelace",
        role: "TEMPLATE_DESIGNER",
      },
      aliceActiveSession
    );

    expect(bobMember.userId).toBe(bobRegistration.user.id);
    expect(bobMember.role).toBe("TEMPLATE_DESIGNER");
    expect(bobMember.invitationToken).toBeDefined();

    // 10. Bob accepts the staff invitation
    await tenantService.acceptInvitation(
      "apex-tech",
      bobMember.invitationToken!,
      bobRegistration.user.id
    );

    // 11. Bob logs in and verifies his membership in Apex Institute
    const bobLogin = await authService.login({
      email: "bob@apex.edu",
      password: "BobPasswordSecure!2026",
      targetTenantId: apexTenant.id,
    });
    const bobActiveSession = verifySessionToken(bobLogin.token)!;
    expect(bobActiveSession.tenants[0].slug).toBe("apex-tech");
    expect(bobActiveSession.tenants[0].role).toBe("TEMPLATE_DESIGNER");

    // 11. Bob attempts unauthorized action: inviting another staff member
    await expect(
      tenantService.inviteMember(
        "apex-tech",
        {
          email: "charlie@apex.edu",
          fullName: "Charlie Hacker",
          role: "CERTIFICATE_ISSUER",
        },
        bobActiveSession
      )
    ).rejects.toThrow(/Forbidden: Role 'TEMPLATE_DESIGNER' lacks permission 'members:invite'/);

    // 12. Alice promotes Bob to INSTITUTION_ADMIN
    const roleUpdated = await tenantService.updateMemberRole(
      "apex-tech",
      bobRegistration.user.id,
      "INSTITUTION_ADMIN",
      aliceActiveSession
    );
    expect(roleUpdated).toBe(true);

    // 13. Register User 3: Charlie and create Tenant "Beta Academy"
    const charlieRegistration = await authService.register({
      email: "charlie@beta.edu",
      password: "CharliePasswordSafe!2026",
      fullName: "Charlie Babbage",
    });
    await EmailVerificationRepository.consumeAndVerifyUser(charlieRegistration.verificationToken);

    const betaTenant = await tenantService.createOrganization(
      {
        name: "Beta Academy",
        legalEntityName: "Beta Academy Foundation",
        websiteUrl: "https://beta.edu",
        slug: "beta-academy",
      },
      charlieRegistration.user.id
    );

    const charlieLogin = await authService.login({
      email: "charlie@beta.edu",
      password: "CharliePasswordSafe!2026",
      targetTenantId: betaTenant.id,
    });
    const charlieSession = verifySessionToken(charlieLogin.token)!;

    // 14. CROSS-TENANT ISOLATION BARRIER TEST:
    // Charlie (Beta Academy) CANNOT read Apex Institute's organization details
    await expect(
      tenantService.getOrganization("apex-tech", charlieSession)
    ).rejects.toThrow(/Forbidden: You do not possess access to organization 'apex-tech'/);

    // Charlie CANNOT list Apex Institute's members
    await expect(
      tenantService.listMembers("apex-tech", charlieSession)
    ).rejects.toThrow(/Forbidden: You do not possess access to organization 'apex-tech'/);

    // Alice (Apex Institute) CANNOT read Beta Academy's details
    await expect(
      tenantService.getOrganization("beta-academy", aliceActiveSession)
    ).rejects.toThrow(/Forbidden: You do not possess access to organization 'beta-academy'/);

    // 15. Sole Owner Protection Safeguard
    // Attempting to demote Alice (the only ORG_OWNER) must be rejected
    await expect(
      tenantService.updateMemberRole(
        "apex-tech",
        aliceRegistration.user.id,
        "INSTITUTION_ADMIN",
        aliceActiveSession
      )
    ).rejects.toThrow(/Cannot demote the sole Organization Owner. Transfer ownership first./);

    // Attempting to remove Alice (the only ORG_OWNER) must be rejected
    await expect(
      tenantService.removeMember(
        "apex-tech",
        aliceRegistration.user.id,
        aliceActiveSession
      )
    ).rejects.toThrow(/Cannot remove the sole Organization Owner/);
  });
});
