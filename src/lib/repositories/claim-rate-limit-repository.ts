import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../db.ts";

/**
 * Derives a deterministic SHA-256 pseudonymous key using a domain-separated SHA-256 digest.
 * Raw user identifiers (e.g. session.sub, user UUIDs) are NEVER persisted directly
 * in the claim_rate_limit_buckets table or emitted in logs.
 *
 * Security note: This domain-separated SHA-256 digest provides pseudonymous key derivation
 * to decouple the rate-limit table from user identity records. It does not claim full cryptographic
 * anonymity against dictionary attacks on low-entropy identifiers.
 */
export function hashRateLimitKey(identifier: string): string {
  if (!identifier || typeof identifier !== "string") {
    throw new Error("Rate limit identifier must be a non-empty string");
  }
  return crypto
    .createHash("sha256")
    .update(`credvail:claim-rate-limit:v1:${identifier}`)
    .digest("hex");
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

export interface StoredRateLimitBucket {
  keyHash: string;
  count: number;
  resetAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Typed error indicating that rate-limit infrastructure (PostgreSQL) is unreachable.
 * Fails closed with HTTP 503 while strictly redacting internal database exception details.
 */
export class ClaimRateLimitUnavailableError extends Error {
  readonly code = "CLAIM_RATE_LIMIT_UNAVAILABLE";
  readonly statusCode = 503;
  readonly cause?: unknown;

  constructor(
    message: string = "Claim protection is temporarily unavailable. Please retry shortly.",
    cause?: unknown
  ) {
    super(message);
    this.name = "ClaimRateLimitUnavailableError";
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON() {
    return {
      error: "SERVICE_UNAVAILABLE",
      code: this.code,
      message: this.message,
    };
  }
}

export interface IClaimRateLimitRepository {
  consumeAttempt(identifier: string): Promise<RateLimitResult>;
  cleanupStaleBuckets(batchSize?: number, olderThanMs?: number): Promise<number>;
  getBucket(identifier: string): Promise<StoredRateLimitBucket | null>;
}

/**
 * Production PostgreSQL implementation using Prisma Client.
 *
 * Concurrency & Row-Locking Strategy:
 * 1. Derives deterministic SHA-256 pseudonymous key from authenticated identifier.
 * 2. Uses parameterized SQL with tagged template literals (SQL-injection immune).
 * 3. Safely inserts uninitialized bucket row if not existing via `INSERT ... ON CONFLICT DO NOTHING`.
 * 4. Serializes concurrent requests for the same bucket via `SELECT ... FOR UPDATE` row lock.
 * 5. Executes a separate `SELECT clock_timestamp() as now` immediately AFTER acquiring the row lock.
 *    PostgreSQL NOW() returns transaction-start time and does NOT advance during lock waits.
 *    Capturing clock_timestamp() post-lock guarantees wall-clock database time for all rate-limit decisions.
 * 6. Implements first-request-anchored 60-second fixed-duration window:
 *    - Expired/initial window: resets count to 1 and sets resetAt to `dbNow + 60s`.
 *    - Active window with count < 10: increments count to 2..10.
 *    - Active window with count >= 10: leaves count untouched at 10 and rejects with retryAfter.
 * 7. Strictly fails closed: any database error throws ClaimRateLimitUnavailableError (no silent fallback).
 */
export class PrismaClaimRateLimitRepository implements IClaimRateLimitRepository {
  private client: PrismaClient;

  constructor(client?: PrismaClient) {
    this.client = client || prisma;
  }

  async consumeAttempt(identifier: string): Promise<RateLimitResult> {
    const keyHash = hashRateLimitKey(identifier);

    try {
      return await this.client.$transaction(
        async (tx) => {
          // Step 1: Ensure row exists using ON CONFLICT DO NOTHING (safe for concurrent first requests)
          await tx.$executeRaw`
            INSERT INTO "claim_rate_limit_buckets" ("keyHash", "count", "resetAt", "createdAt", "updatedAt")
            VALUES (${keyHash}, 0, clock_timestamp(), clock_timestamp(), clock_timestamp())
            ON CONFLICT ("keyHash") DO NOTHING
          `;

          // Step 2: Acquire exclusive bucket row lock via SELECT ... FOR UPDATE
          const rows = await tx.$queryRaw<{ count: number; resetAt: Date }[]>`
            SELECT "count", "resetAt"
            FROM "claim_rate_limit_buckets"
            WHERE "keyHash" = ${keyHash}
            FOR UPDATE
          `;

          if (!rows || rows.length === 0) {
            throw new Error("Failed to acquire rate limit bucket row lock.");
          }

          // Step 3: Capture wall-clock database time strictly AFTER lock acquisition.
          // In PostgreSQL, NOW() / CURRENT_TIMESTAMP does not advance while waiting for locks.
          const timeRows = await tx.$queryRaw<{ now: Date }[]>`
            SELECT clock_timestamp() as now
          `;

          if (!timeRows || timeRows.length === 0) {
            throw new Error("Failed to capture database clock timestamp.");
          }

          const dbNow = new Date(timeRows[0].now);
          const dbResetAt = new Date(rows[0].resetAt);
          const count = rows[0].count;

          // Step 4: Use that one captured database timestamp (dbNow) for all comparisons and updates
          // Check if the window has expired or bucket was just initialized (count === 0)
          if (dbNow.getTime() >= dbResetAt.getTime() || count === 0) {
            const newResetAt = new Date(dbNow.getTime() + 60 * 1000);
            await tx.$executeRaw`
              UPDATE "claim_rate_limit_buckets"
              SET "count" = 1, "resetAt" = ${newResetAt}, "updatedAt" = ${dbNow}
              WHERE "keyHash" = ${keyHash}
            `;
            return { allowed: true };
          }

          // Window is active and under limit (< 10)
          if (count < 10) {
            await tx.$executeRaw`
              UPDATE "claim_rate_limit_buckets"
              SET "count" = "count" + 1, "updatedAt" = ${dbNow}
              WHERE "keyHash" = ${keyHash}
            `;
            return { allowed: true };
          }

          // Window is active and limit reached (>= 10)
          // Do NOT increment count on blocked attempts
          const remainingMs = dbResetAt.getTime() - dbNow.getTime();
          const retryAfter = Math.max(1, Math.ceil(remainingMs / 1000));
          return { allowed: false, retryAfter };
        },
        {
          timeout: 10000,
        }
      );
    } catch (err: any) {
      if (err instanceof ClaimRateLimitUnavailableError) {
        throw err;
      }
      throw new ClaimRateLimitUnavailableError(
        "Claim protection is temporarily unavailable. Please retry shortly.",
        err
      );
    }
  }

  async cleanupStaleBuckets(
    batchSize: number = 500,
    olderThanMs: number = 24 * 60 * 60 * 1000
  ): Promise<number> {
    try {
      const safeBatchSize = Math.min(Math.max(1, Math.floor(batchSize)), 1000);
      const safeOlderThanMs = Math.max(0, Math.floor(olderThanMs));

      // Atomic, bounded cleanup statement using a single CTE query:
      // 1. Evaluates cutoff timestamp once from PostgreSQL server clock_timestamp().
      // 2. Selects stale candidates in deterministic order (resetAt ASC, keyHash ASC).
      // 3. Employs FOR UPDATE SKIP LOCKED to immediately bypass any bucket actively being
      //    refreshed or locked by a concurrent claim request (zero lock contention/delay).
      // 4. Deletes only the locked candidate rows that remain older than the cutoff,
      //    strictly preventing TOCTOU races where a refreshed bucket is deleted.
      const deletedRows = await this.client.$queryRaw<{ keyHash: string }[]>`
        WITH cutoff_time AS (
          SELECT (clock_timestamp() - (${safeOlderThanMs} * INTERVAL '1 millisecond'))::timestamptz AS cutoff
        ),
        candidates AS (
          SELECT "keyHash"
          FROM "claim_rate_limit_buckets", cutoff_time
          WHERE "resetAt" < cutoff_time.cutoff
          ORDER BY "resetAt" ASC, "keyHash" ASC
          LIMIT ${safeBatchSize}
          FOR UPDATE SKIP LOCKED
        )
        DELETE FROM "claim_rate_limit_buckets"
        WHERE "keyHash" IN (SELECT "keyHash" FROM candidates)
          AND "resetAt" < (SELECT cutoff FROM cutoff_time)
        RETURNING "keyHash"
      `;

      return deletedRows ? deletedRows.length : 0;
    } catch {
      // Storage maintenance failure must never affect live rate-limit enforcement
      return 0;
    }
  }

  async getBucket(identifier: string): Promise<StoredRateLimitBucket | null> {
    const keyHash = hashRateLimitKey(identifier);
    return this.client.claimRateLimitBucket.findUnique({
      where: { keyHash },
    });
  }
}

/**
 * In-memory test double used exclusively for isolated unit tests.
 * Never used as an automatic production fallback.
 * Supports an injectable clock function for deterministic time-travel testing.
 */
export class InMemoryClaimRateLimitRepository implements IClaimRateLimitRepository {
  private store = new Map<
    string,
    { count: number; resetAt: Date; createdAt: Date; updatedAt: Date }
  >();
  private clock: () => Date;

  constructor(clock?: () => Date) {
    this.clock = clock || (() => new Date());
  }

  setClock(clock: () => Date): void {
    this.clock = clock;
  }

  clear(): void {
    this.store.clear();
  }

  async consumeAttempt(identifier: string): Promise<RateLimitResult> {
    const keyHash = hashRateLimitKey(identifier);
    const now = this.clock();
    const record = this.store.get(keyHash);

    if (!record || now.getTime() >= record.resetAt.getTime() || record.count === 0) {
      const resetAt = new Date(now.getTime() + 60 * 1000);
      this.store.set(keyHash, {
        count: 1,
        resetAt,
        createdAt: record ? record.createdAt : now,
        updatedAt: now,
      });
      return { allowed: true };
    }

    if (record.count < 10) {
      record.count += 1;
      record.updatedAt = now;
      return { allowed: true };
    }

    // Already 10: blocked; do NOT increment count
    const remainingMs = record.resetAt.getTime() - now.getTime();
    const retryAfter = Math.max(1, Math.ceil(remainingMs / 1000));
    return { allowed: false, retryAfter };
  }

  async cleanupStaleBuckets(
    batchSize: number = 500,
    olderThanMs: number = 24 * 60 * 60 * 1000
  ): Promise<number> {
    const safeBatchSize = Math.min(Math.max(1, Math.floor(batchSize)), 1000);
    const safeOlderThanMs = Math.max(0, Math.floor(olderThanMs));
    const now = this.clock();
    const cutoff = new Date(now.getTime() - safeOlderThanMs);
    let deletedCount = 0;

    // Deterministic ordering by resetAt ASC, keyHash ASC
    const sortedEntries = Array.from(this.store.entries()).sort(
      ([keyA, a], [keyB, b]) => a.resetAt.getTime() - b.resetAt.getTime() || keyA.localeCompare(keyB)
    );

    for (const [key, bucket] of sortedEntries) {
      if (bucket.resetAt.getTime() < cutoff.getTime()) {
        this.store.delete(key);
        deletedCount++;
        if (deletedCount >= safeBatchSize) {
          break;
        }
      }
    }

    return deletedCount;
  }

  async getBucket(identifier: string): Promise<StoredRateLimitBucket | null> {
    const keyHash = hashRateLimitKey(identifier);
    const item = this.store.get(keyHash);
    if (!item) return null;
    return {
      keyHash,
      count: item.count,
      resetAt: item.resetAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}

/**
 * Primary static entry point for rate limit bucket operations.
 * Defaults to PostgreSQL via PrismaClaimRateLimitRepository.
 * Test suites may explicitly inject an InMemoryClaimRateLimitRepository.
 */
export class ClaimRateLimitRepository {
  private static defaultRepo: IClaimRateLimitRepository = new PrismaClaimRateLimitRepository();
  private static testDouble: IClaimRateLimitRepository | null = null;

  static get instance(): IClaimRateLimitRepository {
    return this.testDouble || this.defaultRepo;
  }

  static setTestDouble(repo: IClaimRateLimitRepository | null): void {
    this.testDouble = repo;
  }

  static resetTestDouble(): void {
    this.testDouble = null;
  }

  static hashRateLimitKey(identifier: string): string {
    return hashRateLimitKey(identifier);
  }

  static async consumeAttempt(identifier: string): Promise<RateLimitResult> {
    try {
      return await this.instance.consumeAttempt(identifier);
    } catch (err: any) {
      if (err instanceof ClaimRateLimitUnavailableError) {
        throw err;
      }
      throw new ClaimRateLimitUnavailableError(
        "Claim protection is temporarily unavailable. Please retry shortly.",
        err
      );
    }
  }

  static async cleanupStaleBuckets(batchSize?: number, olderThanMs?: number): Promise<number> {
    return this.instance.cleanupStaleBuckets(batchSize, olderThanMs);
  }

  static async getBucket(identifier: string): Promise<StoredRateLimitBucket | null> {
    return this.instance.getBucket(identifier);
  }
}
