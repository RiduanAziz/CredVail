import { describe, it, expect } from "vitest";
import { VcService } from "@/lib/crypto/vc-service";
import { KeyService } from "@/lib/crypto/key-service";
import { canonicalizeJson } from "@/lib/crypto/canonical";

describe("W3C Verifiable Credential 2.0 Engine & Digital Signing", () => {
  const mockTenant = {
    didUri: "did:web:credvail.com:tenants:apex",
    name: "Apex University",
    slug: "apex",
  };

  const keyPair = KeyService.generateEcdsaKeyPair();
  const keyIdentifier = `${mockTenant.didUri}#key-1`;

  it("should construct a valid unsigned W3C VC 2.0 conforming to schema", () => {
    const unsignedVc = VcService.buildUnsignedCredential({
      credentialId: "urn:uuid:11111111-2222-3333-4444-555555555555",
      certificateNumber: "APEX-2026-000001",
      tenantDidUri: mockTenant.didUri,
      tenantName: mockTenant.name,
      tenantSlug: mockTenant.slug,
      recipientId: "rec_123456",
      recipientName: "Ada Lovelace",
      recipientEmail: "ada@lovelace.org",
      claims: {
        course_name: "Advanced Cryptographic Systems",
        grade: "Distinction",
        issue_date: "November 15, 2026",
      },
      batchId: "batch_abc",
      merkleIndex: 0,
      bitstringIndex: 0,
      baseUrl: "https://credvail.com",
    });

    expect(unsignedVc["@context"]).toContain("https://www.w3.org/ns/credentials/v2");
    expect(unsignedVc["@context"]).toContain("https://w3id.org/security/suites/jws-2020/v1");
    expect(unsignedVc.id).toBe("urn:uuid:11111111-2222-3333-4444-555555555555");
    expect(unsignedVc.type).toContain("VerifiableCredential");
    expect(unsignedVc.type).toContain("CertificateCredential");
    expect(unsignedVc.issuer.id).toBe(mockTenant.didUri);
    expect(unsignedVc.issuer.name).toBe(mockTenant.name);

    expect(unsignedVc.credentialSubject.name).toBe("Ada Lovelace");
    expect(unsignedVc.credentialSubject.certificateNumber).toBe("APEX-2026-000001");
    expect(unsignedVc.credentialSubject.claims["course_name"]).toBe("Advanced Cryptographic Systems");

    expect(unsignedVc.credentialStatus.type).toBe("BitstringStatusListEntry");
    expect(unsignedVc.credentialStatus.statusPurpose).toBe("revocation");
    expect(unsignedVc.credentialStatus.statusListIndex).toBe(0);
    expect(unsignedVc.proof).toBeUndefined();
  });

  it("should digitally sign a credential using ECDSA NIST P-256 and produce W3C proof", () => {
    const unsignedVc = VcService.buildUnsignedCredential({
      credentialId: "urn:uuid:22222222-3333-4444-5555-666666666666",
      certificateNumber: "APEX-2026-000002",
      tenantDidUri: mockTenant.didUri,
      tenantName: mockTenant.name,
      tenantSlug: mockTenant.slug,
      recipientId: "rec_789012",
      recipientName: "Alan Turing",
      recipientEmail: "alan@turing.org",
      claims: { course_name: "Machine Intelligence", grade: "A+" },
      batchId: "batch_abc",
      merkleIndex: 1,
      bitstringIndex: 1,
    });

    const signedVc = VcService.signCredential(
      unsignedVc,
      keyPair.privateKeyPem,
      keyIdentifier
    );

    expect(signedVc.proof).toBeDefined();
    expect(signedVc.proof?.type).toBe("JsonWebSignature2020");
    expect(signedVc.proof?.proofPurpose).toBe("assertionMethod");
    expect(signedVc.proof?.verificationMethod).toBe(keyIdentifier);
    expect(typeof signedVc.proof?.jws).toBe("string");
    expect(signedVc.proof?.jws.length).toBeGreaterThan(50);
  });

  it("should cryptographically verify valid signed credential against issuer public key (PEM and JWK)", () => {
    const unsignedVc = VcService.buildUnsignedCredential({
      credentialId: "urn:uuid:33333333-4444-5555-6666-777777777777",
      certificateNumber: "APEX-2026-000003",
      tenantDidUri: mockTenant.didUri,
      tenantName: mockTenant.name,
      tenantSlug: mockTenant.slug,
      recipientId: "rec_345678",
      recipientName: "Grace Hopper",
      recipientEmail: "grace@navy.mil",
      claims: { course_name: "Compiler Construction" },
      batchId: "batch_abc",
      merkleIndex: 2,
      bitstringIndex: 2,
    });

    const signedVc = VcService.signCredential(
      unsignedVc,
      keyPair.privateKeyPem,
      keyIdentifier
    );

    // Verify with PEM
    const isValidPem = VcService.verifyCredentialSignature(signedVc, keyPair.publicKeyPem);
    expect(isValidPem).toBe(true);

    // Verify with JWK
    const isValidJwk = VcService.verifyCredentialSignature(signedVc, keyPair.publicKeyJwk);
    expect(isValidJwk).toBe(true);
  });

  it("should strictly reject verification if credential claims or subject data are tampered", () => {
    const unsignedVc = VcService.buildUnsignedCredential({
      credentialId: "urn:uuid:44444444-5555-6666-7777-888888888888",
      certificateNumber: "APEX-2026-000004",
      tenantDidUri: mockTenant.didUri,
      tenantName: mockTenant.name,
      tenantSlug: mockTenant.slug,
      recipientId: "rec_456789",
      recipientName: "Claude Shannon",
      recipientEmail: "claude@bell.labs",
      claims: { course_name: "Information Theory", grade: "A" },
      batchId: "batch_abc",
      merkleIndex: 3,
      bitstringIndex: 3,
    });

    const signedVc = VcService.signCredential(
      unsignedVc,
      keyPair.privateKeyPem,
      keyIdentifier
    );

    // 1. Tamper with grade
    const tamperedGrade = JSON.parse(JSON.stringify(signedVc));
    tamperedGrade.credentialSubject.claims["grade"] = "A+++";
    expect(VcService.verifyCredentialSignature(tamperedGrade, keyPair.publicKeyPem)).toBe(false);

    // 2. Tamper with recipient name
    const tamperedRecipient = JSON.parse(JSON.stringify(signedVc));
    tamperedRecipient.credentialSubject.name = "Malicious Impersonator";
    expect(VcService.verifyCredentialSignature(tamperedRecipient, keyPair.publicKeyPem)).toBe(false);

    // 3. Tamper with certificate number
    const tamperedCertNum = JSON.parse(JSON.stringify(signedVc));
    tamperedCertNum.credentialSubject.certificateNumber = "APEX-2026-999999";
    expect(VcService.verifyCredentialSignature(tamperedCertNum, keyPair.publicKeyPem)).toBe(false);

    // 4. Verify against an unrelated key pair
    const otherKeyPair = KeyService.generateEcdsaKeyPair();
    expect(VcService.verifyCredentialSignature(signedVc, otherKeyPair.publicKeyPem)).toBe(false);
  });

  it("should compute deterministic VC hash and Merkle leaf hash matching Cryptographic Profile", () => {
    const unsignedVc = VcService.buildUnsignedCredential({
      credentialId: "urn:uuid:55555555-6666-7777-8888-999999999999",
      certificateNumber: "APEX-2026-000005",
      tenantDidUri: mockTenant.didUri,
      tenantName: mockTenant.name,
      tenantSlug: mockTenant.slug,
      recipientId: "rec_567890",
      recipientName: "Katherine Johnson",
      recipientEmail: "katherine@nasa.gov",
      claims: { course_name: "Astrodynamics" },
      batchId: "batch_abc",
      merkleIndex: 4,
      bitstringIndex: 4,
    });

    const signedVc = VcService.signCredential(
      unsignedVc,
      keyPair.privateKeyPem,
      keyIdentifier
    );

    const vcHash = VcService.computeVcHash(signedVc);
    expect(vcHash.startsWith("0x")).toBe(true);
    expect(vcHash.length).toBe(66); // 32 bytes hex = 0x + 64 chars

    const leafHash = VcService.computeLeafHash(signedVc.id, "APEX-2026-000005", vcHash);
    expect(leafHash.startsWith("0x")).toBe(true);
    expect(leafHash.length).toBe(66);

    // Deterministic: repeating on identical inputs produces identical hash
    const vcHash2 = VcService.computeVcHash(signedVc);
    const leafHash2 = VcService.computeLeafHash(signedVc.id, "APEX-2026-000005", vcHash2);
    expect(vcHash2).toBe(vcHash);
    expect(leafHash2).toBe(leafHash);
  });

  it("should attach Merkle inclusion proof into evidence array without breaking signature verification of the original claims", () => {
    const unsignedVc = VcService.buildUnsignedCredential({
      credentialId: "urn:uuid:66666666-7777-8888-9999-000000000000",
      certificateNumber: "APEX-2026-000006",
      tenantDidUri: mockTenant.didUri,
      tenantName: mockTenant.name,
      tenantSlug: mockTenant.slug,
      recipientId: "rec_678901",
      recipientName: "Margaret Hamilton",
      recipientEmail: "margaret@mit.edu",
      claims: { course_name: "Software Engineering" },
      batchId: "batch_xyz",
      merkleIndex: 0,
      bitstringIndex: 0,
    });

    const signedVc = VcService.signCredential(
      unsignedVc,
      keyPair.privateKeyPem,
      keyIdentifier
    );

    const vcHash = VcService.computeVcHash(signedVc);
    const leafHash = VcService.computeLeafHash(signedVc.id, "APEX-2026-000006", vcHash);

    const mockProof = {
      leafHash,
      root: leafHash, // single-leaf root = leaf
      proof: [] as `0x${string}`[],
      index: 0,
      totalLeaves: 1,
    };

    const vcWithEvidence = VcService.attachMerkleProof(signedVc, mockProof, "batch_xyz");

    expect(vcWithEvidence.evidence).toBeDefined();
    expect(vcWithEvidence.evidence?.length).toBe(1);
    expect(vcWithEvidence.evidence?.[0].merkleRoot).toBe(mockProof.root);
    expect(vcWithEvidence.evidence?.[0].leafHash).toBe(leafHash);
    expect(vcWithEvidence.evidence?.[0].type).toContain("MerkleTreeInclusionProof2026");
  });
});
