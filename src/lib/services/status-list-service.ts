/**
 * CREDVAIL W3C Bitstring Status List 2021 Service
 * 
 * Implements W3C Bitstring Status List specification for high-density,
 * privacy-preserving credential revocation and suspension:
 * - Deterministic bit addressing (MSB-first indexing)
 * - GZIP compression and Base64 encoding
 * - SHA-256 cryptographic digest commitment for on-chain anchoring
 * - Standards-compliant StatusList2021Credential object builder
 */

import zlib from "node:zlib";
import crypto from "node:crypto";
import { canonicalizeJson } from "../crypto/canonical.ts";

export interface W3CStatusListCredential {
  "@context": string[];
  id: string;
  type: string[];
  issuer: string;
  validFrom: string;
  credentialSubject: {
    id: string;
    type: "StatusList2021";
    statusPurpose: "revocation" | "suspension";
    encodedList: string;
  };
}

export interface W3CBitstringStatusListCredential {
  "@context": string[];
  id: string;
  type: string[];
  issuer: string;
  validFrom: string;
  credentialSubject: {
    id: string;
    type: "BitstringStatusList";
    statusPurpose: "revocation" | "suspension";
    encodedList: string;
    statusSize?: number;
  };
}

export class StatusListService {
  /**
   * Default bitstring size: 131,072 bits (16,384 bytes).
   * Supports 131,072 credentials per status list epoch.
   */
  public static readonly DEFAULT_BITSTRING_SIZE_BITS = 131072;

  /**
   * In-memory cache of tenant bitstrings (keyed by `${tenantId}:${epoch}`).
   */
  private static activeBitstrings = new Map<string, Buffer>();

  /**
   * Creates a zeroed bitstring buffer of the specified bit capacity.
   */
  public static createBitstring(sizeBits: number = this.DEFAULT_BITSTRING_SIZE_BITS): Buffer {
    const byteLength = Math.ceil(sizeBits / 8);
    return Buffer.alloc(byteLength, 0);
  }

  /**
   * Sets the bit at the given index (0 = VALID, 1 = REVOKED) using W3C MSB-first bit order.
   */
  public static setBit(buffer: Buffer, index: number, value: 0 | 1): void {
    const byteIndex = Math.floor(index / 8);
    if (byteIndex >= buffer.length) {
      throw new Error(
        `Bitstring index ${index} out of bounds (buffer byte capacity: ${buffer.length} bytes, max index: ${buffer.length * 8 - 1})`
      );
    }
    const bitOffset = 7 - (index % 8);
    if (value === 1) {
      buffer[byteIndex] |= (1 << bitOffset);
    } else {
      buffer[byteIndex] &= ~(1 << bitOffset);
    }
  }

  /**
   * Gets the bit at the given index using W3C MSB-first bit order.
   */
  public static getBit(buffer: Buffer, index: number): 0 | 1 {
    const byteIndex = Math.floor(index / 8);
    if (byteIndex >= buffer.length) {
      return 0;
    }
    const bitOffset = 7 - (index % 8);
    return ((buffer[byteIndex] >> bitOffset) & 1) as 0 | 1;
  }

  /**
   * Compresses a bitstring buffer using GZIP and returns standard Base64 string.
   */
  public static compressBitstring(buffer: Buffer): string {
    const gzipped = zlib.gzipSync(buffer);
    return gzipped.toString("base64");
  }

  /**
   * Decompresses a Base64 GZIP string back into a raw bitstring buffer.
   */
  public static decompressBitstring(gzipBase64: string): Buffer {
    const compressed = Buffer.from(gzipBase64, "base64");
    return zlib.gunzipSync(compressed);
  }

  /**
   * Encodes a raw bitstring buffer as W3C Bitstring Status List v1.0 multibase
   * base64url (no-padding) with leading 'u' prefix over GZIP bytes.
   */
  public static encodeMultibaseBitstring(buffer: Buffer): string {
    const gzipped = zlib.gzipSync(buffer);
    return `u${gzipped.toString("base64url")}`;
  }

  /**
   * Decodes a W3C Bitstring Status List v1.0 multibase ('u'-prefixed base64url GZIP) string.
   */
  public static decodeMultibaseBitstring(encodedList: string): Buffer {
    if (!encodedList || !encodedList.startsWith("u")) {
      throw new Error("Invalid W3C Bitstring Status List v1.0 multibase encoding (expected 'u' prefix).");
    }
    const compressed = Buffer.from(encodedList.slice(1), "base64url");
    return zlib.gunzipSync(compressed);
  }

