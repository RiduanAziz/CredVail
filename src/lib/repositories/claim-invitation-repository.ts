/**
 * CREDVAIL Claim Invitation Repository
 * 
 * Manages single-use, high-entropy credential claim invitations.
 * Only cryptographic hashes of claim tokens are stored in the database.
 * 
 * Implements dual-mode architecture:
 * 1. Prisma Client with multi-tenant scoping
 * 2. In-Memory hermetic store for sub-millisecond testing and disconnected operation
 */

import { prisma } from "../db.ts";
import { handleRepositoryError, isInMemoryFallbackPermissible } from "../db/persistence-policy.ts";

export class ClaimError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ClaimInvalidError extends ClaimError {
  constructor(message: string = "Invalid or unverified credential claim invitation token.") {
    super(message, "CLAIM_INVALID", 404);
  }
}

export class ClaimAlreadyConsumedError extends ClaimError {
  constructor(message: string = "This claim invitation token has already been consumed and cannot be reused.") {
    super(message, "CLAIM_ALREADY_CONSUMED", 410);
  }
}

export class ClaimExpiredError extends ClaimError {
  constructor(message: string = "This credential claim invitation has expired.") {
    super(message, "CLAIM_EXPIRED", 410);
  }
}

export class ClaimOwnershipError extends ClaimError {
  constructor(message: string = "Ownership verification failed.") {
    super(message, "CLAIM_OWNERSHIP_FAILED", 403);
  }
}

export class ClaimEmailUnverifiedError extends ClaimError {
  constructor(message: string = "Email verification is required to establish credential recipient ownership.") {
    super(message, "CLAIM_EMAIL_UNVERIFIED", 403);
  }
}

export class ClaimTransactionBusyError extends ClaimError {
  constructor(message: string = "Transient database concurrency conflict. Please retry your request.") {
    super(message, "CLAIM_TRANSACTION_BUSY", 503);
  }
}

export class CredentialAlreadyClaimedError extends ClaimError {
  constructor(message: string = "This credential has already been claimed by another user.") {
    super(message, "CREDENTIAL_ALREADY_CLAIMED", 409);
  }
}

/**
 * Case A: Explicitly identifies the single-owner partial unique index by name.
 * Only returns true when the constraint/index name is verified in the error.
 */
export function isSingleOwnerIndexViolation(err: any): boolean {
  if (!err) return false;
  const indexName = "claim_invitations_one_consumed_owner_per_credential_uq";
  if (typeof err.message === "string" && err.message.toLowerCase().includes(indexName)) {
    return true;
  }
  if (err.code === "P2002") {
    const target = err.meta?.target;
    if (typeof target === "string" && target.includes(indexName)) return true;
    if (Array.isArray(target) && target.includes(indexName)) return true;
    if (err.meta?.constraint && String(err.meta.constraint).includes(indexName)) return true;
  }
  return false;
}

export const isExplicitSingleOwnerIndexViolation = isSingleOwnerIndexViolation;

/**
 * Case B, C, D: Detects whether any unique constraint violation occurred (Prisma P2002 or Postgres 23505).
 * Never classifies ambiguous violations as single-owner conflicts without explicit index confirmation or post-recheck.
 */
export function isAnyUniqueViolation(err: any): boolean {
  if (!err) return false;
  if (err.code === "P2002") return true;
  if (err.code === "23505") return true;
  if (typeof err.message === "string") {
    const msg = err.message.toLowerCase();
    if (msg.includes("unique constraint") || msg.includes("23505")) return true;
  }
  return false;
}

export function isRetryableTransactionConflict(err: any): boolean {
  if (!err) return false;
  if (isAnyUniqueViolation(err)) return false; // Unique violations are deterministic and must fail fast with 409
  if (err.code === "P2034") return true;
  if (err.code === "40001" || err.code === "40P01" || err.code === "40p01") return true;
  if (typeof err.message === "string") {
    const msg = err.message.toLowerCase();
    if (msg.includes("40001") || msg.includes("could not serialize access")) return true;
    if (msg.includes("40p01") || msg.includes("deadlock detected")) return true;
    if (msg.includes("write conflict or a deadlock")) return true;
  }
  return false;
}

