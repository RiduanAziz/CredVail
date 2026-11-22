# CREDVAIL Feature Acceptance Report
## Feature 01: H1.3.3.1 PostgreSQL Single-Owner Credential Integrity & Lifecycle Acceptance

**Document ID:** CRV-FEAT-01-H1331-ACCEPTANCE  
**Date:** 2026-11-22  
**Repository:** `https://github.com/RiduanAziz/CredVail`  
**Workspace:** `F:\CredVail`  
**Branch:** `main`  
**Baseline Git Commit:** `33f25ca7a06c44b2a8b6797511176fc3522a9cf7`  
**Current Working Tree:** Modified `test/integration/postgres-wallet-ownership.test.ts` (+26 / -5 lines)  
**Status:** `BLOCKED` (Local live PostgreSQL daemon unavailable; pending user approval to commit and push to remote GitHub Actions CI for definitive 50/50 acceptance gate)

---

## 1. Executive Summary

Under the **One-Feature-at-a-Time Engineering & Production Acceptance Protocol**, Feature 01 addresses and closes the remaining integrity, teardown, and race-concurrency fixture defects for **H1.3.3.1 (Single-Owner Credential Integrity & Durable Wallet Ownership)**.

In previous CI Run #13 (`45013956501`), **49 out of 50 live PostgreSQL integration tests passed**. The single failing test in Run #13 was an inversion in `H133-08` in `test/integration/postgres-wallet-ownership.test.ts`:
```
AssertionError: expected ClaimAlreadyConsumedError: This claim invitation has already been consumed. to be an instance of CredentialAlreadyClaimedError
```
- **Root Cause:** Alice and Bob race concurrently to claim the same credential. When Bob's transaction committed first, Bob won and `tokenB` became consumed. The subsequent test step (intended to assert that attempting to claim the remaining unconsumed invitation for the already-claimed credential fails with `CredentialAlreadyClaimedError`) had hardcoded `claimToken: tokenB` and `userId: userIdBob`. Because `tokenB` was already consumed by Bob, the claim failed immediately as `ClaimAlreadyConsumedError` before reaching the credential-level ownership check.
- **Remediation:** The test now dynamically derives `winnerUserId`, `loserUserId`, `loserToken`, and `loserEmail` from the database and `Promise.allSettled` results. It explicitly asserts mutual consistency between the race outcome and persisted state, executes the second claim against the genuine losing unconsumed invitation (`loserToken`), asserts that the resulting error is an instance of `CredentialAlreadyClaimedError` (`CREDENTIAL_ALREADY_CLAIMED`, HTTP 409), and explicitly asserts that it is **not** an instance of `ClaimAlreadyConsumedError`.

All local pre-flight validations passed with 0 errors (`prisma validate`, `prisma generate`, `tsc --noEmit`, 28 unit tests, 4 PostgreSQL integration test files discovered with 50 tests safely skipped locally, 115 phase tests, production build, and clean git diff).

Per mandatory rule 11, the changes are staged for review and await explicit user approval before committing and pushing.

---

## 2. Feature Scope & Invariants

### 2.1. Feature Metadata
- **Feature Name:** H1.3.3.1 PostgreSQL Single-Owner Credential Integrity & Ownership Monotonicity
- **Business Purpose:** Enforce that every issued digital credential can have at most one authenticated holder across all nodes and concurrent transactions. Prevent double-claiming, claim re-assignment, replay redemption, and accidental deletion of consumed ownership titles.
- **User Roles:**
  - `Holder`: Claims credentials into their personal browser wallet using single-use claim tokens.
  - `Issuer / Tenant Admin`: Issues credentials and generates claim invitations.
  - `Verifier`: Verifies credential validity and verifies presentations from the legitimate owner.

