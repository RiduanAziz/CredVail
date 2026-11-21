-- CREDVAIL H1.3.3.1: Pre-Index Data Integrity Diagnostic & Assertion
-- Detects and asserts:
-- 1. Zero pre-existing duplicate claimed ownership records for the same credential.
-- 2. Zero pre-existing inconsistent ownership records (where consumedAt and claimedByUserId are not paired).
-- In a healthy single-owner database, these diagnostic queries must return 0 rows.
-- If any integrity violation exists, an exception is raised, causing psql -v ON_ERROR_STOP=1 to fail immediately.

-- Diagnostic 1: Duplicate claimed ownership records
SELECT
  "credentialId",
  COUNT(*) AS "consumedOwnerCount",
  ARRAY_AGG("id") AS "invitationIds",
  ARRAY_AGG("claimedByUserId") AS "claimants",
  ARRAY_AGG("consumedAt") AS "consumedTimestamps"
FROM "claim_invitations"
WHERE "consumedAt" IS NOT NULL
  AND "claimedByUserId" IS NOT NULL
GROUP BY "credentialId"
HAVING COUNT(*) > 1;

-- Diagnostic 2: Inconsistent ownership-state records (one field NULL and the other NOT NULL)
SELECT
  "id" AS "invitationId",
  "credentialId",
  "consumedAt",
  "claimedByUserId"
FROM "claim_invitations"
WHERE ("consumedAt" IS NULL) IS DISTINCT FROM ("claimedByUserId" IS NULL);

DO $$
BEGIN
  -- Assertion 1: Fail closed if duplicate credential owners exist
  IF EXISTS (
    SELECT 1
    FROM "claim_invitations"
    WHERE "consumedAt" IS NOT NULL
      AND "claimedByUserId" IS NOT NULL
    GROUP BY "credentialId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'H1.3.3.1 integrity gate failed: duplicate credential owners exist in claim_invitations table';
  END IF;

  -- Assertion 2: Fail closed if inconsistent ownership records exist
  IF EXISTS (
    SELECT 1
    FROM "claim_invitations"
    WHERE ("consumedAt" IS NULL) IS DISTINCT FROM ("claimedByUserId" IS NULL)
  ) THEN
    RAISE EXCEPTION
      'H1.3.3.1 integrity gate failed: inconsistent ownership records exist where consumedAt and claimedByUserId are not paired';
  END IF;
END
$$;