export interface StoredClaimInvitation {
  id: string;
  tokenHash: string;
  credentialId: string;
  certificateNumber: string;
  recipientEmail: string;
  tenantId: string;
  expiresAt: Date;
  consumedAt: Date | null;
  claimedByUserId: string | null;
  claimedByHolderDid: string | null;
  createdAt: Date;
}

export interface CreateInvitationInput {
  tokenHash: string;
  credentialId: string;
  certificateNumber: string;
  recipientEmail: string;
  tenantId: string;
  expiresAt: Date;
}

export class ClaimInvitationRepository {
  private static inMemoryInvitations = new Map<string, StoredClaimInvitation>();
  private static manualMemoryOverride: boolean | null = null;

  public static setUseMemory(val: boolean): void {
    this.manualMemoryOverride = val;
  }

  public static getUseMemory(): boolean {
    if (!isInMemoryFallbackPermissible()) return false;
    if (this.manualMemoryOverride !== null) return this.manualMemoryOverride;
    return !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("localhost:5432");
  }

  private static get useMemory(): boolean {
    return this.getUseMemory();
  }

  static resetInMemoryStore(): void {
    this.inMemoryInvitations.clear();
    this.manualMemoryOverride = null;
  }

  static async createInvitation(input: CreateInvitationInput): Promise<StoredClaimInvitation> {
    const record: StoredClaimInvitation = {
      id: `inv_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`,
      tokenHash: input.tokenHash,
      credentialId: input.credentialId,
      certificateNumber: input.certificateNumber,
      recipientEmail: input.recipientEmail.trim().toLowerCase(),
      tenantId: input.tenantId,
      expiresAt: input.expiresAt,
      consumedAt: null,
      claimedByUserId: null,
      claimedByHolderDid: null,
      createdAt: new Date(),
    };

    if (this.useMemory) {
      this.inMemoryInvitations.set(record.tokenHash, record);
      return record;
    }

    try {
      const created = await prisma.claimInvitation.create({
        data: {
          tokenHash: input.tokenHash,
          credentialId: input.credentialId,
          certificateNumber: input.certificateNumber,
          recipientEmail: input.recipientEmail.trim().toLowerCase(),
          tenantId: input.tenantId,
          expiresAt: input.expiresAt,
        },
      });

      return {
        id: created.id,
        tokenHash: created.tokenHash,
        credentialId: created.credentialId,
        certificateNumber: created.certificateNumber,
        recipientEmail: created.recipientEmail,
        tenantId: created.tenantId,
        expiresAt: created.expiresAt,
        consumedAt: created.consumedAt,
        claimedByUserId: created.claimedByUserId,
        claimedByHolderDid: created.claimedByHolderDid,
        createdAt: created.createdAt,
      };
    } catch (err) {
      if (!isInMemoryFallbackPermissible() || !this.useMemory) {
        handleRepositoryError("ClaimInvitationRepository.createInvitation", err);
        throw err;
      }
      this.inMemoryInvitations.set(record.tokenHash, record);
      return record;
    }
  }

  static async findByTokenHash(tokenHash: string): Promise<StoredClaimInvitation | null> {
    if (this.useMemory) {
      return this.inMemoryInvitations.get(tokenHash) || null;
    }

    try {
      const found = await prisma.claimInvitation.findUnique({
        where: { tokenHash },
      });

      if (!found) {
        if (!isInMemoryFallbackPermissible() || !this.useMemory) {
          return null;
        }
        return this.inMemoryInvitations.get(tokenHash) || null;
      }

      return {
        id: found.id,
        tokenHash: found.tokenHash,
        credentialId: found.credentialId,
        certificateNumber: found.certificateNumber,
        recipientEmail: found.recipientEmail,
        tenantId: found.tenantId,
        expiresAt: found.expiresAt,
        consumedAt: found.consumedAt,
        claimedByUserId: found.claimedByUserId,
        claimedByHolderDid: found.claimedByHolderDid,
        createdAt: found.createdAt,
      };
    } catch (err) {
      if (!isInMemoryFallbackPermissible() || !this.useMemory) {
        handleRepositoryError("ClaimInvitationRepository.findByTokenHash", err);
        throw err;
      }
      return this.inMemoryInvitations.get(tokenHash) || null;
    }
  }

