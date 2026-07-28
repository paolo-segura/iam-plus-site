-- =============================================================================
-- READ-ONLY DIAGNOSTIC — everything needed to finish PART B of
--   db/2026-07-14-inquiry-lead-capture.sql
-- (the trigger that bridges website_leads -> public.leads, i.e. what makes
--  website inquiries / Coaching Mastery waitlist signups show up in the
--  dashboard's leads section).
--
-- Target project: dvvlxxbsxirhcqiaysfe  (the shared I AM+ project)
-- SQL editor:     https://supabase.com/dashboard/project/dvvlxxbsxirhcqiaysfe/sql
--
-- ⚠️  This file ONLY READS. No INSERT/UPDATE/DELETE/DDL anywhere. Safe to run
--     on production as-is. Run the whole thing and paste the single JSON result
--     back to Claude.
--
-- Note the Supabase SQL editor runs a paste as ONE transaction — that is fine
-- here (nothing is written), but it is why PART B itself must be pasted alone.
-- =============================================================================

select jsonb_pretty(jsonb_build_object(

  -- 1. Does public.leads even exist, and what is it?  (table vs view matters:
  --    a trigger can't INSERT into a view without an INSTEAD OF rule)
  'leads_relation', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'schema', n.nspname, 'name', c.relname,
             'kind', case c.relkind when 'r' then 'table' when 'v' then 'view'
                                    when 'm' then 'matview' when 'p' then 'partitioned'
                                    else c.relkind::text end,
             'rls_enabled', c.relrowsecurity)), '[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relname = 'leads' and n.nspname not in ('pg_catalog','information_schema')
  ),

  -- 2. THE BLOCKER: real column names, types, NOT NULL set, and defaults.
  --    Every NOT NULL column without a default must be satisfied by the trigger.
  'leads_columns', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'ordinal', ordinal_position, 'column', column_name,
             'type', data_type, 'udt', udt_name,
             'nullable', is_nullable, 'default', column_default,
             'maxlen', character_maximum_length
           ) order by ordinal_position), '[]'::jsonb)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'leads'
  ),

  -- 3. Constraints — a CHECK on status/source is the classic cause of a
  --    trigger that fails at runtime and silently drops every inquiry.
  'leads_constraints', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'name', conname, 'type', contype, 'definition', pg_get_constraintdef(oid))), '[]'::jsonb)
    from pg_constraint where conrelid = to_regclass('public.leads')
  ),

  -- 4. Any enum types the columns use, with their allowed labels.
  'leads_enums', (
    select coalesce(jsonb_agg(distinct jsonb_build_object(
             'column', a.attname, 'enum_type', t.typname,
             'allowed', (select jsonb_agg(e.enumlabel order by e.enumsortorder)
                         from pg_enum e where e.enumtypid = t.oid))), '[]'::jsonb)
    from pg_attribute a join pg_type t on t.oid = a.atttypid
    where a.attrelid = to_regclass('public.leads') and a.attnum > 0 and t.typtype = 'e'
  ),

  -- 5. Triggers already on both tables — so we don't double-insert or clash
  --    with something Jericson's app already does.
  'existing_triggers', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'on_table', c.relname, 'trigger', t.tgname,
             'definition', pg_get_triggerdef(t.oid))), '[]'::jsonb)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname in ('leads','website_leads') and not t.tgisinternal
  ),

  -- 6. RLS policies on public.leads (the trigger runs SECURITY DEFINER, but we
  --    need to know whether the dashboard reads it under a role filter).
  'leads_policies', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'policy', policyname, 'cmd', cmd, 'roles', roles,
             'using', qual, 'with_check', with_check)), '[]'::jsonb)
    from pg_policies where schemaname = 'public' and tablename = 'leads'
  ),

  -- 7. Row shape in practice: how many rows, and how existing rows are tagged.
  --    We mirror the abandoned-cart convention so inquiries land in the SAME
  --    dashboard view rather than a filtered-out limbo.
  'leads_rowcount', (select count(*) from public.leads),

  -- 8. The last 5 rows with every value, so we can see the real conventions
  --    (source/status/stage/program wording) instead of guessing.
  --    ⚠️ contains real customer PII — see the redacted variant at the bottom
  --    if you'd rather not paste that into chat.
  'leads_recent_rows', (
    select coalesce(jsonb_agg(r), '[]'::jsonb)
    from (select to_jsonb(l) as r from public.leads l
          order by l.ctid desc limit 5) s
  ),

  -- 9. What website_leads currently holds, by source — tells us how many
  --    inquiries are already sitting there un-bridged and would need a backfill.
  'website_leads_by_source', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'type', type, 'source', source, 'n', n, 'first', first_at, 'last', last_at)), '[]'::jsonb)
    from (select type, source, count(*) n, min(created_at) first_at, max(created_at) last_at
          from public.website_leads group by 1,2 order by 3 desc) q
  ),

  -- 10. website_leads' own columns, to confirm what we can carry across.
  'website_leads_columns', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'column', column_name, 'type', data_type,
             'nullable', is_nullable, 'default', column_default
           ) order by ordinal_position), '[]'::jsonb)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'website_leads'
  )

)) as leads_bridge_diagnostic;


-- =============================================================================
-- PII-FREE ALTERNATIVE for item 8
-- -----------------------------------------------------------------------------
-- If you'd rather not paste real customer names/emails, SKIP nothing above —
-- just delete the 'leads_recent_rows' block and run this instead. It gives the
-- conventions (which values appear in the tagging columns) without any PII.
-- Replace <<source_col>> / <<status_col>> with the real names from item 2.
-- =============================================================================

-- select 'source' as col, <<source_col>>::text as value, count(*)
--   from public.leads group by 2
-- union all
-- select 'status', <<status_col>>::text, count(*)
--   from public.leads group by 2
-- order by 1, 3 desc;
