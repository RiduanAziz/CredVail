# CREDVAIL H1.3.3.1-H7 — Run #12 PostgreSQL CI Closure Report

**Document ID:** CRV-H1331-H7-RUN12-CLOSURE  
**Date:** 2026-11-22  
**Repository:** `https://github.com/RiduanAziz/CredVail`  
**Workspace:** `F:\CredVail`  
**Branch:** `main`  
**Expected Remote Baseline:** `ddd08233a353770ad07c3bf3a8692e19138e693d`  
**Current Local HEAD:** `33f25ca7a06c44b2a8b6797511176fc3522a9cf7`  
**Previous CI Run:** Run #12 — `45012037195` (`https://github.com/RiduanAziz/CredVail/actions/runs/45012037195`)  
**Objective:** Correct the two remaining PostgreSQL CI failures from Run #12 without weakening the database ownership model.

---

## 1. Baseline and Local HEAD

- **Expected Baseline Commit:** `ddd08233a353770ad07c3bf3a8692e19138e693d` (`docs: add final push readiness audit report and unit test for key generation`)
- **Current Local HEAD:** `33f25ca7a06c44b2a8b6797511176fc3522a9cf7` (`fix: correct postgres integration test teardown and foreign key fixtures`)
- **Git Ancestry Verification:** `33f25ca` directly descends from baseline `ddd0823`.
- **Working Tree State:** Clean; zero uncommitted changes.

---

## 2. Exact Changed-File Inventory

The complete changeset between baseline `ddd0823` and HEAD `33f25ca` comprises 3 files (+116 / -60 lines):

| File | Status | Description |
| :--- | :---: | :--- |
| `test/integration/postgres-claim-concurrency.test.ts` | Modified | Refactored `afterAll` teardown to only delete unconsumed invitations (`consumedAt: null, claimedByUserId: null`), preserving consumed ownership records and parent entities. |
| `test/integration/postgres-wallet-ownership.test.ts` | Modified | Pre-seeded genuine `CredentialRecord` fixtures in `H133-08` for the duplicate `tokenHash` test and step `5f` legitimate pending invitation insert; verified no existing consumed owner before insertion. |
| `docs/reports/H1.3.3.1-WORKSTREAM-A-ACCEPTANCE-REPORT.md` | Added | Detailed Workstream A audit report documenting teardown monotonicity and foreign-key fixture compliance. |

---

## 3. Root Cause of Run #12 Failures

CI Run #12 (`45012037195`) failed on two distinct PostgreSQL constraints:

### Failure A — Concurrency Suite Teardown Monotonicity Check Violation
- **Location:** `test/integration/postgres-claim-concurrency.test.ts` lines 158–221.
- **Root Cause:** The `afterAll` hook attempted a broad cleanup:
  ```ts
  await prisma.claimInvitation.deleteMany({ where: { tenantId } });
  ```
  During concurrency testing, invitations are redeemed and marked with `consumedAt = now()` and `claimedByUserId = winnerUserId`. In live PostgreSQL, the database trigger `trg_claim_invitation_monotonicity` fires `BEFORE DELETE` and enforces:
  ```sql
  IF TG_OP = 'DELETE' THEN
    IF OLD."consumedAt" IS NOT NULL OR OLD."claimedByUserId" IS NOT NULL THEN
      RAISE EXCEPTION 'claim_invitations deletion violation: consumed ownership records cannot be deleted'
        USING ERRCODE = '23514'; -- check_violation
    END IF;
    RETURN OLD;
  END IF;
  ```
  Attempting to delete all invitations for `tenantId` included consumed invitations, causing PostgreSQL to raise SQLSTATE `23514`. Attempting cascade deletions of credentials or tenants also tripped the same trigger, while deleting the test user tripped `claimedByUser User? @relation(fields: [claimedByUserId], references: [id], onDelete: Restrict)`.

### Failure B — H133-08 Legitimate Pending Invitation Foreign Key Violation
- **Location:** `test/integration/postgres-wallet-ownership.test.ts` line 1301 (step `5f`).
- **Root Cause:** In test `H133-08`, step `5f` attempted to insert a legitimate pending invitation using an unseeded random UUID:
  ```ts
  credentialId: `urn:uuid:${crypto.randomUUID()}`
  ```
  `ClaimInvitation` declares:
  ```prisma
  credential CredentialRecord @relation(fields: [credentialId], references: [credentialId], onDelete: Cascade)
  ```
  Because the random UUID did not exist in `CredentialRecord`, PostgreSQL rejected the insert with foreign key violation SQLSTATE `23503` (`foreign_key_violation`), causing step `5f` and subsequent step `5g` to fail.
  Similarly, at line 1015, the duplicate `tokenHash` verification test used an unseeded `credentialId`, risking foreign key collision instead of testing the unique constraint.

