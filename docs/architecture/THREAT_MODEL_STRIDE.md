# CREDVAIL — STRIDE Threat Model & Security Architecture

**Project Title:** Blockchain-Verified, Privacy-Preserving Digital Credential Infrastructure  
**Document:** Threat Assessment, Attack Trees & Defensive Mitigations (STRIDE Methodology)  
**Document Version:** 1.0.0  
**Phase:** Phase 0 (Technical Planning)  

---

## 1. Executive Summary & Security Objectives

CREDVAIL manages sensitive academic, professional, and institutional credentials. The security architecture addresses the following core goals:
1. **Unforgeability:** No adversary can forge a valid credential without possessing the active private key of an authorized institutional issuer.
2. **Non-Tamperability:** Altering any attribute (e.g. recipient name, GPA, completion status) invalidates cryptographic proofs and fails Merkle root verification.
3. **Privacy Preservation:** Verifiers learn only the claims explicitly disclosed by the holder. Zero plain-text PII is leaked on the blockchain or in presentation network payloads.
4. **Tenant Isolation:** No tenant can access, modify, issue, or revoke records belonging to another tenant under any circumstances.
5. **Freshness Guarantee:** Revocation status checks cannot be bypassed by presenting stale, replayed, or cached snapshots.

---

## 2. STRIDE Threat Assessment Matrix

| STRIDE Category | Threat Description | Attack Vector | Severity | CREDVAIL Countermeasure |
| :--- | :--- | :--- | :---: | :--- |
| **Spoofing** | Rogue actor claims to be an authorized educational institution. | Self-signed W3C VC using fabricated DID. | **CRITICAL** | Verifier resolves `did:web` against institutional domain and confirms key fingerprint on Ethereum Sepolia registry contract. |
| **Spoofing** | Holder presents someone else's credential. | Holder downloads another person's public credential presentation. | **HIGH** | Verifier issues a cryptographic challenge nonce; holder must sign `(nonce \|\| audience)` using their bound `did:key` (WebCrypto). |
| **Tampering** | Student modifies certificate grade from "C" to "A". | Altering PDF text or claims within the JSON-LD document. | **CRITICAL** | Any claim modification alters the canonical N-Quads, invalidating the ECDSA signature and causing Merkle leaf hash mismatch. |
| **Tampering** | Attacker intercepts and modifies Bitstring Status List. | Man-in-the-Middle (MitM) flips revocation bit from `1` to `0`. | **CRITICAL** | Verifier computes SHA-256 digest of status list and verifies it against the immutable digest anchored on Ethereum Sepolia. |
| **Repudiation** | Institution denies issuing an authentic certificate. | University claims a valid certificate was unauthorized. | **HIGH** | Public key epoch registered on-chain with timestamped issuance batch root provides non-repudiable proof of institutional issuance. |
| **Information Disclosure** | Credential data intercepted in transit or on-chain. | Passive network eavesdropping or blockchain scanning. | **HIGH** | Full TLS 1.3 encryption in transit; zero PII stored on Ethereum (only 32-byte hashes); ECDSA-SD blinds non-disclosed attributes. |
| **Denial of Service** | Malicious spreadsheet upload executes code on server or client. | CSV/XLSX DDE / formula injection (`=cmd\|'/C calc'!A0`). | **HIGH** | Strict upload file size limits; streaming parsing; neutralizing leading `=`, `+`, `-`, `@` characters before storage and rendering. |
| **Denial of Service** | Resource exhaustion via massive PDF batch generation. | Initiating concurrent 50,000 certificate generation jobs. | **MEDIUM** | Rate limiting per tenant; decoupled asynchronous worker queue; chunked batch processing with backpressure. |
| **Elevation of Privilege** | Tenant user accesses another tenant's templates or keys. | Parameter tampering on REST APIs (`tenantId` manipulation). | **CRITICAL** | Strict session-bound tenant context; database queries scoped at repository level with `WHERE tenantId = :sessionTenantId`. |

---

## 3. Detailed Attack Trees & Defense Mechanisms

### 3.1 Attack Tree: Stale Revocation Cache Bypass
```
[Adversary Goal: Present Revoked Credential as Valid]
  │
  ├── Path A: Block Access to Public Status Endpoint
  │     └── Outcome: Verifier detects missing snapshot -> Emits "STATUS_UNKNOWN" (Fail-Closed)
  │
  ├── Path B: Serve Old Cached Status Snapshot (where bit was 0)
  │     ├── Check 1: Verifier checks snapshot HTTP cache header (max-age <= 60s)
  │     ├── Check 2: Verifier queries Ethereum Sepolia contract for latest status epoch
  │     └── Outcome: Cached epoch < On-chain epoch -> Emits "STATUS_UNKNOWN" or "INVALID"
  │
  └── Path C: Modify Bit in Fresh Status Snapshot
        ├── Verifier recomputes SHA-256(ModifiedBitstring)
        ├── Compares against on-chain anchored statusDigestSha256
        └── Outcome: Digest mismatch -> Emits "INVALID"
```

### 3.2 Attack Tree: CSV Formula Injection (DDE)
```
[Adversary Goal: Execute Code via Malicious Spreadsheet Import]
  │
  ├── Vector: Recipient Name = "=cmd|'/c powershell...'!A1"
  │
  ├── Ingestion Defense:
  │     ├── 1. Regex check on cell strings: /^[=+\-@\t\r]/
  │     ├── 2. Auto-escape dangerous prefixes with a leading single quote (')
  │     ├── 3. Strict schema validation (names must match /^[a-zA-Z\s\-'.]+$/)
  │     └── 4. Plain-text rendering in PDF (PDF generator renders raw text without script execution)
  │
  └── Outcome: Payload neutralized; executed as literal text.
```

---

## 4. Security Verification Checklist for Automated Testing (Phase 13)

- [ ] **SEC-01:** Mutate single character in credential claims -> Verifier returns `INVALID`.
- [ ] **SEC-02:** Present credential with unanchored Merkle root -> Verifier returns `INVALID`.
- [ ] **SEC-03:** Present revoked credential -> Verifier returns `REVOKED`.
- [ ] **SEC-04:** Replay previously consumed challenge nonce -> Verifier rejects request with `400 Bad Request`.
- [ ] **SEC-05:** Present challenge nonce with mismatched audience domain -> Verifier rejects with `403 Forbidden`.
- [ ] **SEC-06:** Query Tenant B credentials with Tenant A authentication token -> Returns `404 Not Found` / `403 Forbidden`.
- [ ] **SEC-07:** Upload CSV with formula injection -> Cell text sanitized and leading characters escaped.
- [ ] **SEC-08:** Query expired status snapshot against updated on-chain epoch -> Verifier returns `STATUS_UNKNOWN`.
- [ ] **SEC-09:** Verify credential signed by compromised key epoch -> Verifier returns `INVALID`.
- [ ] **SEC-10:** Verify credential signed by gracefully rotated key epoch -> Verifier returns `AUTHENTICITY_ONLY`.
