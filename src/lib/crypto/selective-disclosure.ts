/**
 * CREDVAIL Selective Disclosure Security Gate.
 *
 * The previous custom salted-JSON disclosure mechanism was not an
 * interoperable W3C ecdsa-sd-2023 implementation. Issuance, derivation and
 * verification are deliberately disabled until a maintained cryptosuite
 * and its issuer/holder proof workflows are integrated and tested.
 */

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
      "Selective-disclosure issuance is disabled until CREDVAIL integrates a maintained W3C ecdsa-sd-2023 cryptosuite."
    );
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
