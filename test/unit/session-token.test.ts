import { describe, it, expect } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
  getSessionCookieHeader,
  getClearSessionCookieHeader,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";
import { PlatformRole, TenantRole } from "@/types";

describe("Session Management & Cryptographic Tokens", () => {
  const mockUser = {
    id: "usr_1234567890",
    email: "issuer@apex-univ.edu",
    fullName: "Dr. Alan Turing",
    platformRole: "USER" as PlatformRole,
    memberships: [
      {
        tenantId: "tnt_apex_01",
        role: "ORG_OWNER" as TenantRole,
        tenant: { slug: "apex-univ", name: "Apex University" },
      },
      {
        tenantId: "tnt_beta_02",
        role: "CERTIFICATE_ISSUER" as TenantRole,
        tenant: { slug: "beta-college", name: "Beta College" },
      },
    ],
  };

  it("should create a valid HMAC-SHA256 session token with 3 dot-separated parts", () => {
    const token = createSessionToken(mockUser);
    expect(typeof token).toBe("string");
    const parts = token.split(".");
    expect(parts.length).toBe(3);

    const [headerB64, payloadB64, signature] = parts;
    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf-8"));
    expect(header).toEqual({ alg: "HS256", typ: "JWT" });

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    expect(payload.sub).toBe(mockUser.id);
    expect(payload.email).toBe(mockUser.email);
    expect(payload.fullName).toBe(mockUser.fullName);
    expect(payload.platformRole).toBe("USER");
    expect(payload.tenants.length).toBe(2);
    expect(payload.currentTenantId).toBe("tnt_apex_01");
    expect(payload.currentTenantRole).toBe("ORG_OWNER");
    expect(payload.jti).toBeDefined();
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it("should verify a valid token and return full decoded session payload", () => {
    const token = createSessionToken(mockUser, "tnt_beta_02");
    const payload = verifySessionToken(token);

    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe(mockUser.id);
    expect(payload?.email).toBe(mockUser.email);
    expect(payload?.currentTenantId).toBe("tnt_beta_02");
    expect(payload?.currentTenantRole).toBe("CERTIFICATE_ISSUER");
  });

  it("should reject a token when the payload has been tampered with", () => {
    const token = createSessionToken(mockUser);
    const [header, payloadB64, sig] = token.split(".");

    // Attacker modifies their role from USER to SUPER_ADMIN
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    payload.platformRole = "SUPER_ADMIN";
    const forgedPayloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");

    const tamperedToken = `${header}.${forgedPayloadB64}.${sig}`;
    const result = verifySessionToken(tamperedToken);
    expect(result).toBeNull();
  });

  it("should reject a token with a corrupted or mismatched signature", () => {
    const token = createSessionToken(mockUser);
    const [header, payloadB64, sig] = token.split(".");

    // Flip bits in the signature
    const corruptedSig = sig.slice(0, -4) + "XXXX";
    const tamperedToken = `${header}.${payloadB64}.${corruptedSig}`;
    const result = verifySessionToken(tamperedToken);
    expect(result).toBeNull();
  });

  it("should reject tokens with invalid segment counts or arbitrary strings", () => {
    expect(verifySessionToken("")).toBeNull();
    expect(verifySessionToken("invalid-string")).toBeNull();
    expect(verifySessionToken("part1.part2")).toBeNull();
    expect(verifySessionToken("part1.part2.part3.part4")).toBeNull();
  });

  it("should reject an expired token", () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredPayload = {
      sub: "usr_expired",
      email: "expired@example.com",
      fullName: "Expired User",
      platformRole: "USER" as PlatformRole,
      tenants: [],
      iat: now - 3600,
      exp: now - 60, // expired 60 seconds ago
      jti: "test-expired-jti",
    };

    const header = { alg: "HS256", typ: "JWT" };
    const encHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
    const encPayload = Buffer.from(JSON.stringify(expiredPayload)).toString("base64url");
    const signingInput = `${encHeader}.${encPayload}`;

    const crypto = require("node:crypto");
    const secret = process.env.SESSION_SECRET || "credvail_default_development_secret_32bytes_minimum_key!";
    const signature = crypto.createHmac("sha256", secret).update(signingInput).digest("base64url");

    const expiredToken = `${signingInput}.${signature}`;
    const result = verifySessionToken(expiredToken);
    expect(result).toBeNull();
  });

  it("should format correct Set-Cookie header strings", () => {
    const token = createSessionToken(mockUser);
    const cookieHeader = getSessionCookieHeader(token, 86400);

    expect(cookieHeader).toContain(`${SESSION_COOKIE_NAME}=${token}`);
    expect(cookieHeader).toContain("Path=/");
    expect(cookieHeader).toContain("HttpOnly");
    expect(cookieHeader).toContain("SameSite=Strict");
    expect(cookieHeader).toContain("Max-Age=86400");

    const clearHeader = getClearSessionCookieHeader();
    expect(clearHeader).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(clearHeader).toContain("Max-Age=0");
  });
});
