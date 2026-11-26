import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../db.ts";
import { isInMemoryFallbackPermissible } from "../db/persistence-policy.ts";

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

export interface RateLimitOptions {
  identifier: string;
  scope?: string;
  maxAttempts?: number;
  windowSeconds?: number;
}

export const RATE_LIMIT_PROFILES = {
  AUTH_LOGIN: { scope: "auth:login", maxAttempts: 5, windowSeconds: 60 },
  AUTH_REGISTER: { scope: "auth:register", maxAttempts: 5, windowSeconds: 60 },
  AUTH_REGISTER_INSTITUTION: { scope: "auth:register:institution", maxAttempts: 5, windowSeconds: 60 },
  AUTH_REGISTER_WALLET: { scope: "auth:register:wallet", maxAttempts: 5, windowSeconds: 60 },
  AUTH_VERIFY_EMAIL: { scope: "auth:verify-email", maxAttempts: 10, windowSeconds: 60 },
  AUTH_RESEND_VERIFICATION: { scope: "auth:resend-verification", maxAttempts: 3, windowSeconds: 60 },
  VERIFY_LOOKUP: { scope: "verify:lookup", maxAttempts: 60, windowSeconds: 60 },
  VERIFY_PRESENTATION: { scope: "verify:presentation", maxAttempts: 30, windowSeconds: 60 },
  VERIFY_CHALLENGE: { scope: "verify:challenge", maxAttempts: 30, windowSeconds: 60 },
  VERIFY_FRESHNESS: { scope: "verify:freshness", maxAttempts: 60, windowSeconds: 60 },
  BATCH_UPLOAD: { scope: "batches:upload", maxAttempts: 10, windowSeconds: 60 },
  BATCH_PROCESS: { scope: "batches:process", maxAttempts: 5, windowSeconds: 60 },
} as const;

/**
 * Derives a deterministic 64-character SHA-256 pseudonymous key
 * with domain separation by scope and identifier.
 */
export function hashRateLimitKey(identifier: string, scope: string = "general"): string {
  if (!identifier || typeof identifier !== "string") {
    throw new Error("Rate limit identifier must be a non-empty string");
  }
  return crypto
    .createHash("sha256")
    .update(`credvail:rate-limit:v1:${scope.trim()}:${identifier.trim()}`)
    .digest("hex");
}

/**
 * Safely extracts client IP address from request headers,
 * handling multi-proxy x-forwarded-for chains and port stripping.
 */
export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp && isValidIp(firstIp)) {
      return sanitizeIp(firstIp);
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp && isValidIp(realIp)) {
    return sanitizeIp(realIp);
  }

  const cfConnectingIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfConnectingIp && isValidIp(cfConnectingIp)) {
    return sanitizeIp(cfConnectingIp);
  }

  return "127.0.0.1";
}

function sanitizeIp(ip: string): string {
  let clean = ip.replace(/^\[|\]$/g, "");
  if (clean.includes(":") && !clean.includes("::") && clean.split(":").length === 2) {
    clean = clean.split(":")[0];
  }
  return clean.trim();
}

function isValidIp(ip: string): boolean {
  const clean = sanitizeIp(ip);
  return (
    /^(\d{1,3}\.){3}\d{1,3}$/.test(clean) ||
    /^[0-9a-fA-F:]+$/.test(clean)
  );
}

/**
 * Standard HTTP 429 response helper with Retry-After header.
 */
export function createRateLimitResponse(retryAfter: number = 60, scope?: string): NextResponse {
  const safeRetryAfter = Math.max(1, Math.ceil(retryAfter));
  return NextResponse.json(
    {
      error: "TOO_MANY_REQUESTS",
      code: "RATE_LIMIT_EXCEEDED",
      message: `Too many requests${scope ? ` for ${scope}` : ""}. Please try again in ${safeRetryAfter} seconds.`,
      retryAfter: safeRetryAfter,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(safeRetryAfter),
        "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
        "Referrer-Policy": "no-referrer",
      },
    }
  );
}

export class ApiRateLimitUnavailableError extends Error {
  readonly code = "RATE_LIMIT_UNAVAILABLE";
  readonly statusCode = 503;

  constructor(message: string = "Rate limit service is temporarily unavailable. Please retry shortly.") {
    super(message);
    this.name = "ApiRateLimitUnavailableError";
  }
}

/**
 * In-memory rate limit store for offline development and fast unit testing.
 */
class InMemoryApiRateLimitStore {
  private store = new Map<string, { count: number; resetAt: Date; createdAt: Date; updatedAt: Date }>();
  private clock: () => Date = () => new Date();

