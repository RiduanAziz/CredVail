/**
 * CREDVAIL Verifiable Credential 2.0 Engine & Merkle Anchoring
 * 
 * Provides:
 * 1. Standards-compliant W3C Verifiable Credential Data Model 2.0 construction
 * 2. RFC 8785 JSON Canonicalization Scheme (JCS) deterministic hashing
 * 3. W3C Data Integrity / JsonWebSignature2020 digital signing via NIST P-256
 * 4. Signature verification against issuer public key (PEM / JWK)
 * 5. OpenZeppelin-compatible Keccak-256 Merkle leaf calculation
 * 6. Batch Merkle Tree construction & O(log N) inclusion proof generation
 * 7. Verification of Merkle inclusion proofs against Merkle roots
 */

import { canonicalizeJson, computeKeccak256 } from "./canonical.ts";
import { KeyService } from "./key-service.ts";
import type { EcdsaPublicKeyJwk } from "./key-service.ts";
import { CredvailMerkleTree } from "./merkle.ts";
import type { MerkleInclusionProof } from "../../types/index.ts";

export interface CredentialStatusEntry {
  id: string;
  type: "BitstringStatusListEntry";
  statusPurpose: "revocation" | "suspension";
  statusListIndex: number;
  statusListCredential: string;
}

export interface CredentialEvidence {
  id: string;
  type: string[];
  merkleRoot: `0x${string}`;
  leafHash: `0x${string}`;
  merkleIndex: number;
  totalLeaves: number;
  proof: `0x${string}`[];
}

export interface DataIntegrityProof {
  type: "JsonWebSignature2020";
  created: string;
  verificationMethod: string;
  proofPurpose: "assertionMethod";
  jws: string;
}

export interface W3CVerifiableCredential {
  "@context": string[];
  id: string;
  type: string[];
  issuer: {
    id: string;
    name: string;
  };
  validFrom: string;
  validUntil?: string;
  credentialSubject: {
    id: string;
    name: string;
    certificateNumber: string;
    recipientEmail: string;
    claims: Record<string, string>;
    [key: string]: unknown;
  };
  credentialStatus: CredentialStatusEntry;
  evidence?: CredentialEvidence[];
  proof?: DataIntegrityProof;
}

export interface BuildCredentialInput {
  credentialId: string;
  certificateNumber: string;
  tenantDidUri: string;
  tenantName: string;
  tenantSlug: string;
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  claims: Record<string, string>;
  batchId: string;
  merkleIndex: number;
  bitstringIndex: number;
  validFrom?: string;
  validUntil?: string;
  statusEpoch?: number;
  baseUrl?: string;
}

export class VcService {
  /**
   * Constructs an unsigned, standards-compliant W3C Verifiable Credential 2.0 object.
   */
  static buildUnsignedCredential(input: BuildCredentialInput): W3CVerifiableCredential {
    const validFrom = input.validFrom || new Date().toISOString();
    const baseUrl = input.baseUrl || "https://credvail.com";
    const statusEpoch = input.statusEpoch || 1;

    return {
      "@context": [
        "https://www.w3.org/ns/credentials/v2",
        "https://w3id.org/security/suites/jws-2020/v1",
      ],
      id: input.credentialId,
      type: ["VerifiableCredential", "CertificateCredential"],
      issuer: {
        id: input.tenantDidUri,
        name: input.tenantName,
      },
      validFrom,
      ...(input.validUntil ? { validUntil: input.validUntil } : {}),
      credentialSubject: {
        id: `urn:uuid:${input.recipientId}`,
        name: input.recipientName,
        recipientEmail: input.recipientEmail,
        certificateNumber: input.certificateNumber,
        claims: { ...input.claims },
      },
      credentialStatus: {
        id: `${baseUrl}/tenants/${input.tenantSlug}/status/${statusEpoch}#${input.bitstringIndex}`,
        type: "BitstringStatusListEntry",
        statusPurpose: "revocation",
        statusListIndex: input.bitstringIndex,
        statusListCredential: `${baseUrl}/tenants/${input.tenantSlug}/status/${statusEpoch}`,
      },
    };
  }

