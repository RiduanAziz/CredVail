# CREDVAIL — Cryptographic Profile & Standards Conformance

**Project Title:** Blockchain-Verified, Privacy-Preserving Digital Credential Infrastructure  
**Document:** Cryptographic Algorithms, Curves, Encodings & Proof Protocols  
**Document Version:** 1.0.0  
**Phase:** Phase 0 (Technical Planning)  

---

## 1. Overview & Architectural Principles

CREDVAIL relies on established, peer-reviewed, standards-compliant cryptographic primitives. In accordance with master prompt guidelines:
1. **Zero Custom Cryptography:** No proprietary hash functions, cipher modes, or signature protocols are implemented.
2. **Deterministic Canonicalization:** Canonical JSON (RFC 8785) and RDF Dataset Canonicalization (URDNA2015) are used to guarantee bit-for-bit signature reproducibility across platforms.
3. **Domain Separation:** Distinct prefix salts (e.g. `0x00` for Merkle leaves, `0x01` for Merkle internal nodes) prevent preimage attacks and hash collision ambiguity.

---

## 2. Standards Conformance Matrix

| Specification | Version | Profile / Suite Utilized | Standard Body |
| :--- | :--- | :--- | :--- |
| **W3C Verifiable Credentials Data Model** | v2.0 | Core Data Model + JSON-LD Context | W3C Recommendation |
| **Decentralized Identifiers (DIDs)** | 1.0 | `did:web` (Issuers) & `did:key` (Holders) | W3C Recommendation |
| **Data Integrity** | 1.0 | W3C Data Integrity Proof specification | W3C Recommendation |
| **Selective Disclosure Cryptosuite** | 2023 | `ecdsa-sd-2023` (NIST P-256 / secp256k1) | W3C Candidate Rec. |
| **Credential Status List** | 1.0 | W3C Bitstring Status List 2021/2026 | W3C Recommendation |
| **Merkle Tree Proofs** | RFC 6962 / EVM | Deterministic Keccak-256 Merkle Tree | IETF / OpenZeppelin |
| **Password Hashing** | RFC 9106 | Argon2id (`m=65536, t=3, p=4`) | CFRG / IETF |

---

## 3. Decentralized Identifier (DID) Specifications

### 3.1 Issuer Identity: `did:web`
Each institutional tenant is assigned a deterministic web-based DID bound to its verified domain:
- **Format:** `did:web:credvail.io:tenants:<tenant-slug>`
- **DID Document Resolution Endpoint:** `https://credvail.io/tenants/<tenant-slug>/.well-known/did.json`
- **Structure:**
```json
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/suites/jws-2020/v1"
  ],
  "id": "did:web:credvail.io:tenants:harvard",
  "verificationMethod": [
    {
      "id": "did:web:credvail.io:tenants:harvard#key-1",
      "type": "JsonWebKey2020",
      "controller": "did:web:credvail.io:tenants:harvard",
      "publicKeyJwk": {
        "kty": "EC",
        "crv": "P-256",
        "x": "WKn-EgA-drnBcOGWMrOxyL-9UmgWDVvceW8gkGD1o90",
        "y": "D3A...rest-of-curve-coordinate..."
      }
    }
  ],
  "assertionMethod": [
    "did:web:credvail.io:tenants:harvard#key-1"
  ]
}
```

### 3.2 Holder Identity & Binding: `did:key`
Holder digital wallets generate an ephemeral or device-bound non-exportable WebCrypto key pair:
- **Format:** `did:key:zDna...` (Base58-BTC multibase prefix with P-256 / Ed25519 multicodec).
- **Purpose:** Signs verifier-generated challenge nonces during selective disclosure presentations, proving holder possession of the bound key without requiring blockchain transactions.

---

## 4. Selective Disclosure Protocol (`ecdsa-sd-2023`)

### 4.1 Mechanism
Unlike simple frontend masking (which leaks complete data over the wire), `ecdsa-sd-2023`:
1. Decomposes credential claims into individual canonical N-Quads.
2. Blinds each individual claim with a cryptographically secure random salt ($r_i$).
3. Computes HMAC-SHA256 digests over the salted claim statements.
4. Generates an ECDSA signature over the root hash of the claims tree.
5. In presentation mode, the holder selectively reveals only the chosen claims alongside their respective salts and Merkle/HMAC proofs.
6. The verifier verifies the signature over the reconstructed root hash while remaining completely oblivious to undisclosed claims.

