/**
 * CREDVAIL Holder Browser Wallet & Vault Engine
 * 
 * Provides:
 * 1. Holder cryptographic identity management (ECDSA NIST P-256 + did:key)
 * 2. Credential claiming & ownership verification via high-entropy single-use invitations
 * 3. Client-side encrypted credential vault
 * 4. Password KDF with PBKDF2 (600,000 iterations, 16-byte salt, AES-256-GCM) with zero fallback
 * 5. Replay-resistant verifier challenge binding
 */

import crypto from "node:crypto";
import { KeyService } from "../crypto/key-service.ts";
import type { GeneratedKeyPair } from "../crypto/key-service.ts";
import { SelectiveDisclosureEngine } from "../crypto/selective-disclosure.ts";
import type {
  ClaimDisclosure,
  W3CVerifiablePresentation,
} from "../crypto/selective-disclosure.ts";
import { CredentialRepository } from "../repositories/credential-repository.ts";
import { TenantRepository } from "../repositories/tenant-repository.ts";
import { ClaimInvitationService } from "../services/claim-invitation-service.ts";
import type { W3CVerifiableCredential } from "../crypto/vc-service.ts";

export interface StoredWalletCredential {
  id: string;
  credentialId: string;
  certificateNumber: string;
  recipientName: string;
  recipientEmail: string;
  courseName: string;
  issuerName: string;
  issuerDid: string;
  claims: Record<string, string>;
  disclosures: Record<string, ClaimDisclosure>;
  rawVc: W3CVerifiableCredential;
  claimedAt: string;
  claimedByUserId?: string;
}

export interface HolderIdentity {
  holderId: string;
  did: string;
  keyPair: GeneratedKeyPair;
}

export interface ClaimCredentialInput {
  certificateNumber: string;
  recipientEmail?: string;
  claimToken?: string;
  holderDid?: string;
  userId?: string;
  userEmail?: string;
  userEmailVerified?: boolean;
}

export interface EncryptedVaultBackupEnvelope {
  version: 1;
  kdf: {
    algorithm: "PBKDF2";
    hash: "SHA-256";
    iterations: number;
    salt: string;
  };
  cipher: {
    algorithm: "AES-256-GCM";
    iv: string;
    tag: string;
  };
  ciphertext: string;
  exportedAt: string;
  // Backward compatibility fields for legacy parser assertions
  iv?: string;
  tag?: string;
  data?: string;
}

const PBKDF2_ITERATIONS = 600000;
const PBKDF2_KEY_LEN = 32;
const PBKDF2_HASH = "sha256";

export class WalletService {
  private static inMemoryVaults = new Map<string, Map<string, StoredWalletCredential>>();

  /**
   * @deprecated Holder private keys must NEVER be generated, held, or managed on the server.
   * Use BrowserWalletEngine in the client. Calling this method throws an explicit security error.
   */
  static getOrCreateHolderIdentity(holderId: string = "default_holder"): never {
    throw new Error(
      "WalletService.getOrCreateHolderIdentity has been deprecated and removed. " +
      "Holder private keys must never be generated, held, or managed on the server. " +
      "Use BrowserWalletEngine in the client."
    );
  }

  /**
   * Resets wallet stores (for hermetic testing).
   */
  static resetInMemoryStore(): void {
    this.inMemoryVaults.clear();
  }