---

## 4. Teardown Design & Retention of Protected Records

### Teardown Architecture
The teardown hook in `test/integration/postgres-claim-concurrency.test.ts` was refactored to align with the immutable single-owner model:
```ts
  afterAll(async () => {
    if (isPostgresLive) {
      try {
        // Clean up unconsumed invitations ONLY.
        // Consumed claim invitations and their relational dependencies (credentials, batches, templates, keys, tenants, users)
        // are retained in the disposable integration database because trg_claim_invitation_monotonicity
        // and foreign key constraints (such as User onDelete: Restrict) permanently protect consumed ownership records.
        if (tenantId) {
          await prisma.claimInvitation.deleteMany({
            where: {
              tenantId,
              consumedAt: null,
              claimedByUserId: null,
            },
          });
        }
      } catch (cleanupErr: any) {
        console.error(
          `[POSTGRES CONCURRENCY SUITE CLEANUP FAILURE]: ${cleanupErr?.message || cleanupErr}`,
          cleanupErr
        );
        throw cleanupErr;
      } finally {
        await prisma.$disconnect();
      }
    } else {
      await prisma.$disconnect();
    }
  });
```

### Why Protected Records Are Retained
1. **Security Invariant Preservation:** A core requirement of CredVail is that once an ownership claim is consumed, it represents a permanent, immutable legal title. Bypassing the trigger or deleting parent entities would undermine the very invariant under test.
2. **Ephemeral CI Containers:** The GitHub Actions CI database runs in an ephemeral PostgreSQL container provisioned specifically for the workflow job and destroyed immediately upon job termination.
3. **Database Isolation:** Production databases must never share state with integration test runs. In persistent test environments, test entities are uniquely partitioned by timestamped UUIDs (`tenantId`, `userId`, `credentialId`), preventing cross-suite contamination.

---

## 5. H133-08 Fixture Design

In `test/integration/postgres-wallet-ownership.test.ts`, step `5f` was redesigned to ensure full relational integrity before testing the unconsumed-to-consumed lifecycle:

```ts
    // 5f. Legitimate pending invitation INSERT (both fields null) succeeds
    const certNumLegitPending = `H133-CERT-PENDING-${nowTs}`;
    const credIdLegitPending = `urn:uuid:${crypto.randomUUID()}`;
    await prisma.credentialRecord.create({
      data: {
        credentialId: credIdLegitPending,
        certificateNumber: certNumLegitPending,
        tenantId,
        batchId,
        recipientId: recipientIdAlice,
        leafHash: `leaf_hash_legit_pending_${nowTs}`,
        merkleIndex: 84,
        bitstringIndex: 84,
        state: "ISSUED",
        claimsData: { course_name: "Legit Pending Test" },
        vcPayloadJson: signedVcAlice as any,
      },
    });

    // Confirm no consumed owner invitation already exists for this newly generated credential
    const existingOwnerForPending = await prisma.claimInvitation.findFirst({
      where: {
        credentialId: credIdLegitPending,
        consumedAt: { not: null },
        claimedByUserId: { not: null },
      },
    });
    expect(existingOwnerForPending).toBeNull();

    const legitimatePending = await prisma.claimInvitation.create({
      data: {
        tokenHash: crypto.createHash("sha256").update(`inv_legit_pending_${nowTs}`).digest("hex"),
        credentialId: credIdLegitPending,
        certificateNumber: certNumLegitPending,
        recipientEmail: "legit-pending@test.edu",
        tenantId,
        expiresAt: new Date(Date.now() + 86400000),
        consumedAt: null,
        claimedByUserId: null,
      },
    });
    expect(legitimatePending.consumedAt).toBeNull();
    expect(legitimatePending.claimedByUserId).toBeNull();

    // 5g. Legitimate atomic first-claim UPDATE (from both null to both set) succeeds
    const legitimateClaimed = await prisma.claimInvitation.update({
      where: { id: legitimatePending.id },
      data: {
        consumedAt: new Date(),
        claimedByUserId: userIdAlice,
      },
    });
    expect(legitimateClaimed.consumedAt).not.toBeNull();
    expect(legitimateClaimed.claimedByUserId).toBe(userIdAlice);
```

Similarly, the duplicate `tokenHash` negative test (line 1015) pre-seeds `credIdUnrelatedToken` in `CredentialRecord`, guaranteeing that the test triggers unique constraint violation `23505` on `tokenHash` rather than an unintended `23503` foreign key violation.

