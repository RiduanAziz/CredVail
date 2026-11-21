/**
 * CREDVAIL Durable Wallet Credential Repository (H1.3.3 / H1.3.3.1)
 *
 * Provides PostgreSQL-backed durable retrieval and ownership verification for
 * claimed credentials, eliminating reliance on ephemeral in-memory process state.
 *
 * Source of Truth:
 * - ClaimInvitation table: claimedByUserId, claimedByHolderDid, consumedAt, credentialId, tenantId
 * - CredentialRecord table: id, credentialId, certificateNumber, claimsData, vcPayloadJson, recipientId
 * - Recipient table: fullName, email
 * - Tenant table: name, didUri, slug
 *
 * Single-Owner Invariant (H1.3.3.1):
 * - One credential may have at most one authenticated claimant.
 * - Enforced by PostgreSQL partial unique index:
 *   "claim_invitations_one_consumed_owner_per_credential_uq" ON ("credentialId")
 *   WHERE "consumedAt" IS NOT NULL AND "claimedByUserId" IS NOT NULL
 *
 * Core Security Invariants:
 * 1. A credential is owned by an authenticated user iff a ClaimInvitation exists with:
 *    claimedByUserId === userId AND consumedAt IS NOT NULL AND credentialId === targetCredentialId
 * 2. Unclaimed invitations (consumedAt IS NULL) must never grant ownership.
 * 3. Expired or unconsumed invitations must never appear in claimed wallet lists.
 * 4. Cross-user isolation: User A cannot retrieve or present credentials claimed by User B.
 * 5. Strict Cross-entity Integrity: CredentialRecord.credentialId === ClaimInvitation.credentialId
 *    AND CredentialRecord.tenantId === ClaimInvitation.tenantId.
 * 6. Fail-closed: Database failures throw typed WalletStorageUnavailableError (HTTP 503).
 */

import { PrismaClient } from "@prisma/client";
import { prisma } from "../db.ts";
import { ClaimInvitationRepository } from "./claim-invitation-repository.ts";
import type { ClaimDisclosure } from "../crypto/selective-disclosure.ts";
import type { W3CVerifiableCredential } from "../crypto/vc-service.ts";

export interface StoredWalletCredential {
  id: string;
  credentialId: string;
  certificateNumber: string;
  recipientName: string;
  recipientEmail: string;
  courseName: string;
  issuerName: string;
  issuerDid: string;
  claims: Record<string, any>;
  disclosures: Record<string, ClaimDisclosure>;
  rawVc: W3CVerifiableCredential;
  claimedAt: string;
  claimedByUserId?: string;
}

/**
 * Typed error indicating that wallet credential storage (PostgreSQL) is unreachable or failing.
 * Fails closed with HTTP 503 while redacting internal database exception details.
 */
export class WalletStorageUnavailableError extends Error {
  readonly code = "WALLET_STORAGE_UNAVAILABLE";
  readonly statusCode = 503;
  readonly cause?: unknown;

