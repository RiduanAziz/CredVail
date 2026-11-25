# CREDVAIL CRV-SEC-01.2 — KMS LEGACY ISSUER-KEY MIGRATION COMPATIBILITY, INTEGRITY & PRODUCTION READINESS VERIFICATION REPORT

**Project:** CREDVAIL  
**Feature ID:** `CRV-SEC-01.2` (Live PostgreSQL Migration & Integrity Closure for `CRV-SEC-01`)  
**Priority:** P0 — Critical Security Infrastructure  
**Local Workspace:** `F:\CredVail`  
**Repository:** `https://github.com/RiduanAziz/CredVail`  
**Branch / Commit:** `main` at `67162e52bccac5bf8caf0c41d63e9cbc61fa47e8`  
**Evaluation Date:** 2026-11-25  
**Final Status Classification:** **`BLOCKED — TARGET ENVIRONMENT NOT VERIFIED`** *(Technical Acceptance `AC-01`–`AC-13`: **PASSED** on disposable PostgreSQL 16.16; Target Deployment Inventory `AC-14`: **PENDING** authorized operator execution)*

---

## 1. Executive Summary

`CRV-SEC-01.2` closes the live-database technical verification gap left open in `CRV-SEC-01.1`, where no PostgreSQL server was reachable on the workstation and the real migration entry point (`scripts/migrate-issuer-keys.mjs`) could only be analyzed statically and in unit mocks.

An isolated, disposable **PostgreSQL 16.16** cluster (`127.0.0.1:55432`, database `credvail_sec012_migration_test`) was provisioned purely inside temporary scratch storage, initialized with the exact Prisma schema (`prisma/schema.prisma`) and production SQL integrity triggers/indexes (`prisma/sql/`), and used to execute the real migration CLI across all 15 migration scenarios (`MIG-01`–`MIG-15`) plus end-to-end cryptographic signing/verification (`Phase F`).

Running real CLI execution immediately exposed **4 real defects** in `scripts/migrate-issuer-keys.mjs` and `src/lib/crypto/key-migration.ts`—including a high-severity `.env` secret bleed caused by static `PrismaClient` module initialization masking missing `KMS_MASTER_KEY` and `DATABASE_URL` preflight failures (`MIG-08`). All 4 defects were fixed within `CRV-SEC-01.2` scope, locked in with regression tests (`test/unit/migrate-issuer-keys-script.test.ts` and `test/integration/postgres-kms-migration.test.ts`), and re-verified end-to-end.

All technical gates (`AC-01` through `AC-13`), 389 unit tests, 54 live PostgreSQL integration tests (50 existing CI tests + 4 migration test groups covering `MIG-01..MIG-15`), 19 non-PG integration tests, `tsc --noEmit`, and `npm run build` passed. However, because this workstation has no authorized access to any live staging or production deployment database, **`AC-14` (Target database inventory) remains unverified**, mandating the final classification **`BLOCKED — TARGET ENVIRONMENT NOT VERIFIED`**.

---

## 2. Scope and Exclusions

