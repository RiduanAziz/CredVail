import crypto from "node:crypto";
import { z } from "zod";
import { db } from "../db.ts";
import { hashPassword, passwordSchema } from "../auth/password.ts";
import { handleRepositoryError, isInMemoryFallbackPermissible } from "../db/persistence-policy.ts";
import { UserRepository } from "../repositories/user-repository.ts";
import { TenantRepository } from "../repositories/tenant-repository.ts";

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(16, "Reset token is invalid"),
  newPassword: passwordSchema,
});

export const verifyEmailTokenSchema = z.object({
  token: z.string().min(16, "Verification token is invalid"),
});

interface InMemoryTokenRecord {
  tokenHash: string;
  audience: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

const inMemoryRecoveryTokens = new Map<string, InMemoryTokenRecord>();

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken.trim()).digest("hex");
}

function useMemoryStore(): boolean {
  if (!isInMemoryFallbackPermissible()) return false;
  return !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("localhost:5432");
}

async function storeToken(audience: string, rawToken: string, ttlMs: number): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlMs);

  if (useMemoryStore()) {
    inMemoryRecoveryTokens.set(tokenHash, {
      tokenHash,
      audience,
      expiresAt,
      consumedAt: null,
    });
    return;
  }

  try {
    await db.challengeNonce.create({
      data: {
        nonceHash: tokenHash,
        audience,
        expiresAt,
      },
    });
  } catch (err) {
    handleRepositoryError("AuthRecoveryService.storeToken", err);
    inMemoryRecoveryTokens.set(tokenHash, {
      tokenHash,
      audience,
      expiresAt,
      consumedAt: null,
    });
  }
}

async function consumeToken(expectedPrefix: string, rawToken: string): Promise<string> {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  if (useMemoryStore()) {
    const rec = inMemoryRecoveryTokens.get(tokenHash);
    if (!rec || !rec.audience.startsWith(expectedPrefix)) {
      throw new Error("Invalid or expired recovery token");
    }
    if (rec.consumedAt !== null) {
      throw new Error("Token has already been consumed");
    }
    if (rec.expiresAt.getTime() <= now.getTime()) {
      throw new Error("Token has expired");
    }
    rec.consumedAt = now;
    return rec.audience.slice(expectedPrefix.length);
  }

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.challengeNonce.findUnique({
        where: { nonceHash: tokenHash },
      });
      if (!existing || !existing.audience.startsWith(expectedPrefix)) {
        throw new Error("Invalid or expired recovery token");
      }
      if (existing.consumedAt !== null) {
        throw new Error("Token has already been consumed");
      }
      if (existing.expiresAt.getTime() <= now.getTime()) {
        throw new Error("Token has expired");
      }

      const updated = await tx.challengeNonce.updateMany({
        where: {
          nonceHash: tokenHash,
          consumedAt: null,
        },
        data: { consumedAt: now },
      });
      if (updated.count === 0) {
        throw new Error("Token has already been consumed");
      }
      return existing.audience.slice(expectedPrefix.length);
    });
  } catch (err) {
    if (err instanceof Error && /token|recovery/i.test(err.message)) {
      throw err;
    }
    handleRepositoryError("AuthRecoveryService.consumeToken", err);
    throw err;
  }
}

export class AuthRecoveryService {
  private userRepo: UserRepository;
  private tenantRepo: TenantRepository;

  constructor(userRepo?: UserRepository, tenantRepo?: TenantRepository) {
    this.userRepo = userRepo || new UserRepository();
    this.tenantRepo = tenantRepo || new TenantRepository();
  }

  static resetForTesting(): void {
    inMemoryRecoveryTokens.clear();
  }

  async requestPasswordReset(input: z.infer<typeof forgotPasswordSchema>): Promise<{
    accepted: boolean;
    message: string;
    debugToken?: string;
  }> {
    const { email } = forgotPasswordSchema.parse(input);
    const genericMessage =
      "If an account exists for that email address, password reset instructions have been prepared.";

    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      return { accepted: true, message: genericMessage };
    }

    const rawToken = `credvail_rst_${crypto.randomBytes(32).toString("base64url")}`;
    await storeToken(`pwd-reset:${user.id}`, rawToken, 30 * 60 * 1000);

    await this.tenantRepo.recordAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: "PASSWORD_RESET_REQUESTED",
      resourceType: "User",
      resourceId: user.id,
    });

    return {
      accepted: true,
      message: genericMessage,
      ...(process.env.NODE_ENV !== "production" ? { debugToken: rawToken } : {}),
    };
  }

  async confirmPasswordReset(input: z.infer<typeof resetPasswordSchema>): Promise<{
    reset: boolean;
    userId: string;
  }> {
    const validated = resetPasswordSchema.parse(input);
    const userId = await consumeToken("pwd-reset:", validated.token);
    const newHash = await hashPassword(validated.newPassword);
    const ok = await this.userRepo.updatePasswordHash(userId, newHash);
    if (!ok) {
      throw new Error("Unable to update password for account");
    }

    await this.tenantRepo.recordAuditLog({
      userId,
      action: "PASSWORD_RESET_COMPLETED",
      resourceType: "User",
      resourceId: userId,
    });

    return { reset: true, userId };
  }

  async requestEmailVerification(userId: string): Promise<{
    sent: boolean;
    debugToken?: string;
  }> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new Error("User account not found");
    }
    const rawToken = `credvail_vrf_${crypto.randomBytes(32).toString("base64url")}`;
    await storeToken(`email-verify:${user.id}`, rawToken, 24 * 60 * 60 * 1000);

    return {
      sent: true,
      ...(process.env.NODE_ENV !== "production" ? { debugToken: rawToken } : {}),
    };
  }

  async confirmEmailVerification(input: z.infer<typeof verifyEmailTokenSchema>): Promise<{
    verified: boolean;
    userId: string;
    emailVerifiedAt: string;
  }> {
    const { token } = verifyEmailTokenSchema.parse(input);
    const userId = await consumeToken("email-verify:", token);
    const verifiedAt = new Date();
    const ok = await this.userRepo.markEmailVerified(userId, verifiedAt);
    if (!ok) {
      throw new Error("Unable to verify user account");
    }

    await this.tenantRepo.recordAuditLog({
      userId,
      action: "EMAIL_VERIFIED",
      resourceType: "User",
      resourceId: userId,
    });

    return {
      verified: true,
      userId,
      emailVerifiedAt: verifiedAt.toISOString(),
    };
  }
}
