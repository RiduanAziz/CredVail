-- CREDVAIL H1.3.3.1: PostgreSQL Trigger for Claim Invitation Ownership Monotonicity & Paired State
-- Enforces:
-- 1. Paired ownership-state invariant on INSERT and UPDATE:
--    Unclaimed invitation: consumedAt IS NULL AND claimedByUserId IS NULL.
--    Claimed invitation: consumedAt IS NOT NULL AND claimedByUserId IS NOT NULL.
--    Either one-sided state is rejected with SQLSTATE 23514.
-- 2. Once consumed, consumedAt cannot be reset to NULL or modified.
-- 3. Once assigned, claimedByUserId cannot be cleared to NULL or reassigned.
-- 4. credentialId is permanently immutable once created.
-- 5. Safe handling of TG_OP = 'INSERT' (never accesses OLD).

CREATE OR REPLACE FUNCTION trg_enforce_claim_invitation_monotonicity()
RETURNS TRIGGER AS $$
BEGIN
  -- Invariant 0: Paired ownership-state invariant (both NULL or both NOT NULL)
  -- Rejects:
  --   - consumedAt IS NOT NULL with claimedByUserId IS NULL
  --   - claimedByUserId IS NOT NULL with consumedAt IS NULL
  IF (NEW."consumedAt" IS NULL) IS DISTINCT FROM (NEW."claimedByUserId" IS NULL) THEN
    RAISE EXCEPTION 'claim_invitations ownership state violation: consumedAt and claimedByUserId must both be NULL or both be NOT NULL (paired ownership state)'
      USING ERRCODE = '23514'; -- check_violation
  END IF;

  -- The following immutability rules apply only to UPDATE operations (never access OLD on INSERT)
  IF TG_OP = 'UPDATE' THEN
    -- Invariant 1: credentialId cannot be altered
    IF OLD."credentialId" IS DISTINCT FROM NEW."credentialId" THEN
      RAISE EXCEPTION 'claim_invitations ownership violation: credentialId is immutable once created (attempted to change % to %)',
        OLD."credentialId", NEW."credentialId"
        USING ERRCODE = '23514'; -- check_violation
    END IF;

    -- Invariant 2: Once consumed, consumedAt cannot be cleared or modified
    IF OLD."consumedAt" IS NOT NULL THEN
      IF NEW."consumedAt" IS NULL THEN
        RAISE EXCEPTION 'claim_invitations ownership violation: consumedAt cannot be reset to NULL once consumed'
          USING ERRCODE = '23514'; -- check_violation
      END IF;
      IF OLD."consumedAt" IS DISTINCT FROM NEW."consumedAt" THEN
        RAISE EXCEPTION 'claim_invitations ownership violation: consumedAt is immutable once set (attempted to change % to %)',
          OLD."consumedAt", NEW."consumedAt"
          USING ERRCODE = '23514'; -- check_violation
      END IF;
    END IF;

    -- Invariant 3: Once assigned, claimedByUserId cannot be cleared or reassigned
    IF OLD."claimedByUserId" IS NOT NULL THEN
      IF NEW."claimedByUserId" IS NULL THEN
        RAISE EXCEPTION 'claim_invitations ownership violation: claimedByUserId cannot be cleared once assigned'
          USING ERRCODE = '23514'; -- check_violation
      END IF;
      IF OLD."claimedByUserId" IS DISTINCT FROM NEW."claimedByUserId" THEN
        RAISE EXCEPTION 'claim_invitations ownership violation: claimedByUserId is immutable once assigned (attempted to change % to %)',
          OLD."claimedByUserId", NEW."claimedByUserId"
          USING ERRCODE = '23514'; -- check_violation
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_claim_invitation_monotonicity ON "claim_invitations";

CREATE TRIGGER trg_claim_invitation_monotonicity
BEFORE INSERT OR UPDATE ON "claim_invitations"
FOR EACH ROW
EXECUTE FUNCTION trg_enforce_claim_invitation_monotonicity();