### 2.2. Core Database Invariants
1. **Single-Owner Partial Unique Index:** At most one consumed invitation exists per `credentialId`:
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS "claim_invitations_one_consumed_owner_per_credential_uq"
   ON "claim_invitations" ("credentialId")
   WHERE "consumedAt" IS NOT NULL AND "claimedByUserId" IS NOT NULL;
   ```
2. **Ownership Monotonicity Trigger:** `trg_claim_invitation_monotonicity` (`BEFORE INSERT OR UPDATE OR DELETE ON "claim_invitations"`) enforces:
   - Newly inserted invitations must begin unclaimed (`consumedAt IS NULL AND claimedByUserId IS NULL`).
   - Updates must maintain paired states (both null or both not null).
   - Once set, `consumedAt` and `claimedByUserId` can never be reset to null or reassigned.
   - `credentialId` is immutable once created.
   - Deletion of consumed ownership records is strictly rejected (`SQLSTATE 23514`).
3. **Foreign Key Restraints:**
   - `claimedByUser User? @relation(fields: [claimedByUserId], references: [id], onDelete: Restrict)` prevents deletion of users who own claimed credentials.

---

## 3. Initial Repository State

- **Branch:** `main`
- **Reported Baseline Commit:** `33f25ca7a06c44b2a8b6797511176fc3522a9cf7`
- **Previous Failing CI Run:** `45013956501` (Run #13) — 49 passed, 1 failed, 0 skipped.
- **Failing Test:** `test/integration/postgres-wallet-ownership.test.ts` > `H133-08: Two separate invitations for the same credential cannot establish two different owners, including concurrent redemption`.

---

## 4. Exact Source Changes

File modified: `test/integration/postgres-wallet-ownership.test.ts` (+26 / -5 lines)

```diff
--- a/test/integration/postgres-wallet-ownership.test.ts
+++ b/test/integration/postgres-wallet-ownership.test.ts
@@ -43,7 +43,10 @@ import { VcService } from "@/lib/crypto/vc-service";
 import { canonicalizeJson } from "@/lib/crypto/canonical";
 import { createSessionToken } from "@/lib/auth/session";
 import { ClaimInvitationService } from "@/lib/services/claim-invitation-service";
-import { ClaimInvitationRepository } from "@/lib/repositories/claim-invitation-repository";
+import {
+  ClaimInvitationRepository,
+  ClaimAlreadyConsumedError,
+} from "@/lib/repositories/claim-invitation-repository";
 import { GET as getCredentialsRoute } from "@/app/api/v1/wallet/credentials/route";
 import { POST as presentRoute } from "@/app/api/v1/wallet/present/route";
 
