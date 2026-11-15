import { describe, it, expect, beforeEach } from "vitest";
import { StatusListService } from "@/lib/services/status-list-service";

describe("Phase 12: W3C Bitstring Status List Service Unit Tests", () => {
  beforeEach(() => {
    StatusListService.resetInMemoryStore();
  });

  it("1. creates a zeroed bitstring buffer with requested bit capacity", () => {
    const bitstring = StatusListService.createBitstring(1024);
    expect(bitstring.length).toBe(128); // 1024 bits / 8 = 128 bytes
    for (let i = 0; i < bitstring.length; i++) {
      expect(bitstring[i]).toBe(0);
    }
  });

  it("2. sets and gets bits with W3C MSB-first bit order accurately", () => {
    const bitstring = StatusListService.createBitstring(256);

    // Initial state: all bits are 0
    expect(StatusListService.getBit(bitstring, 0)).toBe(0);
    expect(StatusListService.getBit(bitstring, 7)).toBe(0);
    expect(StatusListService.getBit(bitstring, 42)).toBe(0);

    // Set individual bits
    StatusListService.setBit(bitstring, 0, 1);
    StatusListService.setBit(bitstring, 7, 1);
    StatusListService.setBit(bitstring, 42, 1);

    expect(StatusListService.getBit(bitstring, 0)).toBe(1);
    expect(StatusListService.getBit(bitstring, 1)).toBe(0);
    expect(StatusListService.getBit(bitstring, 7)).toBe(1);
    expect(StatusListService.getBit(bitstring, 8)).toBe(0);
    expect(StatusListService.getBit(bitstring, 42)).toBe(1);
    expect(StatusListService.getBit(bitstring, 43)).toBe(0);

    // Reset a bit to 0
    StatusListService.setBit(bitstring, 7, 0);
    expect(StatusListService.getBit(bitstring, 7)).toBe(0);
  });

  it("3. throws error when setting bit out of buffer byte capacity", () => {
    const bitstring = StatusListService.createBitstring(64); // 8 bytes
    expect(() => {
      StatusListService.setBit(bitstring, 100, 1);
    }).toThrow("out of bounds");
  });

  it("4. compresses to GZIP Base64 and decompresses without data loss", () => {
    const bitstring = StatusListService.createBitstring(1024);
    StatusListService.setBit(bitstring, 15, 1);
    StatusListService.setBit(bitstring, 99, 1);
    StatusListService.setBit(bitstring, 512, 1);

    const gzipBase64 = StatusListService.compressBitstring(bitstring);
    expect(typeof gzipBase64).toBe("string");
    expect(gzipBase64.length).toBeGreaterThan(0);

    const restored = StatusListService.decompressBitstring(gzipBase64);
    expect(restored.length).toBe(bitstring.length);
    expect(StatusListService.getBit(restored, 15)).toBe(1);
    expect(StatusListService.getBit(restored, 99)).toBe(1);
    expect(StatusListService.getBit(restored, 512)).toBe(1);
    expect(StatusListService.getBit(restored, 513)).toBe(0);
  });

  it("5. computes deterministic SHA-256 status digest", () => {
    const bitstring = StatusListService.createBitstring(256);
    StatusListService.setBit(bitstring, 1, 1);

    const gzip = StatusListService.compressBitstring(bitstring);
    const digest1 = StatusListService.computeStatusDigest(gzip);
    const digest2 = StatusListService.computeStatusDigest(gzip);

    expect(digest1).toMatch(/^0x[0-9a-f]{64}$/);
    expect(digest1).toBe(digest2);
  });

  it("6. builds a standards-compliant W3C StatusList2021 Verifiable Credential", () => {
    const bitstring = StatusListService.createBitstring(256);
    const gzip = StatusListService.compressBitstring(bitstring);

    const vc = StatusListService.buildStatusListCredential({
      tenantSlug: "mit",
      tenantName: "MIT",
      statusEpoch: 1,
      bitstringGzipBase64: gzip,
      issuerDid: "did:web:credvail.com:tenants:mit",
    });

    expect(vc["@context"]).toContain("https://w3id.org/vc/status-list/2021/v1");
    expect(vc.type).toContain("StatusList2021Credential");
    expect(vc.credentialSubject.type).toBe("StatusList2021");
    expect(vc.credentialSubject.statusPurpose).toBe("revocation");
    expect(vc.credentialSubject.encodedList).toBe(gzip);
  });
});
