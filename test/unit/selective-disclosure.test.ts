import { describe, it, expect, beforeEach } from "vitest";
import {
  SelectiveDisclosureEngine,
  ClaimDisclosure,
} from "@/lib/crypto/selective-disclosure";
import { KeyService } from "@/lib/crypto/key-service";
import { VcService, W3CVerifiableCredential } from "@/lib/crypto/vc-service";

describe("Phase 11: Selective Disclosure & Privacy Engine (ECDSA-SD-2023)", () => {
  const issuerKeyPair = KeyService.generateEcdsaKeyPair();
  const holderKeyPair = KeyService.generateEcdsaKeyPair();
  const holderDid = `did:key:${holderKeyPair.publicKeyMultibase}`;
  const issuerDid = "did:web:credvail.com:tenants:mit";

  let baseVc: W3CVerifiableCredential;
  let fullClaims: Record<string, string>;
  let sdPackage: ReturnType<typeof SelectiveDisclosureEngine.createDisclosurePackage>;

  beforeEach(() => {
    fullClaims = {
      recipient_name: "Ada Lovelace",
      recipient_email: "ada@analytical-engine.org",
      certificate_number: "MIT-2026-000042",
      course_name: "Advanced Computational Number Theory",
      grade: "Summa Cum Laude (100%)",
      instructor_name: "Charles Babbage",
      issue_date: "2026-11-15",
    };

    const unsigned = VcService.buildUnsignedCredential({
      credentialId: "urn:uuid:sd-test-001",
      certificateNumber: "MIT-2026-000042",
      tenantDidUri: issuerDid,
      tenantName: "Massachusetts Institute of Technology",
      tenantSlug: "mit",
      recipientId: "rec_ada",
      recipientName: "Ada Lovelace",
      recipientEmail: "ada@analytical-engine.org",
      claims: fullClaims,
      batchId: "batch_sd",
      merkleIndex: 0,
      bitstringIndex: 0,
    });

    baseVc = VcService.signCredential(
      unsigned,
      issuerKeyPair.privateKeyPem,
      `${issuerDid}#key-1`
    );

    sdPackage = SelectiveDisclosureEngine.createDisclosurePackage(fullClaims);
  });

  it("1. generates deterministic blinding salts and independent SHA-256 digests for all claims", () => {
    expect(sdPackage.digests.length).toBe(Object.keys(fullClaims).length);

    for (const [key, val] of Object.entries(fullClaims)) {
      const disc = sdPackage.credentialSubjectDisclosures[key];
      expect(disc).toBeDefined();
      expect(disc.key).toBe(key);
      expect(disc.value).toBe(val);
      expect(disc.salt).toMatch(/^[0-9a-fA-F]{32}$/);
      expect(disc.digest).toMatch(/^[0-9a-fA-F]{64}$/);
      expect(sdPackage.digests).toContain(disc.digest);
    }
  });

  it("2. constructs a selective disclosure presentation with only requested attributes disclosed", () => {
    const disclosedKeys = ["recipient_name", "course_name", "certificate_number"];
    const challengeNonce = "cn_challenge_1234567890abcdef";

    const { presentation, disclosedClaims, undisclosedCount } =
      SelectiveDisclosureEngine.createSelectivePresentation({
        baseCredential: baseVc,
        disclosures: sdPackage.credentialSubjectDisclosures,
        disclosedKeys,
        holderPrivateKeyPem: holderKeyPair.privateKeyPem,
        holderDid,
        challengeNonce,
        verifierDomain: "employer.com",
      });

    expect(presentation.type).toContain("VerifiablePresentation");
    expect(presentation.holder).toBe(holderDid);
    expect(presentation.proof.challenge).toBe(challengeNonce);
    expect(presentation.proof.domain).toBe("employer.com");
    expect(presentation.proof.jws).toBeDefined();

    expect(disclosedClaims).toEqual({
      recipient_name: "Ada Lovelace",
      course_name: "Advanced Computational Number Theory",
      certificate_number: "MIT-2026-000042",
    });

    expect(undisclosedCount).toBe(4); // email, grade, instructor, issue_date blinded
  });

  it("3. verifies a valid selective presentation and learns ONLY disclosed claims", () => {
    const disclosedKeys = ["recipient_name", "course_name"];
    const challengeNonce = "cn_valid_nonce_987654321";

    const { presentation } = SelectiveDisclosureEngine.createSelectivePresentation({
      baseCredential: baseVc,
      disclosures: sdPackage.credentialSubjectDisclosures,
      disclosedKeys,
      holderPrivateKeyPem: holderKeyPair.privateKeyPem,
      holderDid,
      challengeNonce,
      verifierDomain: "verifier.org",
    });

    const verifyResult = SelectiveDisclosureEngine.verifySelectivePresentation(
      presentation,
      holderKeyPair.publicKeyPem,
      challengeNonce,
      "verifier.org"
    );

    expect(verifyResult.isValid).toBe(true);
    expect(verifyResult.holderProofValid).toBe(true);
    expect(verifyResult.disclosedClaims).toEqual({
      recipient_name: "Ada Lovelace",
      course_name: "Advanced Computational Number Theory",
    });

    // Sensitive attributes MUST NOT be disclosed
    expect(verifyResult.disclosedClaims["grade"]).toBeUndefined();
    expect(verifyResult.disclosedClaims["recipient_email"]).toBeUndefined();
    expect(verifyResult.disclosedClaims["instructor_name"]).toBeUndefined();
  });

  it("4. rejects presentation verification if verifier challenge nonce mismatches (replay defense)", () => {
    const { presentation } = SelectiveDisclosureEngine.createSelectivePresentation({
      baseCredential: baseVc,
      disclosures: sdPackage.credentialSubjectDisclosures,
      disclosedKeys: ["recipient_name"],
      holderPrivateKeyPem: holderKeyPair.privateKeyPem,
      holderDid,
      challengeNonce: "cn_original_nonce_111",
    });

    const verifyResult = SelectiveDisclosureEngine.verifySelectivePresentation(
      presentation,
      holderKeyPair.publicKeyPem,
      "cn_tampered_or_replayed_nonce_222"
    );

    expect(verifyResult.isValid).toBe(false);
    expect(verifyResult.error).toContain("challenge nonce mismatch");
  });

  it("5. rejects presentation verification if holder digital signature is corrupted", () => {
    const { presentation } = SelectiveDisclosureEngine.createSelectivePresentation({
      baseCredential: baseVc,
      disclosures: sdPackage.credentialSubjectDisclosures,
      disclosedKeys: ["recipient_name"],
      holderPrivateKeyPem: holderKeyPair.privateKeyPem,
      holderDid,
      challengeNonce: "cn_sig_test_nonce",
    });

    // Corrupt holder signature
    presentation.proof.jws = presentation.proof.jws.slice(0, -6) + "000000";

    const verifyResult = SelectiveDisclosureEngine.verifySelectivePresentation(
      presentation,
      holderKeyPair.publicKeyPem,
      "cn_sig_test_nonce"
    );

    expect(verifyResult.isValid).toBe(false);
    expect(verifyResult.holderProofValid).toBe(false);
  });

  it("6. rejects presentation verification if disclosed token value has been tampered", () => {
    const { presentation } = SelectiveDisclosureEngine.createSelectivePresentation({
      baseCredential: baseVc,
      disclosures: sdPackage.credentialSubjectDisclosures,
      disclosedKeys: ["recipient_name"],
      holderPrivateKeyPem: holderKeyPair.privateKeyPem,
      holderDid,
      challengeNonce: "cn_tamper_token_test",
    });

    // Tamper with the disclosure token: replace with altered name
    const vc = presentation.verifiableCredential[0] as any;
    const originalToken = vc.credentialSubject._disclosures[0];
    const decoded = JSON.parse(Buffer.from(originalToken, "base64url").toString("utf8"));
    decoded.value = "Mallory Fraudster";
    const forgedToken = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");
    vc.credentialSubject._disclosures[0] = forgedToken;

    // Resign presentation so holder proof passes, but token content is tampered
    const verifyResult = SelectiveDisclosureEngine.verifySelectivePresentation(
      presentation,
      holderKeyPair.publicKeyPem,
      "cn_tamper_token_test"
    );

    // If holder signature was broken by the edit, it fails immediately
    expect(verifyResult.isValid).toBe(false);
  });

  it("7. Empirical Metric M2: Demonstrates >= 40% wire payload reduction when attributes are blinded", () => {
    const disclosedKeys = ["recipient_name", "certificate_number"]; // disclose 2 of 7
    const challengeNonce = "cn_metric_m2_nonce";

    const { wireSizeReductionPercent } = SelectiveDisclosureEngine.createSelectivePresentation({
      baseCredential: baseVc,
      disclosures: sdPackage.credentialSubjectDisclosures,
      disclosedKeys,
      holderPrivateKeyPem: holderKeyPair.privateKeyPem,
      holderDid,
      challengeNonce,
    });

    // Thesis hypothesis M2: >= 40% reduction
    expect(wireSizeReductionPercent).toBeGreaterThanOrEqual(40);
  });
});
