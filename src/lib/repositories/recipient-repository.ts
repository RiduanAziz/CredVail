/**
 * CREDVAIL Recipient Repository
 * 
 * Manages institutional recipient profiles, email uniqueness scoping,
 * external identifiers, metadata, and credential associations.
 * 
 * Implements dual-mode persistence:
 * 1. Prisma Client with multi-tenant scoping (`tenantId`)
 * 2. In-Memory store for hermetic testing and local execution
 */

import { prisma, db } from "../db.ts";
import { handleRepositoryError, isInMemoryFallbackPermissible } from "../db/persistence-policy.ts";

export interface RecipientRecord {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  externalIdentifier: string | null;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRecipientInput {
  tenantId: string;
  fullName: string;
  email: string;
  externalIdentifier?: string | null;
  metadata?: Record<string, any>;
}

export interface UpdateRecipientInput {
  fullName?: string;
  email?: string;
  externalIdentifier?: string | null;
  metadata?: Record<string, any>;
}

export interface ListRecipientsOptions {
  search?: string;
  limit?: number;
  offset?: number;
}

class InMemoryRecipientStore {
  private recipients = new Map<string, RecipientRecord>();
  private credentialReferences = new Map<string, number>(); // recipientId => credentialCount

  async create(data: CreateRecipientInput): Promise<RecipientRecord> {
    const cleanEmail = data.email.trim().toLowerCase();

    // Check unique constraint [tenantId, email]
    for (const r of this.recipients.values()) {
      if (r.tenantId === data.tenantId && r.email.toLowerCase() === cleanEmail) {
        throw new Error(`Recipient with email "${cleanEmail}" already exists for this institution.`);
      }
    }

    const id = `rec_${crypto.randomUUID()}`;
    const record: RecipientRecord = {
      id,
      tenantId: data.tenantId,
      fullName: data.fullName.trim(),
      email: cleanEmail,
      externalIdentifier: data.externalIdentifier ? data.externalIdentifier.trim() : null,
      metadata: data.metadata || {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.recipients.set(id, record);
    return record;
  }

  async findById(tenantId: string, id: string): Promise<RecipientRecord | null> {
    const record = this.recipients.get(id);
    if (!record || record.tenantId !== tenantId) return null;
    return record;
  }

  async findByEmail(tenantId: string, email: string): Promise<RecipientRecord | null> {
    const cleanEmail = email.trim().toLowerCase();
    for (const r of this.recipients.values()) {
      if (r.tenantId === tenantId && r.email.toLowerCase() === cleanEmail) {
        return r;
      }
    }
    return null;
  }

  async list(
    tenantId: string,
    options: ListRecipientsOptions = {}
  ): Promise<{ items: RecipientRecord[]; total: number }> {
    let matches: RecipientRecord[] = [];
    const search = options.search?.trim().toLowerCase();

    for (const r of this.recipients.values()) {
      if (r.tenantId === tenantId) {
        if (!search) {
          matches.push(r);
        } else {
          const matchName = r.fullName.toLowerCase().includes(search);
          const matchEmail = r.email.toLowerCase().includes(search);
          const matchExt = r.externalIdentifier ? r.externalIdentifier.toLowerCase().includes(search) : false;
          if (matchName || matchEmail || matchExt) {
            matches.push(r);
          }
        }
      }
    }

    matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = matches.length;
    const offset = options.offset || 0;
    const limit = options.limit || 50;
    const items = matches.slice(offset, offset + limit);

    return { items, total };
  }

  async update(
    tenantId: string,
    id: string,
    data: UpdateRecipientInput
  ): Promise<RecipientRecord> {
    const existing = await this.findById(tenantId, id);
    if (!existing) throw new Error("Recipient not found or access denied.");

    if (data.email) {
      const cleanEmail = data.email.trim().toLowerCase();
      if (cleanEmail !== existing.email.toLowerCase()) {
        for (const r of this.recipients.values()) {
          if (r.tenantId === tenantId && r.id !== id && r.email.toLowerCase() === cleanEmail) {
            throw new Error(`Recipient with email "${cleanEmail}" already exists for this institution.`);
          }
        }
      }
    }

    const updated: RecipientRecord = {
      ...existing,
      fullName: data.fullName !== undefined ? data.fullName.trim() : existing.fullName,
      email: data.email !== undefined ? data.email.trim().toLowerCase() : existing.email,
      externalIdentifier:
        data.externalIdentifier !== undefined
          ? data.externalIdentifier
            ? data.externalIdentifier.trim()
            : null
          : existing.externalIdentifier,
      metadata: data.metadata !== undefined ? data.metadata : existing.metadata,
      updatedAt: new Date(),
    };

    this.recipients.set(id, updated);
    return updated;
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const existing = await this.findById(tenantId, id);
    if (!existing) throw new Error("Recipient not found or access denied.");

    const linkedCount = this.credentialReferences.get(id) || 0;
    if (linkedCount > 0) {
      throw new Error("Cannot delete recipient: Record is actively linked to issued credentials.");
    }

    this.recipients.delete(id);
    return true;
  }

  setCredentialReferenceCount(recipientId: string, count: number): void {
    this.credentialReferences.set(recipientId, count);
  }

  clear(): void {
    this.recipients.clear();
    this.credentialReferences.clear();
  }
}

export const inMemoryRecipientStore = new InMemoryRecipientStore();

export class RecipientRepository {
  private forceMemory: boolean;

  constructor(forceMemory: boolean = false) {
    this.forceMemory = forceMemory;
  }

  private get useMemory(): boolean {
    if (!isInMemoryFallbackPermissible()) return false;
    if (this.forceMemory) return true;
    return !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("localhost:5432");
  }

  static resetInMemoryStore(): void {
    inMemoryRecipientStore.clear();
  }

  static setCredentialReferenceCount(recipientId: string, count: number): void {
    inMemoryRecipientStore.setCredentialReferenceCount(recipientId, count);
  }

  setCredentialReferenceCount(recipientId: string, count: number): void {
    inMemoryRecipientStore.setCredentialReferenceCount(recipientId, count);
  }

  async createRecipient(data: CreateRecipientInput): Promise<RecipientRecord> {
    if (this.useMemory) {
      return inMemoryRecipientStore.create(data);
    }

    try {
      const cleanEmail = data.email.trim().toLowerCase();
      const created = await (prisma || db).recipient.create({
        data: {
          tenantId: data.tenantId,
          fullName: data.fullName.trim(),
          email: cleanEmail,
          externalIdentifier: data.externalIdentifier ? data.externalIdentifier.trim() : null,
          metadata: (data.metadata || {}) as any,
        },
      });

      return {
        id: created.id,
        tenantId: created.tenantId,
        fullName: created.fullName,
        email: created.email,
        externalIdentifier: created.externalIdentifier,
        metadata: (created.metadata as Record<string, any>) || {},
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      };
    } catch (err: any) {
      if (err.code === "P2002" || err.message?.includes("already exists")) {
        throw new Error(`Recipient with email "${data.email.trim().toLowerCase()}" already exists for this institution.`);
      }
      handleRepositoryError("RecipientRepository.createRecipient", err);
      return inMemoryRecipientStore.create(data);
    }
  }

  async getRecipientById(tenantId: string, id: string): Promise<RecipientRecord | null> {
    if (this.useMemory) {
      return inMemoryRecipientStore.findById(tenantId, id);
    }

    try {
      const record = await (prisma || db).recipient.findFirst({
        where: { id, tenantId },
      });
      if (!record) return null;

      return {
        id: record.id,
        tenantId: record.tenantId,
        fullName: record.fullName,
        email: record.email,
        externalIdentifier: record.externalIdentifier,
        metadata: (record.metadata as Record<string, any>) || {},
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
    } catch (err) {
      handleRepositoryError("RecipientRepository.getRecipientById", err);
      return inMemoryRecipientStore.findById(tenantId, id);
    }
  }

  async findByEmail(tenantId: string, email: string): Promise<RecipientRecord | null> {
    if (this.useMemory) {
      return inMemoryRecipientStore.findByEmail(tenantId, email);
    }

    try {
      const cleanEmail = email.trim().toLowerCase();
      const record = await (prisma || db).recipient.findUnique({
        where: {
          tenantId_email: {
            tenantId,
            email: cleanEmail,
          },
        },
      });
      if (!record) return null;

      return {
        id: record.id,
        tenantId: record.tenantId,
        fullName: record.fullName,
        email: record.email,
        externalIdentifier: record.externalIdentifier,
        metadata: (record.metadata as Record<string, any>) || {},
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
    } catch (err) {
      handleRepositoryError("RecipientRepository.findByEmail", err);
      return inMemoryRecipientStore.findByEmail(tenantId, email);
    }
  }

  async listRecipients(
    tenantId: string,
    options: ListRecipientsOptions = {}
  ): Promise<{ items: RecipientRecord[]; total: number }> {
    if (this.useMemory) {
      return inMemoryRecipientStore.list(tenantId, options);
    }

    try {
      const where: any = { tenantId };
      if (options.search) {
        const search = options.search.trim();
        where.OR = [
          { fullName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { externalIdentifier: { contains: search, mode: "insensitive" } },
        ];
      }

      const offset = options.offset || 0;
      const limit = options.limit || 50;

      const [items, total] = await Promise.all([
        (prisma || db).recipient.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: offset,
          take: limit,
        }),
        (prisma || db).recipient.count({ where }),
      ]);

      return {
        items: items.map((r: any) => ({
          id: r.id,
          tenantId: r.tenantId,
          fullName: r.fullName,
          email: r.email,
          externalIdentifier: r.externalIdentifier,
          metadata: (r.metadata as Record<string, any>) || {},
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
        total,
      };
    } catch (err) {
      handleRepositoryError("RecipientRepository.listRecipients", err);
      return inMemoryRecipientStore.list(tenantId, options);
    }
  }

  async updateRecipient(
    tenantId: string,
    id: string,
    data: UpdateRecipientInput
  ): Promise<RecipientRecord> {
    if (this.useMemory) {
      return inMemoryRecipientStore.update(tenantId, id, data);
    }

    try {
      const updateData: any = {};
      if (data.fullName !== undefined) updateData.fullName = data.fullName.trim();
      if (data.email !== undefined) updateData.email = data.email.trim().toLowerCase();
      if (data.externalIdentifier !== undefined) {
        updateData.externalIdentifier = data.externalIdentifier ? data.externalIdentifier.trim() : null;
      }
      if (data.metadata !== undefined) updateData.metadata = data.metadata;

      const updated = await (prisma || db).recipient.update({
        where: { id, tenantId },
        data: updateData,
      });

      return {
        id: updated.id,
        tenantId: updated.tenantId,
        fullName: updated.fullName,
        email: updated.email,
        externalIdentifier: updated.externalIdentifier,
        metadata: (updated.metadata as Record<string, any>) || {},
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    } catch (err: any) {
      if (err.code === "P2002" || err.message?.includes("already exists")) {
        throw new Error(`Recipient with email "${data.email?.trim().toLowerCase()}" already exists for this institution.`);
      }
      handleRepositoryError("RecipientRepository.updateRecipient", err);
      return inMemoryRecipientStore.update(tenantId, id, data);
    }
  }

  async deleteRecipient(tenantId: string, id: string): Promise<boolean> {
    if (this.useMemory) {
      return inMemoryRecipientStore.delete(tenantId, id);
    }

    try {
      const credCount = await (prisma || db).credentialRecord.count({
        where: { recipientId: id, tenantId },
      });

      if (credCount > 0) {
        throw new Error("Cannot delete recipient: Record is actively linked to issued credentials.");
      }

      await (prisma || db).recipient.delete({
        where: { id, tenantId },
      });
      return true;
    } catch (err: any) {
      if (err.message?.includes("linked to issued credentials")) {
        throw err;
      }
      handleRepositoryError("RecipientRepository.deleteRecipient", err);
      return inMemoryRecipientStore.delete(tenantId, id);
    }
  }
}
