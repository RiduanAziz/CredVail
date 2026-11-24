import { describe, it, expect, beforeEach } from "vitest";
import crypto from "node:crypto";
import { TenantRepository, inMemoryTenantStore, normalizeIpHash } from "@/lib/repositories/tenant-repository";
import { UserRepository, inMemoryUserStore } from "@/lib/repositories/user-repository";
import { TenantService } from "@/lib/services/tenant-service";
import { createSessionToken, verifySessionToken, SessionPayload } from "@/lib/auth/session";
import { extractTenantContext, AuthorizationError } from "@/lib/auth/tenant-context";
import { TenantRole } from "@/types";
import { NextRequest } from "next/server";

describe("CRV-SEC-03: Multi-Tenant RBAC Authorization & Invitation Token Hardening", () => {
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

  const createSession = (
    userId: string,
    email: string,
    tenantId: string,
    slug: string,
    role: TenantRole,
    platformRole: "USER" | "SUPER_ADMIN" = "USER"
  ): SessionPayload => ({
    sub: userId,
    email,
    fullName: "Test User",
    platformRole,
    tenants: [{ tenantId, slug, name: "Test Org", role }],
    currentTenantId: tenantId,
    currentTenantRole: role,
    emailVerified: true,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    jti: crypto.randomBytes(16).toString("hex"),
  });

  describe("1. Privilege Escalation Guards on Member Invitations", () => {
    it("should reject an INSTITUTION_ADMIN attempting to invite an ORG_OWNER", async () => {
      const owner = await userRepo.create({
        email: "owner@mit.edu",
        passwordHash: "hash123",
        fullName: "MIT Owner",
      });
      const tenant = await tenantRepo.createTenant({
        name: "MIT",
        legalEntityName: "Massachusetts Institute of Technology",
        websiteUrl: "https://mit.edu",
        slug: "mit",
        didUri: "did:web:credvail.io:tenants:mit",
        ownerUserId: owner.id,
      });

      const adminUser = await userRepo.create({
        email: "admin@mit.edu",
        passwordHash: "hash123",
        fullName: "MIT Admin",
      });
      await tenantRepo.addMember({
        tenantId: tenant.id,
        userId: adminUser.id,
        role: "INSTITUTION_ADMIN",
        acceptedAt: new Date(),
      });

      const adminSession = createSession(adminUser.id, adminUser.email, tenant.id, "mit", "INSTITUTION_ADMIN");

      await expect(
        tenantService.inviteMember(
          "mit",
          {
            email: "attacker@mit.edu",
            fullName: "Attacker User",
            role: "ORG_OWNER",
          },
          adminSession
        )
      ).rejects.toThrow(/Only Organization Owners or Platform Administrators can invite an Organization Owner/);
    });

    it("should allow an ORG_OWNER to invite another ORG_OWNER", async () => {
      const owner = await userRepo.create({
        email: "owner@mit.edu",
        passwordHash: "hash123",
        fullName: "MIT Owner",
      });
      const tenant = await tenantRepo.createTenant({
        name: "MIT",
        legalEntityName: "Massachusetts Institute of Technology",
        websiteUrl: "https://mit.edu",
        slug: "mit",
        didUri: "did:web:credvail.io:tenants:mit",
        ownerUserId: owner.id,
      });

      const ownerSession = createSession(owner.id, owner.email, tenant.id, "mit", "ORG_OWNER");

      const invite = await tenantService.inviteMember(
        "mit",
        {
          email: "co-owner@mit.edu",
          fullName: "Co-Owner User",
          role: "ORG_OWNER",
        },
        ownerSession
      );

      expect(invite.id).toBeDefined();
      expect(invite.role).toBe("ORG_OWNER");
      expect(invite.invitationToken).toBeDefined();
      expect(invite.invitationToken?.length).toBe(64); // 256 bits = 64 hex chars
    });
  });

  describe("2. Privilege Escalation Guards on Role Updates & Deletions", () => {
    it("should prevent members from modifying their own roles (self-role modification)", async () => {
      const owner = await userRepo.create({
        email: "owner@mit.edu",
        passwordHash: "hash123",
        fullName: "MIT Owner",
      });
      const tenant = await tenantRepo.createTenant({
        name: "MIT",
        legalEntityName: "Massachusetts Institute of Technology",
        websiteUrl: "https://mit.edu",
        slug: "mit",
        didUri: "did:web:credvail.io:tenants:mit",
        ownerUserId: owner.id,
      });

      const adminUser = await userRepo.create({
        email: "admin@mit.edu",
        passwordHash: "hash123",
        fullName: "MIT Admin",
      });
      await tenantRepo.addMember({
        tenantId: tenant.id,
        userId: adminUser.id,
        role: "INSTITUTION_ADMIN",
        acceptedAt: new Date(),
      });

      const adminSession = createSession(adminUser.id, adminUser.email, tenant.id, "mit", "INSTITUTION_ADMIN");

      await expect(
        tenantService.updateMemberRole("mit", adminUser.id, "ORG_OWNER", adminSession)
      ).rejects.toThrow(/Users are forbidden from modifying their own institutional roles/);
    });

    it("should reject an INSTITUTION_ADMIN attempting to promote another user to ORG_OWNER", async () => {
      const owner = await userRepo.create({
        email: "owner@mit.edu",
        passwordHash: "hash123",
        fullName: "MIT Owner",
      });
      const tenant = await tenantRepo.createTenant({
        name: "MIT",
        legalEntityName: "Massachusetts Institute of Technology",
        websiteUrl: "https://mit.edu",
        slug: "mit",
        didUri: "did:web:credvail.io:tenants:mit",
        ownerUserId: owner.id,
      });

      const adminUser = await userRepo.create({
        email: "admin@mit.edu",
        passwordHash: "hash123",
        fullName: "MIT Admin",
      });
      await tenantRepo.addMember({
        tenantId: tenant.id,
        userId: adminUser.id,
        role: "INSTITUTION_ADMIN",
        acceptedAt: new Date(),
      });

      const staffUser = await userRepo.create({
        email: "staff@mit.edu",
        passwordHash: "hash123",
        fullName: "MIT Staff",
      });
      await tenantRepo.addMember({
        tenantId: tenant.id,
        userId: staffUser.id,
        role: "CERTIFICATE_ISSUER",
        acceptedAt: new Date(),
      });

      const adminSession = createSession(adminUser.id, adminUser.email, tenant.id, "mit", "INSTITUTION_ADMIN");

      await expect(
        tenantService.updateMemberRole("mit", staffUser.id, "ORG_OWNER", adminSession)
      ).rejects.toThrow(/Only Organization Owners or Platform Administrators can assign the Organization Owner role/);
    });

    it("should reject an INSTITUTION_ADMIN attempting to modify or demote an ORG_OWNER", async () => {
      const owner = await userRepo.create({
        email: "owner@mit.edu",
        passwordHash: "hash123",
        fullName: "MIT Owner",
      });
      const tenant = await tenantRepo.createTenant({
        name: "MIT",
        legalEntityName: "Massachusetts Institute of Technology",
        websiteUrl: "https://mit.edu",
        slug: "mit",
        didUri: "did:web:credvail.io:tenants:mit",
        ownerUserId: owner.id,
      });

      const coOwner = await userRepo.create({
        email: "coowner@mit.edu",
        passwordHash: "hash123",
        fullName: "MIT Co-Owner",
      });
      await tenantRepo.addMember({
        tenantId: tenant.id,
        userId: coOwner.id,
        role: "ORG_OWNER",
        acceptedAt: new Date(),
      });

      const adminUser = await userRepo.create({
        email: "admin@mit.edu",
        passwordHash: "hash123",
        fullName: "MIT Admin",
      });
      await tenantRepo.addMember({
        tenantId: tenant.id,
        userId: adminUser.id,
        role: "INSTITUTION_ADMIN",
        acceptedAt: new Date(),
      });

      const adminSession = createSession(adminUser.id, adminUser.email, tenant.id, "mit", "INSTITUTION_ADMIN");

      await expect(
        tenantService.updateMemberRole("mit", owner.id, "READ_ONLY_STAFF", adminSession)
      ).rejects.toThrow(/Only Organization Owners or Platform Administrators can modify an Organization Owner/);
    });

    it("should reject an INSTITUTION_ADMIN attempting to remove an ORG_OWNER", async () => {
      const owner = await userRepo.create({
        email: "owner@mit.edu",
        passwordHash: "hash123",
        fullName: "MIT Owner",
      });
      const tenant = await tenantRepo.createTenant({
        name: "MIT",
        legalEntityName: "Massachusetts Institute of Technology",
        websiteUrl: "https://mit.edu",
        slug: "mit",
        didUri: "did:web:credvail.io:tenants:mit",
        ownerUserId: owner.id,
      });

      const coOwner = await userRepo.create({
        email: "coowner@mit.edu",
        passwordHash: "hash123",
        fullName: "MIT Co-Owner",
      });
      await tenantRepo.addMember({
        tenantId: tenant.id,
        userId: coOwner.id,
        role: "ORG_OWNER",
        acceptedAt: new Date(),
      });

      const adminUser = await userRepo.create({
        email: "admin@mit.edu",
        passwordHash: "hash123",
        fullName: "MIT Admin",
      });
      await tenantRepo.addMember({
        tenantId: tenant.id,
        userId: adminUser.id,
        role: "INSTITUTION_ADMIN",
        acceptedAt: new Date(),
      });

      const adminSession = createSession(adminUser.id, adminUser.email, tenant.id, "mit", "INSTITUTION_ADMIN");

      await expect(
        tenantService.removeMember("mit", owner.id, adminSession)
      ).rejects.toThrow(/Only Organization Owners or Platform Administrators can remove an Organization Owner/);
    });
  });

  describe("3. Cryptographic Invitation Token Entropy, Hashing & Acceptance", () => {
    it("should generate a 256-bit CSPRNG token and store only the SHA-256 hash at rest", async () => {
      const owner = await userRepo.create({
        email: "owner@mit.edu",
        passwordHash: "hash123",
        fullName: "MIT Owner",
      });
      const tenant = await tenantRepo.createTenant({
        name: "MIT",
        legalEntityName: "Massachusetts Institute of Technology",
        websiteUrl: "https://mit.edu",
        slug: "mit",
        didUri: "did:web:credvail.io:tenants:mit",
        ownerUserId: owner.id,
      });

      const ownerSession = createSession(owner.id, owner.email, tenant.id, "mit", "ORG_OWNER");

      const invite = await tenantService.inviteMember(
        "mit",
        {
          email: "staff@mit.edu",
          fullName: "MIT Staff Member",
          role: "CERTIFICATE_ISSUER",
        },
        ownerSession
      );

      const rawToken = invite.invitationToken!;
      expect(rawToken).toBeDefined();
      expect(rawToken.length).toBe(64); // 256-bit entropy represented in hex
      expect(/^[0-9a-f]{64}$/.test(rawToken)).toBe(true);

      // Check persisted record in repository
      const members = await tenantRepo.listMembers(tenant.id);
      const invitedMember = members.find((m) => m.id === invite.id);

      expect(invitedMember).toBeDefined();
      expect(invitedMember?.acceptedAt).toBeNull(); // Invitation is unaccepted initially

      const expectedHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      expect(invitedMember?.invitationTokenHash).toBe(expectedHash);
      expect(invitedMember?.invitationExpiresAt).toBeDefined();

      // Ensure raw token is NEVER the stored hash
      expect(rawToken).not.toBe(expectedHash);
    });

    it("should never expose the raw invitation token in audit log metadata", async () => {
      const owner = await userRepo.create({
        email: "owner@mit.edu",
        passwordHash: "hash123",
        fullName: "MIT Owner",
      });
      const tenant = await tenantRepo.createTenant({
        name: "MIT",
        legalEntityName: "Massachusetts Institute of Technology",
        websiteUrl: "https://mit.edu",
        slug: "mit",
        didUri: "did:web:credvail.io:tenants:mit",
        ownerUserId: owner.id,
      });

      const ownerSession = createSession(owner.id, owner.email, tenant.id, "mit", "ORG_OWNER");

      const invite = await tenantService.inviteMember(
        "mit",
        {
          email: "staff@mit.edu",
          fullName: "Staff User",
          role: "CERTIFICATE_ISSUER",
        },
        ownerSession
      );

      const logs = await tenantService.getAuditLogs("mit", ownerSession);
      const inviteLog = logs.find((l) => l.action === "MEMBER_INVITED");
      expect(inviteLog).toBeDefined();

      const rawToken = invite.invitationToken!;
      const metadataStr = JSON.stringify(inviteLog?.metadata);

      // Raw token must NEVER appear anywhere in the audit log metadata
      expect(metadataStr).not.toContain(rawToken);

      // But the SHA-256 hash must be recorded for auditability
      const expectedHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      expect(metadataStr).toContain(expectedHash);
    });

    it("should atomically accept an invitation and prevent replay attacks", async () => {
      const owner = await userRepo.create({
        email: "owner@mit.edu",
        passwordHash: "hash123",
        fullName: "MIT Owner",
      });
      const tenant = await tenantRepo.createTenant({
        name: "MIT",
        legalEntityName: "Massachusetts Institute of Technology",
        websiteUrl: "https://mit.edu",
        slug: "mit",
        didUri: "did:web:credvail.io:tenants:mit",
        ownerUserId: owner.id,
      });

      const ownerSession = createSession(owner.id, owner.email, tenant.id, "mit", "ORG_OWNER");

      const staffUser = await userRepo.create({
        email: "staff@mit.edu",
        passwordHash: "hash123",
        fullName: "Staff User",
      });

      const invite = await tenantService.inviteMember(
        "mit",
        {
          email: "staff@mit.edu",
          fullName: "Staff User",
          role: "CERTIFICATE_ISSUER",
        },
        ownerSession
      );

      const rawToken = invite.invitationToken!;

      // 1. First acceptance succeeds
      const accepted = await tenantService.acceptInvitation("mit", rawToken, staffUser.id);
      expect(accepted.acceptedAt).toBeInstanceOf(Date);
      expect(accepted.role).toBe("CERTIFICATE_ISSUER");

      // 2. Replay attack: second acceptance must be rejected
      await expect(
        tenantService.acceptInvitation("mit", rawToken, staffUser.id)
      ).rejects.toThrow(/Invalid or expired invitation token/);
    });

    it("should reject acceptance if claimed by a different user ID", async () => {
      const owner = await userRepo.create({
        email: "owner@mit.edu",
        passwordHash: "hash123",
        fullName: "MIT Owner",
      });
      const tenant = await tenantRepo.createTenant({
        name: "MIT",
        legalEntityName: "Massachusetts Institute of Technology",
        websiteUrl: "https://mit.edu",
        slug: "mit",
        didUri: "did:web:credvail.io:tenants:mit",
        ownerUserId: owner.id,
      });

      const ownerSession = createSession(owner.id, owner.email, tenant.id, "mit", "ORG_OWNER");

      const legitimateUser = await userRepo.create({
        email: "legitimate@mit.edu",
        passwordHash: "hash123",
        fullName: "Legitimate User",
      });

      const interceptingUser = await userRepo.create({
        email: "hacker@mit.edu",
        passwordHash: "hash123",
        fullName: "Hacker User",
      });

      const invite = await tenantService.inviteMember(
        "mit",
        {
          email: "legitimate@mit.edu",
          fullName: "Legitimate User",
          role: "CERTIFICATE_ISSUER",
        },
        ownerSession
      );

      // Attempting to claim legitimate user's token with interceptingUser.id must fail
      await expect(
        tenantService.acceptInvitation("mit", invite.invitationToken!, interceptingUser.id)
      ).rejects.toThrow(/Invitation was issued to a different user/);
    });

    it("should reject expired invitation tokens", async () => {
      const owner = await userRepo.create({
        email: "owner@mit.edu",
        passwordHash: "hash123",
        fullName: "MIT Owner",
      });
      const tenant = await tenantRepo.createTenant({
        name: "MIT",
        legalEntityName: "Massachusetts Institute of Technology",
        websiteUrl: "https://mit.edu",
        slug: "mit",
        didUri: "did:web:credvail.io:tenants:mit",
        ownerUserId: owner.id,
      });

      const staff = await userRepo.create({
        email: "staff@mit.edu",
        passwordHash: "hash123",
        fullName: "Staff User",
      });

      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiredDate = new Date(Date.now() - 3600 * 1000); // 1 hour ago

      await tenantRepo.addMember({
        tenantId: tenant.id,
        userId: staff.id,
        role: "CERTIFICATE_ISSUER",
        acceptedAt: null,
        invitationTokenHash: tokenHash,
        invitationExpiresAt: expiredDate,
      });

      await expect(
        tenantService.acceptInvitation("mit", rawToken, staff.id)
      ).rejects.toThrow(/Invitation token has expired/);
    });
  });

  describe("4. Session Tenant Gating for Pending (Unaccepted) Memberships", () => {
    it("should filter out unaccepted memberships from session.tenants", () => {
      const mockUser = {
        id: "usr_alice",
        email: "alice@example.com",
        fullName: "Alice Smith",
        platformRole: "USER" as const,
        emailVerified: true,
        memberships: [
          {
            tenantId: "tnt_accepted",
            role: "CERTIFICATE_ISSUER" as const,
            acceptedAt: new Date(),
            tenant: { slug: "org-accepted", name: "Accepted Org" },
          },
          {
            tenantId: "tnt_pending",
            role: "INSTITUTION_ADMIN" as const,
            acceptedAt: null, // Pending invite!
            tenant: { slug: "org-pending", name: "Pending Org" },
          },
        ],
      };

      const token = createSessionToken(mockUser);
      const payload = verifySessionToken(token)!;

      expect(payload).not.toBeNull();
      // Only the accepted tenant membership should exist in the session
      expect(payload.tenants.length).toBe(1);
      expect(payload.tenants[0].slug).toBe("org-accepted");
      expect(payload.tenants.some((t) => t.slug === "org-pending")).toBe(false);
    });

    it("should deny tenant route access to an unaccepted pending member via extractTenantContext", () => {
      const pendingSession: SessionPayload = {
        sub: "usr_pending",
        email: "pending@example.com",
        fullName: "Pending Staff",
        platformRole: "USER",
        tenants: [], // Filtered because acceptedAt was null
        emailVerified: true,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        jti: "test-nonce",
      };

      const mockRequest = {
        cookies: {
          get: () => ({ value: createSessionToken({ ...pendingSession, id: pendingSession.sub }) }),
        },
        headers: {
          get: () => null,
        },
      } as unknown as NextRequest;

      expect(() => extractTenantContext(mockRequest, "target-org")).toThrow(AuthorizationError);
      expect(() => extractTenantContext(mockRequest, "target-org")).toThrow(
        /Access denied: You do not possess active membership in tenant 'target-org'/
      );
    });
  });

  describe("5. Audit Log Privacy & Tamper Resistance (normalizeIpHash)", () => {
    it("should normalize raw IPv4 addresses to a 64-character SHA-256 hash", () => {
      const rawIp = "192.168.1.100";
      const normalized = normalizeIpHash(rawIp);

      expect(normalized.length).toBe(64);
      expect(/^[0-9a-f]{64}$/.test(normalized)).toBe(true);
      expect(normalized).toBe(crypto.createHash("sha256").update(rawIp).digest("hex"));
    });

    it("should preserve already-hashed 64-character hex strings in lowercase", () => {
      const existingHash = crypto.createHash("sha256").update("10.0.0.1").digest("hex").toUpperCase();
      const normalized = normalizeIpHash(existingHash);

      expect(normalized.length).toBe(64);
      expect(normalized).toBe(existingHash.toLowerCase());
    });

    it("should fallback to 64 zeros for empty or undefined IP addresses", () => {
      expect(normalizeIpHash("")).toBe("0".repeat(64));
      expect(normalizeIpHash(undefined)).toBe("0".repeat(64));
    });
  });
});
