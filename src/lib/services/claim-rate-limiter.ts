/**
 * Sliding-window rate limiter for credential claiming.
 * Scoped primarily to the authenticated user ID (`user:${session.sub}`) to prevent
 * bypasses via forged X-Forwarded-For or client IP headers.
 * 
 * SCOPE AND OPERATIONAL BOUNDARIES (H1.2.1 Documentation):
 * 1. Scope: Scoped per authenticated account (`user:${session.sub}`).
 *    - Protects a user's wallet and credential claims from high-frequency automated brute-force attacks.
 *    - Sybil / Multiple Accounts: Multiple distinct authenticated accounts maintain independent buckets.
 * 2. Process-Local State:
 *    - Counters are stored in a process-local in-memory Map.
 *    - Process Restarts: Process restart or container redeployment resets counters to zero.
 *    - Multi-Instance Topologies: Distinct application instances do NOT share counters. In multi-instance
 *      deployments without sticky sessions, an attacker routing requests across N nodes can achieve
 *      N * CLAIM_RATE_LIMIT_MAX attempts per minute. (Distributed Redis rate-limiting is scheduled for H2).
 * 3. Header-Spoofing Immunity:
 *    - Immune to forged `X-Forwarded-For`, `CF-Connecting-IP`, or `X-Real-IP` headers because the rate-limiter
 *      is keyed on server-validated JWT `session.sub`.
 */
interface ClaimRateLimitRecord {
  count: number;
  resetAt: number;
}

const claimRateLimitMap = new Map<string, ClaimRateLimitRecord>();
const CLAIM_RATE_LIMIT_MAX = 10; // Max 10 claim attempts per minute
const CLAIM_RATE_LIMIT_WINDOW_MS = 60 * 1000;

export function checkClaimRateLimit(identifier: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = claimRateLimitMap.get(identifier);

  if (!record || now > record.resetAt) {
    claimRateLimitMap.set(identifier, { count: 1, resetAt: now + CLAIM_RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (record.count >= CLAIM_RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  record.count++;
  return { allowed: true };
}

export function resetClaimRateLimiter(): void {
  claimRateLimitMap.clear();
}
