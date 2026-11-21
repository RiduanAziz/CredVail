/**
 * Distributed PostgreSQL-backed rate limiter for credential claiming (H1.3.2 / H1.3.2.1).
 * Scoped strictly to the authenticated user ID (`user:${session.sub}`) to prevent
 * bypasses via forged X-Forwarded-For or client IP headers.
 *
 * ARCHITECTURAL SPECIFICATION:
 * 1. Scope: Scoped per authenticated account (`user:${session.sub}`).
 *    - Protects a user's wallet and credential claims from high-frequency automated brute-force attacks.
 *    - Multiple distinct authenticated accounts maintain independent rate-limit buckets.
 * 2. Shared Source of Truth:
 *    - Buckets are persisted in PostgreSQL table `claim_rate_limit_buckets`.
 *    - Application instances coordinate via serialized access for the same bucket using PostgreSQL row-level locking (`SELECT ... FOR UPDATE`).
 *    - Authoritative time is captured via `SELECT clock_timestamp()` strictly after row-lock acquisition.
 *    - Process restarts and multi-instance scaling preserve rate-limit state without leakage.
 * 3. Privacy & Pseudonymization:
 *    - Identifiers are hashed using a domain-separated SHA-256 digest (`credvail:claim-rate-limit:v1:${identifier}`)
 *      to derive a deterministic SHA-256 pseudonymous key before database storage.
 *    - Raw user identifiers are never persisted in the bucket table or exposed in application logs.
 *    - Security Note: This domain-separated SHA-256 digest provides pseudonymous key derivation
 *      to decouple the rate-limit table from user identity records. It does not claim full cryptographic
 *      anonymity against dictionary attacks on low-entropy identifiers.
 * 4. Fail-Closed:
 *    - Any database outage or connection failure rejects the claim with HTTP 503 (CLAIM_RATE_LIMIT_UNAVAILABLE).
 *    - Production strictly prohibits silent fallback to in-memory maps.
 */

import {
  ClaimRateLimitRepository,
  ClaimRateLimitUnavailableError,
  InMemoryClaimRateLimitRepository,
  RateLimitResult,
} from "../repositories/claim-rate-limit-repository.ts";

export { ClaimRateLimitUnavailableError };
export type { RateLimitResult };

export const CLAIM_RATE_LIMIT_MAX = 10;
export const CLAIM_RATE_LIMIT_WINDOW_SECONDS = 60;

/**
 * Checks and consumes a claim attempt for the specified authenticated identifier.
 * Returns { allowed: true } or { allowed: false, retryAfter: number }.
 * Throws ClaimRateLimitUnavailableError if the database is unreachable.
 */
export async function checkClaimRateLimit(identifier: string): Promise<RateLimitResult> {
  try {
    return await ClaimRateLimitRepository.consumeAttempt(identifier);
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

/**
 * Resets the in-memory test double rate limiter (for isolated unit tests).
 */
export function resetClaimRateLimiter(): void {
  const instance = ClaimRateLimitRepository.instance;
  if (instance instanceof InMemoryClaimRateLimitRepository) {
    instance.clear();
  }
}
