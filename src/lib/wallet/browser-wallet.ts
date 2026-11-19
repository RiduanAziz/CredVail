/**
 * CREDVAIL Browser-Side Web Crypto & IndexedDB Wallet Engine
 * 
 * Implements a 100% client-side self-sovereign cryptographic wallet:
 * 1. Generates ECDSA NIST P-256 non-extractable key pairs via W3C Web Crypto API (SubtleCrypto).
 * 2. Persists CryptoKey objects locally in browser IndexedDB via structured cloning.
 * 3. Never writes or exports private keys in cleartext JWK format.
 * 4. Derives standard W3C did:key identifier (NIST P-256, multicodec 0x1200 / 0x80, 0x24).
 * 5. Signs presentations locally in the browser sandbox.
 */

import { canonicalizeJson } from "../crypto/canonical";

const DB_NAME = "credvail_wallet_vault";
const DB_VERSION = 2; // Incremented for non-extractable structured cloning
const STORE_IDENTITY = "identity";
const STORE_CREDENTIALS = "credentials";

export interface BrowserHolderIdentity {
  did: string;
  publicKeyJwk: JsonWebKey;
  createdAt: string;
}

export interface StoredHolderIdentityRecord {
  id: "primary_identity";
  did: string;
  publicKeyJwk: JsonWebKey;
  privateKey: CryptoKey;
  createdAt: string;
  version: 2;
}

export interface ClientStoredCredential {
  credentialId: string;
  certificateNumber: string;
  recipientName: string;
  recipientEmail: string;
  courseName: string;
  issuerName: string;
  issuerDid: string;
  claims: Record<string, string>;
  rawVc: Record<string, unknown>;
  claimedAt: string;
}

export interface W3CPresentationProof {
  type: "JsonWebSignature2020";
  created: string;
  verificationMethod: string;
  challenge: string;
  domain?: string;
  jws: string;
}

export interface ClientVerifiablePresentation {
  "@context": string[];
  type: string[];
  id: string;
  holder: string;
  verifiableCredential: Array<Record<string, unknown>>;
  proof: W3CPresentationProof;
  [key: string]: unknown;
}

/**
 * Base58btc alphabet for multibase encoding.
 */
const B58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Encode(buffer: Uint8Array): string {
  const digits: number[] = [0];
  for (let i = 0; i < buffer.length; i++) {
    for (let j = 0; j < digits.length; j++) digits[j] <<= 8;
    digits[0] += buffer[i];
    let carry = 0;
    for (let j = 0; j < digits.length; ++j) {
      digits[j] += carry;
      carry = (digits[j] / 58) | 0;
      digits[j] %= 58;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) digits.push(0);
  return digits.reverse().map((d) => B58_CHARS[d]).join("");
}

export function base58Decode(str: string): Uint8Array {
  let bytes: number[] = [0];
  for (let i = 0; i < str.length; i++) {
    const val = B58_CHARS.indexOf(str[i]);
    if (val === -1) throw new Error(`Invalid Base58 character: "${str[i]}"`);
    for (let j = 0; j < bytes.length; j++) bytes[j] *= 58;
    bytes[0] += val;
    let carry = 0;
    for (let j = 0; j < bytes.length; ++j) {
      bytes[j] += carry;
      carry = bytes[j] >> 8;
      bytes[j] &= 0xff;
    }
    while (carry) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < str.length && str[i] === "1"; i++) {
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 =
    typeof btoa !== "undefined"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  if (typeof atob !== "undefined") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, "base64"));
}

export class BrowserWalletEngine {
  private static inMemoryIdentityStore = new Map<string, StoredHolderIdentityRecord>();
  private static inMemoryCredStore = new Map<string, ClientStoredCredential>();

  private static getSubtleCrypto(): SubtleCrypto {
    if (typeof window !== "undefined" && window.crypto?.subtle) {
      return window.crypto.subtle;
    }
    if (typeof globalThis !== "undefined" && (globalThis as any).crypto?.subtle) {
      return (globalThis as any).crypto.subtle;
    }
    throw new Error("Web Crypto SubtleCrypto API is not supported in this runtime environment.");
  }