  setClock(clock: () => Date) {
    this.clock = clock;
  }

  clear() {
    this.store.clear();
  }

  consume(keyHash: string, maxAttempts: number, windowSeconds: number): RateLimitResult {
    const now = this.clock();
    const record = this.store.get(keyHash);

    if (!record || now.getTime() >= record.resetAt.getTime() || record.count === 0) {
      const resetAt = new Date(now.getTime() + windowSeconds * 1000);
      this.store.set(keyHash, {
        count: 1,
        resetAt,
        createdAt: record ? record.createdAt : now,
        updatedAt: now,
      });
      return { allowed: true };
    }

    if (record.count < maxAttempts) {
      record.count += 1;
      record.updatedAt = now;
      return { allowed: true };
    }

    const remainingMs = record.resetAt.getTime() - now.getTime();
    const retryAfter = Math.max(1, Math.ceil(remainingMs / 1000));
    return { allowed: false, retryAfter };
  }
}

export const inMemoryApiRateLimitStore = new InMemoryApiRateLimitStore();

/**
 * Checks and consumes a rate limit token for a given scope and identifier.
 * Coordinates with PostgreSQL row-level locks in production or in-memory in dev/test.
 */
export async function checkApiRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const {
    identifier,
    scope = "general",
    maxAttempts = 60,
    windowSeconds = 60,
  } = options;

  const keyHash = hashRateLimitKey(identifier, scope);

  // In-memory fallback governance
  const useMemory =
    isInMemoryFallbackPermissible() &&
    (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("localhost:5432"));

  if (useMemory) {
    return inMemoryApiRateLimitStore.consume(keyHash, maxAttempts, windowSeconds);
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        // Step 1: Ensure bucket row exists
        await tx.$executeRaw`
          INSERT INTO "claim_rate_limit_buckets" ("keyHash", "count", "resetAt", "createdAt", "updatedAt")
          VALUES (${keyHash}, 0, clock_timestamp(), clock_timestamp(), clock_timestamp())
          ON CONFLICT ("keyHash") DO NOTHING
        `;

        // Step 2: Acquire exclusive bucket row lock
        const rows = await tx.$queryRaw<{ count: number; resetAt: Date }[]>`
          SELECT "count", "resetAt"
          FROM "claim_rate_limit_buckets"
          WHERE "keyHash" = ${keyHash}
          FOR UPDATE
        `;

        if (!rows || rows.length === 0) {
          throw new Error("Failed to acquire rate limit bucket row lock.");
        }

        // Step 3: Capture wall-clock database time strictly post-lock
        const timeRows = await tx.$queryRaw<{ now: Date }[]>`
          SELECT clock_timestamp() as now
        `;

        if (!timeRows || timeRows.length === 0) {
          throw new Error("Failed to capture database clock timestamp.");
        }

        const dbNow = new Date(timeRows[0].now);
        const dbResetAt = new Date(rows[0].resetAt);
        const count = rows[0].count;

        // Step 4: Window expired or newly initialized
        if (dbNow.getTime() >= dbResetAt.getTime() || count === 0) {
          const newResetAt = new Date(dbNow.getTime() + windowSeconds * 1000);
          await tx.$executeRaw`
            UPDATE "claim_rate_limit_buckets"
            SET "count" = 1, "resetAt" = ${newResetAt}, "updatedAt" = ${dbNow}
            WHERE "keyHash" = ${keyHash}
          `;
          return { allowed: true };
        }

        // Under limit
        if (count < maxAttempts) {
          await tx.$executeRaw`
            UPDATE "claim_rate_limit_buckets"
            SET "count" = "count" + 1, "updatedAt" = ${dbNow}
            WHERE "keyHash" = ${keyHash}
          `;
          return { allowed: true };
        }

        // Limit reached: do not increment count
        const remainingMs = dbResetAt.getTime() - dbNow.getTime();
        const retryAfter = Math.max(1, Math.ceil(remainingMs / 1000));
        return { allowed: false, retryAfter };
      },
      { timeout: 10000 }
    );
  } catch (err: any) {
    if (isInMemoryFallbackPermissible()) {
      return inMemoryApiRateLimitStore.consume(keyHash, maxAttempts, windowSeconds);
    }
    throw new ApiRateLimitUnavailableError(
      "Rate limit service is temporarily unavailable. Please retry shortly."
    );
  }
}

/**
 * Resets the in-memory rate limit store for unit testing.
 */
export function resetApiRateLimiter(): void {
  inMemoryApiRateLimitStore.clear();
}
