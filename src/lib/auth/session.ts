import crypto from "node:crypto";
import type { PlatformRole, TenantRole } from "../../types/index.ts";
import { SessionRevocationService } from "./session-revocation.ts";

export interface SessionTenantInfo {
  tenantId: string;
  slug: string;
  name: string;
  role: TenantRole;
}

export interface SessionPayload {
  sub: string; // User ID
  email: string;
  fullName: string;
  platformRole: PlatformRole;
  tenants: SessionTenantInfo[];
  currentTenantId?: string;
  currentTenantRole?: TenantRole;
  emailVerified?: boolean; // Fail-closed: only explicit `true` permits claims
  iat: number;
  exp: number;
  jti: string;
}

export const SESSION_COOKIE_NAME = "credvail_session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24; // 24 hours
export const DEFAULT_DEV_SESSION_SECRET = "credvail_default_development_secret_32bytes_minimum_key!";

export class SessionConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionConfigurationError";
  }
}

/**
 * Validates that SESSION_SECRET is properly configured for the current environment.
 * Fails closed in production if missing, under 32 characters, or set to the dev default.
 */
export function validateSessionConfiguration(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  const isProd =
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build";

  if (isProd) {
    if (!secret) {
      throw new SessionConfigurationError(
        "FATAL: SESSION_SECRET is not configured in production environment."
      );
    }
    if (secret.length < 32) {
      throw new SessionConfigurationError(
        "FATAL: SESSION_SECRET must be at least 32 characters in production."
      );
    }
    if (secret === DEFAULT_DEV_SESSION_SECRET) {
      throw new SessionConfigurationError(
        "FATAL: SESSION_SECRET cannot use the default development fallback secret in production."
      );
    }
  }

  return secret || DEFAULT_DEV_SESSION_SECRET;
}

function getSessionSecret(): string {
  return validateSessionConfiguration();
}

function base64UrlEncode(data: string | Buffer): string {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf-8");
  return buf.toString("base64url");
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf-8");
}

/**
 * Creates a cryptographically signed HMAC-SHA256 session token.
 */
export function createSessionToken(
  user: {
    id: string;
    email: string;
    fullName: string;
    platformRole: PlatformRole;
    emailVerified?: boolean | null;
    emailVerifiedAt?: Date | string | null;
    memberships?: Array<{
      tenantId: string;
      role: TenantRole;
      acceptedAt?: Date | null;
      tenant: { slug: string; name: string };
    }>;
  },
  activeTenantId?: string
): string {
  const now = Math.floor(Date.now() / 1000);
  // Strictly filter out unaccepted pending member invitations (acceptedAt === null)
  const acceptedMemberships = (user.memberships || []).filter(
    (m) => m.acceptedAt !== null
  );
  const tenants: SessionTenantInfo[] = acceptedMemberships.map((m) => ({
    tenantId: m.tenantId,
    slug: m.tenant.slug,
    name: m.tenant.name,
    role: m.role,
  }));

  const activeTenant = tenants.find((t) => t.tenantId === activeTenantId) || tenants[0];

  // Strictly fail-closed email verification:
  // ONLY an explicit boolean `true` or a valid non-null `emailVerifiedAt` timestamp establishes verification.
  // Missing (undefined), null, false, or any other value strictly evaluates to false.
  const isEmailVerified =
    user.emailVerified === true ||
    (user.emailVerifiedAt !== undefined && user.emailVerifiedAt !== null);

  const payload: SessionPayload = {
    sub: user.id,
    email: user.email,
    fullName: user.fullName,
    platformRole: user.platformRole,
    tenants,
    currentTenantId: activeTenant?.tenantId,
    currentTenantRole: activeTenant?.role,
    emailVerified: isEmailVerified,
    iat: now,
    exp: now + SESSION_DURATION_SECONDS,
    jti: crypto.randomBytes(16).toString("hex"),
  };

  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac("sha256", getSessionSecret())
    .update(signingInput)
    .digest("base64url");

  return `${signingInput}.${signature}`;
}

/**
 * Verifies and decodes a session token.
 * Returns the SessionPayload if valid and non-expired; returns null otherwise.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const expectedSignature = crypto
      .createHmac("sha256", getSessionSecret())
      .update(signingInput)
      .digest("base64url");

    const sigBuf = Buffer.from(signature);
    const expectedSigBuf = Buffer.from(expectedSignature);

    // Timing-safe comparison to prevent timing attacks
    if (sigBuf.length !== expectedSigBuf.length || !crypto.timingSafeEqual(sigBuf, expectedSigBuf)) {
      return null;
    }

    const payload: SessionPayload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);

    // Check expiration
    if (payload.exp < now) {
      return null;
    }

    // Reject revoked sessions
    if (payload.jti && SessionRevocationService.isRevokedSync(payload.jti)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Verifies signature, expiration, and durable revocation store asynchronously.
 */
export async function verifySessionTokenAsync(token: string): Promise<SessionPayload | null> {
  const payload = verifySessionToken(token);
  if (!payload) return null;
  if (payload.jti && (await SessionRevocationService.isRevoked(payload.jti))) {
    return null;
  }
  return payload;
}

/**
 * Next.js standard cookie serialization string.
 */
export function getSessionCookieHeader(token: string, maxAge: number = SESSION_DURATION_SECONDS): string {
  const isProd = process.env.NODE_ENV === "production";
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; ${
    isProd ? "Secure; " : ""
  }SameSite=Strict; Max-Age=${maxAge}`;
}

/**
 * Clears the session cookie.
 */
export function getClearSessionCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}
