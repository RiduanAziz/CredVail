/**
 * CREDVAIL Cryptographic Key & Identity Engine
 * 
 * Provides:
 * 1. Standard ECDSA NIST P-256 (secp256r1) key pair generation
 * 2. W3C JsonWebKey2020 & Multibase Base58-BTC public key representations
 * 3. AES-256-GCM private key encryption at rest
 * 4. Cryptographic signing and verification
 * 5. W3C DID Core 1.0 Document builder for did:web
 * 6. Deterministic did:web resolution
 */

import crypto from "node:crypto";
import { canonicalizeJson } from "./canonical.ts";

export interface EcdsaPublicKeyJwk {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
}

export interface GeneratedKeyPair {
  publicKeyJwk: EcdsaPublicKeyJwk;
  publicKeyMultibase: string;
  publicKeyPem: string;
  privateKeyPem: string;
  fingerprint: string;
}

export interface W3CVerificationMethod {
  id: string;
  type: "JsonWebKey2020";
  controller: string;
  publicKeyJwk: EcdsaPublicKeyJwk;
}

export interface W3CDidDocument {
  "@context": string[];
  id: string;
  verificationMethod: W3CVerificationMethod[];
  authentication: string[];
  assertionMethod: string[];
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Encodes a buffer into Base58-BTC format.
 */
export function encodeBase58(buffer: Buffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const digits = [0];

  for (let i = 0; i < bytes.length; i++) {
    for (let j = 0; j < digits.length; j++) digits[j] <<= 8;
    digits[0] += bytes[i];
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

  let str = "";
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) str += "1";
  for (let i = digits.length - 1; i >= 0; i--) str += BASE58_ALPHABET[digits[i]];
  return str;
}

/**
 * Decodes a Base58-BTC string into a Buffer.
 */
export function decodeBase58(str: string): Buffer {
  const bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const val = BASE58_ALPHABET.indexOf(c);
    if (val === -1) throw new Error(`Invalid Base58 character: "${c}"`);
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
  return Buffer.from(bytes.reverse());
}

export class KeyService {
  private static masterSecret =
    process.env.SESSION_SECRET || "credvail_master_key_encryption_secret_minimum_32_bytes";

  /**
   * Generates a new standard ECDSA P-256 key pair.
   */
  static generateEcdsaKeyPair(): GeneratedKeyPair {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "prime256v1", // NIST P-256 / secp256r1
    });

