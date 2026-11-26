# CREDVAIL Production Operations & Disaster Recovery Runbook

## 1. Recovery Objectives
- **RPO (Recovery Point Objective):** <= 5 minutes via continuous PostgreSQL WAL archiving and point-in-time recovery.
- **RTO (Recovery Time Objective):** <= 30 minutes for multi-AZ application + database failover.

## 2. Production Startup & Environment Checks
Every production node validates fail-closed invariants in `src/instrumentation.ts` before serving traffic:
1. `KMS_MASTER_KEY` is present, valid Base64, decodes to exactly 32 bytes, and is isolated from `SESSION_SECRET`.
2. `SESSION_SECRET` is present, >= 32 characters, and distinct from development fallback strings.
3. `DATABASE_URL` points to PostgreSQL with `ALLOW_IN_MEMORY_FALLBACK` disabled (`false`).
4. Live Sepolia operations require `FORCE_SEPOLIA_LIVE=true`, a funded `DEPLOYER_PRIVATE_KEY`, and a deployed `NEXT_PUBLIC_REGISTRY_CONTRACT_ADDRESS` (unless `ALLOW_BLOCKCHAIN_SIMULATION=true` is explicitly set for sandbox demos).

Verify readiness cleanly via:
```bash
GET /api/v1/health
```
HTTP `200` confirms KMS, Session, and PostgreSQL checks succeeded; `503` indicates degraded readiness.

## 3. KMS Master Key Rotation & Migration
When rotating or onboarding `KMS_MASTER_KEY`:
1. Generate a 32-byte Base64 master key using a CSPRNG / hardware KMS.
2. Perform a non-destructive dry run before modifying any database rows:
   ```bash
   node scripts/migrate-issuer-keys.mjs --dry-run
   ```
3. Verify zero plaintext leaks and 100% round-trip ciphertext re-verification before running `--apply`.

## 4. Compromised Signing Key Emergency Procedure
If an institutional issuer key epoch is suspected compromised:
1. Invoke `POST /api/v1/tenants/:slug/keys/compromise` (`keys:manage` RBAC permission) with the affected epoch.
2. Confirm the smart contract `flagKeyCompromised` event transaction is mined via `GET /api/v1/blockchain/status`.
3. Immediately rotate to the next epoch (`POST /api/v1/tenants/:slug/keys/rotate`).
4. Audit all credentials issued after `compromisedAt` via `GET /api/v1/tenants/:slug/reports/export?format=csv&type=audit_logs`.

## 5. Blockchain Anchor Recovery & Reconciliation
If a batch Merkle root anchor fails due to transient Sepolia RPC saturation:
1. Query receipt status via `GET /api/v1/tenants/:slug/batches/:id/anchor-status`.
2. Trigger idempotent reconciliation/retry via `POST /api/v1/tenants/:slug/batches/:id/anchor-status`.
   This checks on-chain state first to prevent duplicate gas spends or double-anchoring.

## 6. Database Backup & Restoration Drill
1. Take encrypted snapshot before schema changes: `pg_dump --format=custom --no-owner "$DATABASE_URL" > backup.dump`.
2. Restore onto disposable target and run `npx prisma migrate deploy` followed by `node scripts/migrate-issuer-keys.mjs --dry-run`.
