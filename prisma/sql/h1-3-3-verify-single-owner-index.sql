-- CREDVAIL H1.3.3.1: PostgreSQL Catalog Verification for Single-Owner Partial Unique Index
-- Verifies that:
-- 1. Index 'claim_invitations_one_consumed_owner_per_credential_uq' exists
-- 2. Index is unique (indisunique = true)
-- 3. Index is valid (indisvalid = true)
-- 4. Index is ready (indisready = true)
-- 5. Index covers the 'credentialId' column
-- 6. Index predicate enforces both non-null conditions ('consumedAt IS NOT NULL' and 'claimedByUserId IS NOT NULL')

DO $$
DECLARE
  v_indisunique boolean;
  v_indisvalid boolean;
  v_indisready boolean;
  v_attname text;
  v_pred text;
BEGIN
  SELECT 
    i.indisunique,
    i.indisvalid,
    i.indisready,
    a.attname,
    pg_get_expr(i.indpred, i.indrelid)
  INTO
    v_indisunique,
    v_indisvalid,
    v_indisready,
    v_attname,
    v_pred
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
  WHERE c.relname = 'claim_invitations_one_consumed_owner_per_credential_uq'
    AND t.relname = 'claim_invitations';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'H1.3.3.1 index verification failed: index claim_invitations_one_consumed_owner_per_credential_uq does not exist';
  END IF;

  IF NOT v_indisunique THEN
    RAISE EXCEPTION 'H1.3.3.1 index verification failed: index is not unique';
  END IF;

  IF NOT v_indisvalid THEN
    RAISE EXCEPTION 'H1.3.3.1 index verification failed: index indisvalid is false';
  END IF;

  IF NOT v_indisready THEN
    RAISE EXCEPTION 'H1.3.3.1 index verification failed: index indisready is false';
  END IF;

  IF v_attname <> 'credentialId' THEN
    RAISE EXCEPTION 'H1.3.3.1 index verification failed: index does not target credentialId column (found %)', v_attname;
  END IF;

  IF v_pred NOT LIKE '%consumedAt IS NOT NULL%' OR v_pred NOT LIKE '%claimedByUserId IS NOT NULL%' THEN
    RAISE EXCEPTION 'H1.3.3.1 index verification failed: predicate missing required non-null conditions (found %)', v_pred;
  END IF;
END
$$;
