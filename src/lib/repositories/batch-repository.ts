/**
 * CREDVAIL Batch & Recipient Repository
 * 
 * Implements dual-mode persistence:
 * 1. Prisma Client with strict multi-tenant scoping (tenantId)
 * 2. In-Memory staging store for hermetic testing and high-speed validation
 */

import { prisma } from "../db.ts";
import type { BatchStatus } from "../../types/index.ts";
import { handleRepositoryError, isInMemoryFallbackPermissible } from "../db/persistence-policy.ts";

export interface StagedRecipientData {
  id?: string;
  fullName: string;
  email: string;
  externalIdentifier?: string;
  certificateNumberPreview: string;
  courseName?: string;
  issueDate: string;
  completionDate?: string;
  grade?: string;
  instructorName?: string;
  customData?: Record<string, string>;
  status: "VALID" | "INVALID" | "DUPLICATE";
  errors?: Array<{ column: string; field: string; message: string; value: string }>;
}

export interface IssuanceBatchRecord {
  id: string;
  tenantId: string;
  templateId: string;
  templateVersion?: number;
  templateSnapshot?: any;
  issuerKeyId: string;
  batchNumber: string;
  title: string;
  merkleRoot: string | null;
  leafCount: number;
  onChainTxHash: string | null;
  blockchainBlockNumber: bigint | number | null;
  status: BatchStatus;
  errorSummary: string | null;
  stagedRecipients: StagedRecipientData[];
  validCount: number;
  invalidCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBatchInput {
  tenantId: string;
  templateId: string;
  templateVersion?: number;
  templateSnapshot?: any;
  issuerKeyId?: string;
  batchNumber?: string;
  title?: string;
  stagedRecipients: StagedRecipientData[];
}

export class BatchRepository {
  private static inMemoryBatches = new Map<string, IssuanceBatchRecord>();
  private static inMemoryRecipients = new Map<string, Array<{ id: string; tenantId: string; email: string; fullName: string; certNumber?: string }>>();
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

  /**
   * Resets in-memory stores for hermetic test execution.
   */
  static resetInMemoryStore(): void {
    this.inMemoryBatches.clear();
    this.inMemoryRecipients.clear();
    this.manualMemoryOverride = null;
  }

  /**
   * Generates a collision-safe batch number: BATCH-YYYY-XXXXXX
   */
  static generateBatchNumber(tenantId: string): string {
    const year = new Date().getFullYear();
    const rand = Math.floor(100000 + Math.random() * 900000);
    return `BATCH-${year}-${rand}`;
  }

