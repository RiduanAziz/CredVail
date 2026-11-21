import crypto from "node:crypto";
import { prisma } from "../db.ts";

/**
 * Deterministically hashes a raw challenge nonce using SHA-256 (lowercase hex).
 * Plaintext nonces must NEVER be persisted in PostgreSQL or logged.
 */
export function hashNonce(nonce: string): string {
  if (!nonce || typeof nonce !== "string") {
    throw new Error("Nonce must be a non-empty string");
  }
  return crypto.createHash("sha256").update(nonce).digest("hex");
}

export interface StoredChallengeNonce {
  nonceHash: string;
  audience: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateChallengeParams {
  nonce?: string;
  nonceHash?: string;
  audience: string;
  expiresAt: Date;
}

export interface ConsumeChallengeParams {
  nonce?: string;
  nonceHash?: string;
  expectedAudience: string;
  now?: Date;
}

export interface IChallengeNonceRepository {
  createChallenge(params: CreateChallengeParams): Promise<StoredChallengeNonce>;
  findActiveChallenge(nonce: string): Promise<StoredChallengeNonce | null>;
  consumeChallengeAtomic(params: ConsumeChallengeParams): Promise<boolean>;
  cleanupExpiredChallenges(limit?: number, now?: Date): Promise<number>;
}

/**
 * Production PostgreSQL implementation using Prisma Client.
 * Adheres strictly to:
 * - No silent fallback to in-memory maps.
 * - Single-use atomic conditional updates (no read-then-write race windows).
 * - Plaintext nonces never stored in database.
 */
export class PrismaChallengeNonceRepository implements IChallengeNonceRepository {
  async createChallenge(params: CreateChallengeParams): Promise<StoredChallengeNonce> {
    const nonceHash = params.nonceHash || (params.nonce ? hashNonce(params.nonce) : "");
    if (!nonceHash) {
      throw new Error("Either nonce or nonceHash must be provided for challenge creation.");
    }
    const audience = typeof params.audience === "string" ? params.audience : "";

    const record = await prisma.challengeNonce.create({
      data: {
        nonceHash,
        audience,
        expiresAt: params.expiresAt,
      },
      select: {
        nonceHash: true,
        audience: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return {
      nonceHash: record.nonceHash,
      audience: record.audience,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    };
  }

  async findActiveChallenge(nonce: string): Promise<StoredChallengeNonce | null> {
    if (!nonce || typeof nonce !== "string") {
      return null;
    }

    const nonceHash = hashNonce(nonce);
    const record = await prisma.challengeNonce.findUnique({
      where: { nonceHash },
      select: {
        nonceHash: true,
        audience: true,
        expiresAt: true,
        consumedAt: true,
        createdAt: true,
      },
    });

    if (!record) {
      return null;
    }

    const now = new Date();
    // Challenge must be unconsumed and unexpired
    if (record.consumedAt !== null || record.expiresAt <= now) {
      return null;
    }

    return {
      nonceHash: record.nonceHash,
      audience: record.audience,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    };
  }

  async consumeChallengeAtomic(params: ConsumeChallengeParams): Promise<boolean> {
    const nonceHash = params.nonceHash || (params.nonce ? hashNonce(params.nonce) : "");
    if (!nonceHash || typeof params.expectedAudience !== "string") {
      return false;
    }

    const now = params.now || new Date();

    // Single-operation atomic conditional database update.
    // Guaranteed by PostgreSQL row-level locks on the unique nonceHash row.
    const result = await prisma.challengeNonce.updateMany({
      where: {
        nonceHash,
        audience: params.expectedAudience,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        consumedAt: now,
      },
    });

    return result.count === 1;
  }

  async cleanupExpiredChallenges(limit: number = 100, now: Date = new Date()): Promise<number> {
    try {
      const safeLimit = Math.min(Math.max(1, limit), 1000);
      const expired = await prisma.challengeNonce.findMany({
        where: {
          expiresAt: { lt: now },
        },
        select: { id: true },
        take: safeLimit,
      });

      if (expired.length === 0) {
        return 0;
      }

      const ids = expired.map((e) => e.id);
      const result = await prisma.challengeNonce.deleteMany({
        where: {
          id: { in: ids },
        },
      });

      return result.count;
    } catch {
      // Cleanup failures must not affect application security decisions
      return 0;
    }
  }
}

/**
 * In-memory test double used exclusively for isolated unit tests.
 * Never used as an automatic production fallback.
 */
export class InMemoryChallengeNonceRepository implements IChallengeNonceRepository {
  private store = new Map<
    string,
    {
      id: string;
      nonceHash: string;
      audience: string;
      expiresAt: Date;
      consumedAt: Date | null;
      createdAt: Date;
    }
  >();

  clear(): void {
    this.store.clear();
  }

  async createChallenge(params: CreateChallengeParams): Promise<StoredChallengeNonce> {
    const nonceHash = params.nonceHash || (params.nonce ? hashNonce(params.nonce) : "");
    if (!nonceHash) {
      throw new Error("Either nonce or nonceHash must be provided for challenge creation.");
    }
    const audience = typeof params.audience === "string" ? params.audience : "";

    const record = {
      id: crypto.randomUUID(),
      nonceHash,
      audience,
      expiresAt: params.expiresAt,
      consumedAt: null,
      createdAt: new Date(),
    };

    this.store.set(nonceHash, record);

    return {
      nonceHash: record.nonceHash,
      audience: record.audience,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    };
  }

  async findActiveChallenge(nonce: string): Promise<StoredChallengeNonce | null> {
    if (!nonce || typeof nonce !== "string") {
      return null;
    }

    const nonceHash = hashNonce(nonce);
    const record = this.store.get(nonceHash);
    if (!record) {
      return null;
    }

    const now = new Date();
    if (record.consumedAt !== null || record.expiresAt <= now) {
      return null;
    }

    return {
      nonceHash: record.nonceHash,
      audience: record.audience,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    };
  }

  async consumeChallengeAtomic(params: ConsumeChallengeParams): Promise<boolean> {
    const nonceHash = params.nonceHash || (params.nonce ? hashNonce(params.nonce) : "");
    if (!nonceHash || typeof params.expectedAudience !== "string") {
      return false;
    }

    const now = params.now || new Date();
    const record = this.store.get(nonceHash);

    if (!record) {
      return false;
    }

    if (
      record.consumedAt !== null ||
      record.expiresAt <= now ||
      record.audience !== params.expectedAudience
    ) {
      return false;
    }

    record.consumedAt = now;
    return true;
  }

  async cleanupExpiredChallenges(limit: number = 100, now: Date = new Date()): Promise<number> {
    let deletedCount = 0;
    const safeLimit = Math.min(Math.max(1, limit), 1000);

    for (const [key, record] of this.store.entries()) {
      if (record.expiresAt < now) {
        this.store.delete(key);
        deletedCount++;
        if (deletedCount >= safeLimit) {
          break;
        }
      }
    }

    return deletedCount;
  }
}

/**
 * Primary static entry point for challenge nonce operations.
 * Defaults to PostgreSQL via PrismaChallengeNonceRepository.
 * Test suites may explicitly inject an InMemoryChallengeNonceRepository.
 */
export class ChallengeNonceRepository {
  private static defaultRepo: IChallengeNonceRepository = new PrismaChallengeNonceRepository();
  private static testDouble: IChallengeNonceRepository | null = null;

  static get instance(): IChallengeNonceRepository {
    return this.testDouble || this.defaultRepo;
  }

  static setTestDouble(repo: IChallengeNonceRepository | null): void {
    this.testDouble = repo;
  }

  static resetTestDouble(): void {
    this.testDouble = null;
  }

  static hashNonce(nonce: string): string {
    return hashNonce(nonce);
  }

  static async createChallenge(params: CreateChallengeParams): Promise<StoredChallengeNonce> {
    return this.instance.createChallenge(params);
  }

  static async findActiveChallenge(nonce: string): Promise<StoredChallengeNonce | null> {
    return this.instance.findActiveChallenge(nonce);
  }

  static async consumeChallengeAtomic(params: ConsumeChallengeParams): Promise<boolean> {
    return this.instance.consumeChallengeAtomic(params);
  }

  static async cleanupExpiredChallenges(limit?: number, now?: Date): Promise<number> {
    return this.instance.cleanupExpiredChallenges(limit, now);
  }
}
