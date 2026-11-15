import { describe, it, expect, beforeEach } from "vitest";
import { StatusSnapshotRepository } from "@/lib/repositories/status-snapshot-repository";

describe("Phase 12: Status Snapshot Repository Unit Tests", () => {
  const tenantA = "tnt_snap_test_a";
  const tenantB = "tnt_snap_test_b";

  beforeEach(() => {
    StatusSnapshotRepository.resetInMemoryStore();
  });

  it("1. creates and retrieves a status snapshot by epoch", async () => {
    const created = await StatusSnapshotRepository.createSnapshot({
      tenantId: tenantA,
      epoch: 1,
      bitstringGzipBase64: "H4sIC...",
      digestSha256: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    });

    expect(created.tenantId).toBe(tenantA);
    expect(created.epoch).toBe(1);
    expect(created.digestSha256).toBe("0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");

    const retrieved = await StatusSnapshotRepository.getSnapshotByEpoch(tenantA, 1);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(created.id);
  });

  it("2. resolves the latest status snapshot (highest epoch)", async () => {
    await StatusSnapshotRepository.createSnapshot({
      tenantId: tenantA,
      epoch: 1,
      bitstringGzipBase64: "epoch_1_bits",
      digestSha256: "0x1111111111111111111111111111111111111111111111111111111111111111",
    });

    await StatusSnapshotRepository.createSnapshot({
      tenantId: tenantA,
      epoch: 2,
      bitstringGzipBase64: "epoch_2_bits",
      digestSha256: "0x2222222222222222222222222222222222222222222222222222222222222222",
    });

    const latest = await StatusSnapshotRepository.getLatestSnapshot(tenantA);
    expect(latest?.epoch).toBe(2);
    expect(latest?.bitstringGzipBase64).toBe("epoch_2_bits");
  });

  it("3. lists all snapshots for a tenant sorted by epoch descending", async () => {
    await StatusSnapshotRepository.createSnapshot({ tenantId: tenantA, epoch: 1, bitstringGzipBase64: "ep1", digestSha256: "0xd1" });
    await StatusSnapshotRepository.createSnapshot({ tenantId: tenantA, epoch: 3, bitstringGzipBase64: "ep3", digestSha256: "0xd3" });
    await StatusSnapshotRepository.createSnapshot({ tenantId: tenantA, epoch: 2, bitstringGzipBase64: "ep2", digestSha256: "0xd2" });

    const list = await StatusSnapshotRepository.listSnapshots(tenantA);
    expect(list.length).toBe(3);
    expect(list[0].epoch).toBe(3);
    expect(list[1].epoch).toBe(2);
    expect(list[2].epoch).toBe(1);
  });

  it("4. updates a snapshot with on-chain anchoring details", async () => {
    await StatusSnapshotRepository.createSnapshot({
      tenantId: tenantA,
      epoch: 1,
      bitstringGzipBase64: "ep1",
      digestSha256: "0xd1",
    });

    const txHash = "0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba";
    const updated = await StatusSnapshotRepository.updateSnapshotAnchor(tenantA, 1, txHash);

    expect(updated?.onChainTxHash).toBe(txHash);
    expect(updated?.anchoredAt).not.toBeNull();

    const retrieved = await StatusSnapshotRepository.getSnapshotByEpoch(tenantA, 1);
    expect(retrieved?.onChainTxHash).toBe(txHash);
  });

  it("5. strictly enforces multi-tenant boundary isolation across snapshots", async () => {
    await StatusSnapshotRepository.createSnapshot({ tenantId: tenantA, epoch: 1, bitstringGzipBase64: "snapA", digestSha256: "0xdA" });
    await StatusSnapshotRepository.createSnapshot({ tenantId: tenantB, epoch: 1, bitstringGzipBase64: "snapB", digestSha256: "0xdB" });

    const snapA = await StatusSnapshotRepository.getSnapshotByEpoch(tenantA, 1);
    const snapB = await StatusSnapshotRepository.getSnapshotByEpoch(tenantB, 1);

    expect(snapA?.bitstringGzipBase64).toBe("snapA");
    expect(snapB?.bitstringGzipBase64).toBe("snapB");

    const listA = await StatusSnapshotRepository.listSnapshots(tenantA);
    expect(listA.length).toBe(1);
    expect(listA[0].bitstringGzipBase64).toBe("snapA");
  });
});
