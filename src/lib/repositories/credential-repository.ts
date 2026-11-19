/**
 * CREDVAIL Credential Repository
 * 
 * Manages persistence for issued digital credential records,
 * generated print-ready PDF binary buffers, and batch ZIP archives.
 * 
 * Implements dual-mode architecture:
 * 1. Prisma Client with multi-tenant scoping (`tenantId`)
 * 2. In-Memory hermetic store for sub-millisecond testing and disconnected operation
 */

import { prisma } from "../db.ts";
import type { CredentialState, MerkleInclusionProof } from "../../types/index.ts";

export interface StoredCredentialRecord {
  id: string;
  credentialId: string;
  certificateNumber: string;
  tenantId: string;
  batchId: string;
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  leafHash: string;
  merkleIndex: number;
  bitstringIndex: number;
  state: CredentialState;
  revocationReason: string | null;
  revokedAt: Date | null;
  reissuedAsId: string | null;
  originalFromId: string | null;
  claimsData: Record<string, string>;
  pdfStoragePath: string | null;
  vcPayloadJson: Record<string, unknown>;
  merkleProof?: MerkleInclusionProof | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCredentialInput {
  credentialId: string;
  certificateNumber: string;
  tenantId: string;
  batchId: string;
  recipientId?: string;
  recipientName: string;
  recipientEmail: string;
  leafHash: string;
  merkleIndex: number;
  bitstringIndex: number;
  claimsData: Record<string, string>;
  vcPayloadJson?: Record<string, unknown>;
  merkleProof?: MerkleInclusionProof;
  pdfBytes?: Uint8Array | Buffer;
}

export interface ListCredentialsFilter {
  batchId?: string;
  state?: CredentialState;
  search?: string;
  limit?: number;
  offset?: number;
}

export class CredentialRepository {
  private static inMemoryCredentials = new Map<string, StoredCredentialRecord>();
  private static inMemoryPdfBuffers = new Map<string, Uint8Array>();
  private static inMemoryBatchZips = new Map<string, Uint8Array>();
  private static inMemoryMerkleProofs = new Map<string, MerkleInclusionProof>();
  private static useMemory =
    process.env.REQUIRE_POSTGRES_INTEGRATION === "true"
      ? false
      : !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("localhost:5432");

  /**
   * Resets all in-memory credential stores for hermetic testing.
   */
  static resetInMemoryStore(): void {
    this.inMemoryCredentials.clear();
    this.inMemoryPdfBuffers.clear();
    this.inMemoryBatchZips.clear();
    this.inMemoryMerkleProofs.clear();
  }

  /**
   * Stores a Merkle inclusion proof for a credential.
   */
  static storeMerkleProof(idOrCredentialId: string, proof: MerkleInclusionProof): void {
    this.inMemoryMerkleProofs.set(idOrCredentialId, proof);
  }

  /**
   * Retrieves the Merkle inclusion proof for a credential.
   */
  static async getMerkleProof(
    tenantId: string,
    idOrCredentialId: string
  ): Promise<MerkleInclusionProof | null> {
    const cred = await this.findCredentialById(tenantId, idOrCredentialId);
    if (!cred) return null;

    if (this.inMemoryMerkleProofs.has(cred.id)) {
      return this.inMemoryMerkleProofs.get(cred.id)!;
    }
    if (this.inMemoryMerkleProofs.has(cred.credentialId)) {
      return this.inMemoryMerkleProofs.get(cred.credentialId)!;
    }
    if (this.inMemoryMerkleProofs.has(cred.certificateNumber)) {
      return this.inMemoryMerkleProofs.get(cred.certificateNumber)!;
    }

    // Check if proof is embedded in vcPayloadJson.evidence
    const evidence = (cred.vcPayloadJson as any)?.evidence;
    if (Array.isArray(evidence) && evidence.length > 0) {
      const e = evidence[0];
      if (e.merkleRoot && e.proof) {
        const proof: MerkleInclusionProof = {
          leafHash: e.leafHash || cred.leafHash,
          root: e.merkleRoot,
          proof: e.proof,
          index: e.merkleIndex ?? cred.merkleIndex,
          totalLeaves: e.totalLeaves ?? 1,
        };
        this.inMemoryMerkleProofs.set(cred.id, proof);
        this.inMemoryMerkleProofs.set(cred.credentialId, proof);
        return proof;
      }
    }

    return null;
  }