  private static hasIndexedDB(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof window.indexedDB !== "undefined" &&
      window.indexedDB !== null
    );
  }

  /**
   * Resets in-memory stores (used in unit/integration testing).
   */
  static resetInMemoryStore(): void {
    this.inMemoryIdentityStore.clear();
    this.inMemoryCredStore.clear();
  }

  /**
   * Opens or initializes the client IndexedDB database.
   */
  static openDatabase(): Promise<IDBDatabase> {
    if (!this.hasIndexedDB()) {
      return Promise.reject(new Error("IndexedDB is not available in this environment."));
    }

    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_IDENTITY)) {
          db.createObjectStore(STORE_IDENTITY, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_CREDENTIALS)) {
          const credStore = db.createObjectStore(STORE_CREDENTIALS, { keyPath: "credentialId" });
          credStore.createIndex("certificateNumber", "certificateNumber", { unique: true });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Derives W3C did:key from compressed NIST P-256 public coordinates (X, Y).
   * P-256 multicodec value is 0x1200 (varint: [0x80, 0x24]).
   */
  static deriveDidKeyFromCoords(xBase64Url: string, yBase64Url: string): string {
    const x = base64UrlDecode(xBase64Url);
    const y = base64UrlDecode(yBase64Url);

    // Compress P-256 point: 0x02 if Y is even, 0x03 if Y is odd
    const prefix = (y[y.length - 1] & 1) === 0 ? 0x02 : 0x03;
    const compressed = new Uint8Array(33);
    compressed[0] = prefix;
    compressed.set(x, 1);

    // NIST P-256 public key multicodec is 0x1200 (unsigned LEB128 varint: 0x80, 0x24)
    const multicodec = new Uint8Array([0x80, 0x24, ...compressed]);
    return `did:key:z${base58Encode(multicodec)}`;
  }

  /**
   * Generates a fresh non-extractable P-256 key pair via SubtleCrypto.
   * Private key is non-extractable (extractable: false) and cannot be read via exportKey.
   */
  static async generateHolderIdentity(): Promise<{
    did: string;
    publicKeyJwk: JsonWebKey;
    privateKey: CryptoKey;
  }> {
    const subtle = this.getSubtleCrypto();
    const keyPair = await subtle.generateKey(
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      false, // Strictly non-extractable private key
      ["sign"]
    );

    const publicKeyJwk = await subtle.exportKey("jwk", keyPair.publicKey);
    if (!publicKeyJwk.x || !publicKeyJwk.y) {
      throw new Error("Failed to export public key coordinates from Web Crypto.");
    }

    const did = this.deriveDidKeyFromCoords(publicKeyJwk.x, publicKeyJwk.y);

    return {
      did,
      publicKeyJwk,
      privateKey: keyPair.privateKey,
    };
  }

  /**
   * Retrieves existing or generates an independent browser ECDSA P-256 key pair.
   * Persists the CryptoKey object via structured cloning in IndexedDB.
   * Insecure legacy records containing cleartext privateKeyJwk are rejected and migrated.
   */
  static async getOrCreateBrowserIdentity(): Promise<{
    did: string;
    publicKeyJwk: JsonWebKey;
  }> {
    if (!this.hasIndexedDB()) {
      // Memory fallback for SSR and headless unit testing
      let record = this.inMemoryIdentityStore.get("primary_identity");
      if (record && record.version === 2 && record.privateKey) {
        return { did: record.did, publicKeyJwk: record.publicKeyJwk };
      }

      const fresh = await this.generateHolderIdentity();
      record = {
        id: "primary_identity",
        did: fresh.did,
        publicKeyJwk: fresh.publicKeyJwk,
        privateKey: fresh.privateKey,
        createdAt: new Date().toISOString(),
        version: 2,
      };
      this.inMemoryIdentityStore.set("primary_identity", record);
      return { did: record.did, publicKeyJwk: record.publicKeyJwk };
    }

    const db = await this.openDatabase();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_IDENTITY, "readonly");
      const store = tx.objectStore(STORE_IDENTITY);
      const req = store.get("primary_identity");

      req.onsuccess = async () => {
        const existing = req.result;

        // Migration & Security Check: Reject insecure legacy plaintext JWK records
        if (existing) {
          if (existing.version === 2 && existing.privateKey instanceof CryptoKey) {
            resolve({
              did: existing.did,
              publicKeyJwk: existing.publicKeyJwk,
            });
            return;
          }

          // Legacy version 1 with unencrypted privateKeyJwk detected:
          // Do not trust insecure plaintext key material; migrate by overwriting with non-extractable key
        }

        // Generate fresh non-extractable P-256 identity
        try {
          const fresh = await this.generateHolderIdentity();

          const identityRecord: StoredHolderIdentityRecord = {
            id: "primary_identity",
            did: fresh.did,
            publicKeyJwk: fresh.publicKeyJwk,
            privateKey: fresh.privateKey, // Cloned directly into IndexedDB
            createdAt: new Date().toISOString(),
            version: 2,
          };

          const writeTx = db.transaction(STORE_IDENTITY, "readwrite");
          writeTx.objectStore(STORE_IDENTITY).put(identityRecord);

          writeTx.oncomplete = () => {
            resolve({
              did: fresh.did,
              publicKeyJwk: fresh.publicKeyJwk,
            });
          };
          writeTx.onerror = () => reject(writeTx.error);
        } catch (err) {
          reject(err);
        }
      };

      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Saves a verifiable credential into the browser vault.
   */
  static async saveCredential(credential: ClientStoredCredential): Promise<void> {
    if (!this.hasIndexedDB()) {
      this.inMemoryCredStore.set(credential.credentialId, credential);
      return;
    }

    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CREDENTIALS, "readwrite");
      tx.objectStore(STORE_CREDENTIALS).put(credential);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Lists all credentials stored inside the browser vault.
   */
  static async listCredentials(): Promise<ClientStoredCredential[]> {
    if (!this.hasIndexedDB()) {
      return Array.from(this.inMemoryCredStore.values());
    }

    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CREDENTIALS, "readonly");
      const req = tx.objectStore(STORE_CREDENTIALS).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Deletes a credential from the browser vault.
   */
  static async deleteCredential(credentialId: string): Promise<boolean> {
    if (!this.hasIndexedDB()) {
      return this.inMemoryCredStore.delete(credentialId);
    }

    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CREDENTIALS, "readwrite");
      tx.objectStore(STORE_CREDENTIALS).delete(credentialId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Cryptographically signs a payload string in the browser using the non-extractable private key.
   * Private key never leaves the browser SubtleCrypto sandbox.
   * Returns a 64-byte raw IEEE P1363 signature encoded as Base64URL.
   */
  static async signPresentation(payloadString: string): Promise<string> {
    const subtle = this.getSubtleCrypto();

    let privateKey: CryptoKey;

    if (!this.hasIndexedDB()) {
      const record = this.inMemoryIdentityStore.get("primary_identity");
      if (!record?.privateKey) {
        // Initialize if not yet created
        await this.getOrCreateBrowserIdentity();
      }
      const updated = this.inMemoryIdentityStore.get("primary_identity");
      if (!updated?.privateKey) {
        throw new Error("No private key found in browser wallet.");
      }
      privateKey = updated.privateKey;
    } else {
      const db = await this.openDatabase();
      const identity: StoredHolderIdentityRecord | undefined = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_IDENTITY, "readonly");
        const req = tx.objectStore(STORE_IDENTITY).get("primary_identity");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      if (!identity?.privateKey) {
        throw new Error("No private key found in browser wallet.");
      }
      privateKey = identity.privateKey;
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(payloadString);
    const signatureBuffer = await subtle.sign(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      privateKey,
      data
    );

    // Convert raw 64-byte (r, s) IEEE P1363 signature to Base64URL
    return base64UrlEncode(new Uint8Array(signatureBuffer));
  }

  /**
   * Generates and cryptographically signs a W3C Verifiable Presentation in the browser.
   * Private key never leaves the browser Web Crypto boundary.
   */
  static async createAndSignPresentation(options: {
    credential: ClientStoredCredential | Record<string, unknown> | any;
    challengeNonce: string;
    verifierDomain: string;
  }): Promise<ClientVerifiablePresentation> {
    const { credential, challengeNonce, verifierDomain } = options;
    const identity = await this.getOrCreateBrowserIdentity();

    const rawVc = (credential as any).rawVc || credential;

    const id = `urn:uuid:${
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `vp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    }`;

    const context = [
      "https://www.w3.org/2018/credentials/v1",
      "https://w3id.org/security/suites/jws-2020/v1",
    ];
    const type = ["VerifiablePresentation"];
    const verifiableCredential = [rawVc];

    const vpBody = {
      "@context": context,
      type,
      id,
      holder: identity.did,
      verifiableCredential,
    };

    const canonicalVp = canonicalizeJson(vpBody);
    const dataToSign = `${canonicalVp}.${challengeNonce}.${verifierDomain}`;

    const jws = await this.signPresentation(dataToSign);

    const vp: ClientVerifiablePresentation = {
      "@context": context,
      type,
      id,
      holder: identity.did,
      verifiableCredential,
      proof: {
        type: "JsonWebSignature2020",
        created: new Date().toISOString(),
        verificationMethod: `${identity.did}#${identity.did.replace(/^did:key:/, "")}`,
        challenge: challengeNonce,
        domain: verifierDomain,
        jws,
      },
    };

    return vp;
  }
}
