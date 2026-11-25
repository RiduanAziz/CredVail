# CREDVAIL Production KMS Issuer-Key Migration Operational Runbook

**Document ID:** `RUNBOOK-KMS-MIG-01`  
**Related Change:** `CRV-SEC-01` / `CRV-SEC-01.2`  
**Owner:** Platform Security & Infrastructure Engineering  
**Scope:** Safely migrating institutional `IssuerKey.encryptedPrivateKey` rows from legacy `SESSION_SECRET` (SHA-256) encryption to isolated `KMS_MASTER_KEY` (HKDF-SHA-256) encryption.

---

## 1. Pre-Migration Requirements & Mandatory Backup

1. **Mandatory Database Snapshot / Backup (Before Any Write)**:
   Take a verified logical or point-in-time PostgreSQL snapshot before running `--apply`:
   ```bash
   # Logical backup of issuer_keys and tenants before migration
   pg_dump "$DATABASE_URL" --table=issuer_keys --table=tenants --format=custom --file="credvail_pre_kms_migration_$(date -u +%Y%m%dT%H%M%SZ).dump"
   ```
   Verify the backup file is non-empty and restorable in a staging environment before proceeding.

2. **Maintenance / Deployment Coordination**:
   - Ensure the new `KMS_MASTER_KEY` is provisioned in the target runtime secret store before rotating application containers into production.
   - Coordinate rolling updates so application instances running `KeyService` (with `KMS_MASTER_KEY`) and the migration run agree on the target master key. Note that legacy-encrypted records remain unreadable by `CRV-SEC-01` application nodes until migrated to `KMS_MASTER_KEY`.
   - **Retain `LEGACY_SESSION_SECRET` safely in the break-glass vault** until all post-migration verification checks succeed. Never overwrite `.env` or secret managers with test values.

---

## 2. Provisioning & Handling Required Environment Variables

| Variable | Format / Requirement | Secret Handling Rule |
| :--- | :--- | :--- |
| `DATABASE_URL` | Valid PostgreSQL URI (`postgresql://...` or `postgres://...`) | Never print credentials; inspect host/DB name only |
| `KMS_MASTER_KEY` | Canonical 32-byte Base64 string (`44` chars ending in `=`) | Generate via CSPRNG; store in production KMS/Vault |
| `LEGACY_SESSION_SECRET` | Exact legacy `SESSION_SECRET` (or legacy fallback value if historical deployment ran without `SESSION_SECRET`) | Supply via process environment only; never pass as CLI argument |

Generate a fresh 256-bit `KMS_MASTER_KEY`:
```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

---

## 3. Authorized Read-Only Pre-Migration Target Database Inventory

Before migrating, an authorized operator must inspect the intended target database strictly read-only without exposing private keys or secrets.

### 3.1 Read-Only SQL Inventory Query
Execute via `psql "$DATABASE_URL"` (read-only):
```sql
-- 1. Confirm exact target database identity
SELECT current_database() AS database_name,
       current_schema() AS schema_name,
       inet_server_port() AS server_port,
       version() AS pg_version;

-- 2. Count IssuerKey rows categorized safely by format prefix (ZERO secrets returned)
SELECT
  COUNT(*) AS total_issuer_keys,
  COUNT(*) FILTER (WHERE "encryptedPrivateKey" IS NULL) AS null_payload_count,
  COUNT(*) FILTER (WHERE "encryptedPrivateKey" LIKE 'aes-256-gcm:%') AS encrypted_envelope_count,
  COUNT(*) FILTER (
    WHERE "encryptedPrivateKey" IS NOT NULL
      AND "encryptedPrivateKey" NOT LIKE 'aes-256-gcm:%'
  ) AS unsupported_or_unencrypted_count,
  COUNT(*) FILTER (WHERE "isActive" = true AND "isCompromised" = false) AS active_signing_keys
