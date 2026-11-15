import { describe, it, expect } from "vitest";
import { KeyService } from "@/lib/crypto/key-service";
import { KeyManagementService } from "@/lib/services/key-management-service";

describe("W3C did:web Identity & Document Resolution", () => {
  describe("didWebToHttpsUrl Resolution", () => {
    it("should resolve root platform did:web to root .well-known/did.json", () => {
      const didUri = "did:web:credvail.com";
      const resolvedUrl = KeyService.didWebToHttpsUrl(didUri);
      expect(resolvedUrl).toBe("https://credvail.com/.well-known/did.json");
    });

    it("should resolve tenant did:web to subpath .well-known/did.json", () => {
      const didUri = "did:web:credvail.com:tenants:harvard";
      const resolvedUrl = KeyService.didWebToHttpsUrl(didUri);
      expect(resolvedUrl).toBe("https://credvail.com/tenants/harvard/.well-known/did.json");
    });

    it("should handle percent-encoded port numbers in hostname", () => {
      const didUri = "did:web:localhost%3A3000:tenants:apex-univ";
      const resolvedUrl = KeyService.didWebToHttpsUrl(didUri);
      expect(resolvedUrl).toBe("https://localhost:3000/tenants/apex-univ/.well-known/did.json");
    });

    it("should throw error for non did:web identifiers", () => {
      expect(() => KeyService.didWebToHttpsUrl("did:key:z6MkpTHR8VNsBxYAAWHuEc2Ka9txNgoV74RXLu8HJmk5tvgo")).toThrow(
        "Invalid did:web identifier"
      );
      expect(() => KeyService.didWebToHttpsUrl("https://credvail.com")).toThrow(
        "Invalid did:web identifier"
      );
    });
  });

  describe("buildDidDocument Structure & Compromise Exclusion", () => {
    const didUri = "did:web:credvail.com:tenants:stanford";
    const keyPair1 = KeyService.generateEcdsaKeyPair();
    const keyPair2 = KeyService.generateEcdsaKeyPair();
    const keyPair3 = KeyService.generateEcdsaKeyPair();

    it("should generate a compliant W3C DID document with verification methods", () => {
      const didDoc = KeyService.buildDidDocument(didUri, [
        {
          keyEpoch: 1,
          publicKeyJwk: keyPair1.publicKeyJwk,
          isActive: true,
          isCompromised: false,
        },
      ]);

      expect(didDoc["@context"]).toContain("https://www.w3.org/ns/did/v1");
      expect(didDoc["@context"]).toContain("https://w3id.org/security/suites/jws-2020/v1");
      expect(didDoc.id).toBe(didUri);
      expect(didDoc.verificationMethod.length).toBe(1);
      expect(didDoc.verificationMethod[0].id).toBe(`${didUri}#key-1`);
      expect(didDoc.verificationMethod[0].type).toBe("JsonWebKey2020");
      expect(didDoc.verificationMethod[0].controller).toBe(didUri);
      expect(didDoc.verificationMethod[0].publicKeyJwk).toEqual(keyPair1.publicKeyJwk);

      expect(didDoc.assertionMethod).toEqual([`${didUri}#key-1`]);
      expect(didDoc.authentication).toEqual([`${didUri}#key-1`]);
    });

    it("should include historical keys in verificationMethod but omit inactive keys from assertionMethod", () => {
      const didDoc = KeyService.buildDidDocument(didUri, [
        {
          keyEpoch: 2,
          publicKeyJwk: keyPair2.publicKeyJwk,
          isActive: true,
          isCompromised: false,
        },
        {
          keyEpoch: 1,
          publicKeyJwk: keyPair1.publicKeyJwk,
          isActive: false, // ROTATED
          isCompromised: false,
        },
      ]);

      // Both keys present in verificationMethod for audit verification
      expect(didDoc.verificationMethod.length).toBe(2);
      expect(didDoc.verificationMethod.map((v) => v.id)).toContain(`${didUri}#key-1`);
      expect(didDoc.verificationMethod.map((v) => v.id)).toContain(`${didUri}#key-2`);

      // Only active key in assertionMethod
      expect(didDoc.assertionMethod).toEqual([`${didUri}#key-2`]);
      expect(didDoc.authentication).toEqual([`${didUri}#key-2`]);
    });

    it("should strictly exclude COMPROMISED keys from assertionMethod (SEC-09)", () => {
      const didDoc = KeyService.buildDidDocument(didUri, [
        {
          keyEpoch: 3,
          publicKeyJwk: keyPair3.publicKeyJwk,
          isActive: true,
          isCompromised: false,
        },
        {
          keyEpoch: 2,
          publicKeyJwk: keyPair2.publicKeyJwk,
          isActive: false,
          isCompromised: true, // COMPROMISED
        },
        {
          keyEpoch: 1,
          publicKeyJwk: keyPair1.publicKeyJwk,
          isActive: false,
          isCompromised: false, // ROTATED
        },
      ]);

      // All 3 remain in verificationMethod for historical tracking
      expect(didDoc.verificationMethod.length).toBe(3);

      // Compromised key is definitely NOT in assertionMethod
      expect(didDoc.assertionMethod).not.toContain(`${didUri}#key-2`);
      expect(didDoc.assertionMethod).toEqual([`${didUri}#key-3`]);
    });
  });

  describe("Platform Root DID Document", () => {
    it("should generate platform root did document for credvail.com", () => {
      const platformDoc = KeyManagementService.getPlatformDidDocument("credvail.com");
      expect(platformDoc.id).toBe("did:web:credvail.com");
      expect(platformDoc["@context"]).toBeDefined();
    });
  });
});
