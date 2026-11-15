import { describe, it, expect, beforeEach } from "vitest";
import { BlockchainService } from "@/lib/blockchain/blockchain-service";
import { CredvailMerkleTree } from "@/lib/crypto/merkle";
import { keccak256, toHex, stringToBytes } from "viem";

describe("Phase 9: CredvailRegistry Smart Contract & Blockchain Service", () => {
  beforeEach(() => {
    BlockchainService.resetSimulatedState();
  });

  describe("Deterministic Hash Derivation & Multi-Tenant Partitioning", () => {
    it("should compute deterministic 32-byte tenant hashes from slugs", () => {
      const hash1 = BlockchainService.computeTenantHash("harvard");
      const hash2 = BlockchainService.computeTenantHash("HARVARD ");
      const hash3 = BlockchainService.computeTenantHash("stanford");

      expect(hash1).toBe(hash2); // Case & whitespace insensitive
      expect(hash1).not.toBe(hash3);
      expect(hash1.startsWith("0x")).toBe(true);
      expect(hash1.length).toBe(66);
    });

    it("should compute deterministic 32-byte batch hashes", () => {
      const bHash1 = BlockchainService.computeBatchHash("BATCH-2026-0001");
      const bHash2 = BlockchainService.computeBatchHash("BATCH-2026-0001");
      const bHash3 = BlockchainService.computeBatchHash("BATCH-2026-0002");

      expect(bHash1).toBe(bHash2);
      expect(bHash1).not.toBe(bHash3);
      expect(bHash1.length).toBe(66);
    });

    it("should format arbitrary hex strings into standardized 32-byte bytes32", () => {
      const formatted = BlockchainService.formatBytes32("abcd");
      expect(formatted.startsWith("0x")).toBe(true);
      expect(formatted.length).toBe(66);
      expect(formatted.endsWith("abcd")).toBe(true);
    });
  });

  describe("Institutional Key Epoch Governance on Ethereum", () => {
    it("should register an initial key epoch on-chain", async () => {
      const fp = keccak256(toHex("pubkey-fingerprint-epoch-1"));
      const result = await BlockchainService.registerIssuerKey("mit", 1, fp);

      expect(result.txHash.startsWith("0x")).toBe(true);
      expect(result.blockNumber).toBeGreaterThan(0);
      expect(result.explorerUrl).toContain(result.txHash);

      const onChain = await BlockchainService.getIssuerKey("mit", 1);
      expect(onChain).not.toBeNull();
      expect(onChain?.exists).toBe(true);
      expect(onChain?.publicKeyFingerprint.toLowerCase()).toBe(fp.toLowerCase());
      expect(onChain?.isCompromised).toBe(false);
    });

    it("should reject registering an already existing key epoch", async () => {
      const fp = keccak256(toHex("pubkey-fingerprint-epoch-1"));
      await BlockchainService.registerIssuerKey("mit", 1, fp);

      await expect(
        BlockchainService.registerIssuerKey("mit", 1, fp)
      ).rejects.toThrow(/Key epoch already exists/);
    });

    it("should rotate an issuer key to the next epoch on-chain", async () => {
      const fp1 = keccak256(toHex("pubkey-epoch-1"));
      const fp2 = keccak256(toHex("pubkey-epoch-2"));

      await BlockchainService.registerIssuerKey("mit", 1, fp1);
      const rotResult = await BlockchainService.rotateIssuerKey("mit", 1, 2, fp2);

      expect(rotResult.txHash.startsWith("0x")).toBe(true);

      const key2 = await BlockchainService.getIssuerKey("mit", 2);
      expect(key2?.exists).toBe(true);
      expect(key2?.publicKeyFingerprint.toLowerCase()).toBe(fp2.toLowerCase());
    });

    it("should reject rotating to a lower or non-advancing epoch", async () => {
      const fp = keccak256(toHex("pubkey"));
      await BlockchainService.registerIssuerKey("mit", 2, fp);

      await expect(
        BlockchainService.rotateIssuerKey("mit", 2, 1, fp)
      ).rejects.toThrow(/New epoch must be greater than old epoch/);
    });

    it("should flag a key epoch as compromised on-chain (SEC-09)", async () => {
      const fp = keccak256(toHex("pubkey-compromised"));
      await BlockchainService.registerIssuerKey("mit", 1, fp);

      const compTime = 1763200000;
      const compResult = await BlockchainService.flagKeyCompromised("mit", 1, compTime);

      expect(compResult.txHash.startsWith("0x")).toBe(true);

      const key = await BlockchainService.getIssuerKey("mit", 1);
      expect(key?.isCompromised).toBe(true);
      expect(key?.compromisedAt).toBe(compTime);

      // Subsequent attempt must fail
      await expect(
        BlockchainService.flagKeyCompromised("mit", 1, compTime)
      ).rejects.toThrow(/Key already flagged compromised/);
    });
  });

  describe("Batch Merkle Root Anchoring & Gas Scaling", () => {
    it("should anchor a batch Merkle root to the registry contract", async () => {
      const leaves = [
        keccak256(toHex("leaf-1")),
        keccak256(toHex("leaf-2")),
        keccak256(toHex("leaf-3")),
      ];
      const tree = new CredvailMerkleTree(leaves);
      const root = tree.getRoot();

      const result = await BlockchainService.anchorBatch("berkeley", "BATCH-001", root, 3);
      expect(result.txHash.startsWith("0x")).toBe(true);
      expect(result.blockNumber).toBeGreaterThan(0);
      expect(result.explorerUrl).toContain("sepolia.etherscan.io");

      const onChainBatch = await BlockchainService.getBatch("berkeley", "BATCH-001");
      expect(onChainBatch).not.toBeNull();
      expect(onChainBatch?.exists).toBe(true);
      expect(onChainBatch?.leafCount).toBe(3);
      expect(onChainBatch?.merkleRoot.toLowerCase()).toBe(root.toLowerCase());
    });

    it("should reject anchoring an already anchored batch", async () => {
      const root = keccak256(toHex("merkle-root"));
      await BlockchainService.anchorBatch("berkeley", "BATCH-DUP", root, 10);

      await expect(
        BlockchainService.anchorBatch("berkeley", "BATCH-DUP", root, 10)
      ).rejects.toThrow(/Batch already anchored/);
    });

    it("should reject anchoring with zero leaf count", async () => {
      const root = keccak256(toHex("root"));
      await expect(
        BlockchainService.anchorBatch("berkeley", "BATCH-EMPTY", root, 0)
      ).rejects.toThrow(/Leaf count must be positive/);
    });
  });

  describe("OpenZeppelin-Compatible On-Chain Merkle Proof Verification", () => {
    it("should verify valid inclusion proofs across multi-leaf trees", async () => {
      const leaves = [
        keccak256(toHex("cert-alice")),
        keccak256(toHex("cert-bob")),
        keccak256(toHex("cert-charlie")),
        keccak256(toHex("cert-david")),
      ];
      const tree = new CredvailMerkleTree(leaves);
      const root = tree.getRoot();

      await BlockchainService.anchorBatch("stanford", "BATCH-4LEAVES", root, leaves.length);

      // Verify each leaf's inclusion proof
      for (let i = 0; i < leaves.length; i++) {
        const proof = tree.getProof(i);
        const verified = await BlockchainService.verifyCredentialProof(
          "stanford",
          "BATCH-4LEAVES",
          leaves[i],
          proof
        );
        expect(verified).toBe(true);
      }
    });

    it("should reject tampered leaf hashes", async () => {
      const leaves = [keccak256(toHex("cert-1")), keccak256(toHex("cert-2"))];
      const tree = new CredvailMerkleTree(leaves);
      await BlockchainService.anchorBatch("stanford", "BATCH-TAMPER", tree.getRoot(), 2);

      const fakeLeaf = keccak256(toHex("cert-forged"));
      const proof = tree.getProof(0);

      const verified = await BlockchainService.verifyCredentialProof(
        "stanford",
        "BATCH-TAMPER",
        fakeLeaf,
        proof
      );
      expect(verified).toBe(false);
    });

    it("should reject tampered proof siblings", async () => {
      const leaves = [keccak256(toHex("cert-1")), keccak256(toHex("cert-2"))];
      const tree = new CredvailMerkleTree(leaves);
      await BlockchainService.anchorBatch("stanford", "BATCH-PROOF-TAMPER", tree.getRoot(), 2);

      const badProof = [keccak256(toHex("tampered-sibling"))];
      const verified = await BlockchainService.verifyCredentialProof(
        "stanford",
        "BATCH-PROOF-TAMPER",
        leaves[0],
        badProof
      );
      expect(verified).toBe(false);
    });

    it("should enforce tenant isolation during proof verification", async () => {
      const leaves = [keccak256(toHex("cert-secret"))];
      const tree = new CredvailMerkleTree(leaves);
      await BlockchainService.anchorBatch("tenant-a", "BATCH-ISOLATED", tree.getRoot(), 1);

      // Attempting to verify against tenant-b must fail
      const verified = await BlockchainService.verifyCredentialProof(
        "tenant-b",
        "BATCH-ISOLATED",
        leaves[0],
        []
      );
      expect(verified).toBe(false);
    });
  });

  describe("Status List Digest Anchoring", () => {
    it("should anchor W3C bitstring status list digest on-chain", async () => {
      const digest = keccak256(toHex("raw-bitstring-gzip-bytes"));
      const result = await BlockchainService.anchorStatusDigest("oxford", 1, digest);

      expect(result.txHash.startsWith("0x")).toBe(true);

      const onChain = await BlockchainService.getStatusDigest("oxford", 1);
      expect(onChain).not.toBeNull();
      expect(onChain?.exists).toBe(true);
      expect(onChain?.digestSha256.toLowerCase()).toBe(digest.toLowerCase());
    });

    it("should reject duplicate status epoch anchoring", async () => {
      const digest = keccak256(toHex("digest"));
      await BlockchainService.anchorStatusDigest("oxford", 1, digest);

      await expect(
        BlockchainService.anchorStatusDigest("oxford", 1, digest)
      ).rejects.toThrow(/Status epoch already exists/);
    });
  });

  describe("Network Status & Environment Reporting", () => {
    it("should report valid Sepolia chain configuration", () => {
      const status = BlockchainService.getNetworkStatus();
      expect(status.chainId).toBe(11155111);
      expect(status.chainName).toBe("Ethereum Sepolia");
      expect(status.contractAddress.startsWith("0x")).toBe(true);
      expect(status.explorerBaseUrl).toBe("https://sepolia.etherscan.io");
      expect(typeof status.isSimulated).toBe("boolean");
    });
  });
});