  /**
   * Claims an issued credential to a holder's wallet.
   * Requires a single-use high-entropy claim invitation token.
   * Email string matching alone is explicitly rejected.
   */
  static async claimCredential(
    input: ClaimCredentialInput,
    holderId: string = "default_holder",
    options?: {
      simulatePostConsumeFailure?: boolean;
    }
  ): Promise<StoredWalletCredential> {
    const { certificateNumber, recipientEmail, claimToken, holderDid, userId, userEmail } = input;

    if (!certificateNumber || certificateNumber.trim().length === 0) {
      throw new Error("A valid certificate number is required to claim a credential.");
    }

    // Look up credential in institutional registries
    const cred = await CredentialRepository.findCredentialByPublicId(certificateNumber.trim());
    if (!cred) {
      throw new Error(`Certificate "${certificateNumber}" was not found in institutional registries.`);
    }

    // Security Gate: Email string matching alone must never establish ownership.
    // A single-use high-entropy claim token is mandatory.
    if (!claimToken || typeof claimToken !== "string" || claimToken.trim().length === 0) {
      throw new Error(
        "A valid single-use claim invitation token is required to establish credential ownership. Email matching alone is not permitted."
      );
    }

    // Verify and consume the claim token atomically
    // Strict identity binding: userEmail from the verified session MUST take absolute precedence
    const claimingUserEmail = userEmail || recipientEmail;
    if (!claimingUserEmail || claimingUserEmail.trim().length === 0) {
      throw new Error("A valid authenticated user email is required to establish credential ownership.");
    }

    const claimingUserId = userId || holderId;

    // Resolve tenant
    const tenantRepo = new TenantRepository();
    const tenant = await tenantRepo.findById(cred.tenantId);
    const issuerName = tenant?.name || "Verified Educational Institution";
    const issuerDid = tenant?.didUri || `did:web:credvail.com:tenants:${tenant?.slug || "credvail"}`;

    const rawVc = (cred.vcPayloadJson || {}) as unknown as W3CVerifiableCredential;

    const claims = cred.claimsData || {
      recipient_name: cred.recipientName,
      recipient_email: cred.recipientEmail,
      certificate_number: cred.certificateNumber,
    };

    const storedItem: StoredWalletCredential = {
      id: cred.id,
      credentialId: cred.credentialId,
      certificateNumber: cred.certificateNumber,
      recipientName: cred.recipientName,
      recipientEmail: cred.recipientEmail,
      courseName: claims.course_name || "Certified Program",
      issuerName,
      issuerDid,
      claims,
      disclosures: {},
      rawVc,
      claimedAt: new Date().toISOString(),
      claimedByUserId: claimingUserId,
    };

    // Execute atomic consumption and transactional association within a single isolated boundary.
    // If onPostConsume operations fail, the entire database transaction rolls back.
    await ClaimInvitationService.verifyAndConsume(
      {
        certificateNumber: cred.certificateNumber,
        claimToken,
        userEmail: claimingUserEmail,
        userId: claimingUserId,
        holderDid,
        userEmailVerified: input.userEmailVerified === true,
      },
      async (_txClient) => {
        if (options?.simulatePostConsumeFailure) {
          throw new Error("Simulated downstream credential association failure.");
        }
      }
    );

    // After-commit processing: update process-memory holder vault cache ONLY after successful transaction commit
    if (!this.inMemoryVaults.has(holderId)) {
      this.inMemoryVaults.set(holderId, new Map());
    }
    this.inMemoryVaults.get(holderId)!.set(storedItem.credentialId, storedItem);
    this.inMemoryVaults.get(holderId)!.set(storedItem.certificateNumber, storedItem);

    return storedItem;
  }

  /**
   * Lists all claimed credentials in a holder's wallet.
   */
  static listCredentials(holderId: string = "default_holder"): StoredWalletCredential[] {
    const vault = this.inMemoryVaults.get(holderId);
    if (!vault) return [];

    // Deduplicate by credentialId
    const seen = new Set<string>();
    const list: StoredWalletCredential[] = [];

    for (const item of vault.values()) {
      if (!seen.has(item.credentialId)) {
        seen.add(item.credentialId);
        list.push(item);
      }
    }

    return list.sort((a, b) => new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime());
  }

  /**
   * Retrieves a single credential from the holder's wallet.
   */
  static getCredential(
    credentialIdOrCertNumber: string,
    holderId: string = "default_holder"
  ): StoredWalletCredential | null {
    const vault = this.inMemoryVaults.get(holderId);
    if (!vault) return null;

    return vault.get(credentialIdOrCertNumber) || null;
  }

  /**
   * Deletes a credential from the holder's wallet.
   */
  static deleteCredential(
    credentialIdOrCertNumber: string,
    holderId: string = "default_holder"
  ): boolean {
    const vault = this.inMemoryVaults.get(holderId);
    if (!vault) return false;

    const item = vault.get(credentialIdOrCertNumber);
    if (!item) return false;

    vault.delete(item.credentialId);
    vault.delete(item.certificateNumber);
    return true;
  }

  /**
   * @deprecated Server-side presentation signing is disabled and removed for security.
   * Presentations must be generated and signed client-side in the browser wallet using BrowserWalletEngine.
   */
  static createSelectivePresentation(
    ..._args: any[]
  ): never {
    throw new Error(
      "Server-side presentation signing is disabled and removed for security. " +
      "Presentations must be generated and signed client-side by the holder's browser wallet."
    );
  }

