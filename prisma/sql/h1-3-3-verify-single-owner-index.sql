-- CREDVAIL H1.3.3.1: PostgreSQL Catalog Verification for Single-Owner Partial Unique Index
-- Verifies that:
-- 1. Index 'claim_invitations_one_consumed_owner_per_credential_uq' exists in schema 'public'
-- 2. Index is on table 'claim_invitations'
-- 3. Index uses access method 'btree'
-- 4. Index is unique (indisunique = true)
-- 5. Index is valid (indisvalid = true)
-- 6. Index is ready (indisready = true)
-- 7. Exactly one key column is indexed (indnkeyatts = 1)
-- 8. The indexed key column is 'credentialId'
-- 9. Index predicate enforces both 'consumedAt IS NOT NULL' and 'claimedByUserId IS NOT NULL'

DO $$
DECLARE
  v_indisunique boolean;
  v_indisvalid boolean;
  v_indisready boolean;
  v_amname text;
  v_num_keys int;
  v_attname text;
  v_raw_pred text;
  v_pred_normalized text;
BEGIN
  SELECT 
    i.indisunique,
    i.indisvalid,
    i.indisready,
    am.amname,
    i.indnkeyatts,
    a.attname,
    pg_get_expr(i.indpred, i.indrelid)
  INTO
    v_indisunique,
    v_indisvalid,
    v_indisready,
    v_amname,
    v_num_keys,
    v_attname,
    v_raw_pred
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN pg_am am ON am.oid = c.relam
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
  WHERE c.relname = 'claim_invitations_one_consumed_owner_per_credential_uq'
    AND t.relname = 'claim_invitations'
    AND n.nspname = 'public';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'H1.3.3.1 index verification failed: index claim_invitations_one_consumed_owner_per_credential_uq does not exist in schema public';
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

  IF v_amname <> 'btree' THEN
    RAISE EXCEPTION 'H1.3.3.1 index verification failed: index access method is %, expected btree', v_amname;
  END IF;

  IF v_num_keys <> 1 THEN
    RAISE EXCEPTION 'H1.3.3.1 index verification failed: index has % key attributes, expected 1', v_num_keys;
  END IF;

  IF v_attname <> 'credentialId' THEN
    RAISE EXCEPTION 'H1.3.3.1 index verification failed: index does not target credentialId column (found %)', v_attname;
  END IF;

  IF v_raw_pred IS NULL THEN
    RAISE EXCEPTION 'H1.3.3.1 index verification failed: index predicate is NULL (not a partial index)';
  END IF;

  -- Normalize identifier quotes, parentheses, case, and collapse whitespace
  v_pred_normalized := trim(regexp_replace(lower(replace(replace(replace(v_raw_pred, '"', ''), '(', ''), ')', '')), '\s+', ' ', 'g'));

  IF v_pred_normalized <> 'consumedat is not null and claimedbyuserid is not null' THEN
    RAISE EXCEPTION 'H1.3.3.1 index verification failed: index predicate does not exactly match expected single-owner invariant (expected: "consumedat is not null and claimedbyuserid is not null", got: "%")', v_pred_normalized;
  END IF;
END
$$;
