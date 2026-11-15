import { describe, it, expect } from "vitest";
import type { NextRequest } from "next/server";
import {
  extractSession,
  extractTenantContext,
  scopeTenantQuery,
  AuthenticationError,
  AuthorizationError,
} from "@/lib/auth/tenant-context";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { PlatformRole, TenantRole } from "@/types";

describe("Tenant Isolation and Context Enforcement", () => {
  const aliceUser = {
    id: "usr_alice",
    email: "alice@apex-univ.edu",
    fullName: "Alice Turing",
    platformRole: "USER" as PlatformRole,
    memberships: [
      {
        tenantId: "tnt_apex",
        role: "ORG_OWNER" as TenantRole,
        tenant: { slug: "apex-univ", name: "Apex University" },
      },
    ],
  };

  const bobUser = {
    id: "usr_bob",
    email: "bob@beta-coll.edu",
    fullName: "Bob Lovelace",
    platformRole: "USER" as PlatformRole,
    memberships: [
      {
        tenantId: "tnt_beta",
        role: "CERTIFICATE_ISSUER" as TenantRole,
        tenant: { slug: "beta-college", name: "Beta College" },
      },
    ],
  };

  const superAdminUser = {
    id: "usr_admin",
    email: "admin@credvail.io",
    fullName: "System Superadmin",
    platformRole: "SUPER_ADMIN" as PlatformRole,
    memberships: [],
  };

  function createMockRequest(options: {
    cookieToken?: string;
    authHeaderToken?: string;
    headers?: Record<string, string>;
  }): NextRequest {
    const headerMap = new Headers(options.headers || {});
    if (options.authHeaderToken) {
      headerMap.set("authorization", `Bearer ${options.authHeaderToken}`);
    }

    const cookieMap = new Map<string, string>();
    if (options.cookieToken) {
      cookieMap.set(SESSION_COOKIE_NAME, options.cookieToken);
    }

    return {
      headers: headerMap,
      cookies: {
        get: (name: string) =>
          cookieMap.has(name) ? { name, value: cookieMap.get(name)! } : undefined,
      },
    } as unknown as NextRequest;
  }

  describe("extractSession", () => {
    it("should extract session from cookie", () => {
      const token = createSessionToken(aliceUser);
      const req = createMockRequest({ cookieToken: token });
      const session = extractSession(req);

      expect(session.sub).toBe(aliceUser.id);
      expect(session.email).toBe(aliceUser.email);
    });

    it("should extract session from Authorization Bearer header if cookie is absent", () => {
      const token = createSessionToken(aliceUser);
      const req = createMockRequest({ authHeaderToken: token });
      const session = extractSession(req);

      expect(session.sub).toBe(aliceUser.id);
    });

    it("should throw AuthenticationError if neither cookie nor bearer header is present", () => {
      const req = createMockRequest({});
      expect(() => extractSession(req)).toThrow(AuthenticationError);
      expect(() => extractSession(req)).toThrow(/No session authentication provided/);
    });

    it("should throw AuthenticationError if token is invalid or corrupted", () => {
      const req = createMockRequest({ cookieToken: "invalid.token.payload" });
      expect(() => extractSession(req)).toThrow(AuthenticationError);
      expect(() => extractSession(req)).toThrow(/Session expired or token invalid/);
    });
  });

  describe("extractTenantContext & Cross-Tenant Boundary Enforcement", () => {
    it("should grant access when user belongs to target tenant", () => {
      const token = createSessionToken(aliceUser);
      const req = createMockRequest({ cookieToken: token });

      const ctx = extractTenantContext(req, "apex-univ");
      expect(ctx.tenantId).toBe("tnt_apex");
      expect(ctx.tenantSlug).toBe("apex-univ");
      expect(ctx.tenantRole).toBe("ORG_OWNER");
      expect(ctx.userId).toBe(aliceUser.id);
    });

    it("CRITICAL: should reject access when User A attempts to access Tenant B", () => {
      // Alice is in Apex University, trying to access Beta College
      const token = createSessionToken(aliceUser);
      const req = createMockRequest({ cookieToken: token });

      expect(() => extractTenantContext(req, "beta-college")).toThrow(AuthorizationError);
      expect(() => extractTenantContext(req, "beta-college")).toThrow(
        /Access denied: You do not possess active membership in tenant 'beta-college'/
      );
    });

    it("should reject access when Bob attempts to access Apex University", () => {
      const token = createSessionToken(bobUser);
      const req = createMockRequest({ cookieToken: token });

      expect(() => extractTenantContext(req, "apex-univ")).toThrow(AuthorizationError);
    });

    it("should allow SUPER_ADMIN to access any tenant without explicit membership", () => {
      const token = createSessionToken(superAdminUser);
      const req = createMockRequest({ cookieToken: token });

      const ctx = extractTenantContext(req, "apex-univ");
      expect(ctx.tenantSlug).toBe("apex-univ");
      expect(ctx.tenantRole).toBe("ORG_OWNER");
    });

    it("should enforce required permission check in tenant context extraction", () => {
      const token = createSessionToken(bobUser); // Bob is CERTIFICATE_ISSUER in Beta College
      const req = createMockRequest({ cookieToken: token });

      // Bob has batches:issue
      expect(() => extractTenantContext(req, "beta-college", "batches:issue")).not.toThrow();

      // Bob does NOT have tenant:delete
      expect(() => extractTenantContext(req, "beta-college", "tenant:delete")).toThrow(
        /Forbidden: Role 'CERTIFICATE_ISSUER' lacks permission 'tenant:delete'/
      );
    });
  });

  describe("scopeTenantQuery", () => {
    it("should strictly bind tenantId to database queries", () => {
      const query = scopeTenantQuery("tnt_apex", {
        status: "ACTIVE",
        recipientEmail: "student@apex-univ.edu",
      });

      expect(query.tenantId).toBe("tnt_apex");
      expect(query.status).toBe("ACTIVE");
      expect(query.recipientEmail).toBe("student@apex-univ.edu");
    });

    it("should throw critical error if tenantId is missing or blank", () => {
      expect(() => scopeTenantQuery("", { id: "123" })).toThrow(
        /Critical Security Violation: Attempted to execute unscoped tenant query/
      );
    });
  });
});
