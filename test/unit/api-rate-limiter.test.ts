import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  hashRateLimitKey,
  getClientIp,
  checkApiRateLimit,
  createRateLimitResponse,
  inMemoryApiRateLimitStore,
  resetApiRateLimiter,
  RATE_LIMIT_PROFILES,
} from "@/lib/services/api-rate-limiter";
import {
  credentialIdSchema,
  tenantSlugSchema,
  audienceOriginSchema,
  verifyPresentationSchema,
  validateParam,
} from "@/lib/validation/api-validators";

describe("CRV-SEC-04: API Rate Limiting & Input Validation Hardening", () => {
  beforeEach(() => {
    resetApiRateLimiter();
    inMemoryApiRateLimitStore.setClock(() => new Date());
  });

  describe("1. Domain-Separated Cryptographic Key Hashing", () => {
    it("should generate a 64-character SHA-256 digest for any identifier and scope", () => {
      const key = hashRateLimitKey("192.168.1.1", "auth:login");
      expect(key.length).toBe(64);
      expect(/^[0-9a-f]{64}$/.test(key)).toBe(true);
    });

    it("should strictly separate buckets across different scopes for the same identifier", () => {
      const loginKey = hashRateLimitKey("192.168.1.1", "auth:login");
      const registerKey = hashRateLimitKey("192.168.1.1", "auth:register");
      const lookupKey = hashRateLimitKey("192.168.1.1", "verify:lookup");

      expect(loginKey).not.toBe(registerKey);
      expect(loginKey).not.toBe(lookupKey);
      expect(registerKey).not.toBe(lookupKey);
    });

    it("should strictly separate buckets across different identifiers in the same scope", () => {
      const keyA = hashRateLimitKey("10.0.0.1", "verify:lookup");
      const keyB = hashRateLimitKey("10.0.0.2", "verify:lookup");

      expect(keyA).not.toBe(keyB);
    });

    it("should throw an error on empty or invalid identifiers", () => {
      expect(() => hashRateLimitKey("", "auth:login")).toThrow(/Rate limit identifier must be a non-empty string/);
      expect(() => hashRateLimitKey(null as any, "auth:login")).toThrow();
    });
  });

  describe("2. Client IP Extraction & Port Sanitization", () => {
    it("should extract the first client IP from an x-forwarded-for chain", () => {
      const req = new NextRequest("http://localhost/api/v1/auth/login", {
        headers: { "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178" },
      });
      expect(getClientIp(req)).toBe("203.0.113.195");
    });

    it("should strip client port suffixes from IPv4 addresses", () => {
      const req = new NextRequest("http://localhost/api/v1/auth/login", {
        headers: { "x-forwarded-for": "198.51.100.42:54321" },
      });
      expect(getClientIp(req)).toBe("198.51.100.42");
    });

    it("should handle IPv6 addresses cleanly", () => {
      const req = new NextRequest("http://localhost/api/v1/auth/login", {
        headers: { "x-forwarded-for": "2001:0db8:85a3:0000:0000:8a2e:0370:7334" },
      });
      expect(getClientIp(req)).toBe("2001:0db8:85a3:0000:0000:8a2e:0370:7334");
    });

    it("should fallback to x-real-ip or cf-connecting-ip if x-forwarded-for is missing", () => {
      const reqReal = new NextRequest("http://localhost/api/v1/auth/login", {
        headers: { "x-real-ip": "198.51.100.99" },
      });
      expect(getClientIp(reqReal)).toBe("198.51.100.99");

      const reqCf = new NextRequest("http://localhost/api/v1/auth/login", {
        headers: { "cf-connecting-ip": "198.51.100.100" },
      });
      expect(getClientIp(reqCf)).toBe("198.51.100.100");
    });

    it("should fallback to 127.0.0.1 if no headers are provided", () => {
      const req = new NextRequest("http://localhost/api/v1/auth/login");
      expect(getClientIp(req)).toBe("127.0.0.1");
    });
  });

  describe("3. Sliding-Window Rate Limit Enforcement", () => {
    it("should allow requests up to the maxAttempts limit", async () => {
      const ip = "192.168.1.50";

      for (let i = 1; i <= 5; i++) {
        const result = await checkApiRateLimit({
          identifier: ip,
          scope: "test:limit",
          maxAttempts: 5,
          windowSeconds: 60,
        });
        expect(result.allowed).toBe(true);
        expect(result.retryAfter).toBeUndefined();
      }

      // 6th attempt must be rejected
      const rejected = await checkApiRateLimit({
        identifier: ip,
        scope: "test:limit",
        maxAttempts: 5,
        windowSeconds: 60,
      });

      expect(rejected.allowed).toBe(false);
      expect(rejected.retryAfter).toBeGreaterThan(0);
      expect(rejected.retryAfter).toBeLessThanOrEqual(60);
    });

    it("should reset the rate limit bucket after the window expires (time-travel test)", async () => {
      let currentTime = new Date("2026-11-24T12:00:00Z");
      inMemoryApiRateLimitStore.setClock(() => currentTime);

      const ip = "192.168.1.60";

      // Exhaust limit
      for (let i = 0; i < 3; i++) {
        await checkApiRateLimit({
          identifier: ip,
          scope: "test:expire",
          maxAttempts: 3,
          windowSeconds: 60,
        });
      }

      const blocked = await checkApiRateLimit({
        identifier: ip,
        scope: "test:expire",
        maxAttempts: 3,
        windowSeconds: 60,
      });
      expect(blocked.allowed).toBe(false);

      // Advance time by 61 seconds (past the 60s window)
      currentTime = new Date(currentTime.getTime() + 61 * 1000);

      const freshAttempt = await checkApiRateLimit({
        identifier: ip,
        scope: "test:expire",
        maxAttempts: 3,
        windowSeconds: 60,
      });

      expect(freshAttempt.allowed).toBe(true);
    });

    it("should maintain independent limits across distinct scopes", async () => {
      const ip = "192.168.1.70";

      // Exhaust auth:login limit
      for (let i = 0; i < RATE_LIMIT_PROFILES.AUTH_LOGIN.maxAttempts; i++) {
        await checkApiRateLimit({
          identifier: ip,
          ...RATE_LIMIT_PROFILES.AUTH_LOGIN,
        });
      }

      // auth:login is blocked
      const loginBlocked = await checkApiRateLimit({
        identifier: ip,
        ...RATE_LIMIT_PROFILES.AUTH_LOGIN,
      });
      expect(loginBlocked.allowed).toBe(false);

      // verify:lookup is completely unblocked and independent
      const lookupAllowed = await checkApiRateLimit({
        identifier: ip,
        ...RATE_LIMIT_PROFILES.VERIFY_LOOKUP,
      });
      expect(lookupAllowed.allowed).toBe(true);
    });
  });

  describe("4. Standard HTTP 429 Response Generation", () => {
    it("should generate a RFC-compliant HTTP 429 response with Retry-After header", async () => {
      const res = createRateLimitResponse(45, "public lookup");
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("45");
      expect(res.headers.get("Cache-Control")).toContain("no-store");

      const body = await res.json();
      expect(body.error).toBe("TOO_MANY_REQUESTS");
      expect(body.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(body.retryAfter).toBe(45);
      expect(body.message).toContain("public lookup");
    });
  });

  describe("5. Input Validation Schemas & Parameter Sanitization", () => {
    it("should validate safe credential public identifiers and reject injection tokens", () => {
      // Valid identifiers
      expect(() => validateParam("cert-2026-001", credentialIdSchema)).not.toThrow();
      expect(() => validateParam("urn:uuid:123e4567-e89b-12d3-a456-426614174000", credentialIdSchema)).not.toThrow();
      expect(() => validateParam("CV-HARVARD-98231", credentialIdSchema)).not.toThrow();

      // Rejected injection and traversal attempts
      expect(() => validateParam("../../etc/passwd", credentialIdSchema)).toThrow();
      expect(() => validateParam("cert' OR '1'='1", credentialIdSchema)).toThrow();
      expect(() => validateParam("<script>alert(1)</script>", credentialIdSchema)).toThrow();
      expect(() => validateParam("ab", credentialIdSchema)).toThrow(); // Under min length
      expect(() => validateParam("a".repeat(129), credentialIdSchema)).toThrow(); // Over max length
    });

    it("should validate tenant slugs strictly", () => {
      expect(() => validateParam("mit", tenantSlugSchema)).not.toThrow();
      expect(() => validateParam("oxford-university", tenantSlugSchema)).not.toThrow();

      // Rejected invalid slugs
      expect(() => validateParam("Harvard University", tenantSlugSchema)).toThrow(); // spaces
      expect(() => validateParam("MIT", tenantSlugSchema)).toThrow(); // uppercase
      expect(() => validateParam("org_name", tenantSlugSchema)).toThrow(); // underscores
      expect(() => validateParam("a", tenantSlugSchema)).toThrow(); // too short
    });

    it("should enforce HTTPS origin on challenge audiences", () => {
      // Valid HTTPS origins
      expect(() => audienceOriginSchema.parse("https://verifier.example.com")).not.toThrow();
      expect(() => audienceOriginSchema.parse("https://portal.institution.edu:8443")).not.toThrow();
      expect(() => audienceOriginSchema.parse("http://localhost:3000")).not.toThrow();

      // Rejected insecure or invalid origins
      expect(() => audienceOriginSchema.parse("http://insecure.example.com")).toThrow();
      expect(() => audienceOriginSchema.parse("https://user:pass@example.com")).toThrow();
      expect(() => audienceOriginSchema.parse("https://example.com/path/to/page")).toThrow(); // paths not allowed
      expect(() => audienceOriginSchema.parse("javascript:alert(1)")).toThrow();
    });

    it("should validate verifyPresentationSchema correctly", () => {
      expect(
        verifyPresentationSchema.safeParse({
          credential: { id: "test", type: ["VerifiableCredential"] },
        }).success
      ).toBe(true);

      expect(
        verifyPresentationSchema.safeParse({
          presentation: { id: "test-pres", type: ["VerifiablePresentation"] },
          nonce: "nonce-12345",
        }).success
      ).toBe(true);

      // Rejects empty body with neither credential nor presentation
      expect(
        verifyPresentationSchema.safeParse({}).success
      ).toBe(false);
    });
  });
});
