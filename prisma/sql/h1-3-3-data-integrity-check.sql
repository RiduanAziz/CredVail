-- CREDVAIL H1.3.3.1: Pre-Index Data Integrity Diagnostic & Assertion
-- Detects and asserts zero pre-existing duplicate claimed ownership records for the same credential.
-- In a healthy single-owner database, this query must return 0 rows.
-- If duplicate owners exist, an exception is raised, causing psql -v ON_ERROR_STOP=1 to fail immediately.

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

DO $$
BEGIN
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
END
$$;