@@ -947,6 +950,23 @@ describe("CREDVAIL PostgreSQL Live Wallet Ownership & Single-Owner Integrity (H1
     // Verify ownership authority: Only the winning claimant owns the credential
     const winnerUserId = consumedOwners[0].claimedByUserId!;
     const loserUserId = winnerUserId === userIdAlice ? userIdBob : userIdAlice;
+    const loserToken = winnerUserId === userIdAlice ? tokenB : tokenA;
+    const loserEmail = winnerUserId === userIdAlice ? bobEmail : aliceEmail;
+
+    // Verify mutual consistency between Promise.allSettled winner, persisted claimant, and selected loser
+    if (outcomeA.status === "fulfilled") {
+      expect(winnerUserId).toBe(userIdAlice);
+      expect(loserUserId).toBe(userIdBob);
+      expect(loserToken).toBe(tokenB);
+      expect(loserEmail).toBe(bobEmail);
+    } else {
+      expect(winnerUserId).toBe(userIdBob);
+      expect(loserUserId).toBe(userIdAlice);
+      expect(loserToken).toBe(tokenA);
+      expect(loserEmail).toBe(aliceEmail);
+    }
+    expect(consumedOwners[0].recipientEmail).toBe(winnerUserId === userIdAlice ? aliceEmail : bobEmail);
+    expect(unconsumedInvitations[0].recipientEmail).toBe(loserEmail);
 
     const winnerOwns = await WalletCredentialRepository.userOwnsCredential(winnerUserId, credIdRaced);
     expect(winnerOwns).toBe(true);
@@ -1147,18 +1167,19 @@ describe("CREDVAIL PostgreSQL Live Wallet Ownership & Single-Owner Integrity (H1
       await WalletService.claimCredential(
         {
           certificateNumber: certNumRaced,
-          claimToken: tokenB,
-          userEmail: bobEmail,
-          userId: userIdBob,
+          claimToken: loserToken,
+          userEmail: loserEmail,
+          userId: loserUserId,
           userEmailVerified: true,
         },
-        userIdBob
+        loserUserId
       );
     } catch (err: any) {
       secondClaimAfterDeleteAttemptError = err;
     }
     expect(secondClaimAfterDeleteAttemptError).toBeInstanceOf(CredentialAlreadyClaimedError);
     expect(secondClaimAfterDeleteAttemptError.code).toBe("CREDENTIAL_ALREADY_CLAIMED");
+    expect(secondClaimAfterDeleteAttemptError).not.toBeInstanceOf(ClaimAlreadyConsumedError);
 
     // Verify alternate claim API (consumeAtomic) cannot bypass the single-owner invariant
     let consumeAtomicError: any = null;
```

---

## 5. Database Enforcement Evidence

1. **Partial Unique Index (`prisma/sql/h1-3-3-single-owner-index.sql`):**  
   Catalog verification script `prisma/sql/h1-3-3-verify-single-owner-index.sql` inspects `pg_index`, `pg_class`, and `pg_attribute`, asserting that the index is unique, valid, ready, uses btree, targets `credentialId`, and has normalized predicate:
   `consumedat is not null and claimedbyuserid is not null`.
2. **Trigger (`prisma/sql/h1-3-3-ownership-monotonicity-trigger.sql`):**  
   Catalog verification script `prisma/sql/h1-3-3-verify-ownership-trigger.sql` inspects `pg_trigger`, confirming that `trg_claim_invitation_monotonicity` is enabled (`tgenabled = 'O'`) and covers INSERT, UPDATE, and DELETE.
3. **Error Mapping (`src/lib/repositories/claim-invitation-repository.ts`):**  
   `isExplicitSingleOwnerIndexViolation(err)` and `isAnyUniqueViolation(err)` strictly verify the partial unique index name or check for an existing claimed record on the same `credentialId`. Unrelated unique violations (e.g. duplicate `tokenHash`) are not misclassified and re-throw the original error.

---

## 6. Teardown Correction Evidence

In `test/integration/postgres-claim-concurrency.test.ts`:
```ts
  afterAll(async () => {
    if (isPostgresLive) {
      try {
        if (tenantId) {
          await prisma.claimInvitation.deleteMany({
            where: {
              tenantId,
              consumedAt: null,
              claimedByUserId: null,
            },
          });
        }
      } catch (cleanupErr: any) { ... }
    }
  });
```
- Only unconsumed pending invitations are deleted.
- Consumed ownership records and their relational parent records (`CredentialRecord`, `Tenant`, `User`) are safely retained in the disposable container database, preventing SQLSTATE `23514` check violations.

---

## 7. Local Pre-flight Validation Results

| Gate / Command | Exit Code | Discovered | Passed | Failed | Skipped | Details |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `npx prisma validate` | `0` | - | - | - | - | Schema valid |
| `npx prisma generate` | `0` | - | - | - | - | Client v6.19.3 generated in 1.53s |
| `npx tsc --noEmit` | `0` | - | - | - | - | 0 type errors |
| `npx vitest run test/unit/*.test.ts` | `0` | 28 | 28 | 0 | 0 | 9 key-generation, 19 security-hardening |
| `npx vitest run test/integration/*.test.ts` | `0` | 50 | 0 | 0 | 50 | 50 tests discovered across 4 suites, safely skipped locally due to absence of local PostgreSQL daemon |
| `npm test` | `0` | 115 | 115 | 0 | 0 | 115 test files passed (Phases 0–13) |
| `npm run build` | `0` | 24 | 24 | 0 | 0 | Next.js 15.5.29 production build succeeded |
| `git diff --check` | `0` | - | - | - | - | Clean, 0 whitespace violations |

---

## 8. Independent Security & Reliability Review

1. **Race Condition Safety:** The race between Alice and Bob runs concurrently via `Promise.allSettled([raceAlice, raceBob])`. Regardless of whether Alice's or Bob's transaction commits first, exactly one winner is established.
2. **Mutual Consistency:** The test proves that the winner in memory matches the persisted database owner, that the losing invitation remains unconsumed in the database, and that claiming the losing invitation fails specifically due to the existing credential ownership.
3. **No False Positive:** The explicit assertion `expect(...).not.toBeInstanceOf(ClaimAlreadyConsumedError)` guarantees that the test cannot pass on a false positive caused by token exhaustion.

---

## 9. Final Acceptance Decision

### Current Status: `BLOCKED`

**Rationale:**  
The local environment lacks Docker and a local PostgreSQL daemon. Per Section 7, 8, and 13 of the Protocol:
- A local run without PostgreSQL is classified as `BLOCKED`.
- Acceptance cannot be granted based on local compilation, unit tests, or skipped tests.
- Definitive production-readiness requires execution against live PostgreSQL in GitHub Actions, achieving:
  $$\text{Discovered: } 50 \quad|\quad \text{Passed: } 50 \quad|\quad \text{Failed: } 0 \quad|\quad \text{Skipped: } 0$$

### Proposed Commit Operation for User Approval:
- **Files to stage:** `test/integration/postgres-wallet-ownership.test.ts`
- **Intended commit message:** `test: fix H133-08 concurrent claim loser assertion and mutual consistency`
- **Push target:** `origin/main`
- **Expected Actions Workflow:** `PostgreSQL Concurrency & Transaction Integrity` (`postgres-claim-concurrency.yml`)
