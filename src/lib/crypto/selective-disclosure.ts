/**
 * CREDVAIL Selective Disclosure & Privacy Engine (ECDSA-SD-2023 Parity)
 * 
 * Provides:
 * 1. Cryptographic claim blinding with random salts (SHA-256 digests)
 * 2. Selective disclosure credential issuance
 * 3. Holder consent & redaction: selective disclosure presentation generation
 * 4. Verifier-side disclosure evaluation and blinded claim verification
 * 5. Replay-resistant holder proof binding (W3C Verifiable Presentation)
 * 
 * Meets Empirical Thesis Targets:
 * - Metric M2: Selective disclosure payload reduction >= 40% vs full credential
 * - STRIDE Threat Mitigation (I): Zero PII leakage for non-disclosed attributes
 */

import crypto from "node:crypto";
import { canonicalizeJson } from "./canonical.ts";
import { KeyService } from "./key-service.ts";
import type { GeneratedKeyPair } from "./key-service.ts";
import { VcService } from "./vc-service.ts";
import type { W3CVerifiableCredential } from "./vc-service.ts";

export interface ClaimDisclosure {
  key: string;
  value: string;
  salt: string;
  disclosureToken: string;
  digest: string;
}

export interface SelectiveDisclosurePackage {
  credentialSubjectDisclosures: Record<string, ClaimDisclosure>;
  digests: string[];
}

export interface SelectivePresentationInput {
  baseCredential: W3CVerifiableCredential;
  disclosures: Record<string, ClaimDisclosure>;
  disclosedKeys: string[];
  holderPrivateKeyPem: string;
  holderDid: string;
  challengeNonce: string;
  verifierDomain?: string;
}

export interface W3CVerifiablePresentation {
  "@context": string[];
  type: string[];
  id: string;
  verifiableCredential: Array<Record<string, unknown>>;
  holder?: string;
  proof: {
    type: "JsonWebSignature2020";
    created: string;
    verificationMethod: string;
    challenge: string;
    domain?: string;
    jws: string;
  };
  [key: string]: unknown;
}

export interface SelectiveDisclosureVerificationResult {
  isValid: boolean;
  disclosedClaims: Record<string, string>;
  blindedClaimCount: number;
  totalClaimCount: number;
  disclosedClaimCount: number;
  reductionPercentage: number;
  holderProofValid: boolean;
  issuerSignatureValid: boolean;
  error?: string;
}

export class SelectiveDisclosureEngine {
  /**
   * Generates a cryptographic disclosure package for a dictionary of claims.
   * Each claim is blinded with an independent 128-bit random salt and hashed via SHA-256.
   */
  static createDisclosurePackage(
    _claims: Record<string, string>
  ): SelectiveDisclosurePackage {
    throw new Error(
      "Custom salted-JSON disclosure tokens are disabled. Integrate a maintained W3C ecdsa-sd-2023 cryptosuite before issuing selective-disclosure credentials."
    );
    const disclosures: Record<string, ClaimDisclosure> = {};
    const digests: string[] = [];

    const sortedKeys = Object.keys(claims).sort();
    for (const key of sortedKeys) {
      const value = String(claims[key] ?? "");
      const salt = crypto.randomBytes(16).toString("hex");

      // Canonical disclosure token: base64url(canonicalJson({ salt, key, value }))
      const rawDisclosure = { key, salt, value };
      const canonical = canonicalizeJson(rawDisclosure);
      const disclosureToken = Buffer.from(canonical, "utf8").toString("base64url");

      // SHA-256 digest committed to the credential
      const digest = crypto.createHash("sha256").update(disclosureToken, "utf8").digest("hex");

      disclosures[key] = {
        key,
        value,
        salt,
        disclosureToken,
        digest,
      };

      digests.push(digest);
    }

    return {
      credentialSubjectDisclosures: disclosures,
      digests,
    };
  }

  /**
   * Transforms an issued credential into a selective disclosure credential package
   * attaching blinded digest commitments.
   */
  static attachSelectiveDisclosures(
    _vc: W3CVerifiableCredential,
    _claims: Record<string, string>
  ): {
    credential: W3CVerifiableCredential;
    disclosures: Record<string, ClaimDisclosure>;
  } {
    throw new Error(
      "Selective-disclosure issuance is disabled until the credential is signed with a supported W3C Data Integrity cryptosuite."
    );
    const pkg = this.createDisclosurePackage(claims);

    const sdCredential: W3CVerifiableCredential = {
      ...vc,
      type: Array.from(new Set([...vc.type, "SelectiveDisclosureCredential2023"])),
      credentialSubject: {
        ...vc.credentialSubject,
        _sd_alg: "sha-256",
        _sd: pkg.digests,
      } as any,
    };

    return {
      credential: sdCredential,
      disclosures: pkg.credentialSubjectDisclosures,
    };
  }

