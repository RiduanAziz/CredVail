import { describe, it, expect, beforeEach } from "vitest";
import { TenantRepository, inMemoryTenantStore } from "@/lib/repositories/tenant-repository";
import { UserRepository, inMemoryUserStore } from "@/lib/repositories/user-repository";
import { TenantService } from "@/lib/services/tenant-service";
import { SessionPayload } from "@/lib/auth/session";
import { TenantRole } from "@/types";

describe("Tenant Staff Roster & Member Management", () => {
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
    email: "admin@institution.edu",
    fullName: "Admin User",
    platformRole: "USER",
    tenants: [{ tenantId, slug, name: "Institution", role }],
    currentTenantId: tenantId,
    currentTenantRole: role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    jti: "test-nonce",
  });

  it("should invite a new staff member and assign them a specific role", async () => {
    const ownerId = "usr_owner_1";
    const tenant = await tenantRepo.createTenant({
      name: "Princeton University",
      legalEntityName: "Trustees of Princeton University",
      websiteUrl: "https://princeton.edu",
      slug: "princeton",
      didUri: "did:web:credvail.io:tenants:princeton",
      ownerUserId: ownerId,
    });

    const ownerSession = createTestSession(ownerId, tenant.id, "princeton", "ORG_OWNER");

    const member = await tenantService.inviteMember(
      "princeton",
      {
        email: "feynman@princeton.edu",
        fullName: "Richard Feynman",
        role: "CERTIFICATE_ISSUER",
      },
      ownerSession
    );

    expect(member.id).toBeDefined();
    expect(member.user.email).toBe("feynman@princeton.edu");
    expect(member.role).toBe("CERTIFICATE_ISSUER");

    // Member list should now have 2 members
    const members = await tenantService.listMembers("princeton", ownerSession);
    expect(members.length).toBe(2);

    // Verify audit log
    const logs = await tenantService.getAuditLogs("princeton", ownerSession);
    const inviteLog = logs.find((l) => l.action === "MEMBER_INVITED");
    expect(inviteLog).toBeDefined();
  });

  it("should update a member's role and record audit log", async () => {
    const ownerId = "usr_owner_1";
    const tenant = await tenantRepo.createTenant({
      name: "Princeton University",
      legalEntityName: "Trustees of Princeton University",
      websiteUrl: "https://princeton.edu",
      slug: "princeton",
      didUri: "did:web:credvail.io:tenants:princeton",
      ownerUserId: ownerId,
    });

    const ownerSession = createTestSession(ownerId, tenant.id, "princeton", "ORG_OWNER");

    const member = await tenantService.inviteMember(
      "princeton",
      {
        email: "turing@princeton.edu",
        fullName: "Alan Turing",
        role: "TEMPLATE_DESIGNER",
      },
      ownerSession
    );

    // Promote Alan to INSTITUTION_ADMIN
    const success = await tenantService.updateMemberRole(
      "princeton",
      member.userId,
      "INSTITUTION_ADMIN",
      ownerSession
    );
    expect(success).toBe(true);

    const members = await tenantService.listMembers("princeton", ownerSession);
    const updated = members.find((m) => m.userId === member.userId);
    expect(updated?.role).toBe("INSTITUTION_ADMIN");

    // Verify audit log
    const logs = await tenantService.getAuditLogs("princeton", ownerSession);
    const updateRoleLog = logs.find((l) => l.action === "MEMBER_ROLE_UPDATED");
    expect(updateRoleLog).toBeDefined();
  });

  it("should prevent demoting the sole Organization Owner", async () => {
    const ownerId = "usr_sole_owner";
    const tenant = await tenantRepo.createTenant({
      name: "Caltech",
      legalEntityName: "California Institute of Technology",
      websiteUrl: "https://caltech.edu",
      slug: "caltech",
      didUri: "did:web:credvail.io:tenants:caltech",
      ownerUserId: ownerId,
    });

    const ownerSession = createTestSession(ownerId, tenant.id, "caltech", "ORG_OWNER");

    await expect(
      tenantService.updateMemberRole("caltech", ownerId, "INSTITUTION_ADMIN", ownerSession)
    ).rejects.toThrow(/Cannot demote the sole Organization Owner. Transfer ownership first./);
  });

  it("should prevent removing the sole Organization Owner", async () => {
    const ownerId = "usr_sole_owner";
    const tenant = await tenantRepo.createTenant({
      name: "Caltech",
      legalEntityName: "California Institute of Technology",
      websiteUrl: "https://caltech.edu",
      slug: "caltech",
      didUri: "did:web:credvail.io:tenants:caltech",
      ownerUserId: ownerId,
    });

    const ownerSession = createTestSession(ownerId, tenant.id, "caltech", "ORG_OWNER");

    await expect(
      tenantService.removeMember("caltech", ownerId, ownerSession)
    ).rejects.toThrow(/Cannot remove the sole Organization Owner/);
  });

  it("should remove non-owner staff members cleanly", async () => {
    const ownerId = "usr_owner";
    const tenant = await tenantRepo.createTenant({
      name: "Caltech",
      legalEntityName: "California Institute of Technology",
      websiteUrl: "https://caltech.edu",
      slug: "caltech",
      didUri: "did:web:credvail.io:tenants:caltech",
      ownerUserId: ownerId,
    });

    const ownerSession = createTestSession(ownerId, tenant.id, "caltech", "ORG_OWNER");

    const member = await tenantService.inviteMember(
      "caltech",
      {
        email: "staff@caltech.edu",
        fullName: "Temporary Staff",
        role: "READ_ONLY_STAFF",
      },
      ownerSession
    );

    expect((await tenantService.listMembers("caltech", ownerSession)).length).toBe(2);

    const removed = await tenantService.removeMember("caltech", member.userId, ownerSession);
    expect(removed).toBe(true);

    const remaining = await tenantService.listMembers("caltech", ownerSession);
    expect(remaining.length).toBe(1);
    expect(remaining[0].userId).toBe(ownerId);
  });
});