  /**
   * Executes atomic conditional invitation consumption, credential association verification,
   * and audit record creation within a single isolated database transaction.
   * If any downstream step fails, the entire transaction is rolled back,
   * ensuring that the invitation is NOT consumed without completing the claim.
   */
  static async redeemInvitationTransaction(options: {
    invitationId: string;
    tokenHash: string;
    userId: string;
    holderDid?: string;
    certificateNumber: string;
    tenantId: string;
    onPostConsume?: (txClient?: any) => Promise<void>;
  }): Promise<StoredClaimInvitation> {
    const { invitationId, tokenHash, userId, holderDid, certificateNumber, tenantId, onPostConsume } = options;
    const consumedAt = new Date();

    if (this.useMemory) {
      // Find in-memory invitation
      let targetKey: string | null = null;
      let targetInv: StoredClaimInvitation | null = null;
      for (const [key, inv] of this.inMemoryInvitations.entries()) {
        if (inv.id === invitationId || inv.tokenHash === tokenHash) {
          targetKey = key;
          targetInv = inv;
          break;
        }
      }

      if (!targetInv || !targetKey || targetInv.tokenHash !== tokenHash) {
        throw new ClaimInvalidError("Invalid or unverified credential claim invitation token.");
      }

      // Check single-use / replay
      if (targetInv.consumedAt !== null) {
        throw new ClaimAlreadyConsumedError("This claim invitation token has already been consumed and cannot be reused.");
      }

      // Check expiration
      if (new Date(targetInv.expiresAt).getTime() <= Date.now()) {
        throw new ClaimExpiredError("This credential claim invitation has expired.");
      }

      // Check certificate match and tenant match
      if (targetInv.certificateNumber !== certificateNumber.trim() || targetInv.tenantId !== tenantId) {
        throw new ClaimInvalidError(`Certificate mismatch: This claim token is not valid for certificate "${certificateNumber}".`);
      }

      // Single-owner invariant: Check if another invitation for the same credential has already been consumed
      for (const inv of this.inMemoryInvitations.values()) {
        if (
          inv.credentialId === targetInv.credentialId &&
          inv.consumedAt !== null &&
          inv.claimedByUserId !== null &&
          inv.id !== targetInv.id
        ) {
          throw new CredentialAlreadyClaimedError(
            "This credential has already been claimed by another user."
          );
        }
      }

      // Snapshot prior to mutation for atomic transactional rollback
      const snapshot: StoredClaimInvitation = { ...targetInv };
      targetInv.consumedAt = consumedAt;
      targetInv.claimedByUserId = userId;
      targetInv.claimedByHolderDid = holderDid || null;
      this.inMemoryInvitations.set(targetKey, targetInv);

      try {
        if (onPostConsume) {
          await onPostConsume();
        }
        return { ...targetInv };
      } catch (err) {
        // Rollback on downstream failure
        this.inMemoryInvitations.set(targetKey, snapshot);
        throw err;
      }
    }

    // Bounded whole-transaction retry loop for transient PostgreSQL serialization/deadlock conflicts
    const maxAttempts = 3;
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        return await prisma.$transaction(
          async (tx) => {
            // 1. Database-level atomic conditional update binding all security-critical predicates:
            // - invitation ID
            // - token hash
            // - tenant ID
            // - certificate number
            // - unconsumed (consumedAt IS NULL)
            // - unexpired (expiresAt > consumedAt)
            const updateResult = await tx.claimInvitation.updateMany({
              where: {
                id: invitationId,
                tokenHash,
                tenantId,
                certificateNumber: certificateNumber.trim(),
                consumedAt: null,
                expiresAt: { gt: consumedAt },
              },
              data: {
                consumedAt,
                claimedByUserId: userId,
                claimedByHolderDid: holderDid || null,
              },
            });

            if (updateResult.count === 0) {
              // Inspect database within the same transaction to determine exact rejection reason
              const currentInv = await tx.claimInvitation.findUnique({
                where: { id: invitationId },
              });

              if (!currentInv || currentInv.tokenHash !== tokenHash) {
                throw new ClaimInvalidError("Invalid or unverified credential claim invitation token.");
              }
              if (currentInv.tenantId !== tenantId || currentInv.certificateNumber !== certificateNumber.trim()) {
                throw new ClaimInvalidError(
                  `Certificate mismatch: This claim token is not valid for certificate "${certificateNumber}".`
                );
              }
              if (currentInv.consumedAt !== null) {
                throw new ClaimAlreadyConsumedError(
                  "This claim invitation token has already been consumed and cannot be reused."
                );
              }
              if (new Date(currentInv.expiresAt).getTime() <= consumedAt.getTime()) {
                throw new ClaimExpiredError("This credential claim invitation has expired.");
              }

              throw new ClaimAlreadyConsumedError(
                "This claim invitation token has already been consumed and cannot be reused."
              );
            }

            // 2. Verify and associate credential within the same transaction client
            const credRecord = await tx.credentialRecord.findUnique({
              where: { certificateNumber: certificateNumber.trim() },
            });
            if (!credRecord) {
              throw new ClaimInvalidError(`Credential record for certificate "${certificateNumber}" not found.`);
            }
            if (credRecord.tenantId !== tenantId) {
              throw new ClaimOwnershipError(
                `Cross-tenant security violation: Credential does not belong to tenant "${tenantId}".`
              );
            }

            // Single-owner invariant pre-check: ensure no other invitation for this credential is already consumed
            const otherClaimed = await tx.claimInvitation.findFirst({
              where: {
                credentialId: credRecord.credentialId,
                consumedAt: { not: null },
                claimedByUserId: { not: null },
                id: { not: invitationId },
              },
              select: { id: true, claimedByUserId: true },
            });
            if (otherClaimed) {
              throw new CredentialAlreadyClaimedError(
                "This credential has already been claimed by another user."
              );
            }

            // 3. Load updated invitation inside transaction
            const updated = await tx.claimInvitation.findUnique({
              where: { id: invitationId },
            });
            if (!updated) {
              throw new ClaimInvalidError("Failed to load consumed claim invitation.");
            }
            if (credRecord.credentialId !== updated.credentialId) {
              throw new ClaimInvalidError(
                `Credential ID mismatch: Expected "${updated.credentialId}", found "${credRecord.credentialId}".`
              );
            }

            // 4. Record audit log entry within the same transaction client
            await tx.auditLog.create({
              data: {
                tenantId,
                userId,
                action: "CREDENTIAL_CLAIMED",
                resourceType: "CredentialRecord",
                resourceId: credRecord.id,
                metadata: {
                  certificateNumber,
                  invitationId,
                  claimedByHolderDid: holderDid || null,
                },
                ipHash: "claim-transaction",
              },
            });

            // 5. Downstream association hook inside transaction client
            if (onPostConsume) {
              await onPostConsume(tx);
            }

            return {
              id: updated.id,
              tokenHash: updated.tokenHash,
              credentialId: updated.credentialId,
              certificateNumber: updated.certificateNumber,
              recipientEmail: updated.recipientEmail,
              tenantId: updated.tenantId,
              expiresAt: updated.expiresAt,
              consumedAt: updated.consumedAt,
              claimedByUserId: updated.claimedByUserId,
              claimedByHolderDid: updated.claimedByHolderDid,
              createdAt: updated.createdAt,
            };
          },
          {
            isolationLevel: "RepeatableRead" as any,
          }
        );
      } catch (err: any) {
        // Immediate rethrow for typed domain errors and non-retryable application errors
        if (err instanceof ClaimError) {
          throw err;
        }

        // Case A — Explicit single-owner index identity
        if (isExplicitSingleOwnerIndexViolation(err)) {
          throw new CredentialAlreadyClaimedError(
            "This credential has already been claimed by another authenticated account."
          );
        }

        // Case B & C — Ambiguous Prisma P2002 or raw PostgreSQL 23505
        if (isAnyUniqueViolation(err)) {
          try {
            const target = await prisma.claimInvitation.findUnique({
              where: { id: invitationId },
              select: { credentialId: true },
            });
            const targetCredId = target?.credentialId;
            if (targetCredId) {
              const existingClaim = await prisma.claimInvitation.findFirst({
                where: {
                  credentialId: targetCredId,
                  consumedAt: { not: null },
                  claimedByUserId: { not: null },
                  id: { not: invitationId },
                },
                select: { id: true, claimedByUserId: true },
              });
              if (existingClaim) {
                // Case B: Committed consumed owner confirmed for target credential
                throw new CredentialAlreadyClaimedError(
                  "This credential has already been claimed by another authenticated account."
                );
              }
            }
          } catch (recheckErr) {
            if (recheckErr instanceof CredentialAlreadyClaimedError) {
              throw recheckErr;
            }
          }
          // Case C: Unrelated unique violation (e.g. CredentialRecord.credentialId, duplicate tokenHash).
          // Rethrow the original database error unchanged.
          throw err;
        }

        const isRetryable = isRetryableTransactionConflict(err);
        if (isRetryable && attempt < maxAttempts) {
          // Restart fresh whole transaction after small jittered backoff
          await new Promise((resolve) =>
            setTimeout(resolve, 10 * attempt + Math.floor(Math.random() * 20))
          );
          continue;
        }

        if (isRetryable && attempt >= maxAttempts) {
          // Bounded retries exhausted
          throw new ClaimTransactionBusyError(
            "Transient database concurrency conflict. Please retry your request."
          );
        }

        throw err;
      }
    }

    throw new ClaimTransactionBusyError(
      "Transient database concurrency conflict. Please retry your request."
    );
  }

  /**
   * @deprecated Legacy mutation API. Callers must use redeemInvitationTransaction instead.
   * Enforces single-owner invariant and rejects if the credential is already claimed.
   */
  static async consumeAtomic(
    id: string,
    userId: string,
    holderDid?: string
  ): Promise<StoredClaimInvitation | null> {
    const consumedAt = new Date();

    if (this.useMemory) {
      const targetInv = Array.from(this.inMemoryInvitations.values()).find((inv) => inv.id === id);
      if (!targetInv) return null;
      if (targetInv.consumedAt !== null || new Date(targetInv.expiresAt).getTime() <= Date.now()) {
        return null;
      }
      // Single-owner check in memory
      const existingConsumed = Array.from(this.inMemoryInvitations.values()).find(
        (inv) =>
          inv.credentialId === targetInv.credentialId &&
          inv.consumedAt !== null &&
          inv.claimedByUserId !== null &&
          inv.id !== id
      );
      if (existingConsumed) {
        throw new CredentialAlreadyClaimedError(
          "This credential has already been claimed by another user."
        );
      }
      targetInv.consumedAt = consumedAt;
      targetInv.claimedByUserId = userId;
      targetInv.claimedByHolderDid = holderDid || null;
      return { ...targetInv };
    }

    try {
      // In production or live database mode:
      const target = await prisma.claimInvitation.findUnique({
        where: { id },
      });
      if (!target || target.consumedAt !== null || new Date(target.expiresAt).getTime() <= consumedAt.getTime()) {
        return null;
      }

      // Check single-owner invariant before update
      const existingOwner = await prisma.claimInvitation.findFirst({
        where: {
          credentialId: target.credentialId,
          consumedAt: { not: null },
          claimedByUserId: { not: null },
          id: { not: id },
        },
      });
      if (existingOwner) {
        throw new CredentialAlreadyClaimedError(
          "This credential has already been claimed by another user."
        );
      }

      // Atomic conditional update at PostgreSQL level
      const updateResult = await prisma.claimInvitation.updateMany({
        where: {
          id,
          consumedAt: null,
          expiresAt: { gt: consumedAt },
        },
        data: {
          consumedAt,
          claimedByUserId: userId,
          claimedByHolderDid: holderDid || null,
        },
      });

      if (updateResult.count === 0) {
        return null;
      }

      const found = await prisma.claimInvitation.findUnique({
        where: { id },
      });
      if (!found) return null;

      return {
        id: found.id,
        tokenHash: found.tokenHash,
        credentialId: found.credentialId,
        certificateNumber: found.certificateNumber,
        recipientEmail: found.recipientEmail,
        tenantId: found.tenantId,
        expiresAt: found.expiresAt,
        consumedAt: found.consumedAt,
        claimedByUserId: found.claimedByUserId,
        claimedByHolderDid: found.claimedByHolderDid,
        createdAt: found.createdAt,
      };
    } catch (err: any) {
      if (err instanceof ClaimError) {
        throw err;
      }
      if (isExplicitSingleOwnerIndexViolation(err)) {
        throw new CredentialAlreadyClaimedError(
          "This credential has already been claimed by another authenticated account."
        );
      }
      if (isAnyUniqueViolation(err)) {
        try {
          const target = await prisma.claimInvitation.findUnique({
            where: { id },
            select: { credentialId: true },
          });
          const targetCredId = target?.credentialId;
          if (targetCredId) {
            const existingClaim = await prisma.claimInvitation.findFirst({
              where: {
                credentialId: targetCredId,
                consumedAt: { not: null },
                claimedByUserId: { not: null },
                id: { not: id },
              },
              select: { id: true, claimedByUserId: true },
            });
            if (existingClaim) {
              throw new CredentialAlreadyClaimedError(
                "This credential has already been claimed by another authenticated account."
              );
            }
          }
        } catch (recheckErr) {
          if (recheckErr instanceof CredentialAlreadyClaimedError) {
            throw recheckErr;
          }
        }
        throw err;
      }
      if (
        process.env.REQUIRE_POSTGRES_INTEGRATION === "true" ||
        process.env.NODE_ENV === "production" ||
        !this.useMemory
      ) {
        throw err;
      }
      return null;
    }
  }

  /**
   * @deprecated Legacy alias for consumeAtomic. Callers must use redeemInvitationTransaction instead.
   */
  static async markConsumed(
    id: string,
    userId: string,
    holderDid?: string
  ): Promise<StoredClaimInvitation | null> {
    return this.consumeAtomic(id, userId, holderDid);
  }

  static async findPendingByCertificate(
    certificateNumber: string
  ): Promise<StoredClaimInvitation | null> {
    if (this.useMemory) {
      for (const inv of this.inMemoryInvitations.values()) {
        if (inv.certificateNumber === certificateNumber && !inv.consumedAt) {
          return inv;
        }
      }
      return null;
    }

    try {
      const found = await prisma.claimInvitation.findFirst({
        where: {
          certificateNumber,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!found) return null;

      return {
        id: found.id,
        tokenHash: found.tokenHash,
        credentialId: found.credentialId,
        certificateNumber: found.certificateNumber,
        recipientEmail: found.recipientEmail,
        tenantId: found.tenantId,
        expiresAt: found.expiresAt,
        consumedAt: found.consumedAt,
        claimedByUserId: found.claimedByUserId,
        claimedByHolderDid: found.claimedByHolderDid,
        createdAt: found.createdAt,
      };
    } catch (err) {
      if (process.env.REQUIRE_POSTGRES_INTEGRATION === "true" || !this.useMemory) {
        throw err;
      }
      for (const inv of this.inMemoryInvitations.values()) {
        if (inv.certificateNumber === certificateNumber && !inv.consumedAt) {
          return inv;
        }
      }
      return null;
    }
  }
}
