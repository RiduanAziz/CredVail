/**
 * CREDVAIL Real PostgreSQL Claim Rate Limiter & Abuse Protection Integration Suite (H1.3.2)
 *
 * Target: Actual PostgreSQL persistence via Prisma Client
 * Isolation: Row-level locking (SELECT ... FOR UPDATE), SHA-256 key pseudonymization
 *
 * Test Matrix:
 * - PGRL-01: Ten requests for one user in one active window are allowed
 * - PGRL-02: The eleventh request is rejected with HTTP 429 behavior and valid Retry-After
 * - PGRL-03: Expired window resets the attempt count
 * - PGRL-04: Different users maintain isolated rate-limit buckets
 * - PGRL-05: Twenty simultaneous attempts through independent repository clients produce exactly 10 allowed and 10 rejected
 * - PGRL-06: Two independent clients share one persisted bucket (process-local state not required)
 * - PGRL-07: Persisted bucket keys contain only derived hash, not raw user identifier
 * - PGRL-08: Bounded cleanup removes stale buckets (>24h expired) but preserves active and concurrently-refreshed buckets
 * - PGRL-09: Claim API route returns HTTP 429 and correct Retry-After header when rate limit exceeded
 * - PGRL-10: Claim API route returns HTTP 503 with typed CLAIM_RATE_LIMIT_UNAVAILABLE when database fails
 * - PGRL-11: Forwarded-IP header spoofing cannot change or bypass the authenticated user's bucket
 * - PGRL-12: Client waiting on row lock evaluates window expiry using post-lock clock_timestamp(), resetting counter
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  ClaimRateLimitRepository,
  PrismaClaimRateLimitRepository,
  hashRateLimitKey,
} from "@/lib/repositories/claim-rate-limit-repository";
import { POST as claimRoute } from "@/app/api/v1/wallet/claim/route";
import { createSessionToken } from "@/lib/auth/session";

describe("CREDVAIL PostgreSQL Live Rate Limiting & Abuse Protection (H1.3.2)", () => {
  let isPostgresLive = false;
  const createdKeyHashes: string[] = [];

  beforeAll(async () => {
    const requirePostgres = process.env.REQUIRE_POSTGRES_INTEGRATION === "true";

    // Strictly ensure no in-memory test doubles are active
    ClaimRateLimitRepository.resetTestDouble();

    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      isPostgresLive = true;
    } catch (err: any) {
      isPostgresLive = false;
      const diagMsg =
        "\n[POSTGRES RATE LIMITER SUITE DIAGNOSTIC]:\n" +
        "PostgreSQL database is NOT accessible on configured DATABASE_URL.\n" +
        `Error: ${err.message}\n` +
        "STATUS: BLOCKED — Local environment lacks Docker and local PostgreSQL daemon.\n" +
        "Live PostgreSQL rate limiter tests will be skipped with status BLOCKED.\n";

      if (requirePostgres) {
        throw new Error(
          `FATAL: REQUIRE_POSTGRES_INTEGRATION is "true" but PostgreSQL connection failed: ${err.message}`
        );
      }
      console.warn(diagMsg);
    }
  });

  afterAll(async () => {
    ClaimRateLimitRepository.resetTestDouble();

    if (isPostgresLive) {
      try {
        if (createdKeyHashes.length > 0) {
          await prisma.claimRateLimitBucket.deleteMany({
            where: { keyHash: { in: createdKeyHashes } },
          });
        }
      } catch (cleanupErr: any) {
        console.error(
          `[POSTGRES RATE LIMITER CLEANUP FAILURE]: ${cleanupErr?.message || cleanupErr}`,
          cleanupErr
        );
      } finally {
        await prisma.$disconnect();
      }
    } else {
      await prisma.$disconnect();
    }
  });

  const testIfPostgres = (name: string, fn: () => Promise<void>) => {
    it(name, async (ctx: any) => {
      if (!isPostgresLive) {
        console.log(`[SKIPPED - BLOCKED]: ${name} (PostgreSQL daemon not running)`);
        ctx.skip();
        return;
      }
      await fn();
    });
  };

  testIfPostgres("PGRL-01: Ten requests for one user in one active window are allowed", async () => {
    const userId = `user:pgrl-01-${crypto.randomUUID()}`;
    const keyHash = hashRateLimitKey(userId);
    createdKeyHashes.push(keyHash);

    const repo = new PrismaClaimRateLimitRepository();

    for (let attempt = 1; attempt <= 10; attempt++) {
      const result = await repo.consumeAttempt(userId);
      expect(result.allowed, `Attempt ${attempt} must be allowed`).toBe(true);
      expect(result.retryAfter).toBeUndefined();
    }

    const row = await prisma.claimRateLimitBucket.findUnique({
      where: { keyHash },
    });
    expect(row).not.toBeNull();
    expect(row!.count).toBe(10);
  });

  testIfPostgres("PGRL-02: The eleventh request is rejected with HTTP 429 behavior and valid Retry-After", async () => {
    const userId = `user:pgrl-02-${crypto.randomUUID()}`;
    const keyHash = hashRateLimitKey(userId);
    createdKeyHashes.push(keyHash);

    const repo = new PrismaClaimRateLimitRepository();

    for (let i = 0; i < 10; i++) {
      await repo.consumeAttempt(userId);
    }

    const blockedResult = await repo.consumeAttempt(userId);
    expect(blockedResult.allowed).toBe(false);
    expect(blockedResult.retryAfter).toBeDefined();
    expect(blockedResult.retryAfter!).toBeGreaterThan(0);
    expect(blockedResult.retryAfter!).toBeLessThanOrEqual(60);

    // Verify database count was NOT incremented beyond 10
    const row = await prisma.claimRateLimitBucket.findUnique({
      where: { keyHash },
    });
    expect(row!.count).toBe(10);
  });

  testIfPostgres("PGRL-03: Expired window resets the attempt count", async () => {
    const userId = `user:pgrl-03-${crypto.randomUUID()}`;
    const keyHash = hashRateLimitKey(userId);
    createdKeyHashes.push(keyHash);

    const repo = new PrismaClaimRateLimitRepository();

    // Consume 10 attempts
    for (let i = 0; i < 10; i++) {
      await repo.consumeAttempt(userId);
    }

    // Artificially expire the window in PostgreSQL (set resetAt to 5 seconds ago)
    await prisma.claimRateLimitBucket.update({
      where: { keyHash },
      data: { resetAt: new Date(Date.now() - 5000) },
    });

    // The next attempt must succeed and start a fresh window
    const resetResult = await repo.consumeAttempt(userId);
    expect(resetResult.allowed).toBe(true);

    const row = await prisma.claimRateLimitBucket.findUnique({
      where: { keyHash },
    });
    expect(row!.count).toBe(1);
    expect(row!.resetAt.getTime()).toBeGreaterThan(Date.now());
  });

  testIfPostgres("PGRL-04: Different users maintain isolated rate-limit buckets", async () => {
    const userAlice = `user:pgrl-04-alice-${crypto.randomUUID()}`;
    const userBob = `user:pgrl-04-bob-${crypto.randomUUID()}`;

    const hashAlice = hashRateLimitKey(userAlice);
    const hashBob = hashRateLimitKey(userBob);
    createdKeyHashes.push(hashAlice, hashBob);

    const repo = new PrismaClaimRateLimitRepository();

    // Alice consumes 10 attempts
    for (let i = 0; i < 10; i++) {
      await repo.consumeAttempt(userAlice);
    }

    // Alice is blocked on attempt 11
    const aliceBlocked = await repo.consumeAttempt(userAlice);
    expect(aliceBlocked.allowed).toBe(false);

    // Bob has an isolated bucket and is allowed
    const bobAllowed = await repo.consumeAttempt(userBob);
    expect(bobAllowed.allowed).toBe(true);

    const rowAlice = await prisma.claimRateLimitBucket.findUnique({ where: { keyHash: hashAlice } });
    const rowBob = await prisma.claimRateLimitBucket.findUnique({ where: { keyHash: hashBob } });

    expect(rowAlice!.count).toBe(10);
    expect(rowBob!.count).toBe(1);
  });

  testIfPostgres("PGRL-05: Twenty simultaneous attempts through independent repository clients produce exactly 10 allowed and 10 rejected", async () => {
    const userId = `user:pgrl-05-${crypto.randomUUID()}`;
    const keyHash = hashRateLimitKey(userId);
    createdKeyHashes.push(keyHash);

    // 4 independent PrismaClient instances representing separate application instances
    const client1 = new PrismaClient();
    const client2 = new PrismaClient();
    const client3 = new PrismaClient();
    const client4 = new PrismaClient();

    const clients = [client1, client2, client3, client4];
    const repos = clients.map((c) => new PrismaClaimRateLimitRepository(c));

    try {
      const promises = Array.from({ length: 20 }, (_, i) => {
        const repo = repos[i % repos.length];
        return repo.consumeAttempt(userId);
      });

      const results = await Promise.all(promises);

      const successes = results.filter((r) => r.allowed).length;
      const rejections = results.filter((r) => !r.allowed).length;

      expect(successes).toBe(10);
      expect(rejections).toBe(10);

      // Verify row state in PostgreSQL
      const row = await prisma.claimRateLimitBucket.findUnique({ where: { keyHash } });
      expect(row).not.toBeNull();
      expect(row!.count).toBe(10);
    } finally {
      await Promise.all(clients.map((c) => c.$disconnect()));
    }
  });

  testIfPostgres("PGRL-06: Two independent clients share one persisted bucket (process-local state not required)", async () => {
    const userId = `user:pgrl-06-${crypto.randomUUID()}`;
    const keyHash = hashRateLimitKey(userId);
    createdKeyHashes.push(keyHash);

    const clientA = new PrismaClient();
    const clientB = new PrismaClient();
    const repoA = new PrismaClaimRateLimitRepository(clientA);
    const repoB = new PrismaClaimRateLimitRepository(clientB);

    try {
      // Client A consumes 6 attempts
      for (let i = 0; i < 6; i++) {
        const res = await repoA.consumeAttempt(userId);
        expect(res.allowed).toBe(true);
      }

      // Client B consumes remaining 4 attempts
      for (let i = 0; i < 4; i++) {
        const res = await repoB.consumeAttempt(userId);
        expect(res.allowed).toBe(true);
      }

      // 11th attempt on Client A is blocked
      const blockedA = await repoA.consumeAttempt(userId);
      expect(blockedA.allowed).toBe(false);

      // 12th attempt on Client B is also blocked
      const blockedB = await repoB.consumeAttempt(userId);
      expect(blockedB.allowed).toBe(false);
    } finally {
      await Promise.all([clientA.$disconnect(), clientB.$disconnect()]);
    }
  });

  testIfPostgres("PGRL-07: Persisted bucket keys contain only derived hash, not raw user identifier", async () => {
    const rawUserId = `user:confidential-identity-${crypto.randomUUID()}`;
    const expectedHash = hashRateLimitKey(rawUserId);
    createdKeyHashes.push(expectedHash);

    const repo = new PrismaClaimRateLimitRepository();
    await repo.consumeAttempt(rawUserId);

    const row = await prisma.claimRateLimitBucket.findUnique({
      where: { keyHash: expectedHash },
    });

    expect(row).not.toBeNull();
    expect(row!.keyHash).toBe(expectedHash);
    expect(row!.keyHash).not.toContain("confidential-identity");
    expect(row!.keyHash).not.toContain("user:");

    // Verify row does not contain raw user ID
    expect((row as any).userId).toBeUndefined();
    expect((row as any).identifier).toBeUndefined();
  });

  testIfPostgres("PGRL-08: Bounded cleanup removes stale buckets (>24h expired) but preserves active and concurrently-refreshed buckets", async () => {
    const activeUserId = `user:pgrl-08-active-${crypto.randomUUID()}`;
    const staleUserId = `user:pgrl-08-stale-${crypto.randomUUID()}`;
    const concurrentUserId = `user:pgrl-08-concurrent-${crypto.randomUUID()}`;

    const activeHash = hashRateLimitKey(activeUserId);
    const staleHash = hashRateLimitKey(staleUserId);
    const concurrentHash = hashRateLimitKey(concurrentUserId);
    createdKeyHashes.push(activeHash, staleHash, concurrentHash);

    const clientRefresh = new PrismaClient();
    const repo = new PrismaClaimRateLimitRepository();

    let releaseRefreshLock: () => void = () => {};
    const releaseRefreshPromise = new Promise<void>((resolve) => {
      releaseRefreshLock = resolve;
    });

    let refreshTransaction: Promise<any> | null = null;

    try {
      // 1. Active bucket (active window)
      await repo.consumeAttempt(activeUserId);

      // 2. Unlocked stale bucket inserted with resetAt 25 hours in the past
      await prisma.$executeRaw`
        INSERT INTO "claim_rate_limit_buckets" ("keyHash", "count", "resetAt", "createdAt", "updatedAt")
        VALUES (${staleHash}, 10, clock_timestamp() - INTERVAL '25 hours', clock_timestamp(), clock_timestamp())
      `;

      // 3. Stale bucket that will be concurrently refreshed by a live claim transaction
      await prisma.$executeRaw`
        INSERT INTO "claim_rate_limit_buckets" ("keyHash", "count", "resetAt", "createdAt", "updatedAt")
        VALUES (${concurrentHash}, 10, clock_timestamp() - INTERVAL '25 hours', clock_timestamp(), clock_timestamp())
      `;

      // Synchronization for concurrent refresh transaction
      let notifyLockAcquired: () => void = () => {};
      const lockAcquiredPromise = new Promise<void>((resolve) => {
        notifyLockAcquired = resolve;
      });

      // Claim transaction acquires row lock on concurrentHash and refreshes resetAt to active
      refreshTransaction = clientRefresh.$transaction(
        async (tx) => {
          // Acquire exclusive row lock
          await tx.$queryRaw`
            SELECT "count", "resetAt"
            FROM "claim_rate_limit_buckets"
            WHERE "keyHash" = ${concurrentHash}
            FOR UPDATE
          `;
          notifyLockAcquired();

          // Refresh resetAt to active window
          await tx.$executeRaw`
            UPDATE "claim_rate_limit_buckets"
            SET "count" = 1,
                "resetAt" = clock_timestamp() + INTERVAL '60 seconds',
                "updatedAt" = clock_timestamp()
            WHERE "keyHash" = ${concurrentHash}
          `;

          await releaseRefreshPromise;
        },
        { timeout: 15000 }
      );

      // Wait until the claim transaction has acquired the lock and refreshed the row
      await lockAcquiredPromise;

      // 4. Run cleanup while refresh transaction holds the lock.
      // Because cleanup uses FOR UPDATE SKIP LOCKED and checks resetAt < cutoff,
      // it skips concurrentHash without blocking, and deletes unlocked staleHash!
      const deletedCount = await repo.cleanupStaleBuckets(500, 24 * 60 * 60 * 1000);
      expect(deletedCount).toBe(1);

      // 5. Release refresh transaction lock
      releaseRefreshLock();
      await refreshTransaction;

      // 6. Verify outcomes:
      // - Unlocked stale row was deleted
      // - Active row was preserved
      // - Concurrently-refreshed row was NOT deleted and remains active
      const staleRow = await prisma.claimRateLimitBucket.findUnique({ where: { keyHash: staleHash } });
      const activeRow = await prisma.claimRateLimitBucket.findUnique({ where: { keyHash: activeHash } });
      const concurrentRow = await prisma.claimRateLimitBucket.findUnique({ where: { keyHash: concurrentHash } });

      expect(staleRow).toBeNull();
      expect(activeRow).not.toBeNull();
      expect(concurrentRow).not.toBeNull();
      expect(concurrentRow!.count).toBe(1);
      expect(concurrentRow!.resetAt.getTime()).toBeGreaterThan(Date.now());
    } finally {
      releaseRefreshLock();
      if (refreshTransaction) {
        await refreshTransaction.catch(() => {});
      }
      await clientRefresh.$disconnect();
    }
  });

  testIfPostgres("PGRL-09: Claim API route returns HTTP 429 and correct Retry-After header when rate limit exceeded", async () => {
    const userId = `usr_pgrl_09_${crypto.randomUUID()}`;
    const userEmail = "pgrl09@test.edu";
    const sessionToken = createSessionToken({
      id: userId,
      email: userEmail,
      fullName: "Test User PGRL 09",
      platformRole: "USER",
      emailVerified: true,
    });

    const keyHash = hashRateLimitKey(`user:${userId}`);
    createdKeyHashes.push(keyHash);

    // Consume 10 attempts via HTTP requests
    for (let i = 0; i < 10; i++) {
      const req = new NextRequest("https://credvail.com/api/v1/wallet/claim", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          certificateNumber: "NON-EXISTENT",
          claimToken: `tok_${i}`,
        }),
      });

      const res = await claimRoute(req);
      // Not 429
      expect(res.status).not.toBe(429);
    }

    // 11th request must receive HTTP 429
    const req11 = new NextRequest("https://credvail.com/api/v1/wallet/claim", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        certificateNumber: "NON-EXISTENT",
        claimToken: "tok_11",
      }),
    });

    const res11 = await claimRoute(req11);
    expect(res11.status).toBe(429);
    expect(res11.headers.get("Retry-After")).toBeDefined();
    expect(res11.headers.get("Cache-Control")).toContain("no-store");
    expect(res11.headers.get("Referrer-Policy")).toBe("no-referrer");

    const json = await res11.json();
    expect(json.error).toBe("TOO_MANY_REQUESTS");
    expect(json.retryAfter).toBeDefined();
    expect(typeof json.retryAfter).toBe("number");
    expect(json.retryAfter).toBeGreaterThan(0);
  });

  testIfPostgres("PGRL-10: Claim API route returns HTTP 503 with typed CLAIM_RATE_LIMIT_UNAVAILABLE when database fails", async () => {
    const userId = `usr_pgrl_10_${crypto.randomUUID()}`;
    const sessionToken = createSessionToken({
      id: userId,
      email: "pgrl10@test.edu",
      fullName: "Test User PGRL 10",
      platformRole: "USER",
      emailVerified: true,
    });

    // Temporarily inject failing repository test double to simulate PostgreSQL outage
    const failingRepo = {
      consumeAttempt: async () => {
        throw new Error("Simulated database outage");
      },
      cleanupStaleBuckets: async () => 0,
      getBucket: async () => null,
    };

    ClaimRateLimitRepository.setTestDouble(failingRepo);

    try {
      const req = new NextRequest("https://credvail.com/api/v1/wallet/claim", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          certificateNumber: "ANY-CERT",
          claimToken: "any_token",
        }),
      });

      const res = await claimRoute(req);
      expect(res.status).toBe(503);
      expect(res.headers.get("Retry-After")).toBe("5");
      expect(res.headers.get("Cache-Control")).toContain("no-store");

      const json = await res.json();
      expect(json.error).toBe("SERVICE_UNAVAILABLE");
      expect(json.code).toBe("CLAIM_RATE_LIMIT_UNAVAILABLE");
      expect(json.message).toBe("Claim protection is temporarily unavailable. Please retry shortly.");
      // Ensure raw database error message is never leaked
      expect(JSON.stringify(json)).not.toContain("Simulated database outage");
    } finally {
      ClaimRateLimitRepository.resetTestDouble();
    }
  });

  testIfPostgres("PGRL-11: Forwarded-IP header spoofing cannot change or bypass the authenticated user's bucket", async () => {
    const userId = `usr_pgrl_11_${crypto.randomUUID()}`;
    const sessionToken = createSessionToken({
      id: userId,
      email: "pgrl11@test.edu",
      fullName: "Test User PGRL 11",
      platformRole: "USER",
      emailVerified: true,
    });

    const keyHash = hashRateLimitKey(`user:${userId}`);
    createdKeyHashes.push(keyHash);

    // Rotate spoofed IP headers on every request
    for (let i = 0; i < 10; i++) {
      const req = new NextRequest("https://credvail.com/api/v1/wallet/claim", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
          "X-Forwarded-For": `203.0.113.${i + 1}`,
          "X-Real-IP": `198.51.100.${i + 1}`,
          "CF-Connecting-IP": `192.0.2.${i + 1}`,
        },
        body: JSON.stringify({
          certificateNumber: "NON-EXISTENT",
          claimToken: `spoof_tok_${i}`,
        }),
      });
      await claimRoute(req);
    }

    // 11th request with yet another spoofed IP must be strictly blocked by the session bucket
    const req11 = new NextRequest("https://credvail.com/api/v1/wallet/claim", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
        "X-Forwarded-For": "198.51.100.99",
      },
      body: JSON.stringify({
        certificateNumber: "NON-EXISTENT",
        claimToken: "spoof_tok_11",
      }),
    });

    const res11 = await claimRoute(req11);
    expect(res11.status).toBe(429);
    const json = await res11.json();
    expect(json.error).toBe("TOO_MANY_REQUESTS");
  });

  testIfPostgres("PGRL-12: Client waiting on row lock evaluates window expiry using post-lock clock_timestamp(), resetting counter", async () => {
    const userId = `user:pgrl-12-${crypto.randomUUID()}`;
    const keyHash = hashRateLimitKey(userId);
    createdKeyHashes.push(keyHash);

    // Build unique PostgreSQL application_name for Client B to strictly attribute its wait event
    const baseDbUrl =
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5432/credvail_test?schema=public";
    const clientBAppName = `credvail_pgrl12_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const separator = baseDbUrl.includes("?") ? "&" : "?";
    const clientBDbUrl = `${baseDbUrl}${separator}application_name=${clientBAppName}`;

    const clientA = new PrismaClient();
    const clientB = new PrismaClient({
      datasources: {
        db: { url: clientBDbUrl },
      },
    });

    let releaseLockA: () => void = () => {};
    const releaseLockPromise = new Promise<void>((resolve) => {
      releaseLockA = resolve;
    });

    let clientATransaction: Promise<any> | null = null;
    let clientBPromise: Promise<any> | null = null;

    try {
      // 1. Create bucket with count = 10 and resetAt ~1000ms in the future using PostgreSQL clock_timestamp()
      await prisma.$executeRaw`
        INSERT INTO "claim_rate_limit_buckets" ("keyHash", "count", "resetAt", "createdAt", "updatedAt")
        VALUES (${keyHash}, 10, clock_timestamp() + INTERVAL '1000 milliseconds', clock_timestamp(), clock_timestamp())
      `;

      let notifyLockAcquired: () => void = () => {};
      const lockAcquiredPromise = new Promise<void>((resolve) => {
        notifyLockAcquired = resolve;
      });

      // 2. Client A acquires SELECT ... FOR UPDATE
      clientATransaction = clientA.$transaction(
        async (tx) => {
          await tx.$queryRaw`
            SELECT "count", "resetAt"
            FROM "claim_rate_limit_buckets"
            WHERE "keyHash" = ${keyHash}
            FOR UPDATE
          `;
          notifyLockAcquired();
          await releaseLockPromise;
        },
        { timeout: 20000 }
      );

      // Await confirmation that Client A has acquired the exclusive row lock
      await lockAcquiredPromise;

      // Confirm that the original window is still active in PostgreSQL server time before Client B starts
      const activeWindowCheck = await prisma.$queryRaw<{ is_active: boolean }[]>`
        SELECT (clock_timestamp() < "resetAt") as is_active
        FROM "claim_rate_limit_buckets"
        WHERE "keyHash" = ${keyHash}
      `;
      expect(
        activeWindowCheck[0]?.is_active,
        "Original rate-limit window must still be active when Client B dispatches consumeAttempt"
      ).toBe(true);

      // 3. Start Client B's production consumeAttempt() via independent PrismaClient
      const repoB = new PrismaClaimRateLimitRepository(clientB);
      clientBPromise = repoB.consumeAttempt(userId);

      // 4 & 5. Observe pg_stat_activity using third client (prisma) to confirm Client B is blocked on lock
      interface StatActivityRow {
        pid: number;
        application_name: string;
        state: string;
        wait_event_type: string | null;
        wait_event: string | null;
        query: string;
      }

      let lockWaitObserved = false;
      const pollStartTime = Date.now();
      const pollTimeoutMs = 3000;

      while (Date.now() - pollStartTime < pollTimeoutMs) {
        const waitingRows = await prisma.$queryRaw<StatActivityRow[]>`
          SELECT pid, application_name, state, wait_event_type, wait_event, query
          FROM pg_stat_activity
          WHERE application_name = ${clientBAppName}
            AND state = 'active'
            AND wait_event_type = 'Lock'
            AND query LIKE '%claim_rate_limit_buckets%'
            AND query LIKE '%FOR UPDATE%'
        `;

        if (waitingRows.length > 0) {
          lockWaitObserved = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      // 6. Enforce that Client B was actively observed waiting on the lock before the boundary
      expect(
        lockWaitObserved,
        `Client B with application_name '${clientBAppName}' must be actively blocked on PostgreSQL row lock (wait_event_type = 'Lock')`
      ).toBe(true);

      // 7. Verify the original resetAt boundary has actually passed in PostgreSQL time before releasing Client A
      let resetBoundaryPassed = false;
      const boundaryPollStart = Date.now();
      while (Date.now() - boundaryPollStart < 5000) {
        const checkRows = await prisma.$queryRaw<{ is_expired: boolean }[]>`
          SELECT (clock_timestamp() >= "resetAt") as is_expired
          FROM "claim_rate_limit_buckets"
          WHERE "keyHash" = ${keyHash}
        `;
        if (checkRows[0]?.is_expired) {
          resetBoundaryPassed = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      expect(
        resetBoundaryPassed,
        "PostgreSQL wall-clock time must have passed bucket resetAt before Client A releases lock"
      ).toBe(true);

      // 8. Release Client A's lock
      releaseLockA();
      await clientATransaction;

      // 9. Allow Client B to acquire lock and complete decision
      const resultB = await clientBPromise;

      // Assertions using database time:
      // Client B captured post-lock clock_timestamp(), correctly observed window expiry,
      // allowed the claim attempt, and reset count = 1.
      expect(resultB.allowed).toBe(true);
      expect(resultB.retryAfter).toBeUndefined();

      // Query PostgreSQL clock_timestamp() post-completion
      const dbNowRows = await prisma.$queryRaw<{ now: Date }[]>`
        SELECT clock_timestamp() as now
      `;
      const postDbNowMs = new Date(dbNowRows[0].now).getTime();

      const finalRow = await prisma.claimRateLimitBucket.findUnique({
        where: { keyHash },
      });
      expect(finalRow).not.toBeNull();
      expect(finalRow!.count).toBe(1);

      // Phase 2: Assert new expiry is in the expected 60-second interval based on database time
      const resetAtMs = finalRow!.resetAt.getTime();
      const diffSeconds = (resetAtMs - postDbNowMs) / 1000;
      expect(diffSeconds).toBeGreaterThanOrEqual(55);
      expect(diffSeconds).toBeLessThanOrEqual(61);
    } finally {
      // Guaranteed release of Client A's lock on any error or timeout
      releaseLockA();

      // Await transactions to settle to prevent connection or lock leakage
      if (clientATransaction) {
        await clientATransaction.catch(() => {});
      }
      if (clientBPromise) {
        await clientBPromise.catch(() => {});
      }

      await Promise.all([clientA.$disconnect(), clientB.$disconnect()]);
    }
  });
});