  constructor(
    message: string = "Wallet data is temporarily unavailable. Please retry shortly.",
    cause?: unknown
  ) {
    super(message);
    this.name = "WalletStorageUnavailableError";
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

export interface IWalletCredentialRepository {
  listClaimedCredentials(userId: string): Promise<StoredWalletCredential[]>;
  userOwnsCredential(
    userId: string,
    credentialId?: string,
    certificateNumber?: string
  ): Promise<boolean>;
}

/**
 * Production PostgreSQL implementation using Prisma Client.
 * Leverages the composite index @@index([claimedByUserId, consumedAt]) on ClaimInvitation
 * and enforces single-owner constraint through partial unique index.
 */
export class PrismaWalletCredentialRepository implements IWalletCredentialRepository {
  private client: PrismaClient;

  constructor(client?: PrismaClient) {
    this.client = client || prisma;
  }

  /**
   * Retrieves all claimed credentials owned by the given authenticated user.
   * Only includes consumed claim invitations (consumedAt IS NOT NULL and claimedByUserId IS NOT NULL).
   * Enforces cross-entity relational integrity and deduplicates multiple invitations for the same credentialId.
   */
  async listClaimedCredentials(userId: string): Promise<StoredWalletCredential[]> {
    if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
      return [];
    }

    const cleanUserId = userId.trim();

    try {
      const records = await this.client.claimInvitation.findMany({
        where: {
          claimedByUserId: cleanUserId,
          consumedAt: { not: null },
        },
        orderBy: {
          consumedAt: "desc",
        },
        include: {
          credential: {
            include: {
              recipient: true,
            },
          },
          tenant: true,
        },
      });

      const seen = new Set<string>();
      const credentials: StoredWalletCredential[] = [];

      for (const inv of records) {
        // Enforce relational integrity:
        // 1. Associated CredentialRecord must exist
        // 2. CredentialRecord.credentialId must agree with ClaimInvitation.credentialId
        // 3. CredentialRecord.tenantId must agree with ClaimInvitation.tenantId
        // 4. Recipient and Tenant relations must be valid
        if (
          !inv.credential ||
          inv.credential.credentialId !== inv.credentialId ||
          inv.credential.tenantId !== inv.tenantId ||
          !inv.credential.recipient ||
          !inv.tenant
        ) {
          continue;
        }

        const credId = inv.credential.credentialId;
        if (seen.has(credId)) continue;
        seen.add(credId);

        const claims = (inv.credential.claimsData || {}) as Record<string, any>;
        const rawVc = (inv.credential.vcPayloadJson || {}) as unknown as W3CVerifiableCredential;
        const recipientName =
          inv.credential.recipient.fullName ||
          claims.recipient_name ||
          "";
        const recipientEmail =
          inv.credential.recipient.email ||
          claims.recipient_email ||
          inv.recipientEmail;
        const courseName = claims.course_name || "Certified Program";
        const issuerName = inv.tenant.name || "Verified Educational Institution";
        const issuerDid =
          inv.tenant.didUri ||
          (inv.tenant.slug
            ? `did:web:credvail.com:tenants:${inv.tenant.slug}`
            : "did:web:credvail.com");

        credentials.push({
          id: inv.credential.id,
          credentialId: inv.credential.credentialId,
          certificateNumber: inv.credential.certificateNumber,
          recipientName,
          recipientEmail,
          courseName,
          issuerName,
          issuerDid,
          claims,
          disclosures: {},
          rawVc,
          claimedAt: inv.consumedAt ? inv.consumedAt.toISOString() : inv.createdAt.toISOString(),
          claimedByUserId: inv.claimedByUserId || cleanUserId,
        });
      }

      return credentials;
    } catch (error: any) {
      throw new WalletStorageUnavailableError(
        "Wallet data is temporarily unavailable. Please retry shortly.",
        error
      );
    }
  }

  /**
   * Authoritatively verifies whether the authenticated user owns the presented credential.
   * Returns true iff a consumed ClaimInvitation exists with:
   * claimedByUserId === userId AND consumedAt IS NOT NULL
   * AND matching credentialId AND matching certificateNumber (when supplied).
   */
  async userOwnsCredential(
    userId: string,
    credentialId?: string,
    certificateNumber?: string
  ): Promise<boolean> {
    const cleanUserId = typeof userId === "string" ? userId.trim() : "";
    const cleanCredId = typeof credentialId === "string" ? credentialId.trim() : "";
    const cleanCertNum = typeof certificateNumber === "string" ? certificateNumber.trim() : "";

    if (!cleanUserId || (!cleanCredId && !cleanCertNum)) {
      return false;
    }

    try {
      const whereClause: any = {
        claimedByUserId: cleanUserId,
        consumedAt: { not: null },
      };

      if (cleanCredId) {
        whereClause.credentialId = cleanCredId;
      }
      if (cleanCertNum) {
        whereClause.certificateNumber = cleanCertNum;
      }

      const record = await this.client.claimInvitation.findFirst({
        where: whereClause,
        include: {
          credential: true,
        },
      });

      if (!record || !record.credential) {
        return false;
      }

      // Cross-entity integrity checks:
      if (record.credential.credentialId !== record.credentialId) {
        return false;
      }
      if (record.credential.tenantId !== record.tenantId) {
        return false;
      }
      if (cleanCertNum && record.credential.certificateNumber !== cleanCertNum) {
        return false;
      }
      if (cleanCredId && record.credential.credentialId !== cleanCredId) {
        return false;
      }

      return true;
    } catch (error: any) {
      throw new WalletStorageUnavailableError(
        "Wallet data is temporarily unavailable. Please retry shortly.",
        error
      );
    }
  }
}

/**
 * In-memory test double used for hermetic unit testing and simulated failure modes.
 */
export class InMemoryWalletCredentialRepository implements IWalletCredentialRepository {
  private credentials: StoredWalletCredential[] = [];