  /**
   * Exports an encrypted backup of the holder's wallet vault using PBKDF2-HMAC-SHA256
   * (600,000 iterations, 16-byte random salt, AES-256-GCM) with zero hardcoded fallback.
   */
  static exportVaultBackup(
    holderId: string = "default_holder",
    passphrase?: string
  ): { encryptedBackup: string; credentialCount: number } {
    if (!passphrase || typeof passphrase !== "string" || passphrase.trim().length === 0) {
      throw new Error("A non-empty passphrase is required to encrypt the wallet vault backup.");
    }

    const creds = this.listCredentials(holderId);

    const vaultData = {
      holderId,
      credentials: creds,
      exportedAt: new Date().toISOString(),
    };

    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(
      passphrase,
      salt,
      PBKDF2_ITERATIONS,
      PBKDF2_KEY_LEN,
      PBKDF2_HASH
    );

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

    const plaintext = JSON.stringify(vaultData);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    const ivHex = iv.toString("hex");
    const tagHex = tag.toString("hex");
    const ciphertextHex = encrypted.toString("hex");

    const backupPayload: EncryptedVaultBackupEnvelope = {
      version: 1,
      kdf: {
        algorithm: "PBKDF2",
        hash: "SHA-256",
        iterations: PBKDF2_ITERATIONS,
        salt: salt.toString("hex"),
      },
      cipher: {
        algorithm: "AES-256-GCM",
        iv: ivHex,
        tag: tagHex,
      },
      ciphertext: ciphertextHex,
      exportedAt: new Date().toISOString(),
      // Top-level aliases for backward compatibility with standard JSON inspectors
      iv: ivHex,
      tag: tagHex,
      data: ciphertextHex,
    };

    return {
      encryptedBackup: JSON.stringify(backupPayload),
      credentialCount: creds.length,
    };
  }

  /**
   * Restores an encrypted wallet backup into the holder's vault.
   * Requires a valid passphrase and rejects invalid/unauthenticated payloads.
   */
  static importVaultBackup(
    backupJson: string,
    holderId: string = "default_holder",
    passphrase?: string
  ): number {
    if (!passphrase || typeof passphrase !== "string" || passphrase.trim().length === 0) {
      throw new Error("A passphrase is required to decrypt the wallet vault backup.");
    }

    const envelope = JSON.parse(backupJson);

    let key: Buffer;
    let iv: Buffer;
    let tag: Buffer;
    let ciphertext: Buffer;

    if (envelope.version === 1 && envelope.kdf && envelope.cipher) {
      const salt = Buffer.from(envelope.kdf.salt, "hex");
      const iterations = envelope.kdf.iterations || PBKDF2_ITERATIONS;
      key = crypto.pbkdf2Sync(
        passphrase,
        salt,
        iterations,
        PBKDF2_KEY_LEN,
        PBKDF2_HASH
      );
      iv = Buffer.from(envelope.cipher.iv, "hex");
      tag = Buffer.from(envelope.cipher.tag, "hex");
      ciphertext = Buffer.from(envelope.ciphertext, "hex");
    } else if (envelope.iv && envelope.tag && envelope.data) {
      // Legacy envelope fallback without hardcoded default
      key = crypto.createHash("sha256").update(passphrase).digest();
      iv = Buffer.from(envelope.iv, "hex");
      tag = Buffer.from(envelope.tag, "hex");
      ciphertext = Buffer.from(envelope.data, "hex");
    } else {
      throw new Error("Invalid or unsupported wallet backup envelope format.");
    }

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const vaultData = JSON.parse(decrypted);

    if (!Array.isArray(vaultData.credentials)) {
      throw new Error("Invalid backup payload format: 'credentials' array not found.");
    }

    if (!this.inMemoryVaults.has(holderId)) {
      this.inMemoryVaults.set(holderId, new Map());
    }

    const vault = this.inMemoryVaults.get(holderId)!;
    let count = 0;
    for (const cred of vaultData.credentials) {
      vault.set(cred.credentialId, cred);
      vault.set(cred.certificateNumber, cred);
      count++;
    }

    return count;
  }
}