  /**
   * Computes the deterministic SHA-256 digest of the compressed or raw bitstring.
   */
  public static computeStatusDigest(data: string | Buffer): string {
    const buffer = typeof data === "string" ? Buffer.from(data, "utf8") : data;
    return `0x${crypto.createHash("sha256").update(buffer).digest("hex")}`;
  }

  /**
   * Builds a standards-compliant W3C StatusList2021 Verifiable Credential.
   */
  public static buildStatusListCredential(params: {
    tenantSlug: string;
    tenantName: string;
    statusEpoch: number;
    bitstringGzipBase64: string;
    issuerDid: string;
    baseUrl?: string;
  }): W3CStatusListCredential {
    const baseUrl = params.baseUrl || "https://credvail.com";
    const statusUrl = `${baseUrl}/tenants/${params.tenantSlug}/status/${params.statusEpoch}`;

    return {
      "@context": [
        "https://www.w3.org/ns/credentials/v2",
        "https://w3id.org/vc/status-list/2021/v1",
      ],
      id: `${statusUrl}#credential`,
      type: ["VerifiableCredential", "StatusList2021Credential"],
      issuer: params.issuerDid,
      validFrom: new Date().toISOString(),
      credentialSubject: {
        id: statusUrl,
        type: "StatusList2021",
        statusPurpose: "revocation",
        encodedList: params.bitstringGzipBase64,
      },
    };
  }

  /**
   * Builds a W3C Bitstring Status List v1.0 Verifiable Credential using multibase 'u' GZIP encoding.
   */
  public static buildBitstringStatusListCredential(params: {
    tenantSlug: string;
    tenantName: string;
    statusEpoch: number;
    bufferOrGzipBase64: Buffer | string;
    issuerDid: string;
    statusPurpose?: "revocation" | "suspension";
    baseUrl?: string;
  }): W3CBitstringStatusListCredential {
    const baseUrl = params.baseUrl || "https://credvail.com";
    const statusUrl = `${baseUrl}/tenants/${params.tenantSlug}/status/${params.statusEpoch}`;
    const rawBuffer =
      typeof params.bufferOrGzipBase64 === "string"
        ? params.bufferOrGzipBase64.startsWith("u")
          ? this.decodeMultibaseBitstring(params.bufferOrGzipBase64)
          : this.decompressBitstring(params.bufferOrGzipBase64)
        : params.bufferOrGzipBase64;

    return {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      id: `${statusUrl}#credential`,
      type: ["VerifiableCredential", "BitstringStatusListCredential"],
      issuer: params.issuerDid,
      validFrom: new Date().toISOString(),
      credentialSubject: {
        id: statusUrl,
        type: "BitstringStatusList",
        statusPurpose: params.statusPurpose || "revocation",
        encodedList: this.encodeMultibaseBitstring(rawBuffer),
        statusSize: 1,
      },
    };
  }

  /**
   * Retrieves or initializes the active bitstring buffer for a tenant epoch.
   */
  public static getOrCreateActiveBitstring(
    tenantId: string,
    epoch: number = 1,
    sizeBits: number = this.DEFAULT_BITSTRING_SIZE_BITS
  ): Buffer {
    const key = `${tenantId}:${epoch}`;
    if (!this.activeBitstrings.has(key)) {
      this.activeBitstrings.set(key, this.createBitstring(sizeBits));
    }
    return this.activeBitstrings.get(key)!;
  }

  /**
   * Stores an active bitstring buffer in cache.
   */
  public static setActiveBitstring(tenantId: string, epoch: number, buffer: Buffer): void {
    const key = `${tenantId}:${epoch}`;
    this.activeBitstrings.set(key, buffer);
  }

  /**
   * Retrieves the bit value at the given index from a Buffer or a Gzip-Base64 encoded string.
   */
  public static getStatusBit(bufferOrGzipBase64: Buffer | string, index: number): 0 | 1 {
    if (typeof bufferOrGzipBase64 === "string") {
      const buf = this.decompressBitstring(bufferOrGzipBase64);
      return this.getBit(buf, index);
    }
    return this.getBit(bufferOrGzipBase64, index);
  }

  /**
   * Clears in-memory bitstring caches (for hermetic test execution).
   */
  public static resetInMemoryStore(): void {
    this.activeBitstrings.clear();
  }

  /**
   * Alias for resetInMemoryStore.
   */
  public static clearCache(): void {
    this.resetInMemoryStore();
  }
}
