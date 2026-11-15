import { describe, it, expect } from "vitest";
import {
  hasTenantPermission,
  assertTenantPermission,
  hasPlatformPermission,
  TenantPermission,
  PlatformPermission,
} from "@/lib/auth/rbac";
import { TenantRole, PlatformRole } from "@/types";

describe("Role-Based Access Control (RBAC) Engine", () => {
  const allTenantPermissions: TenantPermission[] = [
    "tenant:manage",
    "tenant:delete",
    "members:invite",
    "members:update_role",
    "members:remove",
    "keys:manage",
    "keys:rotate",
    "keys:compromise",
    "templates:create",
    "templates:update",
    "templates:delete",
    "batches:create",
    "batches:issue",
    "credentials:revoke",
    "credentials:reissue",
    "credentials:read",
    "audit:read",
  ];

  describe("Tenant Roles & Permissions Matrix", () => {
    it("ORG_OWNER must have all 17 tenant permissions", () => {
      for (const perm of allTenantPermissions) {
        expect(hasTenantPermission("ORG_OWNER", perm)).toBe(true);
      }
    });

    it("INSTITUTION_ADMIN should have management permissions except tenant:delete and keys management", () => {
      expect(hasTenantPermission("INSTITUTION_ADMIN", "tenant:manage")).toBe(true);
      expect(hasTenantPermission("INSTITUTION_ADMIN", "members:invite")).toBe(true);
      expect(hasTenantPermission("INSTITUTION_ADMIN", "members:update_role")).toBe(true);
      expect(hasTenantPermission("INSTITUTION_ADMIN", "members:remove")).toBe(true);
      expect(hasTenantPermission("INSTITUTION_ADMIN", "templates:create")).toBe(true);
      expect(hasTenantPermission("INSTITUTION_ADMIN", "batches:issue")).toBe(true);
      expect(hasTenantPermission("INSTITUTION_ADMIN", "credentials:revoke")).toBe(true);

      // Forbidden for INSTITUTION_ADMIN
      expect(hasTenantPermission("INSTITUTION_ADMIN", "tenant:delete")).toBe(false);
      expect(hasTenantPermission("INSTITUTION_ADMIN", "keys:manage")).toBe(false);
      expect(hasTenantPermission("INSTITUTION_ADMIN", "keys:rotate")).toBe(false);
      expect(hasTenantPermission("INSTITUTION_ADMIN", "keys:compromise")).toBe(false);
    });

    it("CERTIFICATE_ISSUER should only manage batches, credentials, and read audit logs", () => {
      expect(hasTenantPermission("CERTIFICATE_ISSUER", "batches:create")).toBe(true);
      expect(hasTenantPermission("CERTIFICATE_ISSUER", "batches:issue")).toBe(true);
      expect(hasTenantPermission("CERTIFICATE_ISSUER", "credentials:revoke")).toBe(true);
      expect(hasTenantPermission("CERTIFICATE_ISSUER", "credentials:reissue")).toBe(true);
      expect(hasTenantPermission("CERTIFICATE_ISSUER", "credentials:read")).toBe(true);
      expect(hasTenantPermission("CERTIFICATE_ISSUER", "audit:read")).toBe(true);

      // Forbidden for CERTIFICATE_ISSUER
      expect(hasTenantPermission("CERTIFICATE_ISSUER", "tenant:manage")).toBe(false);
      expect(hasTenantPermission("CERTIFICATE_ISSUER", "members:invite")).toBe(false);
      expect(hasTenantPermission("CERTIFICATE_ISSUER", "keys:manage")).toBe(false);
      expect(hasTenantPermission("CERTIFICATE_ISSUER", "templates:create")).toBe(false);
      expect(hasTenantPermission("CERTIFICATE_ISSUER", "templates:delete")).toBe(false);
    });

    it("TEMPLATE_DESIGNER should only manage templates and read credentials", () => {
      expect(hasTenantPermission("TEMPLATE_DESIGNER", "templates:create")).toBe(true);
      expect(hasTenantPermission("TEMPLATE_DESIGNER", "templates:update")).toBe(true);
      expect(hasTenantPermission("TEMPLATE_DESIGNER", "templates:delete")).toBe(true);
      expect(hasTenantPermission("TEMPLATE_DESIGNER", "credentials:read")).toBe(true);

      // Forbidden for TEMPLATE_DESIGNER
      expect(hasTenantPermission("TEMPLATE_DESIGNER", "batches:issue")).toBe(false);
      expect(hasTenantPermission("TEMPLATE_DESIGNER", "credentials:revoke")).toBe(false);
      expect(hasTenantPermission("TEMPLATE_DESIGNER", "members:invite")).toBe(false);
      expect(hasTenantPermission("TEMPLATE_DESIGNER", "keys:manage")).toBe(false);
    });

    it("READ_ONLY_STAFF should only have read permissions", () => {
      expect(hasTenantPermission("READ_ONLY_STAFF", "credentials:read")).toBe(true);
      expect(hasTenantPermission("READ_ONLY_STAFF", "audit:read")).toBe(true);

      // Forbidden for READ_ONLY_STAFF
      expect(hasTenantPermission("READ_ONLY_STAFF", "templates:create")).toBe(false);
      expect(hasTenantPermission("READ_ONLY_STAFF", "batches:create")).toBe(false);
      expect(hasTenantPermission("READ_ONLY_STAFF", "batches:issue")).toBe(false);
      expect(hasTenantPermission("READ_ONLY_STAFF", "credentials:revoke")).toBe(false);
      expect(hasTenantPermission("READ_ONLY_STAFF", "members:invite")).toBe(false);
    });

    it("undefined role should return false for all permissions", () => {
      for (const perm of allTenantPermissions) {
        expect(hasTenantPermission(undefined, perm)).toBe(false);
      }
    });
  });

  describe("assertTenantPermission Enforcement", () => {
    it("should not throw when role has the requested permission", () => {
      expect(() => assertTenantPermission("ORG_OWNER", "keys:manage")).not.toThrow();
      expect(() => assertTenantPermission("TEMPLATE_DESIGNER", "templates:create")).not.toThrow();
      expect(() => assertTenantPermission("CERTIFICATE_ISSUER", "batches:issue")).not.toThrow();
    });

    it("should throw an error with forbidden description when role lacks permission", () => {
      expect(() => assertTenantPermission("TEMPLATE_DESIGNER", "batches:issue")).toThrow(
        /Forbidden: Role 'TEMPLATE_DESIGNER' lacks permission 'batches:issue'/
      );
      expect(() => assertTenantPermission("READ_ONLY_STAFF", "templates:create")).toThrow(
        /Forbidden: Role 'READ_ONLY_STAFF' lacks permission 'templates:create'/
      );
      expect(() => assertTenantPermission(undefined, "credentials:read")).toThrow(
        /Forbidden: Role 'NONE' lacks permission 'credentials:read'/
      );
    });
  });

  describe("Platform Permissions Matrix", () => {
    it("SUPER_ADMIN must have all platform permissions", () => {
      const platformPerms: PlatformPermission[] = [
        "platform:manage_institutions",
        "platform:verify_institution",
        "platform:view_global_metrics",
        "platform:audit_all",
      ];

      for (const perm of platformPerms) {
        expect(hasPlatformPermission("SUPER_ADMIN", perm)).toBe(true);
      }
    });

    it("PLATFORM_AUDITOR should only have metrics and audit view permissions", () => {
      expect(hasPlatformPermission("PLATFORM_AUDITOR", "platform:view_global_metrics")).toBe(true);
      expect(hasPlatformPermission("PLATFORM_AUDITOR", "platform:audit_all")).toBe(true);
      expect(hasPlatformPermission("PLATFORM_AUDITOR", "platform:manage_institutions")).toBe(false);
      expect(hasPlatformPermission("PLATFORM_AUDITOR", "platform:verify_institution")).toBe(false);
    });

    it("standard USER should have zero platform permissions", () => {
      expect(hasPlatformPermission("USER", "platform:manage_institutions")).toBe(false);
      expect(hasPlatformPermission("USER", "platform:verify_institution")).toBe(false);
      expect(hasPlatformPermission("USER", "platform:view_global_metrics")).toBe(false);
      expect(hasPlatformPermission("USER", "platform:audit_all")).toBe(false);
    });
  });
});
