-- CREDVAIL H1.3.3.1: PostgreSQL Trigger for Claim Invitation Ownership Monotonicity
-- Enforces:
-- 1. An unconsumed invitation (consumedAt IS NULL, claimedByUserId IS NULL) transitions to consumed once.
-- 2. Once consumedAt IS NOT NULL, consumedAt cannot be reset to NULL or changed.
-- 3. Once claimedByUserId IS NOT NULL, claimedByUserId cannot be cleared to NULL or reassigned.
-- 4. credentialId is permanently immutable once created.
-- 5. Transition to consumed state requires setting both consumedAt and claimedByUserId.

CREATE OR REPLACE FUNCTION trg_enforce_claim_invitation_monotonicity()
RETURNS TRIGGER AS $$
BEGIN
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

  -- Invariant 4: Transition to consumed state must set claimedByUserId
  IF OLD."consumedAt" IS NULL AND NEW."consumedAt" IS NOT NULL AND NEW."claimedByUserId" IS NULL THEN
    RAISE EXCEPTION 'claim_invitations ownership violation: cannot set consumedAt without assigning claimedByUserId'
      USING ERRCODE = '23514'; -- check_violation
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_claim_invitation_monotonicity ON "claim_invitations";

CREATE TRIGGER trg_claim_invitation_monotonicity
BEFORE UPDATE ON "claim_invitations"
FOR EACH ROW
EXECUTE FUNCTION trg_enforce_claim_invitation_monotonicity();
