import crypto from "node:crypto";
import { db } from "../db.ts";
import { handleRepositoryError, isInMemoryFallbackPermissible } from "../db/persistence-policy.ts";

function hashJti(jti: string): string {
  return crypto.createHash("sha256").update(`revoked-jti:${jti}`).digest("hex");
}

/**
 * Tracks explicitly revoked session token JTIs (e.g. via logout or forced revocation).
 * Uses an in-process map for synchronous middleware checks plus PostgreSQL persistence
 * via `challenge_nonces` for durable cross-instance revocation in production.
 */
export class SessionRevocationService {
  // jtiHash => expiresAtMs
  private static revokedCache = new Map<string, number>();

  private static pruneExpired(): void {
    const now = Date.now();
    for (const [k, exp] of this.revokedCache.entries()) {
      if (exp <= now) {
        this.revokedCache.delete(k);
      }
    }
  }

  private static get useMemoryOnly(): boolean {
    if (!isInMemoryFallbackPermissible()) return false;
    return !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("localhost:5432");
  }

  static resetForTesting(): void {
    this.revokedCache.clear();
  }

  static async revokeSession(jti: string, expUnixSeconds: number): Promise<void> {
    if (!jti || !jti.trim()) return;
    this.pruneExpired();

    const jtiHash = hashJti(jti.trim());
    const expiresAtMs = Math.max(expUnixSeconds * 1000, Date.now() + 60_000);
    this.revokedCache.set(jtiHash, expiresAtMs);

    if (this.useMemoryOnly) {
      return;
    }

    try {
      const now = new Date();
      await db.challengeNonce.upsert({
        where: { nonceHash: jtiHash },
        create: {
          nonceHash: jtiHash,
          audience: "revoked-session",
          expiresAt: new Date(expiresAtMs),
          consumedAt: now,
        },
        update: {
          consumedAt: now,
          expiresAt: new Date(expiresAtMs),
        },
      });
    } catch (err) {
      handleRepositoryError("SessionRevocationService.revokeSession", err);
    }
  }

  static isRevokedSync(jti: string): boolean {
    if (!jti || !jti.trim()) return false;
    this.pruneExpired();
    const exp = this.revokedCache.get(hashJti(jti.trim()));
    return typeof exp === "number" && exp > Date.now();
  }

  static async isRevoked(jti: string): Promise<boolean> {
    if (!jti || !jti.trim()) return false;
    if (this.isRevokedSync(jti)) return true;
    if (this.useMemoryOnly) return false;

    const jtiHash = hashJti(jti.trim());
    try {
      const row = await db.challengeNonce.findUnique({
        where: { nonceHash: jtiHash },
      });
      if (!row || row.audience !== "revoked-session") {
        return false;
      }
      if (row.expiresAt.getTime() <= Date.now()) {
        return false;
      }
      this.revokedCache.set(jtiHash, row.expiresAt.getTime());
      return true;
    } catch (err) {
      handleRepositoryError("SessionRevocationService.isRevoked", err);
      return false;
    }
  }
}
