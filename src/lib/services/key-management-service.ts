/**
 * CREDVAIL Institutional Key Governance & DID Management Service
 * 
 * Orchestrates:
 * 1. Initial key epoch auto-provisioning
 * 2. Multi-tenant signing key epoch rotation (SEC-10)
 * 3. Emergency cryptographic key compromise revocation (SEC-09)
 * 4. W3C did:web Document generation & resolution
 * 5. Private key encryption at rest and leak-proof public projections
 * 6. RBAC enforcement and immutable audit logging
 */

import { KeyRepository } from "../repositories/key-repository.ts";
import type { StoredIssuerKey } from "../repositories/key-repository.ts";
import { TenantRepository } from "../repositories/tenant-repository.ts";
import { KeyService } from "../crypto/key-service.ts";
import type { W3CDidDocument, EcdsaPublicKeyJwk } from "../crypto/key-service.ts";
import { assertTenantPermission } from "../auth/rbac.ts";
import type { SessionPayload } from "../auth/session.ts";
import { BlockchainService } from "../blockchain/blockchain-service.ts";

export interface PublicIssuerKeyInfo {
  id: string;
  keyEpoch: number;
  keyIdentifier: string;
  publicKeyMultibase: string;
  publicKeyJwk: EcdsaPublicKeyJwk;
  algorithm: string;
  fingerprint: string;
  onChainTxHash?: string | null;
  isActive: boolean;
  isCompromised: boolean;
  validFrom: string;
  validTo: string | null;
  revokedAt: string | null;
}

export class KeyManagementService {
  private static tenantRepo = new TenantRepository();

  /**
   * Resolves tenant context and asserts caller authorization.
   */
  private static async resolveTenantContext(slug: string, session?: SessionPayload) {
    const tenant = await this.tenantRepo.findBySlug(slug);
    if (!tenant) {
      throw new Error(`Institution with slug "${slug}" not found.`);
    }

    if (session) {
      const membership = session.tenants?.find((t) => t.slug === slug || t.tenantId === tenant.id);
      if (!membership && session.platformRole !== "SUPER_ADMIN") {
        throw new Error("Forbidden: User is not authorized for this institution.");
      }
      return { tenant, role: membership?.role || "READ_ONLY_STAFF" };
    }

    return { tenant, role: "ORG_OWNER" as const };
  }

  /**
   * Converts a StoredIssuerKey into a safe public projection (stripping private keys).
   */
  private static toPublicProjection(key: StoredIssuerKey): PublicIssuerKeyInfo {
    return {
      id: key.id,
      keyEpoch: key.keyEpoch,
      keyIdentifier: key.keyIdentifier,
      publicKeyMultibase: key.publicKeyMultibase,
      publicKeyJwk: key.publicKeyJwk,
      algorithm: key.algorithm,
      fingerprint: key.fingerprint,
      onChainTxHash: key.onChainTxHash || null,
      isActive: key.isActive,
      isCompromised: key.isCompromised,
      validFrom: key.validFrom.toISOString(),
      validTo: key.validTo ? key.validTo.toISOString() : null,
      revokedAt: key.revokedAt ? key.revokedAt.toISOString() : null,
    };
  }

  /**
   * Lists all key epochs for an institution.
   */
  static async listKeys(
    tenantSlug: string,
    session?: SessionPayload
  ): Promise<{ activeKey: PublicIssuerKeyInfo | null; allEpochs: PublicIssuerKeyInfo[]; didUri: string }> {
    const { tenant, role } = await this.resolveTenantContext(tenantSlug, session);
    assertTenantPermission(role, "keys:manage");

    // Ensure at least Epoch 1 exists
    await KeyRepository.getOrCreateInitialKey(tenant.id, tenant.didUri);

    const keys = await KeyRepository.listKeys(tenant.id);
    const publicKeys = keys.map((k) => this.toPublicProjection(k));
    const activeKey = publicKeys.find((k) => k.isActive && !k.isCompromised) || null;

    return {
      activeKey,
      allEpochs: publicKeys,
      didUri: tenant.didUri,
    };
  }

  /**
   * Retrieves the active signing key for internal certificate issuance.
   */
  static async getActiveSigningKey(
    tenantSlug: string,
    session?: SessionPayload
  ): Promise<{ key: StoredIssuerKey; decryptedPrivateKey: string }> {
    const { tenant, role } = await this.resolveTenantContext(tenantSlug, session);
    assertTenantPermission(role, "batches:create");

    let activeKey = await KeyRepository.getActiveKey(tenant.id);
    if (!activeKey) {
      activeKey = await KeyRepository.getOrCreateInitialKey(tenant.id, tenant.didUri);
    }

    if (activeKey.isCompromised) {
      throw new Error(`Active signing key for "${tenant.name}" is flagged as COMPROMISED.`);
    }

    if (!activeKey.encryptedPrivateKey) {
      throw new Error("Private key is missing from active key epoch.");
    }

    const decryptedPrivateKey = KeyService.decryptPrivateKey(activeKey.encryptedPrivateKey);

    return {
      key: activeKey,
      decryptedPrivateKey,
    };
  }

