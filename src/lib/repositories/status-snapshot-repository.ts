/**
 * CREDVAIL Status Snapshot Repository
 * 
 * Manages periodic and event-driven bitstring snapshots:
 * 1. Prisma Client with strict multi-tenant boundary scoping (tenantId)
 * 2. In-Memory store for hermetic testing and local execution
 */

import { prisma } from "../db.ts";

export interface StoredStatusSnapshot {
  id: string;
  tenantId: string;
  epoch: number;
  bitstringGzipBase64: string;
  bitstringBase64?: string;
  digestSha256: string;
  statusDigest?: string;
  onChainTxHash: string | null;
  anchoredAt: Date | null;
  createdAt: Date;
}

export interface CreateSnapshotInput {
  tenantId: string;
  epoch: number;
  bitstringGzipBase64?: string;
  bitstringBase64?: string;
  digestSha256?: string;
  statusDigest?: string;
  onChainTxHash?: string | null;
  anchoredAt?: Date | null;
  totalCredentials?: number;
  revokedCount?: number;
}

export class StatusSnapshotRepository {
  private static inMemorySnapshots = new Map<string, StoredStatusSnapshot>();
  private static useMemory = !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("localhost:5432");

  /**
   * Resets the in-memory snapshot store for hermetic test suites.
   */
  public static resetInMemoryStore(): void {
    this.inMemorySnapshots.clear();
  }