  constructor(initialCredentials: StoredWalletCredential[] = []) {
    this.credentials = [...initialCredentials];
  }

  setCredentials(credentials: StoredWalletCredential[]): void {
    this.credentials = [...credentials];
  }

  addCredential(credential: StoredWalletCredential): void {
    this.credentials.push(credential);
  }

  clear(): void {
    this.credentials = [];
  }

  async listClaimedCredentials(userId: string): Promise<StoredWalletCredential[]> {
    if (!userId) return [];
    const cleanUserId = userId.trim();
    const userCreds = this.credentials.filter((c) => c.claimedByUserId === cleanUserId);
    const seen = new Set<string>();
    const result: StoredWalletCredential[] = [];
    for (const cred of userCreds) {
      if (!seen.has(cred.credentialId)) {
        seen.add(cred.credentialId);
        result.push(cred);
      }
    }
    return result.sort((a, b) => new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime());
  }

  async userOwnsCredential(
    userId: string,
    credentialId?: string,
    certificateNumber?: string
  ): Promise<boolean> {
    const cleanUserId = typeof userId === "string" ? userId.trim() : "";
    const cleanCredId = typeof credentialId === "string" ? credentialId.trim() : "";
    const cleanCertNum = typeof certificateNumber === "string" ? certificateNumber.trim() : "";

    if (!cleanUserId || (!cleanCredId && !cleanCertNum)) return false;

    return this.credentials.some((c) => {
      if (c.claimedByUserId !== cleanUserId) return false;
      if (cleanCredId && c.credentialId !== cleanCredId) return false;
      if (cleanCertNum && c.certificateNumber !== cleanCertNum) return false;
      return true;
    });
  }
}

/**
 * Primary static entry point for wallet credential operations.
 * Defaults to PostgreSQL via PrismaWalletCredentialRepository.
 * Test suites may explicitly inject an InMemoryWalletCredentialRepository or mock repository.
 */
export class WalletCredentialRepository {
  private static defaultRepo: IWalletCredentialRepository = new PrismaWalletCredentialRepository();
  private static testDouble: IWalletCredentialRepository | null = null;
  private static memoryFallbackRepo: InMemoryWalletCredentialRepository | null = null;

  static get instance(): IWalletCredentialRepository {
    if (this.testDouble) {
      return this.testDouble;
    }
    // In unit testing environments where PostgreSQL is not running and memory mode is enabled:
    if (
      process.env.REQUIRE_POSTGRES_INTEGRATION !== "true" &&
      process.env.NODE_ENV !== "production" &&
      ClaimInvitationRepository.getUseMemory()
    ) {
      if (!this.memoryFallbackRepo) {
        this.memoryFallbackRepo = new InMemoryWalletCredentialRepository();
      }
      return this.memoryFallbackRepo;
    }
    return this.defaultRepo;
  }

  static setTestDouble(repo: IWalletCredentialRepository | null): void {
    this.testDouble = repo;
  }

  static resetTestDouble(): void {
    this.testDouble = null;
    this.memoryFallbackRepo = null;
  }

  static resetInMemoryStore(): void {
    this.memoryFallbackRepo = null;
  }

  static async listClaimedCredentials(userId: string): Promise<StoredWalletCredential[]> {
    return this.instance.listClaimedCredentials(userId);
  }

  static async userOwnsCredential(
    userId: string,
    credentialId?: string,
    certificateNumber?: string
  ): Promise<boolean> {
    return this.instance.userOwnsCredential(userId, credentialId, certificateNumber);
  }
}
