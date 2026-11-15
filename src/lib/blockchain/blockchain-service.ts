/**
 * CREDVAIL Blockchain Service
 * 
 * Handles multi-tenant institutional registry interactions, key epoch governance,
 * and batch Merkle root anchoring on Ethereum Sepolia (Chain ID 11155111).
 * 
 * Implements dual-mode execution:
 * 1. Live Sepolia Mode via Viem when RPC and private key are configured
 * 2. Deterministic High-Fidelity Simulation Mode for hermetic CI, offline execution, and unit tests
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  concat,
  type PublicClient,
  type WalletClient,
  type Hash,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { CREDVAIL_REGISTRY_ABI } from "./credvail-registry-abi.ts";

export interface IssuerKeyRecord {
  publicKeyFingerprint: string;
  validFrom: number;
  validTo: number;
  compromisedAt: number;
  isCompromised: boolean;
  exists: boolean;
}

export interface BatchRecord {
  merkleRoot: string;
  leafCount: number;
  anchoredAtBlockTimestamp: number;
  exists: boolean;
}

export interface StatusDigestRecord {
  digestSha256: string;
  anchoredAtBlockTimestamp: number;
  exists: boolean;
}

export interface NetworkStatus {
  chainId: number;
  chainName: string;
  contractAddress: string;
  rpcUrl: string;
  isSimulated: boolean;
  explorerBaseUrl: string;
  latestBlockNumber: number;
}

export interface AnchorResult {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  explorerUrl: string;
}

export class BlockchainService {
  public static readonly SEPOLIA_CHAIN_ID = 11155111;
  public static readonly EXPLORER_URL = "https://sepolia.etherscan.io";

  // Simulated in-memory EVM state store for hermetic testing
  private static simulatedBlockNumber = 7123450;
  private static simulatedBatches = new Map<string, BatchRecord>(); // `${tenantHash}:${batchHash}` => BatchRecord
  private static simulatedKeys = new Map<string, IssuerKeyRecord>(); // `${tenantHash}:${epoch}` => IssuerKeyRecord
  private static simulatedStatusDigests = new Map<string, StatusDigestRecord>(); // `${tenantHash}:${statusEpoch}` => StatusDigestRecord

  /**
   * Resets simulated EVM state for test isolation.
   */
  public static resetSimulatedState(): void {
    this.simulatedBlockNumber = 7123450;
    this.simulatedBatches.clear();
    this.simulatedKeys.clear();
    this.simulatedStatusDigests.clear();
  }

  /**
   * Derives deterministic 32-byte tenant hash from slug.
   */
  public static computeTenantHash(tenantSlug: string): `0x${string}` {
    return keccak256(toHex(tenantSlug.trim().toLowerCase()));
  }

  /**
   * Derives deterministic 32-byte batch hash from batch ID string.
   */
  public static computeBatchHash(batchId: string): `0x${string}` {
    return keccak256(toHex(batchId.trim()));
  }

  /**
   * Normalizes hex string to standard 0x-prefixed 32-byte hex.
   */
  public static formatBytes32(hex: string): `0x${string}` {
    let clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    clean = clean.padStart(64, "0").slice(0, 64);
    return `0x${clean.toLowerCase()}` as `0x${string}`;
  }

  /**
   * Returns current Sepolia RPC URL.
   */
  public static getRpcUrl(): string {
    return process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
  }

  /**
   * Returns configured CredvailRegistry smart contract address.
   */
  public static getContractAddress(): Address {
    const addr = process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ADDRESS;
    if (addr && addr.startsWith("0x") && addr.length === 42 && addr !== "0x0000000000000000000000000000000000000000") {
      return addr as Address;
    }
    return "0x742d35Cc6634C0532925a3b844Bc454e4438f44e" as Address; // Default mock/demo Sepolia registry address
  }

  /**
   * Checks whether the service is running in simulated mode.
   */
  public static isSimulationMode(): boolean {
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const forceLive = process.env.FORCE_SEPOLIA_LIVE === "true";
    return !forceLive || !privateKey || privateKey.trim() === "";
  }

  /**
   * Returns network status details.
   */
  public static getNetworkStatus(): NetworkStatus {
    return {
      chainId: this.SEPOLIA_CHAIN_ID,
      chainName: "Ethereum Sepolia",
      contractAddress: this.getContractAddress(),
      rpcUrl: this.getRpcUrl(),
      isSimulated: this.isSimulationMode(),
      explorerBaseUrl: this.EXPLORER_URL,
      latestBlockNumber: this.simulatedBlockNumber,
    };
  }

  // ============================================================================
  // BATCH MERKLE ROOT ANCHORING
  // ============================================================================

  /**
   * Anchors a batch Merkle root to the CredvailRegistry contract.
   */
  public static async anchorBatch(
    tenantSlug: string,
    batchId: string,
    merkleRoot: string,
    leafCount: number
  ): Promise<AnchorResult> {
    const tenantHash = this.computeTenantHash(tenantSlug);
    const batchHash = this.computeBatchHash(batchId);
    const formattedRoot = this.formatBytes32(merkleRoot);

    if (leafCount <= 0) {
      throw new Error("CredvailRegistry: Leaf count must be positive");
    }

    if (this.isSimulationMode()) {
      const storageKey = `${tenantHash}:${batchHash}`;
      if (this.simulatedBatches.has(storageKey)) {
        throw new Error("CredvailRegistry: Batch already anchored");
      }

      this.simulatedBlockNumber += 1;
      const timestamp = Math.floor(Date.now() / 1000);

      const record: BatchRecord = {
        merkleRoot: formattedRoot,
        leafCount,
        anchoredAtBlockTimestamp: timestamp,
        exists: true,
      };

      this.simulatedBatches.set(storageKey, record);

      const txHash = keccak256(
        toHex(`anchorBatch:${tenantHash}:${batchHash}:${formattedRoot}:${this.simulatedBlockNumber}`)
      );

      return {
        txHash,
        blockNumber: this.simulatedBlockNumber,
        timestamp,
        explorerUrl: `${this.EXPLORER_URL}/tx/${txHash}`,
      };
    }

    // Live Sepolia Execution
    try {
      const privateKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
      const account = privateKeyToAccount(privateKey);
      const walletClient = createWalletClient({
        account,
        chain: sepolia,
        transport: http(this.getRpcUrl()),
      });
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(this.getRpcUrl()),
      });

      const txHash = await walletClient.writeContract({
        address: this.getContractAddress(),
        abi: CREDVAIL_REGISTRY_ABI,
        functionName: "anchorBatch",
        args: [tenantHash, batchHash, formattedRoot, leafCount],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      return {
        txHash,
        blockNumber: Number(receipt.blockNumber),
        timestamp: Math.floor(Date.now() / 1000),
        explorerUrl: `${this.EXPLORER_URL}/tx/${txHash}`,
      };
    } catch (err) {
      throw new Error(`Failed to anchor batch on Sepolia: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Retrieves anchored batch details from registry.
   */
  public static async getBatch(tenantSlug: string, batchId: string): Promise<BatchRecord | null> {
    const tenantHash = this.computeTenantHash(tenantSlug);
    const batchHash = this.computeBatchHash(batchId);

    if (this.isSimulationMode()) {
      const storageKey = `${tenantHash}:${batchHash}`;
      return this.simulatedBatches.get(storageKey) || null;
    }

    try {
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(this.getRpcUrl()),
      });

      const data = await publicClient.readContract({
        address: this.getContractAddress(),
        abi: CREDVAIL_REGISTRY_ABI,
        functionName: "getBatch",
        args: [tenantHash, batchHash],
      });

      if (!data || !data.exists) return null;

      return {
        merkleRoot: data.merkleRoot,
        leafCount: Number(data.leafCount),
        anchoredAtBlockTimestamp: Number(data.anchoredAtBlockTimestamp),
        exists: data.exists,
      };
    } catch {
      return null;
    }
  }

  /**
   * Verifies a credential's Merkle inclusion proof against on-chain batch root.
   */
  public static async verifyCredentialProof(
    tenantSlug: string,
    batchId: string,
    leafHash: string,
    proof: string[]
  ): Promise<boolean> {
    const tenantHash = this.computeTenantHash(tenantSlug);
    const batchHash = this.computeBatchHash(batchId);
    const formattedLeaf = this.formatBytes32(leafHash);
    const formattedProof = proof.map((p) => this.formatBytes32(p));

    if (this.isSimulationMode()) {
      const storageKey = `${tenantHash}:${batchHash}`;
      const batch = this.simulatedBatches.get(storageKey);
      if (!batch || !batch.exists) return false;

      // Execute OpenZeppelin pairwise commutative sorted hashing
      let computedHash: `0x${string}` = formattedLeaf;
      for (const proofElement of formattedProof) {
        if (computedHash <= proofElement) {
          computedHash = keccak256(concat([computedHash, proofElement]));
        } else {
          computedHash = keccak256(concat([proofElement, computedHash]));
        }
      }

      return computedHash.toLowerCase() === batch.merkleRoot.toLowerCase();
    }

    try {
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(this.getRpcUrl()),
      });

      return await publicClient.readContract({
        address: this.getContractAddress(),
        abi: CREDVAIL_REGISTRY_ABI,
        functionName: "verifyCredentialProof",
        args: [tenantHash, batchHash, formattedLeaf, formattedProof],
      });
    } catch {
      return false;
    }
  }

  // ============================================================================
  // KEY EPOCH GOVERNANCE
  // ============================================================================

  /**
   * Registers a new institutional key epoch on-chain.
   */
  public static async registerIssuerKey(
    tenantSlug: string,
    epoch: number,
    fingerprint: string,
    validFrom?: number,
    validTo?: number
  ): Promise<{ txHash: string; transactionHash: string; blockNumber: number; explorerUrl: string }> {
    const tenantHash = this.computeTenantHash(tenantSlug);
    const fpBytes = this.formatBytes32(fingerprint);
    const vFrom = validFrom ?? Math.floor(Date.now() / 1000);
    const vTo = validTo ?? 0;

    if (this.isSimulationMode()) {
      const storageKey = `${tenantHash}:${epoch}`;
      if (this.simulatedKeys.has(storageKey)) {
        throw new Error("CredvailRegistry: Key epoch already exists");
      }

      this.simulatedBlockNumber += 1;
      const record: IssuerKeyRecord = {
        publicKeyFingerprint: fpBytes,
        validFrom: vFrom,
        validTo: vTo,
        compromisedAt: 0,
        isCompromised: false,
        exists: true,
      };

      this.simulatedKeys.set(storageKey, record);
      const txHash = keccak256(toHex(`registerKey:${tenantHash}:${epoch}:${fpBytes}:${this.simulatedBlockNumber}`));

      return {
        txHash,
        transactionHash: txHash,
        blockNumber: this.simulatedBlockNumber,
        explorerUrl: `${this.EXPLORER_URL}/tx/${txHash}`,
      };
    }

    try {
      const privateKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
      const account = privateKeyToAccount(privateKey);
      const walletClient = createWalletClient({
        account,
        chain: sepolia,
        transport: http(this.getRpcUrl()),
      });
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(this.getRpcUrl()),
      });

      const txHash = await walletClient.writeContract({
        address: this.getContractAddress(),
        abi: CREDVAIL_REGISTRY_ABI,
        functionName: "registerIssuerKey",
        args: [tenantHash, BigInt(epoch), fpBytes, BigInt(vFrom), BigInt(vTo)],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      return {
        txHash,
        transactionHash: txHash,
        blockNumber: Number(receipt.blockNumber),
        explorerUrl: `${this.EXPLORER_URL}/tx/${txHash}`,
      };
    } catch (err) {
      throw new Error(`Failed to register issuer key on Sepolia: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Alias for registerIssuerKey accepting either positional parameters or an options object.
   */
  public static async registerKeyEpoch(
    param1: { tenantId?: string; tenantSlug?: string; epoch: number; publicKeyPem?: string; fingerprint?: string } | string,
    param2?: number,
    param3?: string,
    param4?: number,
    param5?: number
  ): Promise<{ txHash: string; transactionHash: string; blockNumber: number; explorerUrl: string }> {
    if (typeof param1 === "object") {
      const slug = param1.tenantSlug || param1.tenantId || "default";
      const fp = param1.fingerprint || param1.publicKeyPem || "fp_default";
      return this.registerIssuerKey(slug, param1.epoch, fp);
    }
    return this.registerIssuerKey(param1, param2!, param3!, param4, param5);
  }

  /**
   * Rotates an issuer key to the next epoch on-chain.
   */
  public static async rotateIssuerKey(
    tenantSlug: string,
    oldEpoch: number,
    newEpoch: number,
    newFingerprint: string,
    validFrom?: number,
    validTo?: number
  ): Promise<{ txHash: string; blockNumber: number; explorerUrl: string }> {
    const tenantHash = this.computeTenantHash(tenantSlug);
    const newFpBytes = this.formatBytes32(newFingerprint);
    const vFrom = validFrom ?? Math.floor(Date.now() / 1000);
    const vTo = validTo ?? 0;

    if (newEpoch <= oldEpoch) {
      throw new Error("CredvailRegistry: New epoch must be greater than old epoch");
    }

    if (this.isSimulationMode()) {
      const oldStorageKey = `${tenantHash}:${oldEpoch}`;
      const newStorageKey = `${tenantHash}:${newEpoch}`;

      if (!this.simulatedKeys.has(oldStorageKey)) {
        throw new Error("CredvailRegistry: Old epoch does not exist");
      }
      if (this.simulatedKeys.has(newStorageKey)) {
        throw new Error("CredvailRegistry: New epoch already exists");
      }

      this.simulatedBlockNumber += 1;
      const record: IssuerKeyRecord = {
        publicKeyFingerprint: newFpBytes,
        validFrom: vFrom,
        validTo: vTo,
        compromisedAt: 0,
        isCompromised: false,
        exists: true,
      };

      this.simulatedKeys.set(newStorageKey, record);
      const txHash = keccak256(toHex(`rotateKey:${tenantHash}:${oldEpoch}:${newEpoch}:${this.simulatedBlockNumber}`));

      return {
        txHash,
        blockNumber: this.simulatedBlockNumber,
        explorerUrl: `${this.EXPLORER_URL}/tx/${txHash}`,
      };
    }

    try {
      const privateKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
      const account = privateKeyToAccount(privateKey);
      const walletClient = createWalletClient({
        account,
        chain: sepolia,
        transport: http(this.getRpcUrl()),
      });
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(this.getRpcUrl()),
      });

      const txHash = await walletClient.writeContract({
        address: this.getContractAddress(),
        abi: CREDVAIL_REGISTRY_ABI,
        functionName: "rotateIssuerKey",
        args: [tenantHash, BigInt(oldEpoch), BigInt(newEpoch), newFpBytes, BigInt(vFrom), BigInt(vTo)],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      return {
        txHash,
        blockNumber: Number(receipt.blockNumber),
        explorerUrl: `${this.EXPLORER_URL}/tx/${txHash}`,
      };
    } catch (err) {
      throw new Error(`Failed to rotate issuer key on Sepolia: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Flags an institutional key epoch as compromised on-chain.
   */
  public static async flagKeyCompromised(
    param1: { tenantId?: string; tenantSlug?: string; epoch: number; reason?: string } | string,
    param2?: number,
    param3?: number
  ): Promise<{ txHash: string; transactionHash: string; blockNumber: number; explorerUrl: string }> {
    const tenantSlug = typeof param1 === "object" ? (param1.tenantSlug || param1.tenantId || "default") : param1;
    const epoch = typeof param1 === "object" ? param1.epoch : param2!;
    const compTime = (typeof param1 === "object" ? undefined : param3) ?? Math.floor(Date.now() / 1000);

    const tenantHash = this.computeTenantHash(tenantSlug);

    if (this.isSimulationMode()) {
      const storageKey = `${tenantHash}:${epoch}`;
      const record = this.simulatedKeys.get(storageKey);
      if (!record || !record.exists) {
        throw new Error("CredvailRegistry: Epoch does not exist");
      }
      if (record.isCompromised) {
        throw new Error("CredvailRegistry: Key already flagged compromised");
      }

      record.isCompromised = true;
      record.compromisedAt = compTime;
      this.simulatedBlockNumber += 1;

      const txHash = keccak256(toHex(`flagKeyCompromised:${tenantHash}:${epoch}:${compTime}:${this.simulatedBlockNumber}`));

      return {
        txHash,
        transactionHash: txHash,
        blockNumber: this.simulatedBlockNumber,
        explorerUrl: `${this.EXPLORER_URL}/tx/${txHash}`,
      };
    }

    try {
      const privateKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
      const account = privateKeyToAccount(privateKey);
      const walletClient = createWalletClient({
        account,
        chain: sepolia,
        transport: http(this.getRpcUrl()),
      });
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(this.getRpcUrl()),
      });

      const txHash = await walletClient.writeContract({
        address: this.getContractAddress(),
        abi: CREDVAIL_REGISTRY_ABI,
        functionName: "flagKeyCompromised",
        args: [tenantHash, BigInt(epoch), BigInt(compTime)],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      return {
        txHash,
        transactionHash: txHash,
        blockNumber: Number(receipt.blockNumber),
        explorerUrl: `${this.EXPLORER_URL}/tx/${txHash}`,
      };
    } catch (err) {
      throw new Error(`Failed to flag key compromised on Sepolia: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Retrieves on-chain issuer key record.
   */
  public static async getIssuerKey(tenantSlug: string, epoch: number): Promise<IssuerKeyRecord | null> {
    const tenantHash = this.computeTenantHash(tenantSlug);

    if (this.isSimulationMode()) {
      const storageKey = `${tenantHash}:${epoch}`;
      return this.simulatedKeys.get(storageKey) || null;
    }

    try {
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(this.getRpcUrl()),
      });

      const data = await publicClient.readContract({
        address: this.getContractAddress(),
        abi: CREDVAIL_REGISTRY_ABI,
        functionName: "getIssuerKey",
        args: [tenantHash, BigInt(epoch)],
      });

      if (!data || !data.exists) return null;

      return {
        publicKeyFingerprint: data.publicKeyFingerprint,
        validFrom: Number(data.validFrom),
        validTo: Number(data.validTo),
        compromisedAt: Number(data.compromisedAt),
        isCompromised: data.isCompromised,
        exists: data.exists,
      };
    } catch {
      return null;
    }
  }

  /**
   * Alias for getIssuerKey supporting options object or positional arguments.
   */
  public static async getKeyEpoch(
    param1: { tenantId?: string; tenantSlug?: string; epoch: number } | string,
    param2?: number
  ): Promise<IssuerKeyRecord | null> {
    if (typeof param1 === "object") {
      const slug = param1.tenantSlug || param1.tenantId || "default";
      return this.getIssuerKey(slug, param1.epoch);
    }
    return this.getIssuerKey(param1, param2!);
  }

  // ============================================================================
  // STATUS LIST DIGEST ANCHORING
  // ============================================================================

  /**
   * Anchors SHA-256 digest of W3C Bitstring status list to the registry.
   */
  public static async anchorStatusDigest(
    tenantSlug: string,
    statusEpoch: number,
    digestSha256: string
  ): Promise<{ txHash: string; blockNumber: number; explorerUrl: string }> {
    const tenantHash = this.computeTenantHash(tenantSlug);
    const digestBytes = this.formatBytes32(digestSha256);

    if (this.isSimulationMode()) {
      const storageKey = `${tenantHash}:${statusEpoch}`;
      if (this.simulatedStatusDigests.has(storageKey)) {
        throw new Error("CredvailRegistry: Status epoch already exists");
      }

      this.simulatedBlockNumber += 1;
      const timestamp = Math.floor(Date.now() / 1000);

      const record: StatusDigestRecord = {
        digestSha256: digestBytes,
        anchoredAtBlockTimestamp: timestamp,
        exists: true,
      };

      this.simulatedStatusDigests.set(storageKey, record);

      const txHash = keccak256(
        toHex(`anchorStatusDigest:${tenantHash}:${statusEpoch}:${digestBytes}:${this.simulatedBlockNumber}`)
      );

      return {
        txHash,
        blockNumber: this.simulatedBlockNumber,
        explorerUrl: `${this.EXPLORER_URL}/tx/${txHash}`,
      };
    }

    try {
      const privateKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
      const account = privateKeyToAccount(privateKey);
      const walletClient = createWalletClient({
        account,
        chain: sepolia,
        transport: http(this.getRpcUrl()),
      });
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(this.getRpcUrl()),
      });

      const txHash = await walletClient.writeContract({
        address: this.getContractAddress(),
        abi: CREDVAIL_REGISTRY_ABI,
        functionName: "anchorStatusDigest",
        args: [tenantHash, BigInt(statusEpoch), digestBytes],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      return {
        txHash,
        blockNumber: Number(receipt.blockNumber),
        explorerUrl: `${this.EXPLORER_URL}/tx/${txHash}`,
      };
    } catch (err) {
      throw new Error(`Failed to anchor status digest on Sepolia: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Retrieves on-chain status list digest record.
   */
  public static async getStatusDigest(tenantSlug: string, statusEpoch: number): Promise<StatusDigestRecord | null> {
    const tenantHash = this.computeTenantHash(tenantSlug);

    if (this.isSimulationMode()) {
      const storageKey = `${tenantHash}:${statusEpoch}`;
      return this.simulatedStatusDigests.get(storageKey) || null;
    }

    try {
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(this.getRpcUrl()),
      });

      const data = await publicClient.readContract({
        address: this.getContractAddress(),
        abi: CREDVAIL_REGISTRY_ABI,
        functionName: "getStatusDigest",
        args: [tenantHash, BigInt(statusEpoch)],
      });

      if (!data || !data.exists) return null;

      return {
        digestSha256: data.digestSha256,
        anchoredAtBlockTimestamp: Number(data.anchoredAtBlockTimestamp),
        exists: data.exists,
      };
    } catch {
      return null;
    }
  }
}
