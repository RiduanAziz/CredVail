import crypto from "node:crypto";
import { db } from "../db.ts";
import { handleRepositoryError, isInMemoryFallbackPermissible } from "../db/persistence-policy.ts";
import { inMemoryUserStore, type UserWithMemberships } from "./user-repository.ts";

export interface EmailVerificationTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const globalForEvfStore = globalThis as unknown as {
  __credvailInMemoryVerificationTokens?: Map<string, EmailVerificationTokenRecord>;
};

const inMemoryTokens =
  globalForEvfStore.__credvailInMemoryVerificationTokens ||
  (globalForEvfStore.__credvailInMemoryVerificationTokens = new Map<string, EmailVerificationTokenRecord>());

export function hashVerificationToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken.trim()).digest("hex");
}

export function generateRawVerificationToken(): string {
  return `credvail_evf_${crypto.randomBytes(32).toString("base64url")}`;
}

export class EmailVerificationRepository {
  private static manualMemoryOverride: boolean | null = null;

  static setUseMemory(val: boolean | null): void {
    this.manualMemoryOverride = val;
  }

  static resetInMemoryStore(): void {
    inMemoryTokens.clear();
  }

  private static get useMemory(): boolean {
    if (!isInMemoryFallbackPermissible()) return false;
    if (this.manualMemoryOverride !== null) return this.manualMemoryOverride;
    return !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("localhost:5432");
  }

  /**
   * Generates a 256-bit random verification token and persists only its SHA-256 hash.
   * Accepts an optional Prisma transaction client so registration commits atomically.
   */
  static async createToken(
    userId: string,
    options?: { ttlMs?: number; invalidateExisting?: boolean; tx?: any }
  ): Promise<{ rawToken: string; record: EmailVerificationTokenRecord }> {
    const rawToken = generateRawVerificationToken();
    const tokenHash = hashVerificationToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (options?.ttlMs ?? DEFAULT_TOKEN_TTL_MS));

    if (this.useMemory && !options?.tx) {
      if (options?.invalidateExisting) {
        for (const t of inMemoryTokens.values()) {
          if (t.userId === userId && t.consumedAt === null) {
            t.consumedAt = now;
          }
        }
      }
      const record: EmailVerificationTokenRecord = {
        id: `evf_${crypto.randomUUID()}`,
        userId,
        tokenHash,
        expiresAt,
        consumedAt: null,
        createdAt: now,
      };
      inMemoryTokens.set(tokenHash, record);
      return { rawToken, record };
    }

    const client = options?.tx || db;
    try {
      if (options?.invalidateExisting) {
        await client.emailVerificationToken.updateMany({
          where: { userId, consumedAt: null },
          data: { consumedAt: now },
        });
      }
      const created = await client.emailVerificationToken.create({
        data: {
          userId,
          tokenHash,
          expiresAt,
        },
      });
      return { rawToken, record: created as EmailVerificationTokenRecord };
    } catch (err) {
      if (options?.tx) {
        throw err;
      }
      handleRepositoryError("EmailVerificationRepository.createToken", err);
      const record: EmailVerificationTokenRecord = {
        id: `evf_${crypto.randomUUID()}`,
        userId,
        tokenHash,
        expiresAt,
        consumedAt: null,
        createdAt: now,
      };
      inMemoryTokens.set(tokenHash, record);
      return { rawToken, record };
    }
  }

  /**
   * Atomically validates and consumes an email verification token, marks the user verified,
   * invalidates any other unconsumed tokens for that user, and reloads the user with memberships.
   */
  static async consumeAndVerifyUser(rawToken: string): Promise<{
    user: UserWithMemberships;
    verifiedAt: Date;
  }> {
    if (!rawToken || typeof rawToken !== "string" || rawToken.trim().length < 16) {
      throw new Error("Verification link is invalid or malformed.");
    }

    const tokenHash = hashVerificationToken(rawToken);
    const now = new Date();

    if (this.useMemory) {
      const token = inMemoryTokens.get(tokenHash);
      if (!token) {
        throw new Error("Verification link is invalid or has already been used.");
      }
      if (token.consumedAt !== null) {
        throw new Error("Verification link has already been used.");
      }
      if (token.expiresAt.getTime() <= now.getTime()) {
        throw new Error("Verification link has expired. Please request a new verification email.");
      }

      token.consumedAt = now;
      for (const other of inMemoryTokens.values()) {
        if (other.userId === token.userId && other.consumedAt === null) {
          other.consumedAt = now;
        }
      }

      await inMemoryUserStore.markEmailVerified(token.userId, now);
      const user = await inMemoryUserStore.findWithMemberships(token.userId);
      if (!user) {
        throw new Error("User account could not be found.");
      }
      return { user, verifiedAt: now };
    }

    try {
      const user = await db.$transaction(async (tx) => {
        const existing = await tx.emailVerificationToken.findUnique({
          where: { tokenHash },
        });

        if (!existing) {
          throw new Error("Verification link is invalid or has already been used.");
        }
        if (existing.consumedAt !== null) {
          throw new Error("Verification link has already been used.");
        }
        if (existing.expiresAt.getTime() <= now.getTime()) {
          throw new Error("Verification link has expired. Please request a new verification email.");
        }

        const updated = await tx.emailVerificationToken.updateMany({
          where: {
            tokenHash,
            consumedAt: null,
          },
          data: { consumedAt: now },
        });
        if (updated.count === 0) {
          throw new Error("Verification link has already been used.");
        }

        // Invalidate any other outstanding tokens for this account
        await tx.emailVerificationToken.updateMany({
          where: {
            userId: existing.userId,
            consumedAt: null,
          },
          data: { consumedAt: now },
        });

        await tx.user.update({
          where: { id: existing.userId },
          data: { emailVerifiedAt: now },
        });

        const reloaded = await tx.user.findUnique({
          where: { id: existing.userId },
          include: {
            memberships: {
              include: {
                tenant: {
                  select: {
                    id: true,
                    slug: true,
                    name: true,
                    didUri: true,
                  },
                },
              },
            },
          },
        });

        if (!reloaded) {
          throw new Error("User account could not be found.");
        }
        return reloaded;
      });

      return {
        user: user as unknown as UserWithMemberships,
        verifiedAt: now,
      };
    } catch (err) {
      if (
        err instanceof Error &&
        /verification link|already been used|expired|not be found/i.test(err.message)
      ) {
        throw err;
      }
      handleRepositoryError("EmailVerificationRepository.consumeAndVerifyUser", err);
      throw err;
    }
  }

  /**
   * Lists hashed tokens for inspection (never raw tokens) for tests.
   */
  static listInMemoryTokenRecordsForUser(userId: string): EmailVerificationTokenRecord[] {
    return Array.from(inMemoryTokens.values()).filter((t) => t.userId === userId);
  }
}
