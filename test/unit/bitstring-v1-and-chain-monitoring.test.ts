import { describe, it, expect, beforeEach } from "vitest";
import { StatusListService } from "@/lib/services/status-list-service";
import { BlockchainService } from "@/lib/blockchain/blockchain-service";

describe("Phase 11 & Phase 12: W3C Bitstring Status List v1.0 & Chain Receipt Monitoring", () => {
  beforeEach(() => {
    StatusListService.resetInMemoryStore();
    BlockchainService.resetSimulatedState();
  });

  it("11.1 encodes and decodes multibase 'u' GZIP bitstrings and builds W3C BitstringStatusList v1.0 credentials", () => {
    const bitstring = StatusListService.createBitstring();
    StatusListService.setBit(bitstring, 14, 1);
    StatusListService.setBit(bitstring, 1024, 1);

    const encoded = StatusListService.encodeMultibaseBitstring(bitstring);
    expect(encoded.startsWith("u")).toBe(true);
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");

    const decoded = StatusListService.decodeMultibaseBitstring(encoded);
    expect(StatusListService.getBit(decoded, 14)).toBe(1);
    expect(StatusListService.getBit(decoded, 1024)).toBe(1);
    expect(StatusListService.getBit(decoded, 15)).toBe(0);

    const vcV1 = StatusListService.buildBitstringStatusListCredential({
      tenantSlug: "cambridge-demo",
      tenantName: "Cambridge Demo",
      statusEpoch: 1,
      bufferOrGzipBase64: bitstring,
      issuerDid: "did:web:credvail.io:tenants:cambridge-demo",
      statusPurpose: "revocation",
    });

    expect(vcV1["@context"]).toEqual(["https://www.w3.org/ns/credentials/v2"]);
    expect(vcV1.type).toContain("BitstringStatusListCredential");
    expect(vcV1.credentialSubject.type).toBe("BitstringStatusList");
    expect(vcV1.credentialSubject.encodedList).toBe(encoded);

    // Reject non-multibase inputs
    expect(() => StatusListService.decodeMultibaseBitstring("invalid-no-u-prefix")).toThrow(
      /expected 'u' prefix/i
    );
  });

  it("12.1 tracks transaction receipts, confirmation depth, and performs idempotent anchorBatchWithRetry", async () => {
    const merkleRoot = "0x" + "ef".repeat(32);
    const first = await BlockchainService.anchorBatchWithRetry(
      "cambridge-demo",
      "batch-chain-1",
      merkleRoot,
      25
    );
    expect(first.alreadyAnchored).toBe(false);
    expect(first.attemptCount).toBe(1);

    const receipt = await BlockchainService.getTransactionReceiptStatus(first.txHash, 1);
    expect(receipt.status).toBe("CONFIRMED");
    expect(receipt.blockNumber).toBe(first.blockNumber);
    expect(receipt.confirmations).toBeGreaterThanOrEqual(1);

    // Unknown valid-format hash returns NOT_FOUND in simulated mode
    const unknown = await BlockchainService.getTransactionReceiptStatus("0x" + "aa".repeat(32));
    expect(unknown.status).toBe("NOT_FOUND");

    // Repeated retry call does NOT re-submit duplicate tx or throw "Batch already anchored"
    const second = await BlockchainService.anchorBatchWithRetry(
      "cambridge-demo",
      "batch-chain-1",
      merkleRoot,
      25,
      { existingTxHash: first.txHash }
    );
    expect(second.alreadyAnchored).toBe(true);
    expect(second.attemptCount).toBe(0);
    expect(second.txHash).toBe(first.txHash);
  });
});
