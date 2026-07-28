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
-- ⚠️  READS ONLY. No INSERT/UPDATE/DELETE/DDL anywhere. Safe on production.
--
-- RUN STEP 1 FIRST, ON ITS OWN. Paste the JSON result back to Claude.
-- STEP 2 needs the real table name from STEP 1 and is a separate paste.
--
-- Why split: STEP 2 has to name the leads table in a FROM clause. If that table
-- doesn't exist, or is called something else, or lives in another schema, then
-- Postgres fails the ENTIRE statement at parse time — including the part meant
-- to tell us whether it exists. STEP 1 touches only the system catalogs, so it
-- always returns something no matter what the CRM table turns out to be.
-- =============================================================================


-- =============================================================================
-- STEP 1 — catalogue only. Always safe, always returns. Run this first.
-- =============================================================================

select jsonb_pretty(jsonb_build_object(

  -- 1. Find the CRM table. Not assuming it's public.leads — anything with
  --    'lead' in the name, in any user schema. Also flags table vs view:
  --    a trigger can't INSERT into a view without an INSTEAD OF rule.
  'lead_like_relations', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'schema', n.nspname, 'name', c.relname,
             'kind', case c.relkind when 'r' then 'table' when 'v' then 'view'
                                    when 'm' then 'matview' when 'p' then 'partitioned'
                                    else c.relkind::text end,
             'rls_enabled', c.relrowsecurity,
             'approx_rows', c.reltuples::bigint) order by n.nspname, c.relname), '[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relname ilike '%lead%'
      and c.relkind in ('r','v','m','p')
      and n.nspname not in ('pg_catalog','information_schema','pg_toast')
  ),

  -- 2. THE BLOCKER: real columns, types, NOT NULL set and defaults, for every
  --    lead-ish table found above. Any NOT NULL column without a default must
  --    be satisfied by the trigger or every inquiry INSERT fails at runtime.
  'columns', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'table', c.table_schema || '.' || c.table_name,
             'ordinal', c.ordinal_position, 'column', c.column_name,
             'type', c.data_type, 'udt', c.udt_name,
             'nullable', c.is_nullable, 'default', c.column_default,
             'maxlen', c.character_maximum_length
           ) order by c.table_schema, c.table_name, c.ordinal_position), '[]'::jsonb)
    from information_schema.columns c
    where c.table_name ilike '%lead%'
      and c.table_schema not in ('pg_catalog','information_schema')
  ),

  -- 3. Constraints — a CHECK on status/source is the classic cause of a trigger
  --    that fails at runtime and silently drops every inquiry.
  'constraints', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'table', n.nspname || '.' || c.relname,
             'name', con.conname, 'type', con.contype,
             'definition', pg_get_constraintdef(con.oid))), '[]'::jsonb)
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where c.relname ilike '%lead%'
      and n.nspname not in ('pg_catalog','information_schema')
  ),

  -- 4. Enum types used by those columns, with their allowed labels.
  'enums', (
    select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
    from (
      select distinct
             n.nspname || '.' || c.relname as "table",
             a.attname as "column",
             t.typname as enum_type,
             (select jsonb_agg(en.enumlabel order by en.enumsortorder)
                from pg_enum en where en.enumtypid = t.oid) as allowed
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_type t on t.oid = a.atttypid
      where c.relname ilike '%lead%' and a.attnum > 0 and not a.attisdropped
        and t.typtype = 'e'
        and n.nspname not in ('pg_catalog','information_schema')
    ) e
  ),

  -- 5. Triggers already on those tables — so we don't double-insert or clash
  --    with something Jericson's app already does.
  'existing_triggers', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'on_table', n.nspname || '.' || c.relname,
             'trigger', t.tgname, 'enabled', t.tgenabled,
             'definition', pg_get_triggerdef(t.oid))), '[]'::jsonb)
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where c.relname ilike '%lead%' and not t.tgisinternal
      and n.nspname not in ('pg_catalog','information_schema')
  ),

  -- 6. RLS policies. The bridge trigger runs SECURITY DEFINER, but we need to
  --    know whether the dashboard reads the table under a role filter.
  'policies', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'table', schemaname || '.' || tablename,
             'policy', policyname, 'cmd', cmd, 'roles', to_jsonb(roles),
             'using', qual, 'with_check', with_check)), '[]'::jsonb)
    from pg_policies
    where tablename ilike '%lead%' and schemaname not in ('pg_catalog','information_schema')
  ),

  -- 7. Is the July migration's PART A actually live? (type CHECK must allow
  --    'inquiry', or the waitlist POST is already 400-ing in production.)
  'website_leads_type_check', (
    select coalesce(jsonb_agg(pg_get_constraintdef(con.oid)), '[]'::jsonb)
    from pg_constraint con
    where con.conrelid = to_regclass('public.website_leads')
      and con.conname = 'website_leads_type_check'
  )

)) as step_1_catalogue;