    const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }) as string;
    const publicKeyDer = publicKey.export({ type: "spki", format: "der" }) as Buffer;
    const rawJwk = publicKey.export({ format: "jwk" }) as any;

    const publicKeyJwk: EcdsaPublicKeyJwk = {
      kty: "EC",
      crv: "P-256",
      x: rawJwk.x,
      y: rawJwk.y,
    };

    // Multibase Base58-BTC format prefixed with 'z' (with P-256 multicodec 0x1200)
    const multicodecHeader = Buffer.from([0x12, 0x00]);
    const multibaseBuffer = Buffer.concat([multicodecHeader, publicKeyDer]);
    const publicKeyMultibase = `z${encodeBase58(multibaseBuffer)}`;

    // Cryptographic fingerprint: SHA-256 of canonical JWK
    const canonicalJwk = canonicalizeJson(publicKeyJwk);
    const fingerprint = crypto.createHash("sha256").update(canonicalJwk).digest("hex");

    return {
      publicKeyJwk,
      publicKeyMultibase,
      publicKeyPem,
      privateKeyPem,
      fingerprint,
    };
  }

  /**
   * Encrypts a private key string at rest using AES-256-GCM.
   */
  static encryptPrivateKey(privateKeyPem: string): string {
    const key = crypto.createHash("sha256").update(this.masterSecret).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

    const encrypted = Buffer.concat([cipher.update(privateKeyPem, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `aes-256-gcm:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
  }

  /**
   * Decrypts an encrypted private key string.
   */
  static decryptPrivateKey(payload: string): string {
    if (!payload.startsWith("aes-256-gcm:")) {
      // If raw PEM was stored in dev/test, return directly
      return payload;
    }

    const parts = payload.split(":");
    if (parts.length !== 4) {
      throw new Error("Invalid encrypted private key format");
    }

    const iv = Buffer.from(parts[1], "hex");
    const tag = Buffer.from(parts[2], "hex");
    const ciphertext = Buffer.from(parts[3], "hex");

    const key = crypto.createHash("sha256").update(this.masterSecret).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  }

  /**
   * Cryptographically signs arbitrary data using an ECDSA P-256 private key.
   */
  static signData(privateKeyPem: string, data: string | Buffer): string {
    const signer = crypto.createSign("SHA256");
    signer.update(data);
    signer.end();
    return signer.sign(privateKeyPem, "hex");
  }

  /**
   * Verifies an ECDSA P-256 signature against a public key PEM or JWK.
   * Supports:
   * 1. IEEE P1363 raw (r, s) signatures (64 bytes for P-256, Base64URL or Buffer) from Web Crypto.
   * 2. ASN.1 DER-encoded signatures (Hex, Base64, or Buffer) from Node.js crypto / OpenSSL.
   */
  static verifySignature(
    publicKeyPemOrJwk: string | EcdsaPublicKeyJwk,
    data: string | Buffer,
    signature: string | Buffer
  ): boolean {
    try {
      let keyInput: crypto.KeyObject;
      if (typeof publicKeyPemOrJwk === "string") {
        keyInput = crypto.createPublicKey(publicKeyPemOrJwk);
      } else {
        keyInput = crypto.createPublicKey({
          key: publicKeyPemOrJwk as any,
          format: "jwk",
        });
      }

      let sigBuffer: Buffer;
      if (Buffer.isBuffer(signature)) {
        sigBuffer = signature;
      } else if (typeof signature === "string") {
        const trimmed = signature.trim();
        // Check for Hex representation: even length, hex characters, and typical signature length
        if (
          /^[0-9a-fA-F]+$/.test(trimmed) &&
          trimmed.length % 2 === 0 &&
          (trimmed.length === 128 || (trimmed.length >= 136 && trimmed.startsWith("30")))
        ) {
          sigBuffer = Buffer.from(trimmed, "hex");
        } else {
          // Standard JWS Base64URL / Base64 format from Web Crypto
          sigBuffer = Buffer.from(trimmed, "base64url");
        }
      } else {
        return false;
      }

      const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const dsaEncoding = sigBuffer.length === 64 ? "ieee-p1363" : "der";

      return crypto.verify(
        "SHA256",
        dataBuffer,
        { key: keyInput, dsaEncoding },
        sigBuffer
      );
    } catch {
      return false;
    }
  }

  /**
   * Builds a standards-compliant W3C DID Document for an institution's did:web.
   */
  static buildDidDocument(
    didUri: string,
    keyEpochs: Array<{
      keyEpoch: number;
      publicKeyJwk: EcdsaPublicKeyJwk;
      isActive: boolean;
      isCompromised: boolean;
    }>
  ): W3CDidDocument {
    const verificationMethod: W3CVerificationMethod[] = [];
    const assertionMethod: string[] = [];
    const authentication: string[] = [];

    for (const key of keyEpochs) {
      // Compromised keys are excluded from assertionMethod to immediately invalidate signing authority
      const methodId = `${didUri}#key-${key.keyEpoch}`;

      verificationMethod.push({
        id: methodId,
        type: "JsonWebKey2020",
        controller: didUri,
        publicKeyJwk: key.publicKeyJwk,
      });

      if (key.isActive && !key.isCompromised) {
        assertionMethod.push(methodId);
        authentication.push(methodId);
      }
    }

    return {
      "@context": [
        "https://www.w3.org/ns/did/v1",
        "https://w3id.org/security/suites/jws-2020/v1",
      ],
      id: didUri,
      verificationMethod,
      authentication,
      assertionMethod,
    };
  }

  /**
   * Resolves a did:web URI into its HTTPS resource URL.
   * Specification: did:web:<domain> -> https://<domain>/.well-known/did.json
   * Specification: did:web:<domain>:tenants:<slug> -> https://<domain>/tenants/<slug>/.well-known/did.json
   */
  static didWebToHttpsUrl(didUri: string): string {
    if (!didUri.startsWith("did:web:")) {
      throw new Error(`Invalid did:web identifier: "${didUri}"`);
    }

    const pathParts = didUri.substring(8).split(":");
    if (pathParts.length === 0 || !pathParts[0]) {
      throw new Error(`Malformed did:web: "${didUri}"`);
    }

    const domain = decodeURIComponent(pathParts[0]);
    if (pathParts.length === 1) {
      return `https://${domain}/.well-known/did.json`;
    }

    const path = pathParts.slice(1).map((p) => decodeURIComponent(p)).join("/");
    return `https://${domain}/${path}/.well-known/did.json`;
  }

  /**
   * Recovers an ECDSA NIST P-256 public key in SPKI PEM format from a Multibase Base58-BTC string.
   * Supports:
   * 1. Standard W3C did:key NIST P-256 (multicodec 0x1200 / varint [0x80, 0x24] + 33-byte compressed SEC1 point).
   * 2. Legacy internal format ([0x12, 0x00] + 91-byte SPKI DER).
   */
  static multibaseToPublicKeyPem(multibase: string): string {
    if (!multibase.startsWith("z")) {
      throw new Error(`Invalid multibase key format: "${multibase}" must begin with 'z' (Base58-BTC).`);
    }

    const decodedBuffer = decodeBase58(multibase.slice(1));
    if (decodedBuffer.length < 4) {
      throw new Error(`Malformed multibase key: buffer too short (${decodedBuffer.length} bytes).`);
    }

    // Standard W3C P-256: multicodec 0x1200 represented as varint [0x80, 0x24] + 33-byte compressed SEC1
    if (decodedBuffer[0] === 0x80 && decodedBuffer[1] === 0x24) {
      if (decodedBuffer.length !== 35) {
        throw new Error(
          `Malformed P-256 did:key: expected exactly 35 bytes for multicodec and compressed point, got ${decodedBuffer.length}`
        );
      }
      const compressedPoint = decodedBuffer.subarray(2);
      return this.compressedP256ToPublicKeyPem(compressedPoint);
    }

    // Legacy fallback: [0x12, 0x00] + SPKI DER
    if (decodedBuffer[0] === 0x12 && decodedBuffer[1] === 0x00) {
      const publicKeyDer = decodedBuffer.subarray(2);
      const keyObject = crypto.createPublicKey({
        key: publicKeyDer,
        format: "der",
        type: "spki",
      });
      return keyObject.export({ type: "spki", format: "pem" }) as string;
    }

    throw new Error(
      `Unsupported or invalid multicodec prefix: [0x${decodedBuffer[0].toString(16)}, 0x${decodedBuffer[1].toString(16)}]. Expected 0x1200 (0x80, 0x24).`
    );
  }

  /**
   * Decompresses a 33-byte compressed NIST P-256 (secp256r1) elliptic curve point,
   * validates that it lies on the curve (y^2 = x^3 - 3x + b mod p), and exports SPKI PEM.
   */
  static compressedP256ToPublicKeyPem(compressed: Buffer): string {
    if (!compressed || compressed.length !== 33) {
      throw new Error(`Compressed P-256 point must be exactly 33 bytes, got ${compressed?.length || 0}`);
    }
    const prefix = compressed[0];
    if (prefix !== 0x02 && prefix !== 0x03) {
      throw new Error(`Invalid compressed point prefix: 0x${prefix.toString(16)}. Must be 0x02 or 0x03.`);
    }

    const p = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
    const a = p - 3n;
    const b = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;

    const x = BigInt("0x" + compressed.subarray(1).toString("hex"));
    if (x >= p) {
      throw new Error("X coordinate is not within the P-256 field (x >= p).");
    }

    // z = (x^3 + ax + b) mod p
    const z = (((x * x + a) % p * x) % p + b) % p;
    const modZ = (z % p + p) % p;

    // y = z^((p+1)/4) mod p
    let y = this.modPow(modZ, (p + 1n) / 4n, p);
    const ySq = (y * y) % p;
    if (ySq !== modZ) {
      throw new Error("Supplied compressed coordinates do not represent a valid point on the NIST P-256 curve.");
    }

    if ((y & 1n) !== (BigInt(prefix) & 1n)) {
      y = p - y;
    }

    const xHex = x.toString(16).padStart(64, "0");
    const yHex = y.toString(16).padStart(64, "0");

    const jwk: EcdsaPublicKeyJwk = {
      kty: "EC",
      crv: "P-256",
      x: Buffer.from(xHex, "hex").toString("base64url"),
      y: Buffer.from(yHex, "hex").toString("base64url"),
    };

    const keyObj = crypto.createPublicKey({
      key: jwk as any,
      format: "jwk",
    });

    return keyObj.export({ type: "spki", format: "pem" }) as string;
  }

  private static modPow(base: bigint, exp: bigint, mod: bigint): bigint {
    let res = 1n;
    base = (base % mod + mod) % mod;
    while (exp > 0n) {
      if (exp % 2n === 1n) res = (res * base) % mod;
      base = (base * base) % mod;
      exp = exp / 2n;
    }
    return res;
  }

  /**
   * Recovers an ECDSA NIST P-256 public key in SPKI PEM format from a did:key identifier.
   */
  static didKeyToPublicKeyPem(didKey: string): string {
    if (!didKey.startsWith("did:key:")) {
      throw new Error(`Invalid did:key identifier: "${didKey}"`);
    }

    const multibase = didKey.replace(/^did:key:/, "").split("#")[0];
    return this.multibaseToPublicKeyPem(multibase);
  }
}