FROM "issuer_keys";
```

### 3.2 Script-Based Dry-Run Classification (Zero Writes)
Run the migration utility in default dry-run mode to distinguish records already using `KMS_MASTER_KEY` vs records encrypted under `LEGACY_SESSION_SECRET` vs malformed/unsupported payloads:
```bash
DATABASE_URL="<target-db-url>" \
LEGACY_SESSION_SECRET="<legacy-secret>" \
KMS_MASTER_KEY="<target-kms-master-key>" \
node scripts/migrate-issuer-keys.mjs
```

---

## 4. Dry-Run Procedure

1. Execute without `--apply`:
   ```bash
   node scripts/migrate-issuer-keys.mjs
   ```
2. Verify in output:
   - `[OK] Target PostgreSQL database validated:` matches the intended host, port, and database name.
   - `Mode: DRY-RUN (Safe audit, no changes made)`.
   - `Decryption/verify failures: 0`.
   - `Pending/eligible migration` matches expected legacy record count.
   - Zero raw private key material or database passwords appear in output.
3. **Stop immediately** if `Decryption/verify failures > 0` or if the target database host/name is unexpected.

---

## 5. Live Atomic Apply Procedure

After confirming the backup and clean dry-run:
```bash
DATABASE_URL="<target-db-url>" \
LEGACY_SESSION_SECRET="<legacy-secret>" \
KMS_MASTER_KEY="<target-kms-master-key>" \
node scripts/migrate-issuer-keys.mjs --apply
```

The script automatically:
- Validates `DATABASE_URL`, `KMS_MASTER_KEY`, and `LEGACY_SESSION_SECRET` before initializing Prisma.
- Runs read, decryption, re-encryption, self-decryption verification, and optimistic CAS `updateMany` checks inside a single `Serializable` PostgreSQL transaction.
- Aborts with zero database mutations if any record fails decryption, self-verification, or optimistic concurrency validation.

---

## 6. Post-Migration Verification

1. **Read-Only KMS-Only Audit (Without `LEGACY_SESSION_SECRET`)**:
   ```bash
   DATABASE_URL="<target-db-url>" \
   KMS_MASTER_KEY="<target-kms-master-key>" \
   node scripts/migrate-issuer-keys.mjs --audit-kms-only
   ```
   Confirm:
   - Exit code `0`
   - `Already on new KMS key` equals expected encrypted total
   - `Pending/eligible migration: 0`
   - `Decryption/verify failures: 0`

2. **Application & Signing Health Verification**:
   - Confirm production instances boot cleanly (`src/instrumentation.ts` passes `KeyService.validateMasterKey()`).
   - Confirm public DID documents (`GET /tenants/[slug]/.well-known/did.json`) continue returning identical public key JWKs.
   - Issue and verify a smoke-test credential for an internal test tenant.

---

## 7. Failure Handling, Rollback Limitations & Recovery

- **In-Flight Failures**: Because `--apply` runs inside a single `Serializable` PostgreSQL transaction with pre-commit self-decryption checks, a mid-run crash, bad ciphertext, or concurrent key rotation automatically rolls back **all** updates in the batch. The database stays untouched.
- **Re-Execution Safety**: The migration is strictly idempotent. Records already decryptable under `KMS_MASTER_KEY` are classified `ALREADY_MIGRATED` and never re-encrypted or touched. Re-running `--apply` is safe.
- **Post-Commit Rollback Limitation**: Once `--apply` commits, re-encrypted ciphertexts are bound exclusively to `KMS_MASTER_KEY`. To revert the database to legacy `SESSION_SECRET` encryption after commit, either:
  1. Restore the pre-migration `pg_dump` snapshot taken in Step 1 (if reverting deployment), OR
  2. Never discard `KMS_MASTER_KEY` while records remain encrypted under it.

---

## 8. Logging & Secrecy Policy

- Never pass `KMS_MASTER_KEY`, `LEGACY_SESSION_SECRET`, or `DATABASE_URL` directly on CLI flags (`--key=...`); always inject via process environment.
- Retain sanitized execution logs (`Mode`, `Total`, `Already on new KMS key`, `Pending`, `Skipped`, `Failures`, `Successfully updated`, exit code) in change-management records.
- Never archive plaintext PEMs, `.env` snapshots, or unredacted connection URIs in ticket logs.