  /**
   * Rotates key epoch: generates new ECDSA P-256 key pair, increments epoch,
   * gracefully expires previous epoch, and records an audit log entry.
   */
  static async rotateKey(
    tenantSlug: string,
    session?: SessionPayload
  ): Promise<PublicIssuerKeyInfo> {
    const { tenant, role } = await this.resolveTenantContext(tenantSlug, session);
    assertTenantPermission(role, "keys:rotate");

    const newKey = await KeyRepository.rotateKey(tenant.id, tenant.didUri);

    try {
      const onChain = await BlockchainService.rotateIssuerKey(
        tenantSlug,
        newKey.keyEpoch - 1,
        newKey.keyEpoch,
        newKey.fingerprint
      );
      await KeyRepository.updateKeyOnChainTx(tenant.id, newKey.keyEpoch, onChain.txHash);
      newKey.onChainTxHash = onChain.txHash;
    } catch {
      // Non-blocking for offline or detached execution
    }

    await this.tenantRepo.recordAuditLog({
      tenantId: tenant.id,
      userId: session?.sub,
      userEmail: session?.email,
      action: "KEY_ROTATED",
      resourceType: "IssuerKey",
      resourceId: newKey.id,
      metadata: {
        newEpoch: newKey.keyEpoch,
        keyIdentifier: newKey.keyIdentifier,
        algorithm: newKey.algorithm,
        fingerprint: newKey.fingerprint,
        onChainTxHash: newKey.onChainTxHash,
      },
    });

    return this.toPublicProjection(newKey);
  }

  /**
   * Emergency compromise invalidation: marks a key epoch as COMPROMISED.
   * Any future verifications against this epoch will immediately return INVALID.
   */
  static async flagCompromised(
    tenantSlug: string,
    epoch: number,
    session?: SessionPayload
  ): Promise<PublicIssuerKeyInfo> {
    const { tenant, role } = await this.resolveTenantContext(tenantSlug, session);
    assertTenantPermission(role, "keys:compromise");

    const compromisedKey = await KeyRepository.flagKeyCompromised(tenant.id, epoch);

    try {
      const onChain = await BlockchainService.flagKeyCompromised(
        tenantSlug,
        epoch,
        Math.floor((compromisedKey.revokedAt?.getTime() || Date.now()) / 1000)
      );
      await KeyRepository.updateKeyOnChainTx(tenant.id, epoch, onChain.txHash);
      compromisedKey.onChainTxHash = onChain.txHash;
    } catch {
      // Non-blocking
    }

    await this.tenantRepo.recordAuditLog({
      tenantId: tenant.id,
      userId: session?.sub,
      userEmail: session?.email,
      action: "KEY_COMPROMISED",
      resourceType: "IssuerKey",
      resourceId: compromisedKey.id,
      metadata: {
        compromisedEpoch: epoch,
        keyIdentifier: compromisedKey.keyIdentifier,
        revokedAt: compromisedKey.revokedAt,
        onChainTxHash: compromisedKey.onChainTxHash,
      },
    });

    return this.toPublicProjection(compromisedKey);
  }

  /**
   * Resolves and builds a W3C DID Document for an institution.
   * Public endpoint conforming to W3C did:web resolution.
   */
  static async getTenantDidDocument(tenantSlug: string): Promise<W3CDidDocument> {
    const tenant = await this.tenantRepo.findBySlug(tenantSlug);
    if (!tenant) {
      throw new Error(`Institution with slug "${tenantSlug}" not found.`);
    }

    // Ensure at least Epoch 1 exists
    await KeyRepository.getOrCreateInitialKey(tenant.id, tenant.didUri);

    const keys = await KeyRepository.listKeys(tenant.id);

    const didDoc = KeyService.buildDidDocument(
      tenant.didUri,
      keys.map((k) => ({
        keyEpoch: k.keyEpoch,
        publicKeyJwk: k.publicKeyJwk,
        isActive: k.isActive,
        isCompromised: k.isCompromised,
      }))
    );

    return didDoc;
  }

  /**
   * Returns the platform root DID Document (did:web:credvail.com).
   */
  static getPlatformDidDocument(host: string = "credvail.com"): W3CDidDocument {
    const didUri = `did:web:${host}`;
    return {
      "@context": [
        "https://www.w3.org/ns/did/v1",
        "https://w3id.org/security/suites/jws-2020/v1",
      ],
      id: didUri,
      verificationMethod: [],
      authentication: [],
      assertionMethod: [],
    };
  }
}
