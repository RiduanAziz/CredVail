/**
 * CREDVAIL Claim Rate Limiter Unit Tests (H1.3.2)
 *
 * Covers:
 * - 1. First attempt allowed within new window.
 * - 2. Attempts 2 to 10 allowed within active window.
 * - 3. Attempt 11 strictly rejected with retry-after.
 * - 4. Correct retry-after calculation via deterministic injected clock.
 * - 5. Window expiry resets counter and permits immediate recovery.
 * - 6. Blocked attempts do not increment counter (counter remains at 10).
 * - 7. Distinct authenticated identifiers maintain strictly isolated buckets.
 * - 8. Key derivation produces deterministic SHA-256 hex without raw user IDs.
 * - 9. Storage failure is fail-closed (throws ClaimRateLimitUnavailableError).
 * - 10. ClaimRateLimitUnavailableError maps to HTTP 503 and safe public message.
 * - 11. Explicit test double injection is supported; default is PostgreSQL Prisma repository.
 * - 12. Bounded stale-bucket cleanup deletes expired entries while preserving active entries.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  checkClaimRateLimit,
  resetClaimRateLimiter,
  ClaimRateLimitUnavailableError,
  CLAIM_RATE_LIMIT_MAX,
  CLAIM_RATE_LIMIT_WINDOW_SECONDS,
} from "@/lib/services/claim-rate-limiter";
import {
  ClaimRateLimitRepository,
  InMemoryClaimRateLimitRepository,
  PrismaClaimRateLimitRepository,
  hashRateLimitKey,
} from "@/lib/repositories/claim-rate-limit-repository";

describe("CREDVAIL Claim Rate Limiter & Abuse Protection Unit Suite (H1.3.2)", () => {
  let simulatedTimeMs: number;
  let testDouble: InMemoryClaimRateLimitRepository;

  beforeEach(() => {
    simulatedTimeMs = 1700000000000; // Deterministic fixed timestamp
    testDouble = new InMemoryClaimRateLimitRepository(() => new Date(simulatedTimeMs));
    ClaimRateLimitRepository.setTestDouble(testDouble);
    resetClaimRateLimiter();
  });

  afterAll(() => {
    ClaimRateLimitRepository.resetTestDouble();
  });

  it("1. allows the first claim attempt for a new user and anchors a 60-second window", async () => {
    const result = await checkClaimRateLimit("user:test-user-01");
    expect(result.allowed).toBe(true);
    expect(result.retryAfter).toBeUndefined();

    const bucket = await testDouble.getBucket("user:test-user-01");
    expect(bucket).not.toBeNull();
    expect(bucket!.count).toBe(1);
    expect(bucket!.resetAt.getTime()).toBe(simulatedTimeMs + CLAIM_RATE_LIMIT_WINDOW_SECONDS * 1000);
  });

  it("2. allows attempts 2 through 10 within the active 60-second window", async () => {
    for (let attempt = 1; attempt <= CLAIM_RATE_LIMIT_MAX; attempt++) {
      const result = await checkClaimRateLimit("user:test-user-02");
      expect(result.allowed, `Attempt ${attempt} should be allowed`).toBe(true);
    }

    const bucket = await testDouble.getBucket("user:test-user-02");
    expect(bucket!.count).toBe(10);
  });

  it("3. strictly rejects the 11th claim attempt within the active window", async () => {
    // Consume 10 attempts at T = 0s
    for (let i = 0; i < 10; i++) {
      await checkClaimRateLimit("user:test-user-03");
    }

    // Advance clock by 15 seconds (T = 15s, window remaining = 45s)
    simulatedTimeMs += 15000;

    const blocked = await checkClaimRateLimit("user:test-user-03");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBe(45);
  });

  it("4. computes accurate retry-after calculation as time elapses", async () => {
    for (let i = 0; i < 10; i++) {
      await checkClaimRateLimit("user:test-user-04");
    }

    // Check at T = +0s -> retryAfter = 60
    let res = await checkClaimRateLimit("user:test-user-04");
    expect(res.allowed).toBe(false);
    expect(res.retryAfter).toBe(60);

    // Advance clock by 30 seconds -> retryAfter = 30
    simulatedTimeMs += 30000;
    res = await checkClaimRateLimit("user:test-user-04");
    expect(res.allowed).toBe(false);
    expect(res.retryAfter).toBe(30);

    // Advance clock by 29 seconds -> retryAfter = 1
    simulatedTimeMs += 29000;
    res = await checkClaimRateLimit("user:test-user-04");
    expect(res.allowed).toBe(false);
    expect(res.retryAfter).toBe(1);
  });

  it("5. resets the attempt counter after the window expires", async () => {
    for (let i = 0; i < 10; i++) {
      await checkClaimRateLimit("user:test-user-05");
    }

    // Still blocked at 59 seconds
    simulatedTimeMs += 59000;
    expect((await checkClaimRateLimit("user:test-user-05")).allowed).toBe(false);

    // Clock reaches 60 seconds (window expired)
    simulatedTimeMs += 1000;

    // First attempt in new window succeeds
    const recovered = await checkClaimRateLimit("user:test-user-05");
    expect(recovered.allowed).toBe(true);

    const bucket = await testDouble.getBucket("user:test-user-05");
    expect(bucket!.count).toBe(1);
    expect(bucket!.resetAt.getTime()).toBe(simulatedTimeMs + 60000);
  });

  it("6. blocked attempts do NOT increment the attempt count", async () => {
    for (let i = 0; i < 10; i++) {
      await checkClaimRateLimit("user:test-user-06");
    }

    const bucketBefore = await testDouble.getBucket("user:test-user-06");
    expect(bucketBefore!.count).toBe(10);

    // Send 5 blocked attempts
    for (let i = 0; i < 5; i++) {
      const res = await checkClaimRateLimit("user:test-user-06");
      expect(res.allowed).toBe(false);
    }

    // Count must remain at 10 (not 15)
    const bucketAfter = await testDouble.getBucket("user:test-user-06");
    expect(bucketAfter!.count).toBe(10);
  });

  it("7. separate authenticated users maintain completely isolated rate-limit buckets", async () => {
    // User Alice exhausts her limit
    for (let i = 0; i < 10; i++) {
      await checkClaimRateLimit("user:alice");
    }
    expect((await checkClaimRateLimit("user:alice")).allowed).toBe(false);

    // User Bob has an independent bucket and is not blocked
    const bobResult = await checkClaimRateLimit("user:bob");
    expect(bobResult.allowed).toBe(true);

    const aliceBucket = await testDouble.getBucket("user:alice");
    const bobBucket = await testDouble.getBucket("user:bob");

    expect(aliceBucket!.count).toBe(10);
    expect(bobBucket!.count).toBe(1);
    expect(aliceBucket!.keyHash).not.toBe(bobBucket!.keyHash);
  });

  it("8. derives deterministic SHA-256 key without storing raw user identifier", () => {
    const rawId = "user:authenticated-subject-uuid-1234";
    const hashA = hashRateLimitKey(rawId);
    const hashB = hashRateLimitKey(rawId);

    expect(hashA).toBe(hashB);
    expect(hashA).toMatch(/^[a-f0-9]{64}$/);
    expect(hashA).not.toContain("authenticated-subject-uuid-1234");
    expect(hashA).not.toContain("user:");

    expect(() => hashRateLimitKey("")).toThrow("Rate limit identifier must be a non-empty string");
  });

  it("9. storage/database failure fails closed with ClaimRateLimitUnavailableError", async () => {
    // Mock failing repository
    const failingRepo = {
      consumeAttempt: async () => {
        throw new Error("PostgreSQL connection terminated unexpectedly");
      },
      cleanupStaleBuckets: async () => 0,
      getBucket: async () => null,
    };

    ClaimRateLimitRepository.setTestDouble(failingRepo);

    await expect(checkClaimRateLimit("user:any-user")).rejects.toThrow(
      ClaimRateLimitUnavailableError
    );

    try {
      await checkClaimRateLimit("user:any-user");
    } catch (err: any) {
      expect(err).toBeInstanceOf(ClaimRateLimitUnavailableError);
      expect(err.code).toBe("CLAIM_RATE_LIMIT_UNAVAILABLE");
      expect(err.statusCode).toBe(503);
      expect(err.message).toBe("Claim protection is temporarily unavailable. Please retry shortly.");
      // Internal error preserved for logging but not exposed in toJSON()
      expect(err.cause).toBeDefined();
      const json = err.toJSON();
      expect(json.error).toBe("SERVICE_UNAVAILABLE");
      expect(json.code).toBe("CLAIM_RATE_LIMIT_UNAVAILABLE");
      expect(json.message).toBe("Claim protection is temporarily unavailable. Please retry shortly.");
    }
  });

  it("10. production defaults to Prisma repository without silent in-memory fallback", () => {
    ClaimRateLimitRepository.resetTestDouble();
    expect(ClaimRateLimitRepository.instance).toBeInstanceOf(PrismaClaimRateLimitRepository);
  });

  it("11. bounded cleanup removes stale buckets (>24h expired) but preserves active buckets", async () => {
    // Create an active bucket at T = 0
    await checkClaimRateLimit("user:active-user");

    // Manually insert an expired bucket from 25 hours ago
    const staleTimeMs = simulatedTimeMs - 25 * 60 * 60 * 1000;
    const staleDouble = new InMemoryClaimRateLimitRepository(() => new Date(staleTimeMs));
    await staleDouble.consumeAttempt("user:stale-user");

    // Copy stale bucket into current test double
    const staleBucket = await staleDouble.getBucket("user:stale-user");
    (testDouble as any).store.set(staleBucket!.keyHash, {
      count: staleBucket!.count,
      resetAt: staleBucket!.resetAt,
      createdAt: staleBucket!.createdAt,
      updatedAt: staleBucket!.updatedAt,
    });

    expect(await testDouble.getBucket("user:active-user")).not.toBeNull();
    expect(await testDouble.getBucket("user:stale-user")).not.toBeNull();

    // Run cleanup for buckets older than 24h
    const deletedCount = await testDouble.cleanupStaleBuckets(500, 24 * 60 * 60 * 1000);
    expect(deletedCount).toBe(1);

    // Stale bucket removed; active bucket strictly preserved
    expect(await testDouble.getBucket("user:stale-user")).toBeNull();
    expect(await testDouble.getBucket("user:active-user")).not.toBeNull();
  });
});
