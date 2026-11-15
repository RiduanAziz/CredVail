import { NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME, SessionPayload, SessionTenantInfo } from "./session";
import { assertTenantPermission, TenantPermission, hasTenantPermission } from "./rbac";
import { TenantRole } from "@/types";

export interface AuthenticatedTenantContext {
  session: SessionPayload;
  userId: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  tenantRole: TenantRole;
}

export class AuthenticationError extends Error {
  constructor(message: string = "Unauthorized") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  constructor(message: string = "Forbidden") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/**
 * Extracts and verifies the session token from a NextRequest.
 * Checks both the HTTP-only cookie and the Authorization Bearer header.
 */
export function extractSession(request: NextRequest): SessionPayload {
  let token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    throw new AuthenticationError("No session authentication provided");
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    throw new AuthenticationError("Session expired or token invalid");
  }

  return payload;
}

/**
 * Enforces authenticated tenant membership and returns tenant-isolated context.
 * Guarantees that a user from Tenant A cannot access Tenant B.
 */
export function extractTenantContext(
  request: NextRequest,
  requiredSlugOrId?: string,
  requiredPermission?: TenantPermission
): AuthenticatedTenantContext {
  const session = extractSession(request);

  // Tenant identifier can come from explicit param, header, or query
  const targetSlugOrId =
    requiredSlugOrId ||
    request.headers.get("x-tenant-slug") ||
    request.headers.get("x-tenant-id") ||
    session.currentTenantId;

  if (!targetSlugOrId) {
    throw new AuthorizationError("No tenant context specified");
  }

  // Super administrators bypass tenant membership requirements
  if (session.platformRole === "SUPER_ADMIN") {
    const matchingTenant = session.tenants.find(
      (t) => t.slug === targetSlugOrId || t.tenantId === targetSlugOrId
    );

    return {
      session,
      userId: session.sub,
      tenantId: matchingTenant?.tenantId || targetSlugOrId,
      tenantSlug: matchingTenant?.slug || targetSlugOrId,
      tenantName: matchingTenant?.name || "System Admin Override",
      tenantRole: "ORG_OWNER",
    };
  }

  // Match against user's verified tenant memberships
  const membership = session.tenants.find(
    (t) => t.slug === targetSlugOrId || t.tenantId === targetSlugOrId
  );

  if (!membership) {
    throw new AuthorizationError(
      `Access denied: You do not possess active membership in tenant '${targetSlugOrId}'`
    );
  }

  // Verify permission if requested
  if (requiredPermission) {
    assertTenantPermission(membership.role, requiredPermission);
  }

  return {
    session,
    userId: session.sub,
    tenantId: membership.tenantId,
    tenantSlug: membership.slug,
    tenantName: membership.name,
    tenantRole: membership.role,
  };
}

/**
 * Query isolation wrapper guaranteeing that any operational data access
 * is strictly scoped to the tenant ID.
 */
export function scopeTenantQuery<T extends Record<string, unknown>>(
  tenantId: string,
  queryCriteria: T
): T & { tenantId: string } {
  if (!tenantId) {
    throw new Error("Critical Security Violation: Attempted to execute unscoped tenant query");
  }
  return {
    ...queryCriteria,
    tenantId,
  };
}
