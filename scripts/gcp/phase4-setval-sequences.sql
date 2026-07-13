-- phase4-setval-sequences.sql
-- LingoLinq Render -> GCP Cloud Run migration, Phase 4 (cutover).
--
-- WHAT: After a pg_dump -> restore into Cloud SQL, every column-owned sequence is left at
--       its dump-time value, which lags the restored MAX(id). The next INSERT would reuse an
--       existing primary key. LingoLinq's global_id (app/models/concerns/global_id.rb) encodes
--       the RAW primary key ("1_<id>"), so a PK collision is not just a DB error -- it corrupts
--       global_id references. This script advances every column-owned sequence to its table's
--       MAX(owning column) so the next INSERT is collision-free.
--
-- HOW:  Discovery is fully dynamic via pg_depend (deptype 'a' = a sequence AUTO-owned by a
--       column, i.e. SERIAL / bigserial). It covers every such sequence in the live schema with
--       NO hardcoded table list, so new tables are handled automatically. Ordered by
--       schema/table/column for deterministic NOTICE output (stable audit logs).
--
-- WHY ONLY deptype 'a': we intentionally reset ONLY column-owned sequences. Standalone/custom
--       sequences not tied to a column (deptype != 'a') are excluded -- their "next value" is
--       application-defined, not derivable from a MAX(column), so blindly setval-ing them could
--       break intended numbering. GENERATED ... AS IDENTITY columns use deptype 'i' and are NOT
--       matched here by design; phase4-verify-sequences.sql asserts none have crept in (drift
--       check), so if Rails ever switches to identity PKs this surfaces loudly instead of being
--       silently skipped.
--
-- IDEMPOTENT: re-running lands on the same values (setval to MAX, or to 1/not-called for an
--       empty table). Safe to run more than once.
--
-- RUNNERS: scripts/gcp/phase4-setval-sequences.sh (psql, cutover) and
--       `rake db:setval_all_sequences` (lib/tasks/phase4_sequences.rake, rehearsal/test).
--       This file is the single source of truth for the logic; do not duplicate it.

DO $$
DECLARE
  r         RECORD;
  maxid     BIGINT;
  newval    BIGINT;
  is_called BOOLEAN;
  n_done    INTEGER := 0;
BEGIN
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

    IF maxid > 0 THEN
      -- Non-empty table: set the sequence to MAX and mark it called, so nextval = MAX + 1.
      newval := maxid;
      is_called := true;
    ELSE
      -- Empty table: set to 1, NOT called, so the first nextval returns 1.
      newval := 1;
      is_called := false;
    END IF;

    PERFORM setval(format('%I.%I', r.schema_name, r.seq_name)::regclass, newval, is_called);
    n_done := n_done + 1;

    RAISE NOTICE 'setval %.% -> % (is_called=%; from %.%.% MAX=%)',
      r.schema_name, r.seq_name, newval, is_called,
      r.schema_name, r.table_name, r.column_name, maxid;
  END LOOP;

  RAISE NOTICE 'phase4-setval-sequences: advanced % column-owned sequence(s).', n_done;
END $$;
