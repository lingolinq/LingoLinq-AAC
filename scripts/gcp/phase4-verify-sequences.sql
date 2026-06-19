-- phase4-verify-sequences.sql
-- LingoLinq Render -> GCP Cloud Run migration, Phase 4 (cutover) -- post-setval verification.
--
-- Confirms phase4-setval-sequences.sql did its job and that the schema has not drifted in a way
-- the setval discovery would silently miss. Two checks, both fail LOUD:
--
--   CHECK A (lag): every column-owned sequence (deptype 'a') must be advanced past its table's
--     MAX(owning column) -- i.e. the next nextval must exceed MAX -- so the next INSERT cannot
--     collide on a primary key. A sequence still at/behind MAX is a setval failure.
--
--   CHECK B (identity drift): no user table may have a PRIMARY-KEY column that is a
--     GENERATED ... AS IDENTITY column (attidentity in 'a','d'). phase4-setval-sequences.sql
--     resets only deptype 'a' (SERIAL) sequences; an identity PK would be skipped silently and
--     could collide after restore. LingoLinq is all-SERIAL today (verified against db/schema.rb),
--     so this must stay empty. If it ever fires, the setval script must be extended before cutover.
--
-- On any problem this RAISES EXCEPTION (so psql with ON_ERROR_STOP and the rake runner both exit
-- non-zero and HALT the cutover). On success it emits a NOTICE and returns cleanly. Read-only:
-- it never advances a sequence (uses last_value/is_called, never nextval/setval).

DO $$
DECLARE
  r          RECORD;
  maxid      BIGINT;
  seq_last   BIGINT;
  seq_called BOOLEAN;
  eff_next   BIGINT;
  problems   TEXT := '';
  n_checked  INTEGER := 0;
BEGIN
  -- CHECK A: owned sequences behind their column MAX.
  FOR r IN
    SELECT n.nspname AS schema_name,
           s.relname AS seq_name,
           t.relname AS table_name,
           a.attname AS column_name
    FROM pg_class s
    JOIN pg_depend d    ON d.objid = s.oid
                       AND d.classid = 'pg_class'::regclass
                       AND d.deptype = 'a'
    JOIN pg_class t     ON t.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
    JOIN pg_namespace n ON n.oid = s.relnamespace
    WHERE s.relkind = 'S'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY n.nspname, t.relname, a.attname
  LOOP
    EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I.%I',
                   r.column_name, r.schema_name, r.table_name)
      INTO maxid;
    EXECUTE format('SELECT last_value, is_called FROM %I.%I',
                   r.schema_name, r.seq_name)
      INTO seq_last, seq_called;

    -- Effective next value the sequence would hand out.
    eff_next := CASE WHEN seq_called THEN seq_last + 1 ELSE seq_last END;
    n_checked := n_checked + 1;

    IF maxid > 0 AND eff_next <= maxid THEN
      problems := problems || format(
        E'\n  - %I.%I behind: next=%s but %I.%I MAX=%s',
        r.schema_name, r.seq_name, eff_next, r.table_name, r.column_name, maxid);
    END IF;
  END LOOP;

  -- CHECK B: identity-column PKs (drift the SERIAL-only setval would skip).
  FOR r IN
    SELECT n.nspname AS schema_name, t.relname AS table_name, a.attname AS column_name
    FROM pg_attribute a
    JOIN pg_class t       ON t.oid = a.attrelid AND t.relkind = 'r'
    JOIN pg_namespace n   ON n.oid = t.relnamespace
    JOIN pg_constraint pk ON pk.conrelid = t.oid AND pk.contype = 'p'
                         AND a.attnum = ANY (pk.conkey)
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND a.attidentity IN ('a', 'd')   -- GENERATED ALWAYS / BY DEFAULT AS IDENTITY
    ORDER BY n.nspname, t.relname, a.attname
  LOOP
    problems := problems || format(
      E'\n  - identity PK not covered by SERIAL setval: %I.%I.%I',
      r.schema_name, r.table_name, r.column_name);
  END LOOP;

  IF problems <> '' THEN
    RAISE EXCEPTION E'phase4-verify-sequences FAILED:%', problems;
  END IF;

  RAISE NOTICE 'phase4-verify-sequences: OK -- % owned sequence(s) past MAX, no identity-PK drift.', n_checked;
END $$;