### 4.2 Presentation Exchange Flow
```
Holder                                         Verifier
  |                                                |
  | -------- 1. Initiate Presentation Request ---> |
  | <------- 2. Challenge Nonce + Expected Claims - | (Nonce, 5-min TTL, Audience)
  |                                                |
  | [Filter Claims to Disclose]                    |
  | [Sign (Nonce || VerifierOrigin) with did:key]  |
  |                                                |
  | -------- 3. Disclosed Presentation ----------> | (Blinded Proof + Holder Signature)
  |                                                |
  |                                                | [Verify Holder Nonce Signature]
  |                                                | [Verify ECDSA-SD Claims Proof]
  |                                                | [Verify On-Chain Merkle Inclusion]
  |                                                | [Verify Bitstring Freshness]
  | <------- 4. Return Verification Outcome ------ | (VALID_CURRENT / REVOKED / etc.)
```

---

## 5. Merkle Tree & Blockchain Integrity Anchoring

### 5.1 Deterministic Tree Construction
To ensure 100% interoperability with OpenZeppelin's `MerkleProof.sol` on Ethereum Sepolia:
- **Hash Function:** Keccak-256 ($H(x) = \text{keccak256}(x)$).
- **Leaf Computation:**
  $$\text{Leaf}_i = \text{keccak256}(\text{canonical}(\text{credentialId} \mathbin{\Vert} \text{certificateNumber} \mathbin{\Vert} \text{vcHash}))$$
- **Sorting:** Adjacent leaf pairs are sorted lexicographically before hashing to prevent second-preimage tree manipulation:
  $$\text{Parent}(A, B) = \text{keccak256}(\min(A, B) \mathbin{\Vert} \max(A, B))$$
- **Root Commitment:** The resulting 32-byte Merkle root is posted to `CredvailRegistry.sol` via `anchorBatch(...)`.

### 5.2 Gas Efficiency Mathematical Proof ($O(1)$ Scaling)
- For a batch of $N$ certificates:
  - **Individual Anchoring Cost:** $N \times 45,000\text{ gas} \approx 45,000 N\text{ gas}$.
  - **CREDVAIL Merkle Batch Cost:** $1 \times 62,000\text{ gas} = \mathcal{O}(1)$.
  - **Efficiency Gain:** At $N = 1,000$, gas reduction is $> 99.86\%$.

---

## 6. W3C Bitstring Status List & Freshness Anchoring

### 6.1 Bitstring Specification
- **Bit Interpretation:**
  - `0`: Credential is valid and active.
  - `1`: Credential is suspended or revoked.
- **Compression:** The binary bitstring is GZIP-compressed and encoded in Base64 according to W3C Bitstring Status List v1.0.
- **Digest Anchoring:** The SHA-256 digest of the raw bitstring is anchored to `CredvailRegistry.sol` alongside an epoch integer:
  $$\text{Digest} = \text{SHA-256}(\text{RawBitstring})$$

---

## 7. Freshness-Aware Verification Transition Logic

The verification engine evaluates the following mathematical truth table:

| Condition 1 (Issuer & Signature) | Condition 2 (Merkle Proof) | Condition 3 (Bitstring Bit) | Condition 4 (On-chain Digest Fresh) | Machine Outcome |
| :---: | :---: | :---: | :---: | :--- |
| **Pass** | **Pass** | `0` (Active) | **Fresh & Matching** | `VALID_CURRENT` |
| **Pass** | **Pass** | `1` (Revoked)| Any | `REVOKED` |
| **Pass (Expired Key)**| **Pass** | `0` (Active) | **Fresh & Matching** | `AUTHENTICITY_ONLY` |
| **Pass** | **Pass** | Unknown/Stale | **Unreachable / Expired TTL**| `STATUS_UNKNOWN` |
| **Fail** | Any | Any | Any | `INVALID` |
| Any | **Fail** | Any | Any | `INVALID` |