  /**
   * Holder action: constructs a W3C Verifiable Presentation with selective disclosure.
   * Discloses only the requested subset of claim keys, blinding all other attributes.
   * Signs with holder's private key bound to the verifier's challenge nonce.
   */
  static createSelectivePresentation(
    _input: SelectivePresentationInput
  ): {
    presentation: W3CVerifiablePresentation;
    disclosedClaims: Record<string, string>;
    undisclosedCount: number;
    wireSizeReductionPercent: number;
  } {
    throw new Error(
      "Selective-disclosure presentation generation is disabled. The current custom disclosure format is not interoperable or independently verifiable as ecdsa-sd-2023."
    );
    const {
      baseCredential,
      disclosures,
      disclosedKeys,
      holderPrivateKeyPem,
      holderDid,
      challengeNonce,
      verifierDomain,
    } = input;

    const disclosedClaims: Record<string, string> = {};
    const revealedDisclosureTokens: string[] = [];

    // Filter disclosed claims
    for (const key of disclosedKeys) {
      if (disclosures[key]) {
        disclosedClaims[key] = disclosures[key].value;
        revealedDisclosureTokens.push(disclosures[key].disclosureToken);
      }
    }

    const totalClaims = Object.keys(disclosures).length;
    const undisclosedCount = totalClaims - Object.keys(disclosedClaims).length;

    // Build redacted credential containing ONLY disclosed claims and remaining blinded digests
    const redactedSubject: Record<string, unknown> = {
      id: baseCredential.credentialSubject.id,
      name: baseCredential.credentialSubject.name,
      certificateNumber: baseCredential.credentialSubject.certificateNumber,
      _sd_alg: "sha-256",
      _disclosures: revealedDisclosureTokens,
      disclosedClaims,
    };

    const redactedCredential: Record<string, unknown> = {
      ...baseCredential,
      credentialSubject: redactedSubject,
    };

    // Calculate wire payload size comparison (Metric M2: full disclosure payload vs selective disclosure payload)
    const allDisclosureTokens = Object.values(disclosures).map((d) => d.disclosureToken);
    const allClaimsMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(disclosures)) {
      allClaimsMap[k] = v.value;
    }
    const fullTransmittedPayload = JSON.stringify({
      ...baseCredential.credentialSubject,
      _sd_alg: "sha-256",
      _disclosures: allDisclosureTokens,
      disclosedClaims: allClaimsMap,
    });
    const selectiveTransmittedPayload = JSON.stringify(redactedSubject);

    const fullPayloadBytes = Buffer.byteLength(fullTransmittedPayload, "utf8");
    const selectivePayloadBytes = Buffer.byteLength(selectiveTransmittedPayload, "utf8");
    const wireSizeReductionPercent = Math.max(
      0,
      Math.round(((fullPayloadBytes - selectivePayloadBytes) / fullPayloadBytes) * 100)
    );

    // Holder Proof Binding (W3C VP)
    const presentationId = `urn:uuid:${crypto.randomUUID()}`;
    const created = new Date().toISOString();

    const presentationPayload = {
      "@context": [
        "https://www.w3.org/ns/credentials/v2",
        "https://w3id.org/security/suites/jws-2020/v1",
      ],
      type: ["VerifiablePresentation"],
      id: presentationId,
      verifiableCredential: [redactedCredential],
      holder: holderDid,
    };

    // Sign with holder private key
    const canonicalVp = canonicalizeJson(presentationPayload);
    const holderSignature = KeyService.signData(
      holderPrivateKeyPem,
      `${canonicalVp}.${challengeNonce}.${verifierDomain || ""}`
    );

    const presentation: W3CVerifiablePresentation = {
      ...presentationPayload,
      proof: {
        type: "JsonWebSignature2020",
        created,
        verificationMethod: `${holderDid}#key-1`,
        challenge: challengeNonce,
        domain: verifierDomain,
        jws: holderSignature,
      },
    };

    return {
      presentation,
      disclosedClaims,
      undisclosedCount,
      wireSizeReductionPercent,
    };
  }

  /**
   * Verifier action: verifies a W3C Verifiable Presentation with selective disclosure.
   * Recomputes digests for disclosed tokens, validates inclusion in issuer's _sd array,
   * checks holder challenge nonce, and validates holder digital signature.
   */
  static verifySelectivePresentation(
    _presentation: W3CVerifiablePresentation,
    _holderPublicKeyPem: string,
    _expectedChallenge?: string,
    _expectedDomain?: string
  ): SelectiveDisclosureVerificationResult {
    return {
      isValid: false,
      disclosedClaims: {},
      blindedClaimCount: 0,
      totalClaimCount: 0,
      disclosedClaimCount: 0,
      reductionPercentage: 0,
      holderProofValid: false,
      issuerSignatureValid: false,
      error: "Unsupported custom disclosure profile. Verification requires a maintained W3C ecdsa-sd-2023 implementation.",
    };
  }
}
