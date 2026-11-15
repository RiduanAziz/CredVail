import { describe, it, expect } from "vitest";
import { CredvailMerkleTree } from "../../src/lib/crypto/merkle";
import { computeKeccak256 } from "../../src/lib/crypto/canonical";

describe("CredvailMerkleTree", () => {
  it("should construct a valid deterministic root for single leaf", () => {
    const leaf = computeKeccak256("CREDVAIL-2026-000001");
    const tree = new CredvailMerkleTree([leaf]);
    expect(tree.getRoot()).toBe(leaf);
  });

  it("should construct a valid Merkle root for even number of leaves", () => {
    const leaf1 = computeKeccak256("CREDVAIL-2026-000001");
    const leaf2 = computeKeccak256("CREDVAIL-2026-000002");
    const tree = new CredvailMerkleTree([leaf1, leaf2]);

    const expectedRoot = CredvailMerkleTree.hashPair(leaf1, leaf2);
    expect(tree.getRoot()).toBe(expectedRoot);
  });

  it("should generate and verify valid cryptographic inclusion proofs for all leaves", () => {
    const leafCount = 8;
    const leaves = Array.from({ length: leafCount }, (_, i) =>
      computeKeccak256(`CREDVAIL-2026-${String(i + 1).padStart(6, "0")}`)
    );

    const tree = new CredvailMerkleTree(leaves);
    const root = tree.getRoot();

    for (let i = 0; i < leaves.length; i++) {
      const proof = tree.getProof(i);
      const isValid = CredvailMerkleTree.verifyProof(leaves[i], proof, root);
      expect(isValid).toBe(true);
    }
  });

  it("should reject invalid leaf or tampered proof", () => {
    const leaves = [
      computeKeccak256("CREDVAIL-2026-000001"),
      computeKeccak256("CREDVAIL-2026-000002"),
      computeKeccak256("CREDVAIL-2026-000003"),
      computeKeccak256("CREDVAIL-2026-000004"),
    ];

    const tree = new CredvailMerkleTree(leaves);
    const root = tree.getRoot();
    const proof = tree.getProof(0);

    const tamperedLeaf = computeKeccak256("CREDVAIL-TAMPERED");
    expect(CredvailMerkleTree.verifyProof(tamperedLeaf, proof, root)).toBe(false);
  });
});
