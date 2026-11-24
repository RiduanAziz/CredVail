# CREDVAIL Security Priority & Remediation Register

**Document ID:** CRV-AUDIT-02-SECURITY-PRIORITY-REGISTER  
**Date:** 2026-11-24  
**Audit Scope:** Production Security, Cryptographic Soundness, Tenant Isolation, and Persistence Fail-Closed Guarantees  
**Status:** ACTIVE AUDIT REGISTER  
**Authoritative Reference:** [`docs/security/REMEDIATION_STATUS.md`](file:///f:/CredVail/docs/security/REMEDIATION_STATUS.md)

---

## 1. Risk Classification Methodology

- **P0 — Critical Blocker:** Vulnerabilities or architectural shortcuts that break tenant boundaries, allow credential theft, risk private-key compromise, or permit simulated state to masquerade as production evidence. Must be remediated before commercial deployment.
- **P1 — High Priority:** Conformance, standards compliance, and client-side isolation requirements essential for production trust and audit compliance.
- **P2 — Medium Priority:** Operational resilience, rate limiting, and administrative security hardening.
- **P3 — Low Priority:** Defense-in-depth enhancements, performance optimizations, and future cryptographic capabilities.

---

## 2. Priority Register

| Item ID | Priority | Category | Finding & Vulnerability Description | Affected Source Code | Risk Impact | Required Remediation Action | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **P0** | Secrets Management | **Issuer Private Key Derived from Session Secret / Hardcoded Default.** Private keys are encrypted using AES-256-GCM, but the key is derived from `SESSION_SECRET` or a hardcoded fallback string. Missing `KMS_MASTER_KEY` does not fail closed. | `src/lib/crypto/key-service.ts` (L105-107, L149-158) | High: Compromise of web session secret compromises all institutional signing keys. | Decouple encryption secrets. Require independent `KMS_MASTER_KEY` (minimum 32 bytes). In production, startup must fail closed if missing. | **OPEN** |
| **SEC-02** | **P0** | Persistence Hardening | **Silent In-Memory Fallback on Database Misconfiguration.** Repositories silently switch to in-memory `Map` instances if `REQUIRE_POSTGRES_INTEGRATION` is not explicitly set to `"true"`. | `src/lib/repositories/credential-repository.ts` (L70-74), `batch-repository.ts`, `tenant-repository.ts` | High: Multi-instance deployment produces split-brain state; server restart destroys credential records. | Eliminate silent in-memory fallback when `NODE_ENV === "production"`. Throw explicit, sanitized `DatabaseConnectionError` (HTTP 503). | **OPEN** |
| **SEC-03** | **P0** | Replay Protection | **Process-Local Challenge Nonce Cache Risk.** `ChallengeNonceRepository` defaults to PostgreSQL, but provides a static test double fallback. Under high concurrency without DB, lookups fall back to process memory. | `src/lib/repositories/challenge-nonce-repository.ts` (L289-324) | High: Horizontally scaled instances cannot verify challenges issued by sibling instances. | Enforce persistent database or Redis cluster storage for all verification challenges. Disallow in-memory fallback outside unit tests. | **OPEN** |
| **SEC-04** | **P0** | Data Integrity | **PostgreSQL Single-Owner Invariant CI Verification.** Database triggers (`trg_claim_invitation_monotonicity`) and partial unique indexes prevent double-claiming, but local tests are skipped due to missing local daemon. | `prisma/sql/h1-3-3-ownership-monotonicity-trigger.sql`, `test/integration/postgres-wallet-ownership.test.ts` | High: Regressions in Prisma migrations could silently disable the trigger without local developer detection. | Enforce that CI quality gate runs against real PostgreSQL service container on every commit before merging to `main`. | **VERIFIED IN CI / BLOCKED LOCALLY** |
| **SEC-05** | **P0** | Blockchain Integrity | **Silent Simulation Mode Fallback.** `BlockchainService.isSimulationMode()` returns `true` whenever `FORCE_SEPOLIA_LIVE !== "true"` or private key is missing, anchoring roots into an in-memory map without error. | `src/lib/blockchain/blockchain-service.ts` (L131-135) | High: Production tenants could believe batch is anchored on Ethereum Sepolia when it was only held in server RAM. | Require explicit configuration. If institutional policy specifies blockchain anchoring, lack of RPC or wallet key must fail closed with HTTP 502/503. | **OPEN** |
| **SEC-06** | **P1** | Cryptographic Conformance | **Prototype VC Proof Suite (JsonWebSignature2020).** Credential signing uses ECDSA NIST P-256 encoded in custom `JsonWebSignature2020` format rather than a standardized W3C Data Integrity cryptosuite. | `src/lib/crypto/vc-service.ts` (L130-180), `verification-service.ts` | Medium: Interoperability rejection by external W3C-compliant credential verifiers and digital wallets. | Migrate to W3C Data Integrity proof suites (e.g., `ecdsa-2019` or `ecdsa-jws-2020`) with formal test fixtures. | **OPEN** |
| **SEC-07** | **P1** | Standards Profile | **StatusList2021 Legacy Structure.** Revocation engine uses StatusList2021 rather than the finalized W3C Bitstring Status List v1.0 standard. | `src/lib/services/status-list-service.ts`, `status-snapshot.ts` | Medium: Non-compliance with latest W3C recommendation for revocable credentials. | Upgrade status list generation, bit-indexing, and gzip compression to match W3C Bitstring Status List v1.0. | **OPEN** |
| **SEC-08** | **P1** | Client Key Custody | **Server-Side Wallet Service vs Client Browser Sandbox.** Server maintains `wallet-service.ts` alongside `browser-wallet.ts`. Potential risk of custodian holding recipient private keys. | `src/lib/wallet/wallet-service.ts`, `src/lib/wallet/browser-wallet.ts` | Medium: Custodial liability for holder identities. | Restrict server-side wallet exclusively to ephemeral testing. Ensure production wallet operations execute in browser WebCrypto / IndexedDB. | **PARTIALLY HARDENED** |
| **SEC-09** | **P1** | API Abuse | **Rate Limiting Coverage.** IP rate limiting is implemented on `/api/v1/verify/lookup/[id]` (60/min) and claim endpoints, but missing on general public endpoints. | `src/app/api/v1/verify/lookup/[id]/route.ts` (L13-37) | Medium: Potential DoS or credential enumeration via verification QR endpoints. | Implement unified Redis-backed sliding-window rate limiting middleware across all public route handlers. | **PARTIALLY HARDENED** |
| **SEC-10** | **P2** | Key Lifecycle | **Key Compromise Emergency Protocol (SEC-09).** Key compromise flags keys as `isCompromised = true` and invalidates credentials, but requires automated web notification hooks. | `src/lib/services/key-management-service.ts`, `verification-service.ts` | Low: Relying parties must actively query verification endpoint to detect key compromise. | Implement automated webhook dispatch and public transparency log updates upon emergency key deactivation. | **IMPLEMENTED & VERIFIED** |
| **SEC-11** | **P2** | Privacy Preservation | **Selective Disclosure Fail-Closed State.** Legacy custom salted-JSON tokens are disabled via `SelectiveDisclosureEngine` throwing explicit errors. | `src/lib/crypto/selective-disclosure.ts` (L71-133) | None (Fails Closed): Ensures no false claims of zero-knowledge privacy are made until properly built. | Integrate `@digitalbazaar/ecdsa-sd-2023-cryptosuite` with full issuer base proofs and holder derived proofs. | **DISABLED / FAIL-CLOSED** |

---

## 3. Immediate Action Plan

To transition CREDVAIL from **Release B** to **Release C (Production V1)**, the engineering team must address **SEC-01**, **SEC-02**, **SEC-03**, and **SEC-05** as the primary P0 remediation slice.