  /**
   * Creates or updates a status snapshot for a given tenant and epoch.
   */
  public static async createSnapshot(input: CreateSnapshotInput): Promise<StoredStatusSnapshot> {
    const id = `snap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const bitstring = input.bitstringGzipBase64 || input.bitstringBase64 || "";
    const digest = input.digestSha256 || input.statusDigest || "";

    const record: StoredStatusSnapshot = {
      id,
      tenantId: input.tenantId,
      epoch: input.epoch,
      bitstringGzipBase64: bitstring,
      bitstringBase64: bitstring,
      digestSha256: digest,
      statusDigest: digest,
      onChainTxHash: input.onChainTxHash || null,
      anchoredAt: input.anchoredAt || null,
      createdAt: new Date(),
    };

    if (!this.useMemory && prisma) {
      try {
        const created = await prisma.statusSnapshot.upsert({
          where: {
            tenantId_epoch: {
              tenantId: input.tenantId,
              epoch: input.epoch,
            },
          },
          create: {
            id: record.id,
            tenantId: record.tenantId,
            epoch: record.epoch,
            bitstringGzipBase64: record.bitstringGzipBase64,
            digestSha256: record.digestSha256,
            onChainTxHash: record.onChainTxHash,
            anchoredAt: record.anchoredAt,
          },
          update: {
            bitstringGzipBase64: record.bitstringGzipBase64,
            digestSha256: record.digestSha256,
            onChainTxHash: record.onChainTxHash,
            anchoredAt: record.anchoredAt,
          },
        });

        const resRecord: StoredStatusSnapshot = {
          id: created.id,
          tenantId: created.tenantId,
          epoch: created.epoch,
          bitstringGzipBase64: created.bitstringGzipBase64,
          digestSha256: created.digestSha256,
          onChainTxHash: created.onChainTxHash,
          anchoredAt: created.anchoredAt,
          createdAt: created.createdAt,
        };

        const storeKey = `${input.tenantId}:${input.epoch}`;
        this.inMemorySnapshots.set(storeKey, resRecord);
        return resRecord;
      } catch {
        // Fall back to in-memory store
      }
    }

    const storeKey = `${input.tenantId}:${input.epoch}`;
    this.inMemorySnapshots.set(storeKey, record);
    return record;
  }

  /**
   * Retrieves a status snapshot by tenant ID and epoch number.
   */
  public static async getSnapshotByEpoch(
    tenantId: string,
    epoch: number
  ): Promise<StoredStatusSnapshot | null> {
    const storeKey = `${tenantId}:${epoch}`;
    const found = this.inMemorySnapshots.get(storeKey);
    if (found) return found;

    if (!this.useMemory && prisma) {
      try {
        const dbSnapshot = await prisma.statusSnapshot.findUnique({
          where: {
            tenantId_epoch: { tenantId, epoch },
          },
        });
        if (dbSnapshot) {
          const record: StoredStatusSnapshot = {
            id: dbSnapshot.id,
            tenantId: dbSnapshot.tenantId,
            epoch: dbSnapshot.epoch,
            bitstringGzipBase64: dbSnapshot.bitstringGzipBase64,
            digestSha256: dbSnapshot.digestSha256,
            onChainTxHash: dbSnapshot.onChainTxHash,
            anchoredAt: dbSnapshot.anchoredAt,
            createdAt: dbSnapshot.createdAt,
          };
          this.inMemorySnapshots.set(storeKey, record);
          return record;
        }
      } catch {
        // Fall back
      }
    }

    return null;
  }

  /**
   * Retrieves the latest status snapshot for a tenant (highest epoch).
   */
  public static async getLatestSnapshot(tenantId: string): Promise<StoredStatusSnapshot | null> {
    let latest: StoredStatusSnapshot | null = null;
    for (const snap of this.inMemorySnapshots.values()) {
      if (snap.tenantId === tenantId) {
        if (!latest || snap.epoch > latest.epoch) {
          latest = snap;
        }
      }
    }

    if (!this.useMemory && prisma) {
      try {
        const dbSnapshot = await prisma.statusSnapshot.findFirst({
          where: { tenantId },
          orderBy: { epoch: "desc" },
        });
        if (dbSnapshot && (!latest || dbSnapshot.epoch > latest.epoch)) {
          latest = {
            id: dbSnapshot.id,
            tenantId: dbSnapshot.tenantId,
            epoch: dbSnapshot.epoch,
            bitstringGzipBase64: dbSnapshot.bitstringGzipBase64,
            digestSha256: dbSnapshot.digestSha256,
            onChainTxHash: dbSnapshot.onChainTxHash,
            anchoredAt: dbSnapshot.anchoredAt,
            createdAt: dbSnapshot.createdAt,
          };
        }
      } catch {
        // Fall back
      }
    }

    return latest;
  }

  /**
   * Lists all status snapshots for a given tenant, ordered by epoch descending.
   */
  public static async listSnapshots(tenantId: string): Promise<StoredStatusSnapshot[]> {
    const list: StoredStatusSnapshot[] = [];
    for (const snap of this.inMemorySnapshots.values()) {
      if (snap.tenantId === tenantId) {
        list.push(snap);
      }
    }

    if (!this.useMemory && prisma) {
      try {
        const dbSnapshots = await prisma.statusSnapshot.findMany({
          where: { tenantId },
          orderBy: { epoch: "desc" },
        });
        for (const dbSnapshot of dbSnapshots) {
          if (!list.some((s) => s.epoch === dbSnapshot.epoch)) {
            list.push({
              id: dbSnapshot.id,
              tenantId: dbSnapshot.tenantId,
              epoch: dbSnapshot.epoch,
              bitstringGzipBase64: dbSnapshot.bitstringGzipBase64,
              digestSha256: dbSnapshot.digestSha256,
              onChainTxHash: dbSnapshot.onChainTxHash,
              anchoredAt: dbSnapshot.anchoredAt,
              createdAt: dbSnapshot.createdAt,
            });
          }
        }
      } catch {
        // Fall back
      }
    }

    return list.sort((a, b) => b.epoch - a.epoch);
  }

  /**
   * Updates an existing snapshot with on-chain anchoring details.
   */
  public static async updateSnapshotAnchor(
    tenantId: string,
    epoch: number,
    onChainTxHash: string,
    anchoredAt: Date = new Date()
  ): Promise<StoredStatusSnapshot | null> {
    const snapshot = await this.getSnapshotByEpoch(tenantId, epoch);
    if (!snapshot) return null;

    snapshot.onChainTxHash = onChainTxHash;
    snapshot.anchoredAt = anchoredAt;

    if (!this.useMemory && prisma) {
      try {
        await prisma.statusSnapshot.update({
          where: {
            tenantId_epoch: { tenantId, epoch },
          },
          data: {
            onChainTxHash,
            anchoredAt,
          },
        });
      } catch {
        // Fall back
      }
    }

    const storeKey = `${tenantId}:${epoch}`;
    this.inMemorySnapshots.set(storeKey, snapshot);
    return snapshot;
  }
}
