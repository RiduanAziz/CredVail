import { describe, it, expect } from "vitest";
import { CredvailMerkleTree } from "@/lib/crypto/merkle";
import { computeKeccak256 } from "@/lib/crypto/canonical";

describe("OpenZeppelin-Compatible Keccak-256 Merkle Tree & Proof Generation", () => {
  it("should enforce commutative pair sorting to prevent second-preimage attacks", () => {
    const a = computeKeccak256("Leaf A");
    const b = computeKeccak256("Leaf B");

    const parentAB = CredvailMerkleTree.hashPair(a, b);
    const parentBA = CredvailMerkleTree.hashPair(b, a);

    // Parent must be identical regardless of input order
    expect(parentAB).toBe(parentBA);
  });

  it("should correctly handle single-leaf batch with root equal to leaf and empty proof", () => {
    const singleLeaf = computeKeccak256("Single Certificate Batch");
    const tree = new CredvailMerkleTree([singleLeaf]);

    expect(tree.getRoot()).toBe(singleLeaf);
    expect(tree.getLeafCount()).toBe(1);
    expect(tree.getLeaves()).toEqual([singleLeaf]);
    expect(tree.getLeaf(0)).toBe(singleLeaf);

    const proof = tree.getProof(0);
    expect(proof).toEqual([]);
    expect(CredvailMerkleTree.verifyProof(singleLeaf, proof, tree.getRoot())).toBe(true);
  });

  it("should generate and verify inclusion proofs for all leaves across odd and even batch sizes", () => {
    const batchSizes = [1, 2, 3, 4, 5, 7, 8, 9, 15, 16, 23, 32];

    for (const size of batchSizes) {
      const leaves = Array.from({ length: size }, (_, i) =>
        computeKeccak256(`BATCH-LEAF-${size}-${i}`)
      );

      const tree = new CredvailMerkleTree(leaves);
      const root = tree.getRoot();

      expect(root.startsWith("0x")).toBe(true);
      expect(root.length).toBe(66);
      expect(tree.getLeafCount()).toBe(size);

      // Verify inclusion proof for EVERY index in this tree
      for (let i = 0; i < size; i++) {
        const proof = tree.getProof(i);
        const verified = CredvailMerkleTree.verifyProof(leaves[i], proof, root);
        expect(verified).toBe(true);
      }
    }
  });

  it("should reject verification on tampered leaves, altered proofs, or incorrect roots", () => {
    const leaves = Array.from({ length: 6 }, (_, i) =>
      computeKeccak256(`Certificate-Recipient-${i}`)
    );

    const tree = new CredvailMerkleTree(leaves);
    const root = tree.getRoot();
    const targetIndex = 2;
    const validLeaf = leaves[targetIndex];
    const validProof = tree.getProof(targetIndex);

    // Baseline: Valid proof passes
    expect(CredvailMerkleTree.verifyProof(validLeaf, validProof, root)).toBe(true);

    // 1. Tampered leaf hash
    const fakeLeaf = computeKeccak256("Tampered Certificate Data");
    expect(CredvailMerkleTree.verifyProof(fakeLeaf, validProof, root)).toBe(false);

    // 2. Tampered proof element
    if (validProof.length > 0) {
      const tamperedProof = [...validProof];
      tamperedProof[0] = computeKeccak256("Altered Internal Node");
      expect(CredvailMerkleTree.verifyProof(validLeaf, tamperedProof, root)).toBe(false);
    }

    // 3. Incorrect Merkle root
    const fakeRoot = computeKeccak256("Unanchored Root");
    expect(CredvailMerkleTree.verifyProof(validLeaf, validProof, fakeRoot)).toBe(false);
  });

  it("should throw error when requesting proof for out-of-bounds indices", () => {
    const leaves = [computeKeccak256("A"), computeKeccak256("B")];
    const tree = new CredvailMerkleTree(leaves);

    expect(() => tree.getProof(-1)).toThrow(/out of bounds/);
    expect(() => tree.getProof(2)).toThrow(/out of bounds/);
    expect(() => tree.getLeaf(5)).toThrow(/out of bounds/);
  });

  it("should reject constructing a Merkle tree with zero leaves", () => {
    expect(() => new CredvailMerkleTree([])).toThrow(/empty leaves/);
  });
});
