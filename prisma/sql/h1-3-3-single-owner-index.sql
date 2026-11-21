-- CREDVAIL H1.3.3.1: Single-Owner Credential Integrity Partial Unique Index
-- Enforces that one credential may have at most one authenticated claimant in PostgreSQL.
-- Multiple unconsumed pending invitations (consumedAt IS NULL) remain permitted.

CREATE UNIQUE INDEX IF NOT EXISTS "claim_invitations_one_consumed_owner_per_credential_uq"
ON "claim_invitations" ("credentialId")
WHERE "consumedAt" IS NOT NULL
  AND "claimedByUserId" IS NOT NULL;
