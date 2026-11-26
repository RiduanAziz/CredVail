import crypto from "node:crypto";
import { db } from "../db.ts";
import { handleRepositoryError, isInMemoryFallbackPermissible } from "../db/persistence-policy.ts";

export type OutboxEventStatus = "PENDING" | "PROCESSED" | "FAILED";
export type OutboxEventType =
  | "CREDENTIAL_GENERATED"
  | "CLAIM_INVITATION_READY"
  | "ANCHOR_REQUESTED";

export interface BatchOutboxEventRecord {
  id: string;
  tenantId: string;
  batchId: string;
  credentialId: string;
  certificateNumber: string;
  recipientEmail: string;
  eventType: OutboxEventType;
  status: OutboxEventStatus;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export class BatchOutboxRepository {
  private static outboxEvents = new Map<string, BatchOutboxEventRecord[]>();
  private static idempotencyResults = new Map<string, unknown>();

  private static get useMemoryOnly(): boolean {
    if (!isInMemoryFallbackPermissible()) return false;
    return !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("localhost:5432");
  }

  static resetForTesting(): void {
    this.outboxEvents.clear();
    this.idempotencyResults.clear();
  }

  private static idempotencyMapKey(tenantId: string, batchId: string, key: string): string {
    return crypto
      .createHash("sha256")
      .update(`${tenantId}:${batchId}:${key.trim()}`)
      .digest("hex");
  }

  static async getIdempotentResult<T>(
    tenantId: string,
    batchId: string,
    idempotencyKey?: string
  ): Promise<T | null> {
    if (!idempotencyKey || !idempotencyKey.trim()) return null;
    const keyHash = this.idempotencyMapKey(tenantId, batchId, idempotencyKey);
    const cached = this.idempotencyResults.get(keyHash);
    if (cached) {
      return cached as T;
    }

    if (this.useMemoryOnly) return null;

    try {
      const existing = await db.auditLog.findFirst({
        where: {
          tenantId,
          action: "BATCH_IDEMPOTENCY_SNAPSHOT",
          resourceId: keyHash,
        },
        orderBy: { createdAt: "desc" },
      });
      if (existing && existing.metadata && typeof existing.metadata === "object") {
        const meta = existing.metadata as Record<string, unknown>;
        if (meta.resultSnapshot) {
          this.idempotencyResults.set(keyHash, meta.resultSnapshot);
          return meta.resultSnapshot as T;
        }
      }
    } catch (err) {
      handleRepositoryError("BatchOutboxRepository.getIdempotentResult", err);
    }

    return null;
  }

  static async saveIdempotentResult<T>(
    tenantId: string,
    batchId: string,
    idempotencyKey: string | undefined,
    resultSnapshot: T
  ): Promise<void> {
    if (!idempotencyKey || !idempotencyKey.trim()) return;
    const keyHash = this.idempotencyMapKey(tenantId, batchId, idempotencyKey);
    this.idempotencyResults.set(keyHash, resultSnapshot);

    if (this.useMemoryOnly) return;

    try {
      await db.auditLog.create({
        data: {
          tenantId,
          action: "BATCH_IDEMPOTENCY_SNAPSHOT",
          resourceType: "IssuanceBatch",
          resourceId: keyHash,
          metadata: {
            batchId,
            resultSnapshot: resultSnapshot as any,
          },
          ipHash: "0000000000000000000000000000000000000000000000000000000000000000",
        },
      });
    } catch (err) {
      handleRepositoryError("BatchOutboxRepository.saveIdempotentResult", err);
    }
  }

  static async enqueueEvent(input: {
    tenantId: string;
    batchId: string;
    credentialId: string;
    certificateNumber: string;
    recipientEmail: string;
    eventType: OutboxEventType;
    status?: OutboxEventStatus;
    lastError?: string | null;
  }): Promise<BatchOutboxEventRecord> {
    const now = new Date().toISOString();
    const record: BatchOutboxEventRecord = {
      id: `outbox_${crypto.randomUUID()}`,
      tenantId: input.tenantId,
      batchId: input.batchId,
      credentialId: input.credentialId,
      certificateNumber: input.certificateNumber,
      recipientEmail: input.recipientEmail,
      eventType: input.eventType,
      status: input.status || "PENDING",
      attemptCount: 1,
      lastError: input.lastError || null,
      createdAt: now,
      updatedAt: now,
    };

    const key = `${input.tenantId}:${input.batchId}`;
    const existing = this.outboxEvents.get(key) || [];
    existing.push(record);
    this.outboxEvents.set(key, existing);

    if (!this.useMemoryOnly) {
      try {
        await db.auditLog.create({
          data: {
            tenantId: input.tenantId,
            action: `OUTBOX_${record.eventType}`,
            resourceType: "BatchOutboxEvent",
            resourceId: record.id,
            metadata: record as any,
            ipHash: "0000000000000000000000000000000000000000000000000000000000000000",
          },
        });
      } catch (err) {
        handleRepositoryError("BatchOutboxRepository.enqueueEvent", err);
      }
    }

    return record;
  }

  static async listEvents(tenantId: string, batchId: string): Promise<BatchOutboxEventRecord[]> {
    const key = `${tenantId}:${batchId}`;
    const local = this.outboxEvents.get(key);
    if (local && local.length > 0) {
      return [...local];
    }

    if (this.useMemoryOnly) return [];

    try {
      const rows = await db.auditLog.findMany({
        where: {
          tenantId,
          resourceType: "BatchOutboxEvent",
        },
        orderBy: { createdAt: "asc" },
      });
      const matching = rows
        .map((r) => r.metadata as unknown as BatchOutboxEventRecord)
        .filter((m) => m && m.batchId === batchId);
      if (matching.length > 0) {
        this.outboxEvents.set(key, matching);
      }
      return matching;
    } catch (err) {
      handleRepositoryError("BatchOutboxRepository.listEvents", err);
      return [];
    }
  }

  static async updateEventStatus(
    tenantId: string,
    batchId: string,
    eventId: string,
    status: OutboxEventStatus,
    lastError?: string | null
  ): Promise<BatchOutboxEventRecord | null> {
    const key = `${tenantId}:${batchId}`;
    const list = this.outboxEvents.get(key) || [];
    const target = list.find((e) => e.id === eventId);
    if (!target) return null;

    target.status = status;
    target.attemptCount += 1;
    target.lastError = lastError ?? null;
    target.updatedAt = new Date().toISOString();
    this.outboxEvents.set(key, list);
    return target;
  }
}
