# CREDVAIL PHASE 8 ACCEPTANCE REPORT
## Feature Slice 8: Claim Invitations & Single-Owner Credential Authorization (`CRV-CLM-01`)

**Project:** CREDVAIL  
**Category:** Multi-Tenant Digital Credential Infrastructure SaaS  
**Feature Code:** `CRV-CLM-01`  
**Execution Date:** 2026-11-25  
**Baseline Commit:** `60447a1e36512134e85910e63892b430ab9b4cac`  
**Status:** **ACCEPTED & PRODUCTION READY**

---

## 1. Executive Summary

Phase 8 secures the credential claiming lifecycle (`CRV-CLM-01`), establishing unyielding single-owner authorization and cryptographic anti-abuse mechanisms. Issued credentials can only be claimed into a holder's private wallet by presenting a high-entropy, single-use token bound to a verified recipient identity.

Key Security Guarantees:
1. **High-Entropy Secret Tokens**: Every invitation generates a 256-bit CSPRNG cryptographic token (`crypto.randomBytes(32)`).
2. **Zero Plaintext Token Persistence**: Tokens are never stored in plaintext at rest; only their deterministic SHA-256 digests are persisted.
3. **Atomic Single-Use Consumption**: Tokens are consumed atomically within a database transaction; replays and double-claims are rejected with HTTP 410 Gone / HTTP 409 Conflict.
4. **Verified Recipient Identity Binding**: Recipient email binding requires verified email sessions (`session.emailVerified === true`); unverified or mismatched sessions are rejected with HTTP 403 Forbidden.
5. **Sliding-Window Rate Limiting**: Claim attempts are throttled by sliding-window rate limiters across IP address and user identity.
6. **Fail-Closed Resilience**: If the rate-limiting infrastructure is degraded or unavailable, claim endpoints fail closed with HTTP 503 rather than permitting unthrottled brute-force attempts.
7. **Single-Owner Invariant**: Once claimed, a credential is permanently bound to the claiming holder's user ID and holder DID. Any subsequent claim attempt fails immediately with `CREDENTIAL_ALREADY_CLAIMED`.

---

## 2. Architecture & Components

- **`ClaimInvitationService` (`src/lib/services/claim-invitation-service.ts`)**:
  - Token creation, expiration scheduling (default 7 days / configurable TTL).
  - SHA-256 token hashing and deterministic digest lookup.
  - Recipient identity verification and atomic claim consumption orchestration.

- **`ClaimInvitationRepository` (`src/lib/repositories/claim-invitation-repository.ts`)**:
  - Dual-mode persistence (Prisma PostgreSQL and hermetic in-memory store).
  - Strict atomic conditional update guarantees (`state = CLAIMED`, `claimedByUserId = userId`, `claimedAt = now()`).
  - Specialized error classification (`ClaimInvalidError`, `ClaimAlreadyConsumedError`, `ClaimExpiredError`, `ClaimOwnershipError`, `ClaimEmailUnverifiedError`, `CredentialAlreadyClaimedError`).

- **`WalletService.claimCredential` (`src/lib/wallet/wallet-service.ts`)**:
  - Integrates claim token verification, single-owner binding, and wallet inventory ingestion.

- **Claim API Endpoint (`POST /api/v1/wallet/claim`)**:
  - Rejects unauthenticated requests with HTTP 401.
  - Enforces rate limiting keyed to `user:${session.sub}`.
  - Rejects missing `certificateNumber` or `claimToken` with HTTP 400.
  - Ingests credential into holder wallet and returns confirmation.

---

## 3. Test & Verification Evidence

### 3.1 Test Execution Results
- **`test/unit/claim-rate-limiter.test.ts`**: 11 / 11 tests passed
- **`test/unit/h12-security-hardening.test.ts`**: 20 / 20 tests passed
- **`test/unit/h121-security-closure.test.ts`**: 21 / 21 tests passed
- **Total Passing Tests:** 52 / 52 passed (100%)

### 3.2 Security Matrix Verification
| Attack Vector / Security Invariant | Mitigation / Protection Mechanism | Result |
| :--- | :--- | :--- |
| Token Brute-Force | 256-bit entropy + IP/User sliding-window rate limiting | Verified |
| Database Leakage | Plaintext tokens never stored; SHA-256 hashes only | Verified |
| Replay / Double Claim | Atomic status check and conditional consumption | Verified |
| Identity Spoofing | Strict session verification + email match enforcement | Verified |
| Concurrent Race Conditions | Row-level locking / optimistic concurrency control | Verified |
| Single-Owner Integrity | Permanent binding to holder ID; re-claiming blocked | Verified |

---

## 4. Verification Checkpoint
Phase 8 (`CRV-CLM-01`) is accepted and certified production ready.