-- =============================================================================
-- STEP 1 RESULT (2026-07-28) — the bridge is ALREADY DEPLOYED.
-- -----------------------------------------------------------------------------
--   trg_bridge_inquiry_to_leads  AFTER INSERT ON public.website_leads
--   FOR EACH ROW WHEN (new.type = 'inquiry') EXECUTE FUNCTION bridge_inquiry_to_leads()
--
-- So PART B of 2026-07-14-inquiry-lead-capture.sql was run at some point; that
-- file's "DO NOT RUN / pending Jericson" header is stale. Confirmed live too:
--   website_leads_type_check allows 'inquiry'  -> PART A is live
--   RLS "anon can submit website leads" WITH CHECK (status='new')
--
-- 🔴 BUT the bridge may be silently doing nothing. public.leads carries:
--
--   leads_source_check  CHECK (source = ANY (ARRAY[
--       'transaction','manual_admin','manual_affiliate','subscription']))
--   leads_status_check  CHECK (status = ANY (ARRAY[
--       'Active','Converted','Inactive']))
--   leads.name  NOT NULL,  leads.email NOT NULL
--
-- The DRAFT of PART B inserts source='website_inquiry' — NOT in that allowed
-- list — and wraps the INSERT in `exception when others then raise warning;
-- return new;` so a CRM-mirror failure can never block the website's capture.
-- If the deployed body still does that, every inquiry raises, the handler
-- swallows it, the row stays in website_leads, and NOTHING reaches the
-- dashboard — with no error anywhere a human would look.
--
-- STEP 2 settles it by reading the deployed function body.
-- =============================================================================


-- =============================================================================
-- STEP 2 — is the deployed bridge actually working? Run as a separate paste.
-- Still READ-ONLY.
-- =============================================================================

select jsonb_pretty(jsonb_build_object(

  -- 1. THE DECIDER: the real deployed function body. Compare its source/status
  --    values against leads_source_check / leads_status_check above.
  'bridge_function_def', (
    select coalesce(jsonb_agg(pg_get_functiondef(p.oid)), '[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'bridge_inquiry_to_leads' and n.nspname = 'public'
  ),

  -- 2. Reconciliation. If bridged_ok is 0 while inquiries > 0, the trigger is
  --    firing and failing silently — which is the whole question.
  'inquiries_in_website_leads', (select count(*) from public.website_leads where type='inquiry'),
  'total_leads_rows',           (select count(*) from public.leads),

  -- 3. How leads rows are tagged today, no PII. Tells us which allowed `source`
  --    value website inquiries should legitimately use.
  'leads_by_source_status', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'source', source, 'status', status, 'n', n,
             'first', first_at, 'last', last_at)), '[]'::jsonb)
    from (select source, status, count(*) n,
                 min(subscribed_date) first_at, max(subscribed_date) last_at
          from public.leads group by 1,2 order by 3 desc) q
  ),

  -- 4. What's sitting in website_leads by source — the backfill size if the
  --    bridge has been failing.
  'website_leads_by_source', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'type', type, 'source', source, 'n', n,
             'first', first_at, 'last', last_at)), '[]'::jsonb)
    from (select type, source, count(*) n, min(created_at) first_at, max(created_at) last_at
          from public.website_leads group by 1,2 order by 3 desc) q
  ),

  -- 5. Do any leads rows correspond to a website inquiry? Matches on email, so
  --    it works regardless of which `source` value the bridge chose.
  --    bridged_ok > 0 = the bridge really is landing rows.
  'bridged_ok', (
    select count(*) from public.leads l
    where exists (select 1 from public.website_leads w
                  where w.type='inquiry' and lower(w.email) = lower(l.email))
  ),

  -- 6. Inquiries that never made it across — the exact backfill set (count only).
  'missing_from_leads', (
    select count(*) from public.website_leads w
    where w.type='inquiry'
      and not exists (select 1 from public.leads l
                      where lower(l.email) = lower(w.email))
  )

)) as step_2_bridge_health;
