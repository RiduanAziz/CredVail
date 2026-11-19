/**
 * CREDVAIL Issuer Key Repository
 * 
 * Manages institutional signing key epochs, lifecycle states
 * (ACTIVE, ROTATED, COMPROMISED), public key JWK/Multibase records,
 * and encrypted private keys at rest.
 * 
 * Implements dual-mode persistence:
 * 1. Prisma Client with multi-tenant scoping (`tenantId`)
 * 2. In-Memory store for hermetic testing and local execution
 */

import { prisma } from "../db.ts";
import { KeyService } from "../crypto/key-service.ts";
import type { GeneratedKeyPair, EcdsaPublicKeyJwk } from "../crypto/key-service.ts";

export interface StoredIssuerKey {
  id: string;
  tenantId: string;
  keyEpoch: number;
  keyIdentifier: string;
  publicKeyMultibase: string;
  publicKeyJwk: EcdsaPublicKeyJwk;
  publicKeyPem: string;
  algorithm: string;
  encryptedPrivateKey: string | null;
  fingerprint: string;
  onChainTxHash: string | null;
  isActive: boolean;
  isCompromised: boolean;
  validFrom: Date;
  validTo: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class KeyRepository {
  private static inMemoryKeys = new Map<string, StoredIssuerKey>();
  private static useMemory =
    process.env.REQUIRE_POSTGRES_INTEGRATION === "true"
      ? false
      : !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("localhost:5432");

  /**
   * Resets the in-memory key store for hermetic test suites.
   */
  static resetInMemoryStore(): void {
    this.inMemoryKeys.clear();
  }

  /**
   * Automatically provisions or retrieves the active initial Key Epoch 1 for a tenant.
   */
  static async getOrCreateInitialKey(tenantId: string, didUri: string): Promise<StoredIssuerKey> {
    const existingActive = await this.getActiveKey(tenantId);
    if (existingActive) return existingActive;

    const keyPair = KeyService.generateEcdsaKeyPair();
    const keyIdentifier = `${didUri}#key-1`;
    const encryptedPrivateKey = KeyService.encryptPrivateKey(keyPair.privateKeyPem);

    const initialKey: StoredIssuerKey = {
      id: `key_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenantId,
      keyEpoch: 1,
      keyIdentifier,
      publicKeyMultibase: keyPair.publicKeyMultibase,
      publicKeyJwk: keyPair.publicKeyJwk,
      publicKeyPem: keyPair.publicKeyPem,
      algorithm: "ECDSA-P256",
      encryptedPrivateKey,
      fingerprint: keyPair.fingerprint,
      onChainTxHash: null,
      isActive: true,
      isCompromised: false,
      validFrom: new Date(),
      validTo: null,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (!this.useMemory && prisma) {
      try {
        await prisma.issuerKey.create({
          data: {
            id: initialKey.id,
            tenantId,
            keyEpoch: 1,
            keyIdentifier,
            publicKeyMultibase: initialKey.publicKeyMultibase,
            algorithm: initialKey.algorithm,
            encryptedPrivateKey: initialKey.encryptedPrivateKey,
            isActive: true,
            isCompromised: false,
            validFrom: initialKey.validFrom,
          },
        });
        this.inMemoryKeys.set(initialKey.id, initialKey);
        return initialKey;
      } catch {
        // Fall back to in-memory store
      }
    }

    this.inMemoryKeys.set(initialKey.id, initialKey);
    return initialKey;
  }

  /**
   * Retrieves the currently active signing key for a tenant.
   */
  static async getActiveKey(tenantId: string): Promise<StoredIssuerKey | null> {
    for (const key of this.inMemoryKeys.values()) {
      if (key.tenantId === tenantId && key.isActive && !key.isCompromised) {
        return key;
      }
    }

    if (!this.useMemory && prisma) {
      try {
        const found = await prisma.issuerKey.findFirst({
          where: { tenantId, isActive: true, isCompromised: false },
          orderBy: { keyEpoch: "desc" },
        });

        if (found) {
          // Reconstitute from stored attributes
          const stored: StoredIssuerKey = {
            id: found.id,
            tenantId: found.tenantId,
            keyEpoch: found.keyEpoch,
            keyIdentifier: found.keyIdentifier,
            publicKeyMultibase: found.publicKeyMultibase,
            publicKeyJwk: { kty: "EC", crv: "P-256", x: "", y: "" },
            publicKeyPem: "",
            algorithm: found.algorithm,
            encryptedPrivateKey: found.encryptedPrivateKey,
            fingerprint: found.publicKeyMultibase.slice(0, 16),
            onChainTxHash: found.onChainTxHash,
            isActive: found.isActive,
            isCompromised: found.isCompromised,
            validFrom: found.validFrom,
            validTo: found.validTo,
            revokedAt: found.revokedAt,
            createdAt: found.validFrom,
            updatedAt: found.validFrom,
          };
          this.inMemoryKeys.set(stored.id, stored);
          return stored;
        }
      } catch {
        // Fall back
      }
    }

    return null;
  }

  /**
   * Retrieves a key epoch by its epoch number.
   */
  static async getKeyByEpoch(tenantId: string, epoch: number): Promise<StoredIssuerKey | null> {
    for (const key of this.inMemoryKeys.values()) {
      if (key.tenantId === tenantId && key.keyEpoch === epoch) {
        return key;
      }
    }

    if (!this.useMemory && prisma) {
      try {
        const found = await prisma.issuerKey.findFirst({
          where: { tenantId, keyEpoch: epoch },
        });
        if (found) {
          return {
            id: found.id,
            tenantId: found.tenantId,
            keyEpoch: found.keyEpoch,
            keyIdentifier: found.keyIdentifier,
            publicKeyMultibase: found.publicKeyMultibase,
            publicKeyJwk: { kty: "EC", crv: "P-256", x: "", y: "" },
            publicKeyPem: "",
            algorithm: found.algorithm,
            encryptedPrivateKey: found.encryptedPrivateKey,
            fingerprint: found.publicKeyMultibase.slice(0, 16),
            onChainTxHash: found.onChainTxHash,
            isActive: found.isActive,
            isCompromised: found.isCompromised,
            validFrom: found.validFrom,
            validTo: found.validTo,
            revokedAt: found.revokedAt,
            createdAt: found.validFrom,
            updatedAt: found.validFrom,
          };
        }
      } catch {
        // Fall back
      }
    }

    return null;
  }

  /**
   * Lists all key epochs for a tenant, ordered by epoch descending.
   */
  static async listKeys(tenantId: string): Promise<StoredIssuerKey[]> {
    const keys: StoredIssuerKey[] = [];

    for (const key of this.inMemoryKeys.values()) {
      if (key.tenantId === tenantId) {
        keys.push(key);
      }
    }

    if (!this.useMemory && prisma) {
      try {
        const dbKeys = await prisma.issuerKey.findMany({
          where: { tenantId },
          orderBy: { keyEpoch: "desc" },
        });

        for (const dbk of dbKeys) {
          if (!keys.some((k) => k.id === dbk.id)) {
            keys.push({
              id: dbk.id,
              tenantId: dbk.tenantId,
              keyEpoch: dbk.keyEpoch,
              keyIdentifier: dbk.keyIdentifier,
              publicKeyMultibase: dbk.publicKeyMultibase,
              publicKeyJwk: { kty: "EC", crv: "P-256", x: "", y: "" },
              publicKeyPem: "",
              algorithm: dbk.algorithm,
              encryptedPrivateKey: dbk.encryptedPrivateKey,
              fingerprint: dbk.publicKeyMultibase.slice(0, 16),
              onChainTxHash: dbk.onChainTxHash,
              isActive: dbk.isActive,
              isCompromised: dbk.isCompromised,
              validFrom: dbk.validFrom,
              validTo: dbk.validTo,
              revokedAt: dbk.revokedAt,
              createdAt: dbk.validFrom,
              updatedAt: dbk.validFrom,
            });
          }
        }
      } catch {
        // Fall back
      }
    }

    return keys.sort((a, b) => b.keyEpoch - a.keyEpoch);
  }

  /**
   * Rotates key epoch: generates new ECDSA P-256 key pair, increments epoch,
   * deactivates previous active epoch (graceful rotation), and sets new key as active.
   */
  static async rotateKey(tenantId: string, didUri: string): Promise<StoredIssuerKey> {
    const currentKeys = await this.listKeys(tenantId);
    const maxEpoch = currentKeys.length > 0 ? Math.max(...currentKeys.map((k) => k.keyEpoch)) : 0;
    const nextEpoch = maxEpoch + 1;

    // Gracefully deactivate all current active keys (without flagging compromise)
    for (const key of currentKeys) {
      if (key.isActive) {
        key.isActive = false;
        key.validTo = new Date();
        key.updatedAt = new Date();
        this.inMemoryKeys.set(key.id, key);
      }
    }

    if (!this.useMemory && prisma) {
      try {
        await prisma.issuerKey.updateMany({
          where: { tenantId, isActive: true },
          data: { isActive: false, validTo: new Date() },
        });
      } catch {
        // Fall back
      }
    }

    // Generate new ECDSA key pair for next epoch
    const keyPair = KeyService.generateEcdsaKeyPair();
    const keyIdentifier = `${didUri}#key-${nextEpoch}`;
    const encryptedPrivateKey = KeyService.encryptPrivateKey(keyPair.privateKeyPem);

    const newKey: StoredIssuerKey = {
      id: `key_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenantId,
      keyEpoch: nextEpoch,
      keyIdentifier,
      publicKeyMultibase: keyPair.publicKeyMultibase,
      publicKeyJwk: keyPair.publicKeyJwk,
      publicKeyPem: keyPair.publicKeyPem,
      algorithm: "ECDSA-P256",
      encryptedPrivateKey,
      fingerprint: keyPair.fingerprint,
      onChainTxHash: null,
      isActive: true,
      isCompromised: false,
      validFrom: new Date(),
      validTo: null,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (!this.useMemory && prisma) {
      try {
        await prisma.issuerKey.create({
          data: {
            id: newKey.id,
            tenantId,
            keyEpoch: nextEpoch,
            keyIdentifier,
            publicKeyMultibase: newKey.publicKeyMultibase,
            algorithm: newKey.algorithm,
            encryptedPrivateKey: newKey.encryptedPrivateKey,
            isActive: true,
            isCompromised: false,
            validFrom: newKey.validFrom,
          },
        });
        this.inMemoryKeys.set(newKey.id, newKey);
        return newKey;
      } catch {
        // Fall back
      }
    }

    this.inMemoryKeys.set(newKey.id, newKey);
    return newKey;
  }

  /**
   * Flags a key epoch as COMPROMISED: immediately revokes signing validity and deactivates it.
   */
  static async flagKeyCompromised(tenantId: string, epoch: number, reason?: string): Promise<StoredIssuerKey> {
    const key = await this.getKeyByEpoch(tenantId, epoch);
    if (!key) {
      throw new Error(`Key Epoch ${epoch} not found for this institution.`);
    }

    key.isCompromised = true;
    key.isActive = false;
    key.revokedAt = new Date();
    key.validTo = new Date();
    key.updatedAt = new Date();

    this.inMemoryKeys.set(key.id, key);

    if (!this.useMemory && prisma) {
      try {
        await prisma.issuerKey.updateMany({
          where: { tenantId, keyEpoch: epoch },
          data: {
            isCompromised: true,
            isActive: false,
            revokedAt: new Date(),
            validTo: new Date(),
          },
        });
      } catch {
        // Fall back
      }
    }

    return key;
  }

  /**
   * Updates on-chain transaction hash for a key epoch.
   */
  static async updateKeyOnChainTx(tenantId: string, epoch: number, txHash: string): Promise<StoredIssuerKey | null> {
    const key = await this.getKeyByEpoch(tenantId, epoch);
    if (!key) return null;

    key.onChainTxHash = txHash;
    key.updatedAt = new Date();
    this.inMemoryKeys.set(key.id, key);

    if (!this.useMemory && prisma) {
      try {
        await prisma.issuerKey.updateMany({
          where: { tenantId, keyEpoch: epoch },
          data: { onChainTxHash: txHash },
        });
      } catch {
        // Fall back
      }
    }

    return key;
  }
}
