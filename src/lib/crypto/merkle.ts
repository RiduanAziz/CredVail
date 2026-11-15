import { keccak256, concat } from "viem";

/**
 * Deterministic Keccak-256 Merkle Tree matching OpenZeppelin MerkleProof.sol
 * and CredvailRegistry.sol.
 */
export class CredvailMerkleTree {
  private leaves: `0x${string}`[];
  private layers: `0x${string}`[][];

  constructor(leaves: `0x${string}`[]) {
    if (leaves.length === 0) {
      throw new Error("Cannot construct Merkle tree with empty leaves");
    }
    this.leaves = [...leaves];
    this.layers = [this.leaves];
    this.buildTree();
  }

  /**
   * Hashes two adjacent nodes in sorted order to prevent second-preimage attacks.
   */
  public static hashPair(a: `0x${string}`, b: `0x${string}`): `0x${string}` {
    return a <= b
      ? keccak256(concat([a, b]))
      : keccak256(concat([b, a]));
  }

  private buildTree(): void {
    let currentLayer = this.layers[0];

    while (currentLayer.length > 1) {
      const nextLayer: `0x${string}`[] = [];

      for (let i = 0; i < currentLayer.length; i += 2) {
        if (i + 1 < currentLayer.length) {
          nextLayer.push(CredvailMerkleTree.hashPair(currentLayer[i], currentLayer[i + 1]));
        } else {
          // Odd leaf: propagate to next layer
          nextLayer.push(currentLayer[i]);
        }
      }

      this.layers.push(nextLayer);
      currentLayer = nextLayer;
    }
  }

  /**
   * Returns the 32-byte hexadecimal Merkle root.
   */
  public getRoot(): `0x${string}` {
    return this.layers[this.layers.length - 1][0];
  }

  /**
   * Returns a copy of the ordered leaf hashes.
   */
  public getLeaves(): `0x${string}`[] {
    return [...this.leaves];
  }

  /**
   * Returns the total count of leaves in this Merkle tree.
   */
  public getLeafCount(): number {
    return this.leaves.length;
  }

  /**
   * Returns the leaf at the specified index.
   */
  public getLeaf(index: number): `0x${string}` {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error(`Leaf index ${index} out of bounds`);
    }
    return this.leaves[index];
  }

  /**
   * Generates a cryptographic inclusion proof for the leaf at the specified index.
   */
  public getProof(index: number): `0x${string}`[] {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error(`Leaf index ${index} out of bounds (total leaves: ${this.leaves.length})`);
    }

    const proof: `0x${string}`[] = [];
    let currentIndex = index;

    for (let layerIndex = 0; layerIndex < this.layers.length - 1; layerIndex++) {
      const layer = this.layers[layerIndex];
      const isRightNode = currentIndex % 2 === 1;
      const pairIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

      if (pairIndex < layer.length) {
        proof.push(layer[pairIndex]);
      }

      currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
  }

  /**
   * Validates a leaf inclusion proof against a specified Merkle root.
   */
  public static verifyProof(
    leaf: `0x${string}`,
    proof: `0x${string}`[],
    root: `0x${string}`
  ): boolean {
    let computedHash = leaf;

    for (const element of proof) {
      computedHash = CredvailMerkleTree.hashPair(computedHash, element);
    }

    return computedHash.toLowerCase() === root.toLowerCase();
  }
}
