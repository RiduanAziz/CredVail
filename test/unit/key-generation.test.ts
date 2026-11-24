import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { KeyService, encodeBase58 } from "@/lib/crypto/key-service";

describe("ECDSA NIST P-256 Key Generation & Cryptographic Operations", () => {
  beforeAll(() => {
    KeyService.setMasterKeyForTesting("zlWXisXpyUfdlbhE31iIHkuRx6gmTt0I6WIIaFffrE8=");
  });

  afterAll(() => {
    KeyService.resetMasterKeyForTesting();
  });
  it("should generate a valid ECDSA P-256 key pair with JWK, Multibase, PEM, and fingerprint", () => {
    const keyPair = KeyService.generateEcdsaKeyPair();

    // 1. Verify JWK conforms to RFC 7517 / JsonWebKey2020
    expect(keyPair.publicKeyJwk).toBeDefined();
    expect(keyPair.publicKeyJwk.kty).toBe("EC");
    expect(keyPair.publicKeyJwk.crv).toBe("P-256");
    expect(typeof keyPair.publicKeyJwk.x).toBe("string");
    expect(typeof keyPair.publicKeyJwk.y).toBe("string");
    expect(keyPair.publicKeyJwk.x.length).toBeGreaterThan(20);
    expect(keyPair.publicKeyJwk.y.length).toBeGreaterThan(20);

    // 2. Verify Multibase Base58-BTC representation
    expect(keyPair.publicKeyMultibase).toBeDefined();
    expect(keyPair.publicKeyMultibase.startsWith("z")).toBe(true);
    expect(keyPair.publicKeyMultibase.length).toBeGreaterThan(30);

    // 3. Verify PEM structures
    expect(keyPair.publicKeyPem).toContain("-----BEGIN PUBLIC KEY-----");
    expect(keyPair.publicKeyPem).toContain("-----END PUBLIC KEY-----");
    expect(keyPair.privateKeyPem).toContain("-----BEGIN PRIVATE KEY-----");
    expect(keyPair.privateKeyPem).toContain("-----END PRIVATE KEY-----");

    // 4. Verify SHA-256 fingerprint
    expect(keyPair.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should generate unique, non-colliding key pairs on sequential invocations", () => {
    const key1 = KeyService.generateEcdsaKeyPair();
    const key2 = KeyService.generateEcdsaKeyPair();

    expect(key1.fingerprint).not.toBe(key2.fingerprint);
    expect(key1.publicKeyMultibase).not.toBe(key2.publicKeyMultibase);
    expect(key1.publicKeyJwk.x).not.toBe(key2.publicKeyJwk.x);
    expect(key1.privateKeyPem).not.toBe(key2.privateKeyPem);
  });

  it("should encode arbitrary byte buffers to Base58-BTC correctly", () => {
    const testBuffer = Buffer.from("CredVail Institutional Cryptography 2026");
    const encoded = encodeBase58(testBuffer);
    expect(typeof encoded).toBe("string");
    expect(encoded.length).toBeGreaterThan(0);
    // Base58 excludes 0, O, I, l
    expect(encoded).not.toMatch(/[0OIl]/);
  });

  it("should encrypt private key at rest using AES-256-GCM and decrypt cleanly", () => {
    const keyPair = KeyService.generateEcdsaKeyPair();
    const encrypted = KeyService.encryptPrivateKey(keyPair.privateKeyPem);

    // Encrypted string format: aes-256-gcm:iv:tag:ciphertext
    expect(encrypted.startsWith("aes-256-gcm:")).toBe(true);
    const parts = encrypted.split(":");
    expect(parts.length).toBe(4);
    expect(parts[1].length).toBe(24); // 12 bytes IV = 24 hex chars
    expect(parts[2].length).toBe(32); // 16 bytes auth tag = 32 hex chars
    expect(parts[3].length).toBeGreaterThan(50); // ciphertext

    // Decrypt and compare
    const decrypted = KeyService.decryptPrivateKey(encrypted);
    expect(decrypted).toBe(keyPair.privateKeyPem);
  });

  it("should fail decryption when ciphertext or authentication tag is tampered", () => {
    const keyPair = KeyService.generateEcdsaKeyPair();
    const encrypted = KeyService.encryptPrivateKey(keyPair.privateKeyPem);
    const parts = encrypted.split(":");

    // Tamper the ciphertext
    const tamperedCiphertext = parts[3].slice(0, -2) + (parts[3].endsWith("aa") ? "bb" : "aa");
    const tampered = `aes-256-gcm:${parts[1]}:${parts[2]}:${tamperedCiphertext}`;

    expect(() => KeyService.decryptPrivateKey(tampered)).toThrow();
  });

  it("should sign arbitrary data and verify signature with PEM public key", () => {
    const keyPair = KeyService.generateEcdsaKeyPair();
    const message = "urn:credential:leaf-hash-keccak256-0x987654321fedcba";

    const signatureHex = KeyService.signData(keyPair.privateKeyPem, message);
    expect(typeof signatureHex).toBe("string");
    expect(signatureHex.length).toBeGreaterThan(50);

    // Verify with PEM
    const isValid = KeyService.verifySignature(keyPair.publicKeyPem, message, signatureHex);
    expect(isValid).toBe(true);
  });

  it("should verify signature with publicKeyJwk object", () => {
    const keyPair = KeyService.generateEcdsaKeyPair();
    const message = "CredVail verifiable credential issuance verification test";

    const signatureHex = KeyService.signData(keyPair.privateKeyPem, message);
    const isValid = KeyService.verifySignature(keyPair.publicKeyJwk, message, signatureHex);
    expect(isValid).toBe(true);
  });

  it("should reject verification on tampered data or wrong keys", () => {
    const keyPair1 = KeyService.generateEcdsaKeyPair();
    const keyPair2 = KeyService.generateEcdsaKeyPair();
    const message = "Original untampered payload";

    const signature = KeyService.signData(keyPair1.privateKeyPem, message);

    // 1. Tampered payload
    const isTamperedValid = KeyService.verifySignature(keyPair1.publicKeyPem, message + "!", signature);
    expect(isTamperedValid).toBe(false);

    // 2. Verified against wrong public key
    const isWrongKeyValid = KeyService.verifySignature(keyPair2.publicKeyPem, message, signature);
    expect(isWrongKeyValid).toBe(false);
  });

  it("should reconstruct usable SPKI PEM from public key multibase and verify ECDSA signatures", () => {
    const keyPair = KeyService.generateEcdsaKeyPair();
    const reconstructedPem = KeyService.multibaseToPublicKeyPem(keyPair.publicKeyMultibase);

    expect(reconstructedPem).toBe(keyPair.publicKeyPem);

    const message = "PostgreSQL reconstituted public key verification test";
    const signature = KeyService.signData(keyPair.privateKeyPem, message);
    expect(KeyService.verifySignature(reconstructedPem, message, signature)).toBe(true);

    // Fail-closed verification: empty PEM fails closed without throwing unhandled exceptions
    expect(KeyService.verifySignature("", message, signature)).toBe(false);
  });
});