---

## 6. Database Invariant Verification

All required H1.3.3.1 database invariants were verified against the codebase:

1. **Partial Unique Index on `credentialId`:**  
   Index `claim_invitations_one_consumed_owner_per_credential_uq` indexes `credentialId` exclusively `WHERE "consumedAt" IS NOT NULL AND "claimedByUserId" IS NOT NULL`.
2. **Exact Normalized Predicate:**  
   Verified via `prisma/sql/h1-3-3-verify-single-owner-index.sql` and `isExactSingleOwnerPredicate()` in Vitest. Predicate matches `consumedat is not null and claimedbyuserid is not null`.
3. **Trigger Operation Coverage:**  
   `trg_claim_invitation_monotonicity` is registered `BEFORE INSERT OR UPDATE OR DELETE ON "claim_invitations" FOR EACH ROW`.
4. **Ownership Immutability:**  
   Once `claimedByUserId` is non-null, any mutation to a different user ID or reset to null raises SQLSTATE `23514`.
5. **Consumption Immutability:**  
   Once `consumedAt` is non-null, any mutation to a different timestamp or reset to null raises SQLSTATE `23514`.
6. **Credential Identifier Immutability:**  
   Any attempt to mutate `credentialId` raises SQLSTATE `23514`.
7. **Paired State Invariant:**  
   `consumedAt` and `claimedByUserId` must both be null or both non-null on update (SQLSTATE `23514`).
8. **Initial State Invariant:**  
   New invitations must be inserted with both fields null (SQLSTATE `23514`).
9. **User Deletion Restriction:**  
   `claimedByUser User? @relation(fields: [claimedByUserId], references: [id], onDelete: Restrict)` prevents deletion of users who own claimed credentials.

---

## 7. Exact Test Commands & Results

| Step | Command | Exit Code | Result Summary |
| :--- | :--- | :---: | :--- |
| **Prisma Validation** | `npx prisma validate` | `0` | Schema is valid. |
| **Prisma Client Generation** | `npx prisma generate` | `0` | Generated Prisma Client v6.19.3 in 1.46s. |
| **TypeScript Compilation** | `npx tsc --noEmit` | `0` | 0 type errors across entire codebase. |
| **Security Unit Tests** | `npx vitest run test/unit/key-generation.test.ts test/unit/h1-security-hardening.test.ts` | `0` | **28 passed** (9 key generation, 19 security hardening; 212ms). |
| **PostgreSQL Matrix Discovery** | `npx vitest run test/integration/*.test.ts` | `0` | **50 tests discovered** across 4 suites: 10 concurrency, 12 rate limiter, 16 resilience, 12 wallet ownership. All skipped with `SKIPPED - BLOCKED` due to absence of local PostgreSQL daemon. |
| **Phase Verification Scripts** | `npm test` | `0` | **115 passed**, 0 failed (Phases 0–13 verification scripts). |
| **Next.js Production Build** | `npm run build` | `0` | Next.js 15.5.29 production build succeeded for all 24 routes. |
| **Git Hygiene Check** | `git diff --check` | `0` | Clean; 0 trailing whitespace or line-ending errors. |

---

## 8. Remaining Blockers

1. **Local Host Environment Capability:**  
   The local Windows workstation lacks Docker and a local PostgreSQL daemon (TCP 5432 not listening). Consequently, live PostgreSQL execution of the 50 integration tests cannot execute locally and skips cleanly with status `BLOCKED`.
2. **Definitive Acceptance Gate:**  
   Per Phase 6 of the operating instructions:
   > "A local run without PostgreSQL must be marked `BLOCKED`; it is not acceptance evidence."
   Definitive milestone acceptance requires execution in the GitHub Actions CI environment (`ubuntu-latest` with containerized PostgreSQL 15), registering:
   $$\text{Discovered: } 50 \quad|\quad \text{Passed: } 50 \quad|\quad \text{Failed: } 0 \quad|\quad \text{Skipped: } 0$$

---

## 9. Clear Acceptance Decision

In strict accordance with the mandatory operating rules:
- All source code, schema, and test fixture corrections for Failure A and Failure B are complete, verified, and committed at HEAD `33f25ca`.
- No database triggers, indexes, foreign keys, or security invariants were weakened.
- Because local live PostgreSQL execution is not supported on this host, the formal status is declared as:

**Status Declaration:**
`BLOCKED — LIVE POSTGRESQL VALIDATION INCOMPLETE OR SECURITY REGRESSION FOUND`  
*(Sub-status: Source code and fixture remediation complete; local validation passed; blocked on remote GitHub Actions CI execution against live PostgreSQL container)*