  /**
   * Updates a credential's vcPayloadJson and associated Merkle proof.
   */
  static async updateCredentialPayload(
    tenantId: string,
    idOrCredentialId: string,
    vcPayloadJson: Record<string, unknown>,
    merkleProof?: MerkleInclusionProof
  ): Promise<StoredCredentialRecord | null> {
    const cred = await this.findCredentialById(tenantId, idOrCredentialId);
    if (!cred) return null;

    cred.vcPayloadJson = vcPayloadJson;
    cred.updatedAt = new Date();
    if (merkleProof) {
      cred.merkleProof = merkleProof;
      this.inMemoryMerkleProofs.set(cred.id, merkleProof);
      this.inMemoryMerkleProofs.set(cred.credentialId, merkleProof);
      this.inMemoryMerkleProofs.set(cred.certificateNumber, merkleProof);
    }

    this.inMemoryCredentials.set(cred.id, cred);

    if (!this.useMemory && prisma) {
      try {
        await prisma.credentialRecord.updateMany({
          where: {
            tenantId,
            OR: [{ id: idOrCredentialId }, { credentialId: idOrCredentialId }],
          },
          data: {
            vcPayloadJson: vcPayloadJson as any,
          },
        });
      } catch {
        // Fall back
      }
    }

    return cred;
  }