  /**
   * Cryptographically signs an unsigned W3C Verifiable Credential using NIST P-256 ECDSA.
   * Produces a JCS-canonicalized signature attached to the proof block.
   */
  static signCredential(
    vc: W3CVerifiableCredential,
    privateKeyPem: string,
    verificationMethod: string
  ): W3CVerifiableCredential {
    // Strip proof and evidence to ensure canonical core credential representation
    const { proof: _existingProof, evidence: _existingEvidence, ...corePayload } = vc;

    // Deterministically serialize unsigned core payload using RFC 8785 (JCS)
    const canonicalPayload = canonicalizeJson(corePayload);

    // Generate ECDSA-SHA256 signature
    const signatureHex = KeyService.signData(privateKeyPem, canonicalPayload);

    const proof: DataIntegrityProof = {
      type: "JsonWebSignature2020",
      created: new Date().toISOString(),
      verificationMethod,
      proofPurpose: "assertionMethod",
      jws: signatureHex,
    };

    return {
      ...vc,
      proof,
    };
  }

  /**
   * Cryptographically verifies the digital signature of a W3C Verifiable Credential.
   * Returns false if any claims or metadata have been altered.
   */
  static verifyCredentialSignature(
    vc: W3CVerifiableCredential,
    publicKeyPemOrJwk: string | EcdsaPublicKeyJwk
  ): boolean {
    if (!vc.proof || !vc.proof.jws) {
      return false;
    }

    // Strip proof and evidence to reproduce original signed payload
    const { proof, evidence: _evidence, ...corePayload } = vc;
    const canonicalPayload = canonicalizeJson(corePayload);

    return KeyService.verifySignature(publicKeyPemOrJwk, canonicalPayload, proof.jws);
  }

  /**
   * Computes the deterministic Keccak-256 hash of a signed Verifiable Credential.
   */
  static computeVcHash(signedVc: W3CVerifiableCredential): `0x${string}` {
    const canonicalSigned = canonicalizeJson(signedVc);
    return computeKeccak256(canonicalSigned);
  }

  /**
   * Computes the deterministic Keccak-256 Merkle leaf hash matching Section 5.1 of Cryptographic Profile:
   * Leaf = keccak256(canonical({ credentialId, certificateNumber, vcHash }))
   */
  static computeLeafHash(
    credentialId: string,
    certificateNumber: string,
    vcHash: string
  ): `0x${string}` {
    const leafPayload = {
      certificateNumber,
      credentialId,
      vcHash,
    };
    return computeKeccak256(canonicalizeJson(leafPayload));
  }

  /**
   * Constructs an OpenZeppelin-compatible Merkle tree from an ordered list of leaf hashes.
   */
  static buildBatchMerkleTree(leaves: `0x${string}`[]): CredvailMerkleTree {
    return new CredvailMerkleTree(leaves);
  }

  /**
   * Extracts an inclusion proof for the leaf at index i.
   */
  static generateMerkleProof(tree: CredvailMerkleTree, index: number): MerkleInclusionProof {
    const root = tree.getRoot();
    const proof = tree.getProof(index);
    const leafHash = tree.getLeaf(index);

    return {
      leafHash,
      root,
      proof,
      index,
      totalLeaves: tree.getLeafCount(),
    };
  }

  /**
   * Verifies an inclusion proof against a specified Merkle root.
   */
  static verifyMerkleProof(
    leaf: `0x${string}`,
    proof: `0x${string}`[],
    root: `0x${string}`
  ): boolean {
    return CredvailMerkleTree.verifyProof(leaf, proof, root);
  }

  /**
   * Attaches the computed Merkle inclusion proof into the Verifiable Credential's evidence block.
   */
  static attachMerkleProof(
    vc: W3CVerifiableCredential,
    merkleProof: MerkleInclusionProof,
    batchId: string
  ): W3CVerifiableCredential {
    const evidence: CredentialEvidence = {
      id: `urn:merkle-batch:${batchId}`,
      type: ["MerkleTreeInclusionProof2026"],
      merkleRoot: merkleProof.root,
      leafHash: merkleProof.leafHash,
      merkleIndex: merkleProof.index,
      totalLeaves: merkleProof.totalLeaves,
      proof: merkleProof.proof,
    };

    return {
      ...vc,
      evidence: [evidence],
    };
  }
}