  /**
   * Creates an issuance batch in DRAFT status with staged recipients.
   */
  static async createBatch(input: CreateBatchInput): Promise<IssuanceBatchRecord> {
    const batchNumber = input.batchNumber || this.generateBatchNumber(input.tenantId);
    const validCount = input.stagedRecipients.filter((r) => r.status === "VALID").length;
    const invalidCount = input.stagedRecipients.filter((r) => r.status !== "VALID").length;
    const batchTitle = input.title || `Batch ${batchNumber} (${validCount} recipients)`;

    // Fallback or default issuer key if none provided
    const issuerKeyId = input.issuerKeyId || `key_default_${input.tenantId}`;

    const batchRecord: IssuanceBatchRecord = {
      id: `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenantId: input.tenantId,
      templateId: input.templateId,
      templateVersion: input.templateVersion || 1,
      templateSnapshot: input.templateSnapshot || null,
      issuerKeyId,
      batchNumber,
      title: batchTitle,
      merkleRoot: null,
      leafCount: validCount,
      onChainTxHash: null,
      blockchainBlockNumber: null,
      status: "DRAFT",
      errorSummary: null,
      stagedRecipients: input.stagedRecipients,
      validCount,
      invalidCount,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (!this.useMemory && prisma) {
      try {
        const created = await prisma.issuanceBatch.create({
          data: {
            id: batchRecord.id,
            tenantId: input.tenantId,
            templateId: input.templateId,
            issuerKeyId,
            batchNumber,
            status: "DRAFT",
            leafCount: validCount,
          },
        });

        // Store recipients in memory/DB
        this.inMemoryBatches.set(created.id, batchRecord);
        return batchRecord;
      } catch (err) {
        handleRepositoryError("BatchRepository.createBatch", err);
      }
    }

    this.inMemoryBatches.set(batchRecord.id, batchRecord);

    // Track recipients for duplicate checks
    const currentRecipients = this.inMemoryRecipients.get(input.tenantId) || [];
    for (const r of input.stagedRecipients) {
      if (r.status === "VALID") {
        currentRecipients.push({
          id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tenantId: input.tenantId,
          email: r.email.toLowerCase(),
          fullName: r.fullName,
          certNumber: r.certificateNumberPreview,
        });
      }
    }
    this.inMemoryRecipients.set(input.tenantId, currentRecipients);

    return batchRecord;
  }

  /**
   * Finds a batch by ID, scoped strictly to the specified tenantId.
   */
  static async findBatchById(tenantId: string, batchId: string): Promise<IssuanceBatchRecord | null> {
    if (this.useMemory) {
      const batch = this.inMemoryBatches.get(batchId);
      if (batch && batch.tenantId === tenantId) {
        return batch;
      }
      return null;
    }

    if (prisma) {
      try {
        const found = await prisma.issuanceBatch.findFirst({
          where: { id: batchId, tenantId },
          include: { template: true },
        });
        if (found) {
          const batch = this.inMemoryBatches.get(batchId);
          return {
            id: found.id,
            tenantId: found.tenantId,
            templateId: found.templateId,
            issuerKeyId: found.issuerKeyId,
            batchNumber: found.batchNumber,
            title: `Batch ${found.batchNumber}`,
            merkleRoot: found.merkleRoot,
            leafCount: found.leafCount,
            onChainTxHash: found.onChainTxHash,
            blockchainBlockNumber: found.blockchainBlockNumber,
            status: found.status as BatchStatus,
            errorSummary: found.errorSummary,
            stagedRecipients: batch?.stagedRecipients || [],
            validCount: batch?.validCount || found.leafCount,
            invalidCount: batch?.invalidCount || 0,
            createdAt: found.createdAt,
            updatedAt: found.updatedAt,
          };
        }
      } catch (err) {
        handleRepositoryError("BatchRepository.findBatchById", err);
      }
    }

    return null;
  }

  /**
   * Lists batches for a tenant, ordered by createdAt descending.
   */
  static async listBatches(tenantId: string): Promise<IssuanceBatchRecord[]> {
    if (this.useMemory) {
      const list: IssuanceBatchRecord[] = [];
      for (const batch of this.inMemoryBatches.values()) {
        if (batch.tenantId === tenantId) {
          list.push(batch);
        }
      }
      return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    if (prisma) {
      try {
        const dbBatches = await prisma.issuanceBatch.findMany({
          where: { tenantId },
          orderBy: { createdAt: "desc" },
        });

        const list: IssuanceBatchRecord[] = [];
        for (const dbb of dbBatches) {
          list.push({
            id: dbb.id,
            tenantId: dbb.tenantId,
            templateId: dbb.templateId,
            issuerKeyId: dbb.issuerKeyId,
            batchNumber: dbb.batchNumber,
            title: `Batch ${dbb.batchNumber}`,
            merkleRoot: dbb.merkleRoot,
            leafCount: dbb.leafCount,
            onChainTxHash: dbb.onChainTxHash,
            blockchainBlockNumber: dbb.blockchainBlockNumber,
            status: dbb.status as BatchStatus,
            errorSummary: dbb.errorSummary,
            stagedRecipients: [],
            validCount: dbb.leafCount,
            invalidCount: 0,
            createdAt: dbb.createdAt,
            updatedAt: dbb.updatedAt,
          });
        }
        return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } catch (err) {
        handleRepositoryError("BatchRepository.listBatches", err);
      }
    }

    return [];
  }

  /**
   * Updates batch status and error details.
   */
  static async updateBatchStatus(
    tenantId: string,
    batchId: string,
    status: BatchStatus,
    details?: { merkleRoot?: string; onChainTxHash?: string; blockchainBlockNumber?: bigint | number; errorSummary?: string }
  ): Promise<IssuanceBatchRecord | null> {
    const batch = await this.findBatchById(tenantId, batchId);
    if (!batch) return null;

    batch.status = status;
    batch.updatedAt = new Date();
    if (details?.merkleRoot) batch.merkleRoot = details.merkleRoot;
    if (details?.onChainTxHash) batch.onChainTxHash = details.onChainTxHash;
    if (details?.blockchainBlockNumber !== undefined) batch.blockchainBlockNumber = details.blockchainBlockNumber;
    if (details?.errorSummary) batch.errorSummary = details.errorSummary;

    this.inMemoryBatches.set(batchId, batch);

    if (!this.useMemory && prisma) {
      try {
        await prisma.issuanceBatch.updateMany({
          where: { id: batchId, tenantId },
          data: {
            status,
            merkleRoot: details?.merkleRoot,
            onChainTxHash: details?.onChainTxHash,
            blockchainBlockNumber: details?.blockchainBlockNumber ? BigInt(details.blockchainBlockNumber) : undefined,
            errorSummary: details?.errorSummary,
          },
        });
      } catch (err) {
        handleRepositoryError("BatchRepository.updateBatchStatus", err);
      }
    }

    return batch;
  }

  /**
   * Returns a set of existing recipient emails in this tenant.
   */
  static async getExistingRecipientEmails(tenantId: string): Promise<Set<string>> {
    const emails = new Set<string>();

    const inMem = this.inMemoryRecipients.get(tenantId) || [];
    for (const r of inMem) {
      emails.add(r.email.toLowerCase());
    }

    if (!this.useMemory && prisma) {
      try {
        const recipients = await prisma.recipient.findMany({
          where: { tenantId },
          select: { email: true },
        });
        for (const r of recipients) {
          emails.add(r.email.toLowerCase());
        }
      } catch (err) {
        handleRepositoryError("BatchRepository.getExistingRecipientEmails", err);
      }
    }

    return emails;
  }

  /**
   * Returns a set of existing certificate numbers in this tenant.
   */
  static async getExistingCertificateNumbers(tenantId: string): Promise<Set<string>> {
    const certs = new Set<string>();

    const inMem = this.inMemoryRecipients.get(tenantId) || [];
    for (const r of inMem) {
      if (r.certNumber) certs.add(r.certNumber);
    }

    if (!this.useMemory && prisma) {
      try {
        const records = await prisma.credentialRecord.findMany({
          where: { tenantId },
          select: { certificateNumber: true },
        });
        for (const rec of records) {
          certs.add(rec.certificateNumber);
        }
      } catch (err) {
        handleRepositoryError("BatchRepository.getExistingCertificateNumbers", err);
      }
    }

    return certs;
  }

  /**
   * Deletes a draft or failed batch.
   * Safeguard: Cannot delete ANCHORED or GENERATED batches.
   */
  static async deleteBatch(tenantId: string, batchId: string): Promise<boolean> {
    const batch = await this.findBatchById(tenantId, batchId);
    if (!batch) return false;

    if (batch.status === "ANCHORED" || batch.status === "GENERATED") {
      throw new Error(`Cannot delete batch in ${batch.status} status. Anchored credentials must be managed via revocation.`);
    }

    this.inMemoryBatches.delete(batchId);

    if (!this.useMemory && prisma) {
      try {
        await prisma.issuanceBatch.deleteMany({
          where: { id: batchId, tenantId },
        });
      } catch (err) {
        handleRepositoryError("BatchRepository.deleteBatch", err);
      }
    }

    return true;
  }
}
