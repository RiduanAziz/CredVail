import type { PlatformRole, TenantRole } from "../../types/index.ts";

export type TenantPermission =
  | "tenant:manage"
  | "tenant:delete"
  | "members:invite"
  | "members:update_role"
  | "members:remove"
  | "keys:manage"
  | "keys:rotate"
  | "keys:compromise"
  | "templates:create"
  | "templates:update"
  | "templates:delete"
  | "batches:create"
  | "batches:issue"
  | "credentials:revoke"
  | "credentials:reissue"
  | "credentials:read"
  | "audit:read";

export type PlatformPermission =
  | "platform:manage_institutions"
  | "platform:verify_institution"
  | "platform:view_global_metrics"
  | "platform:audit_all";

/**
 * Mapping of Tenant Roles to their permitted actions.
 */
const TENANT_ROLE_PERMISSIONS: Record<TenantRole, Set<TenantPermission>> = {
  ORG_OWNER: new Set<TenantPermission>([
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
  ]),

  INSTITUTION_ADMIN: new Set<TenantPermission>([
    "tenant:manage",
    "members:invite",
    "members:update_role",
    "members:remove",
    "templates:create",
    "templates:update",
    "templates:delete",
    "batches:create",
    "batches:issue",
    "credentials:revoke",
    "credentials:reissue",
    "credentials:read",
    "audit:read",
  ]),

  CERTIFICATE_ISSUER: new Set<TenantPermission>([
    "batches:create",
    "batches:issue",
    "credentials:revoke",
    "credentials:reissue",
    "credentials:read",
    "audit:read",
  ]),

  TEMPLATE_DESIGNER: new Set<TenantPermission>([
    "templates:create",
    "templates:update",
    "templates:delete",
    "credentials:read",
  ]),

  READ_ONLY_STAFF: new Set<TenantPermission>([
    "credentials:read",
    "audit:read",
  ]),
};

/**
 * Mapping of Platform Roles to global permissions.
 */
const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, Set<PlatformPermission>> = {
  SUPER_ADMIN: new Set<PlatformPermission>([
    "platform:manage_institutions",
    "platform:verify_institution",
    "platform:view_global_metrics",
    "platform:audit_all",
  ]),

  PLATFORM_AUDITOR: new Set<PlatformPermission>([
    "platform:view_global_metrics",
    "platform:audit_all",
  ]),

  USER: new Set<PlatformPermission>([]),
};

/**
 * Checks if a given tenant role possesses a specific permission.
 */
export function hasTenantPermission(role: TenantRole | undefined, permission: TenantPermission): boolean {
  if (!role) return false;
  return TENANT_ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/**
 * Checks if a platform role possesses a global permission.
 */
export function hasPlatformPermission(role: PlatformRole, permission: PlatformPermission): boolean {
  return PLATFORM_ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/**
 * Asserts that a user has the required tenant permission; throws an Error if unauthorized.
 */
export function assertTenantPermission(role: TenantRole | undefined, permission: TenantPermission): void {
  if (!hasTenantPermission(role, permission)) {
    throw new Error(`Forbidden: Role '${role || "NONE"}' lacks permission '${permission}'`);
  }
}
