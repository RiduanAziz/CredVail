-- CREDVAIL H1.3.3.1: PostgreSQL Catalog Verification for Ownership Monotonicity Trigger
-- Verifies that:
-- 1. Trigger 'trg_claim_invitation_monotonicity' exists on table 'claim_invitations' in schema 'public'
-- 2. Trigger is enabled (tgenabled = 'O')
-- 3. Trigger executes function 'trg_enforce_claim_invitation_monotonicity'
-- 4. Trigger fires BEFORE UPDATE for each row (tgtype & 2 = 2, tgtype & 16 = 16, tgtype & 1 = 1)

DO $$
DECLARE
  v_tgenabled "char";
  v_tgtype smallint;
  v_proname text;
BEGIN
  SELECT t.tgenabled, t.tgtype, p.proname
  INTO v_tgenabled, v_tgtype, v_proname
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_proc p ON p.oid = t.tgfoid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE t.tgname = 'trg_claim_invitation_monotonicity'
    AND c.relname = 'claim_invitations'
    AND n.nspname = 'public';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'H1.3.3.1 trigger verification failed: trigger trg_claim_invitation_monotonicity does not exist on claim_invitations in public schema';
  END IF;

  IF v_tgenabled <> 'O' THEN
    RAISE EXCEPTION 'H1.3.3.1 trigger verification failed: trigger is not enabled (tgenabled = %)', v_tgenabled;
  END IF;

  IF v_proname <> 'trg_enforce_claim_invitation_monotonicity' THEN
    RAISE EXCEPTION 'H1.3.3.1 trigger verification failed: trigger function is %, expected trg_enforce_claim_invitation_monotonicity', v_proname;
  END IF;

  -- Verify BEFORE UPDATE FOR EACH ROW
  -- Bit 0 (1): row-level trigger (FOR EACH ROW)
  -- Bit 1 (2): BEFORE trigger
  -- Bit 4 (16): UPDATE event
  IF (v_tgtype & 1) = 0 THEN
    RAISE EXCEPTION 'H1.3.3.1 trigger verification failed: trigger is not row-level (tgtype = %)', v_tgtype;
  END IF;

  IF (v_tgtype & 2) = 0 THEN
    RAISE EXCEPTION 'H1.3.3.1 trigger verification failed: trigger is not BEFORE (tgtype = %)', v_tgtype;
  END IF;

  IF (v_tgtype & 16) = 0 THEN
    RAISE EXCEPTION 'H1.3.3.1 trigger verification failed: trigger does not fire on UPDATE (tgtype = %)', v_tgtype;
  END IF;
END
$$;
