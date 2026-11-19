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
  private static useMemory =
    process.env.REQUIRE_POSTGRES_INTEGRATION === "true"
      ? false
      : !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("localhost:5432");

  static resetInMemoryStore(): void {
    this.inMemoryInvitations.clear();
    this.useMemory =
      process.env.REQUIRE_POSTGRES_INTEGRATION === "true"
        ? false
        : !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("localhost:5432");
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
      if (process.env.REQUIRE_POSTGRES_INTEGRATION === "true" || !this.useMemory) {
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
        if (process.env.REQUIRE_POSTGRES_INTEGRATION === "true" || !this.useMemory) {
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
      if (process.env.REQUIRE_POSTGRES_INTEGRATION === "true" || !this.useMemory) {
        throw err;
      }
      return this.inMemoryInvitations.get(tokenHash) || null;
    }
  }

  static setUseMemory(val: boolean): void {
    this.useMemory = val;
  }

  static getUseMemory(): boolean {
    return this.useMemory;
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

      if (!targetInv || !targetKey) {
        throw new Error("Invalid or unverified credential claim invitation token.");
      }

      // Check single-use / replay
      if (targetInv.consumedAt !== null) {
        throw new Error("This claim invitation token has already been consumed and cannot be reused.");
      }

      // Check expiration
      if (new Date(targetInv.expiresAt).getTime() <= Date.now()) {
        throw new Error("This credential claim invitation has expired.");
      }

      // Check certificate match
      if (targetInv.certificateNumber !== certificateNumber.trim()) {
        throw new Error(`Certificate mismatch: This claim token is not valid for certificate "${certificateNumber}".`);
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

    try {
      return await prisma.$transaction(
        async (tx) => {
          // 1. Database-level atomic conditional update
          // Matches ONLY if consumedAt IS NULL and expiresAt > NOW
          const updateResult = await tx.claimInvitation.updateMany({
            where: {
              id: invitationId,
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
            throw new Error("This claim invitation token has already been consumed and cannot be reused.");
          }

          // 2. Verify and associate credential within the same transaction
          const credRecord = await tx.credentialRecord.findUnique({
            where: { certificateNumber: certificateNumber.trim() },
          });
          if (!credRecord) {
            throw new Error(`Credential record for certificate "${certificateNumber}" not found.`);
          }

          // 3. Record audit log entry within the same transaction
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

          // 4. Downstream association hook
          if (onPostConsume) {
            await onPostConsume(tx);
          }

          const updated = await tx.claimInvitation.findUnique({
            where: { id: invitationId },
          });
          if (!updated) {
            throw new Error("Failed to load consumed claim invitation.");
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
    } catch (err) {
      throw err;
    }
  }

  /**
   * Atomically consumes a claim invitation using a database-level conditional update.
   * Guarantees single-use semantics even under highly concurrent simultaneous requests.
   * Fails (returns null) if the invitation is already consumed, expired, or not found.
   */
  static async consumeAtomic(
    id: string,
    userId: string,
    holderDid?: string
  ): Promise<StoredClaimInvitation | null> {
    const consumedAt = new Date();

    if (this.useMemory) {
      for (const [key, inv] of this.inMemoryInvitations.entries()) {
        if (inv.id === id) {
          // Atomic check-and-set: Reject if already consumed or expired
          if (inv.consumedAt !== null || new Date(inv.expiresAt).getTime() <= Date.now()) {
            return null;
          }
          inv.consumedAt = consumedAt;
          inv.claimedByUserId = userId;
          inv.claimedByHolderDid = holderDid || null;
          this.inMemoryInvitations.set(key, inv);
          return { ...inv };
        }
      }
      return null;
    }

    try {
      // Atomic conditional update at PostgreSQL level: matches ONLY if consumedAt IS NULL and not expired
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
        // Concurrency conflict: another request consumed it, or it expired
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
    } catch (err) {
      if (process.env.REQUIRE_POSTGRES_INTEGRATION === "true" || !this.useMemory) {
        throw err;
      }
      for (const [key, inv] of this.inMemoryInvitations.entries()) {
        if (inv.id === id) {
          if (inv.consumedAt !== null || new Date(inv.expiresAt).getTime() <= Date.now()) {
            return null;
          }
          inv.consumedAt = consumedAt;
          inv.claimedByUserId = userId;
          inv.claimedByHolderDid = holderDid || null;
          this.inMemoryInvitations.set(key, inv);
          return { ...inv };
        }
      }
      return null;
    }
  }

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