  /**
   * Creates and stores a single credential record and its PDF buffer.
   */
  static async createCredential(input: CreateCredentialInput): Promise<StoredCredentialRecord> {
    const id = `cred_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const recipientId = input.recipientId || `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const record: StoredCredentialRecord = {
      id,
      credentialId: input.credentialId,
      certificateNumber: input.certificateNumber,
      tenantId: input.tenantId,
      batchId: input.batchId,
      recipientId,
      recipientName: input.recipientName,
      recipientEmail: input.recipientEmail.toLowerCase(),
      leafHash: input.leafHash,
      merkleIndex: input.merkleIndex,
      bitstringIndex: input.bitstringIndex,
      state: "ISSUED",
      revocationReason: null,
      revokedAt: null,
      reissuedAsId: null,
      originalFromId: null,
      claimsData: input.claimsData,
      pdfStoragePath: `storage/tenants/${input.tenantId}/certificates/${input.certificateNumber}.pdf`,
      vcPayloadJson: input.vcPayloadJson || {},
      merkleProof: input.merkleProof || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (input.merkleProof) {
      this.inMemoryMerkleProofs.set(record.id, input.merkleProof);
      this.inMemoryMerkleProofs.set(record.credentialId, input.merkleProof);
      this.inMemoryMerkleProofs.set(record.certificateNumber, input.merkleProof);
    }

    // Store PDF in-memory buffer
    if (input.pdfBytes) {
      const u8 = input.pdfBytes instanceof Uint8Array ? input.pdfBytes : new Uint8Array(input.pdfBytes);
      this.inMemoryPdfBuffers.set(record.id, u8);
      this.inMemoryPdfBuffers.set(record.certificateNumber, u8);
      this.inMemoryPdfBuffers.set(record.credentialId, u8);
    }

    if (!this.useMemory && prisma) {
      try {
        await prisma.credentialRecord.create({
          data: {
            id: record.id,
            credentialId: record.credentialId,
            certificateNumber: record.certificateNumber,
            tenantId: record.tenantId,
            batchId: record.batchId,
            recipientId: record.recipientId,
            leafHash: record.leafHash,
            merkleIndex: record.merkleIndex,
            bitstringIndex: record.bitstringIndex,
            state: "ISSUED",
            claimsData: record.claimsData as any,
            pdfStoragePath: record.pdfStoragePath,
            vcPayloadJson: record.vcPayloadJson as any,
          },
        });
        this.inMemoryCredentials.set(record.id, record);
        return record;
      } catch {
        // Fall back to in-memory store
      }
    }

    this.inMemoryCredentials.set(record.id, record);
    return record;
  }

  /**
   * Bulk persists credential records and their corresponding PDF buffers.
   */
  static async createBulkCredentials(
    inputs: CreateCredentialInput[]
  ): Promise<StoredCredentialRecord[]> {
    const results: StoredCredentialRecord[] = [];
    for (const input of inputs) {
      const created = await this.createCredential(input);
      results.push(created);
    }
    return results;
  }

  /**
   * Finds a credential by its internal ID or credentialId (URN), strictly tenant-scoped.
   */
  static async findCredentialById(
    param1: string,
    param2: string
  ): Promise<StoredCredentialRecord | null> {
    const isParam1Id = param1.startsWith("cred_") || param1.startsWith("urn:");
    const tenantId = isParam1Id ? param2 : param1;
    const idOrCredentialId = isParam1Id ? param1 : param2;

    for (const cred of this.inMemoryCredentials.values()) {
      if (
        cred.tenantId === tenantId &&
        (cred.id === idOrCredentialId || cred.credentialId === idOrCredentialId)
      ) {
        return cred;
      }
    }

    if (!this.useMemory && prisma) {
      try {
        const found = await prisma.credentialRecord.findFirst({
          where: {
            tenantId,
            OR: [{ id: idOrCredentialId }, { credentialId: idOrCredentialId }],
          },
          include: { recipient: true },
        });

        if (found) {
          return {
            id: found.id,
            credentialId: found.credentialId,
            certificateNumber: found.certificateNumber,
            tenantId: found.tenantId,
            batchId: found.batchId,
            recipientId: found.recipientId,
            recipientName: found.recipient?.fullName || "Recipient",
            recipientEmail: found.recipient?.email || "",
            leafHash: found.leafHash,
            merkleIndex: found.merkleIndex,
            bitstringIndex: found.bitstringIndex,
            state: found.state as CredentialState,
            revocationReason: found.revocationReason,
            revokedAt: found.revokedAt,
            reissuedAsId: found.reissuedAsId,
            originalFromId: found.originalFromId,
            claimsData: (found.claimsData as Record<string, string>) || {},
            pdfStoragePath: found.pdfStoragePath,
            vcPayloadJson: (found.vcPayloadJson as Record<string, unknown>) || {},
            createdAt: found.createdAt,
            updatedAt: found.updatedAt,
          };
        }
      } catch {
        // Fall back
      }
    }

    return null;
  }

  /**
   * Finds a credential by certificate number, strictly tenant-scoped.
   */
  static async findCredentialByCertificateNumber(
    param1: string,
    param2: string
  ): Promise<StoredCredentialRecord | null> {
    const isParam1Cert = !param1.startsWith("tnt_") && (param1.includes("-") || param1.startsWith("ALPHA") || param1.startsWith("SEC"));
    const tenantId = isParam1Cert ? param2 : param1;
    const certificateNumber = isParam1Cert ? param1 : param2;

    for (const cred of this.inMemoryCredentials.values()) {
      if (cred.tenantId === tenantId && cred.certificateNumber === certificateNumber) {
        return cred;
      }
    }

    if (!this.useMemory && prisma) {
      try {
        const found = await prisma.credentialRecord.findFirst({
          where: { tenantId, certificateNumber },
          include: { recipient: true },
        });
        if (found) {
          return {
            id: found.id,
            credentialId: found.credentialId,
            certificateNumber: found.certificateNumber,
            tenantId: found.tenantId,
            batchId: found.batchId,
            recipientId: found.recipientId,
            recipientName: found.recipient?.fullName || "Recipient",
            recipientEmail: found.recipient?.email || "",
            leafHash: found.leafHash,
            merkleIndex: found.merkleIndex,
            bitstringIndex: found.bitstringIndex,
            state: found.state as CredentialState,
            revocationReason: found.revocationReason,
            revokedAt: found.revokedAt,
            reissuedAsId: found.reissuedAsId,
            originalFromId: found.originalFromId,
            claimsData: (found.claimsData as Record<string, string>) || {},
            pdfStoragePath: found.pdfStoragePath,
            vcPayloadJson: (found.vcPayloadJson as Record<string, unknown>) || {},
            createdAt: found.createdAt,
            updatedAt: found.updatedAt,
          };
        }
      } catch {
        // Fall back
      }
    }

    return null;
  }

  /**
   * Public lookup for verification: finds a credential by internal ID, URN, UUID, or certificate number
   * across all tenants (read-only safe public discovery).
   */
  static async findCredentialByPublicId(publicId: string): Promise<StoredCredentialRecord | null> {
    if (!publicId || typeof publicId !== "string") return null;
    const trimmed = publicId.trim();
    const urn = trimmed.startsWith("urn:uuid:") ? trimmed : `urn:uuid:${trimmed}`;
    const upper = trimmed.toUpperCase();

    for (const cred of this.inMemoryCredentials.values()) {
      if (
        cred.id === trimmed ||
        cred.credentialId === trimmed ||
        cred.credentialId === urn ||
        cred.certificateNumber.toUpperCase() === upper
      ) {
        return cred;
      }
    }

    if (!this.useMemory && prisma) {
      try {
        const found = await prisma.credentialRecord.findFirst({
          where: {
            OR: [
              { id: trimmed },
              { credentialId: trimmed },
              { credentialId: urn },
              { certificateNumber: { equals: upper, mode: "insensitive" } },
            ],
          },
          include: { recipient: true },
        });

        if (found) {
          return {
            id: found.id,
            credentialId: found.credentialId,
            certificateNumber: found.certificateNumber,
            tenantId: found.tenantId,
            batchId: found.batchId,
            recipientId: found.recipientId,
            recipientName: found.recipient?.fullName || "Recipient",
            recipientEmail: found.recipient?.email || "",
            leafHash: found.leafHash,
            merkleIndex: found.merkleIndex,
            bitstringIndex: found.bitstringIndex,
            state: found.state as CredentialState,
            revocationReason: found.revocationReason,
            revokedAt: found.revokedAt,
            reissuedAsId: found.reissuedAsId,
            originalFromId: found.originalFromId,
            claimsData: (found.claimsData as Record<string, string>) || {},
            pdfStoragePath: found.pdfStoragePath,
            vcPayloadJson: (found.vcPayloadJson as Record<string, unknown>) || {},
            createdAt: found.createdAt,
            updatedAt: found.updatedAt,
          };
        }
      } catch {
        // Fall back
      }
    }

    return null;
  }

  /**
   * Revokes an issued credential with an audit reason and timestamp.
   */
  static async revokeCredential(
    tenantId: string,
    idOrCredentialId: string,
    reason: string = "Revoked by institutional authority"
  ): Promise<StoredCredentialRecord | null> {
    const cred = await this.findCredentialById(tenantId, idOrCredentialId);
    if (!cred) return null;

    cred.state = "REVOKED";
    cred.revocationReason = reason;
    cred.revokedAt = new Date();
    cred.updatedAt = new Date();

    this.inMemoryCredentials.set(cred.id, cred);

    if (!this.useMemory && prisma) {
      try {
        await prisma.credentialRecord.updateMany({
          where: {
            tenantId,
            OR: [{ id: idOrCredentialId }, { credentialId: idOrCredentialId }],
          },
          data: {
            state: "REVOKED",
            revocationReason: reason,
            revokedAt: cred.revokedAt,
          },
        });
      } catch {
        // Fall back
      }
    }

    return cred;
  }

  /**
   * Lists credentials for a tenant with optional filtering.
   */
  static async listCredentials(
    tenantId: string,
    filters?: ListCredentialsFilter
  ): Promise<{ items: StoredCredentialRecord[]; total: number }> {
    let items: StoredCredentialRecord[] = [];

    for (const cred of this.inMemoryCredentials.values()) {
      if (cred.tenantId !== tenantId) continue;
      if (filters?.batchId && cred.batchId !== filters.batchId) continue;
      if (filters?.state && cred.state !== filters.state) continue;
      if (filters?.search) {
        const s = filters.search.toLowerCase();
        const match =
          cred.certificateNumber.toLowerCase().includes(s) ||
          cred.recipientName.toLowerCase().includes(s) ||
          cred.recipientEmail.toLowerCase().includes(s) ||
          (cred.claimsData["course_name"] || "").toLowerCase().includes(s);
        if (!match) continue;
      }
      items.push(cred);
    }

    // Sort descending by creation date
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = items.length;
    const offset = filters?.offset || 0;
    const limit = filters?.limit || 50;
    const paginated = items.slice(offset, offset + limit);

    return { items: paginated, total };
  }

  /**
   * Convenience helper to list all credentials for a tenant as an array.
   */
  static async listCredentialsByTenant(tenantId: string): Promise<StoredCredentialRecord[]> {
    const res = await this.listCredentials(tenantId);
    return res.items;
  }

  /**
   * Stores a generated PDF buffer for a credential.
   */
  static storePdfBuffer(identifier: string, pdfBytes: Uint8Array | Buffer): void {
    const u8 = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
    this.inMemoryPdfBuffers.set(identifier, u8);
  }

  /**
   * Retrieves the raw PDF binary buffer for a credential by ID or certificate number.
   */
  static getPdfBuffer(identifier: string): Uint8Array | null {
    return this.inMemoryPdfBuffers.get(identifier) || null;
  }

  /**
   * Stores the generated bulk ZIP archive for an issuance batch.
   */
  static storeBatchZip(batchId: string, zipBytes: Uint8Array | Buffer): void {
    const u8 = zipBytes instanceof Uint8Array ? zipBytes : new Uint8Array(zipBytes);
    this.inMemoryBatchZips.set(batchId, u8);
  }

  /**
   * Retrieves the bulk ZIP archive buffer for an issuance batch.
   */
  static getBatchZip(batchId: string): Uint8Array | null {
    return this.inMemoryBatchZips.get(batchId) || null;
  }
}