### Included in Scope
- Audit of cryptographic key isolation, legacy encryption format (`SHA-256` + `SESSION_SECRET`), and current KMS encryption (`HKDF-SHA-256` + `KMS_MASTER_KEY`).
- Audit and hardening of `scripts/migrate-issuer-keys.mjs` and `src/lib/crypto/key-migration.ts`.
- Provisioning and schema synchronization of an isolated disposable PostgreSQL 16.16 cluster.
- Live CLI execution across dry-run, `--apply`, `--audit-kms-only`, idempotency, failure handling, and SQL-triggered mid-transaction rollback.
- End-to-end cryptographic verification (`KeyManagementService`, `KeyRepository`, `VcService`).
- Regression verification across unit tests, live PostgreSQL integration tests, typecheck, and production build.
- Production migration operational runbook ([KMS_ISSUER_KEY_MIGRATION_RUNBOOK.md](file:///F:/CredVail/docs/runbooks/KMS_ISSUER_KEY_MIGRATION_RUNBOOK.md)) and reconciliation of prior reports.

### Explicitly Excluded
- Production/staging deployment database modification or unauthorized credential probing.
- Unrelated refactors to RBAC, rate-limiting, selective disclosure, wallet, billing, UI, or `src/lib/db/persistence-policy.ts`.
- Git commits, pushes, merges, or deployments.

---

## 3. Verified Git Commit and Branch

- **Current Branch:** `main`
- **Starting & Final Local Commit:** `67162e52bccac5bf8caf0c41d63e9cbc61fa47e8` (`feat: implement core credential issuance, template designer, verification, and security infrastructure`)
- **Remote Baseline (`origin/main`):** `67162e52bccac5bf8caf0c41d63e9cbc61fa47e8` (`git rev-list --left-right --count HEAD...origin/main` -> `0 0`, fully synchronized before `CRV-SEC-01.2` edits)
- **Git Mutations:** Zero commits, zero pushes, zero resets/checkouts.

---

## 4. Architecture Reviewed

| Component | Path | Responsibility Reviewed |
| :--- | :--- | :--- |
| Key & Crypto Engine | [src/lib/crypto/key-service.ts](file:///F:/CredVail/src/lib/crypto/key-service.ts) | `resolveMasterKey`, `validateMasterKey`, HKDF-SHA-256, AES-256-GCM, ECDSA P-256, `did:web` |
| Pure Migration Engine | [src/lib/crypto/key-migration.ts](file:///F:/CredVail/src/lib/crypto/key-migration.ts) | Legacy SHA-256 derivation, KMS HKDF derivation, payload verification, credential redaction |
| Migration CLI | [scripts/migrate-issuer-keys.mjs](file:///F:/CredVail/scripts/migrate-issuer-keys.mjs) | Preflight checks, dry-run inspection, `--audit-kms-only`, Serializable CAS transaction apply |
| Persistence Schema | [prisma/schema.prisma](file:///F:/CredVail/prisma/schema.prisma) | `IssuerKey` (`issuer_keys`), `Tenant`, `ClaimInvitation`, triggers/indexes in `prisma/sql/` |
| Key Persistence | [src/lib/repositories/key-repository.ts](file:///F:/CredVail/src/lib/repositories/key-repository.ts) | Prisma hydration of `IssuerKey`, `multibaseToPublicKeyDetails`, fail-closed handling |
| Key Governance Service | [src/lib/services/key-management-service.ts](file:///F:/CredVail/src/lib/services/key-management-service.ts) | `getActiveSigningKey`, `getTenantDidDocument`, key rotation & compromise status |
| VC Engine | [src/lib/crypto/vc-service.ts](file:///F:/CredVail/src/lib/crypto/vc-service.ts) | W3C VC 2.0 `JsonWebSignature2020` signing & verification over JCS canonical JSON |
| Startup Boot Hook | [src/instrumentation.ts](file:///F:/CredVail/src/instrumentation.ts) | Production boot validation of `KMS_MASTER_KEY` and `DATABASE_URL` |
| Persistence Policy | [src/lib/db/persistence-policy.ts](file:///F:/CredVail/src/lib/db/persistence-policy.ts) | Fail-closed database policy & credential sanitization |

---

## 5. Legacy and Current Encryption Formats

Verified directly against pre-`67162e5` git history of `src/lib/crypto/key-service.ts`:

| Property | Legacy Encryption Format (Pre-`67162e5`) | Current KMS Format (`CRV-SEC-01`+) |
| :--- | :--- | :--- |
| **Secret Source** | `process.env.SESSION_SECRET` (or hardcoded fallback string if unset) | `process.env.KMS_MASTER_KEY` (canonical 32-byte Base64, 44 chars ending in `=`) |
| **Key Derivation** | `SHA-256(legacySecret)` (32 bytes raw digest) | `HKDF-SHA-256(base64Decode(KMS_MASTER_KEY), salt=empty, info="credvail_issuer_private_key_encryption_v1", len=32)` |
| **Cipher & Mode** | `AES-256-GCM` | `AES-256-GCM` |
| **IV & Auth Tag** | 12-byte CSPRNG IV; 16-byte GCM authentication tag | 12-byte CSPRNG IV; 16-byte GCM authentication tag |
| **Serialization** | `aes-256-gcm:${ivHex}:${tagHex}:${ciphertextHex}` | `aes-256-gcm:${ivHex}:${tagHex}:${ciphertextHex}` |
| **DB Schema Marker** | None (`IssuerKey` has no version column; identified cryptographically) | Identified by successful GCM authenticated decryption under HKDF-derived `KMS_MASTER_KEY` |

---

## 6. Secret-Isolation Findings

1. **`KeyService` Isolation Verified**: Zero references to `SESSION_SECRET` exist in `src/lib/crypto/key-service.ts`. Changing `SESSION_SECRET` has zero effect on KMS encryption/decryption. Production runtime boot (`src/instrumentation.ts`) calls `KeyService.validateMasterKey()` before serving traffic.
2. **Legacy Secret Isolation Verified**: `scripts/migrate-issuer-keys.mjs` never reads `SESSION_SECRET` silently; it exclusively consumes `LEGACY_SESSION_SECRET` via environment variables and fails closed on missing/empty inputs.
3. **Remediated `.env` Static Import Bleed (`DEFECT-01`)**: Previously, top-level `import { PrismaClient } from "@prisma/client"` and `new PrismaClient()` executed Prisma's internal `.env` loader before `main()` checked environment variables—allowing CWD `.env` to silently supply `KMS_MASTER_KEY` or `DATABASE_URL` when omitted (`MIG-08`). Moving dynamic `await import("@prisma/client")` cleanly after preflight validation closed this bypass.

---

## 7. Migration Script Behavior (`scripts/migrate-issuer-keys.mjs`)

- **Default Mode (Dry-Run)**: Read-only `findMany` query classifies every `IssuerKey` into `ALREADY_MIGRATED`, `READY_TO_UPDATE` (pending/eligible), `Skipped` (`encryptedPrivateKey === null`), or error (`FAILED_DECRYPTION`, `INVALID_PAYLOAD`, `VERIFICATION_FAILED`). Performs zero writes.
- **Apply Mode (`--apply`)**: Executes `findMany`, evaluation (including pre-commit self-decryption check against new KMS key), failure gate abort (`countFailed > 0` aborts before any writes), and optimistic compare-and-set `tx.issuerKey.updateMany({ where: { id, encryptedPrivateKey: oldEncrypted }, data: { encryptedPrivateKey: newEncrypted } })` verifying `res.count === 1` inside a **single `Serializable` `prisma.$transaction`**.
- **Audit-Only Mode (`--audit-kms-only`)**: Read-only mode allowing operators to confirm post-migration KMS decryptability without needing `LEGACY_SESSION_SECRET`; disallowed alongside `--apply`.

---

## 8. Disposable PostgreSQL Test Environment Details (Sanitized)

- **Host Environment Check**: Local workstation had no Docker, WSL, or PostgreSQL Windows service (`127.0.0.1:5432` refused). Existing `.env` `DATABASE_URL` was inspected safely via URL parser and confirmed to target inactive local `postgresql://localhost:5432/credvail?schema=public` (no staging/production credentials).
- **Disposable Engine Provisioned**: Isolated **PostgreSQL 16.16** (`Visual C++ build 1944, 64-bit`) binary cluster launched solely inside conversation scratch directory on ephemeral port **`55432`** bound to **`127.0.0.1`** with database **`credvail_sec012_migration_test`**.
- **Schema Parity**: Synchronized via `npx prisma db push --skip-generate --accept-data-loss`, followed by CI SQL enforcement scripts `prisma/sql/h1-3-3-single-owner-index.sql` and `prisma/sql/h1-3-3-ownership-monotonicity-trigger.sql` across all 13 public tables.
- **Lifecycle**: Disposable cluster was cleanly stopped and scratch binary/data directories removed after preserving verified test evidence.

---

## 9. Fixture Composition

Fixtures used fresh CSPRNG ephemeral test keys (`crypto.randomBytes(32)`) and real `KeyService.generateEcdsaKeyPair()` NIST P-256 key pairs:
- **Multi-tenant Fixture (4 records across 2 tenants)**:
  - `Tenant 1` (`Epoch 1`, inactive): Encrypted under legacy `SHA-256(LEGACY_SESSION_SECRET)` AES-256-GCM.
  - `Tenant 1` (`Epoch 2`, active): Encrypted under legacy `SHA-256(LEGACY_SESSION_SECRET)` AES-256-GCM.
  - `Tenant 1` (`Epoch 3`, inactive): Already encrypted under HKDF-SHA-256(`KMS_MASTER_KEY`).
  - `Tenant 2` (`Epoch 1`, active): Encrypted under legacy `SHA-256(LEGACY_SESSION_SECRET)` AES-256-GCM.
- **Adversarial / Failure Fixtures**: Empty `issuer_keys` table (`0` records), wrong `LEGACY_SESSION_SECRET`, missing/empty secrets, malformed Base64/16-byte KMS keys, corrupted ciphertext body, corrupted non-hex ciphertext tails, tampered GCM auth tags, and a PostgreSQL `BEFORE UPDATE` trigger aborting row 2 of a 2-record batch.

---

## 10. Dry-Run Results (`E1` & `MIG-13`)

Executed `node scripts/migrate-issuer-keys.mjs` directly against the 4-record mixed fixture (and repeatedly on empty + seeded tables):
- **Exit Code:** `0`
- **Total Records:** `4`
- **Already on New KMS Key:** `1`
- **Pending/Eligible Migration:** `3`
- **Skipped (`null` payload):** `0`
- **Decryption/Verify Failures:** `0`
- **Database Mutations:** `0` (exact pre/post ciphertext hashes matched 100% across repeated runs)

---

## 11. Apply Results (`E2`)

Executed `node scripts/migrate-issuer-keys.mjs --apply`:
- **Exit Code:** `0`
- **Transaction Mode:** Single `Serializable` `prisma.$transaction` with optimistic CAS `where: { id, encryptedPrivateKey: oldEncrypted }`.
- **Results:** `3` legacy records updated cleanly; `1` already-migrated record preserved byte-for-byte; `0` failures; zero secrets or private keys logged.

---

## 12. Idempotency Results (`E3` & `MIG-14`)

Executed `node scripts/migrate-issuer-keys.mjs --apply` a second time immediately following commit, plus `node scripts/migrate-issuer-keys.mjs --audit-kms-only`:
- **Second `--apply`:** Exit Code `0`; `Already on new KMS key: 4`; `Pending/eligible migration: 0`; `Successfully updated in DB: 0`; all 4 ciphertext strings remained byte-for-byte identical.
- **`--audit-kms-only` (without `LEGACY_SESSION_SECRET`):** Exit Code `0`; `Already on new KMS key: 4`; `Decryption/verify failures: 0`.

---

## 13. Failure and Rollback Results (`E4` & `MIG-06`–`MIG-12`)

| Scenario ID | Condition Tested | Exit Code | DB Mutations Committed |
| :--- | :--- | :---: | :--- |
| `MIG-06` | Wrong `LEGACY_SESSION_SECRET` | `2` | `0` (aborted before writes) |
| `MIG-07` | Missing or whitespace `LEGACY_SESSION_SECRET` | `1` | `0` (preflight rejected) |
| `MIG-08` | Missing `KMS_MASTER_KEY` (with CWD `.env` present!) | `1` | `0` (preflight rejected) |
| `MIG-09` | Malformed / 16-byte `KMS_MASTER_KEY` | `1` | `0` (preflight rejected) |
| `MIG-10` | Corrupted ciphertext body / non-hex chars in mixed batch | `2` | `0` (valid rows preserved untouched) |
| `MIG-11` | Tampered AES-GCM authentication tag | `2` | `0` (valid rows preserved untouched) |
| `MIG-12` | Mid-transaction PostgreSQL trigger abort on row 2 of 2-row `--apply` | `1` | `0` (row 1 rolled back to exact pre-migration ciphertext) |

---

## 14. Cryptographic Integrity Results (Phase F & `MIG-15`)

Verified end-to-end against migrated records in PostgreSQL 16.16 via real application services (`KeyRepository.getUseMemory() === false`):
1. Cleared in-memory key stores and forced live Prisma hydration via `KeyManagementService.getActiveSigningKey(tenantSlug)`.
2. Verified `id`, `tenantId`, `keyEpoch`, `keyIdentifier` (`did:web:...#key-1`), `publicKeyMultibase`, reconstructed `publicKeyPem`, RFC 7517 `publicKeyJwk`, and 64-hex-char SHA-256 `fingerprint` remained 100% identical pre/post migration.
3. Verified recovered `decryptedPrivateKey` matched original private key digest and derived identical original public key (`crypto.createPublicKey`).
4. Signed a pre-migration W3C VC (`JsonWebSignature2020`) with the original key and verified it against the **hydrated** public key post-migration (`true`).
5. Signed a post-migration W3C VC with the **KMS-recovered private key** and verified it against BOTH the **original** `publicKeyPem` AND the DID document (`KeyManagementService.getTenantDidDocument`) `verificationMethod[0].publicKeyJwk` (`true`).

---

## 15. Unit Test Results

| Command | Scope | Files | Passed | Failed |
| :--- | :--- | :---: | :---: | :---: |
| `npx vitest run test/unit` | Full repository unit suite (incl. `kms-master-key`, `key-migration`, `migrate-issuer-keys-script`, `key-generation`, `startup-validation`, `persistence-fail-closed`) | 45 | 389 | 0 |

New unit tests added in `CRV-SEC-01.2`: [test/unit/migrate-issuer-keys-script.test.ts](file:///F:/CredVail/test/unit/migrate-issuer-keys-script.test.ts) (7/7 passed).

---

## 16. Live PostgreSQL Integration Test Results

Executed with `REQUIRE_POSTGRES_INTEGRATION="true"` against live PostgreSQL 16.16 (`127.0.0.1:55432`):

| Command | Scope | Files | Passed | Failed | Skipped |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `npx vitest run test/integration/postgres-kms-migration.test.ts --reporter=verbose` | `CRV-SEC-01.2` Live PG Migration (`MIG-01..MIG-15` + Phase F) | 1 | 4 (all 15 MIG + F) | 0 | 0 |
| `npx vitest run test/integration/postgres-claim-concurrency.test.ts test/integration/postgres-h13-resilience.test.ts test/integration/postgres-claim-rate-limiter.test.ts test/integration/postgres-wallet-ownership.test.ts` | CI Live PG Concurrency, Replay, Rate-Limiter & Single-Owner Suites | 4 | 50 | 0 | 0 |
| **Total Live PostgreSQL Tests** | | **5** | **54** | **0** | **0** |

Additionally executed offline/in-memory integration flows:
- `npx vitest run test/integration --exclude "test/integration/postgres-*.test.ts"`: **11 files, 19/19 passed** (0 failed). *(Note: running those 11 non-PG fixture files under `REQUIRE_POSTGRES_INTEGRATION=true` fails FK constraints because they seed synthetic owner IDs without `User` rows, matching existing CI separation).*

---

## 17. Type-Check, Lint, and Build Results

| Gate | Command | Exit Code | Result & Notes |
| :--- | :--- | :---: | :--- |
| **TypeScript Typecheck** | `npx tsc --noEmit` | `0` | 0 diagnostics across codebase & new tests |
| **Production Build** | `npm run build` | `0` | Compiled successfully in 47s; generated `24/24` static pages and all dynamic API routes |
| **ESLint (`npm run lint`)** | `node node_modules/next/dist/bin/next lint` | Interactive | ESLint is not configured in repo (triggers interactive Next.js ESLint setup prompt); no lint checks executed |
| **Legacy `npm test`** | `node --test scripts/verify-phase-*.mjs ...` | `1` | Pre-existing baseline `src/lib/db/persistence-policy.ts:13` contains TS parameter property syntax rejected by plain Node 24 strip-only loader (unrelated to `CRV-SEC-01.2`; `key-migration.ts` & `migrate-issuer-keys.mjs` run cleanly on Node 24) |

---

## 18. Security Findings and Remediation

| ID | Finding Description | Severity | Resolution in `CRV-SEC-01.2` |
| :--- | :--- | :---: | :--- |
| **DEF-01** | Top-level `import { PrismaClient }` / `new PrismaClient()` in `scripts/migrate-issuer-keys.mjs` silently loaded CWD `.env` into `process.env` before secret validation, defeating missing-key preflight checks (`MIG-08`). | **High** | Validated `DATABASE_URL`, `KMS_MASTER_KEY`, and `LEGACY_SESSION_SECRET` BEFORE dynamically importing `@prisma/client` inside `main()`. Verified by `MIG-08` CLI test with `.env` present. |
| **DEF-02** | Missing or empty `LEGACY_SESSION_SECRET` (`""`, `"   "`, or omitted during `--apply`) bypassed preflight rejection (`MIG-07`). | **Medium** | Required non-empty `LEGACY_SESSION_SECRET` at preflight for both default dry-run and `--apply`; introduced explicit read-only `--audit-kms-only` flag for post-migration audits. |
| **DEF-03** | `--apply` read records outside `$transaction` and updated by `id` alone (TOCTOU risk); `process.exit()` bypassed `$disconnect()`; mixed-failure abort skipped summary; `null` payloads lacked summary count; raw Prisma errors lacked credential sanitization. | **Medium** | Refactored `--apply` into a single `Serializable` interactive `$transaction` using optimistic CAS (`where: { id, encryptedPrivateKey: oldEncrypted }`), replaced `process.exit` with `process.exitCode`, added `Skipped` accounting & consistent summary output, and applied `sanitizeErrorText` across all errors. |
| **DEF-04** | `decryptPayloadWithKey` / `evaluateKeyMigration` relied on Node `Buffer.from(..., "hex")`, which silently ignores non-hex trailing characters instead of rejecting malformed payloads immediately. | **Low** | Enforced strict regex length/hex validation on IV (24 hex), auth tag (32 hex), and ciphertext segments. |
| **DEF-05** | Missing dedicated operational runbook & safe read-only SQL inventory procedure. | **Medium** | Created [KMS_ISSUER_KEY_MIGRATION_RUNBOOK.md](file:///F:/CredVail/docs/runbooks/KMS_ISSUER_KEY_MIGRATION_RUNBOOK.md). |

---

## 19. Target-Environment Inventory Status (`AC-14`)

- **Configured Local Workspace Target:** Inactive localhost stub (`postgresql://***:***@localhost:5432/credvail?schema=public`).
- **Authorized Production/Staging DB Access:** **NOT AVAILABLE** from this workstation.
- **Real Deployment Record Count:** **UNVERIFIED / UNKNOWN**. Do not assume zero legacy keys exist in deployed environments.
- **Required Operator Action:** Execute the read-only SQL inventory query and dry-run documented in Section 3 & Section 4 of [KMS_ISSUER_KEY_MIGRATION_RUNBOOK.md](file:///F:/CredVail/docs/runbooks/KMS_ISSUER_KEY_MIGRATION_RUNBOOK.md) against the intended target database before executing `--apply`.

---

## 20. Operational Readiness Assessment

The operational procedure is documented in [docs/runbooks/KMS_ISSUER_KEY_MIGRATION_RUNBOOK.md](file:///F:/CredVail/docs/runbooks/KMS_ISSUER_KEY_MIGRATION_RUNBOOK.md) (`AC-13` PASSED), covering `pg_dump` backup verification, read-only SQL & script inventory, secret provisioning, dry-run validation, `--apply` Serializable execution, `--audit-kms-only` post-check, rollback limitations, and idempotency.

---

## 21. Remaining Blockers

1. **Deployment Target Database Inventory & Dry-Run (`AC-14`):** Cannot verify the actual `issuer_keys` record distribution on staging/production until an authorized operator runs the runbook inventory and dry-run against the real deployment database.
2. *(Pre-existing Non-Migration Note)*: Pre-existing `npm run lint` lacks ESLint configuration and `npm test` (`scripts/verify-phase-*.mjs`) requires TS transformation for `src/lib/db/persistence-policy.ts:13`.

---

## 22. Final Acceptance Criteria & Decision

| Criterion | Status | Evidence |
| :--- | :---: | :--- |
| `AC-01` KMS master key independent of `SESSION_SECRET` | **PASS** | `src/lib/crypto/key-service.ts`, `kms-master-key.test.ts` (16/16) |
| `AC-02` Legacy key decryption works | **PASS** | `postgres-kms-migration.test.ts`, live `migrate-issuer-keys.mjs` |
| `AC-03` Migrated ciphertext uses current KMS | **PASS** | `KeyService.decryptPrivateKey` / `KeyManagementService` hydration (`MIG-15`) |
| `AC-04` Dry-run is read-only | **PASS** | Repeated dry-run byte-for-byte DB comparison (`MIG-13`) |
| `AC-05` Apply migration succeeds | **PASS** | Live disposable PostgreSQL 16.16 `--apply` execution |
| `AC-06` Migration preserves issuer identity | **PASS** | Public key PEM/JWK/multibase, fingerprint, and `did:web` preserved |
| `AC-07` Migration is idempotent | **PASS** | Repeated `--apply` + `--audit-kms-only` (`MIG-04`, `MIG-14`) |
| `AC-08` Invalid secrets and ciphertext fail closed | **PASS** | `MIG-06`–`MIG-11` + `migrate-issuer-keys-script.test.ts` |
| `AC-09` Partial migration cannot leave unintended writes | **PASS** | Pre-commit validation abort + SQL trigger `ROLLBACK` (`MIG-12`) |
| `AC-10` Migrated key remains usable | **PASS** | End-to-end W3C VC signing & verification pre/post migration (`Phase F`) |
| `AC-11` No sensitive data exposure | **PASS** | Credential redaction verified across stdout/stderr & reports |
| `AC-12` Relevant regression suite passes | **PASS** | 389 unit tests + 54 live PG tests + 19 non-PG integration + `tsc` + `build` |
| `AC-13` Production operational procedure documented | **PASS** | [KMS_ISSUER_KEY_MIGRATION_RUNBOOK.md](file:///F:/CredVail/docs/runbooks/KMS_ISSUER_KEY_MIGRATION_RUNBOOK.md) |
| `AC-14` Target database inventory established | **BLOCKED (Pending)** | Target deployment DB not accessible from local workstation |

**Mandatory Final Status Classification:**  
### **`BLOCKED — TARGET ENVIRONMENT NOT VERIFIED`**

Technical verification (`AC-01`–`AC-13`) is completely verified on live PostgreSQL 16.16; final promotion to `PASS — TECHNICAL AND OPERATIONAL ACCEPTANCE` requires only executing `AC-14` (authorized read-only inventory + dry-run against the real deployment PostgreSQL target).
