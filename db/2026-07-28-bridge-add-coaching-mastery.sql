-- =============================================================================
-- Teach the leads bridge about the Coaching Mastery waitlist.
-- Target project: dvvlxxbsxirhcqiaysfe   (shared I AM+)
--
-- CONTEXT (verified live 2026-07-28, not assumed):
--   public.bridge_inquiry_to_leads() is deployed and WORKING. It inserts into
--   public.leads with source='manual_admin' + status='Active' — both allowed by
--   leads_source_check / leads_status_check — so inquiries really do land in
--   the dashboard leads section. Confirmed: 4 inquiries in website_leads, and
--   the matching manual_admin/Active rows are in leads.
--
-- THE GAP THIS FIXES:
--   The function labels the lead by branching on website_leads.source:
--       'breakthrough_inquiry' -> 'Breakthrough'
--       'discovery_inquiry'    -> 'Discovery'
--       else                   -> 'I AM+'
--   The Coaching Mastery waitlist posts source='coaching_mastery_waitlist',
--   which is not in that list, so it falls through to the generic 'I AM+'.
--   The lead still arrives — it just arrives unlabelled, indistinguishable
--   from any other inquiry, which defeats the point of a waitlist you are
--   meant to call back first when the date is announced.
--
-- WHAT CHANGES: the CASE only. Same columns, same source='manual_admin',
--   same status='Active', same swallow-errors-so-the-website-never-breaks
--   behaviour. Nothing about how a lead is stored or secured changes.
--
-- SAFE TO RE-RUN (CREATE OR REPLACE). Existing rows are untouched.
-- Paste this ALONE — the Supabase SQL editor runs a paste as ONE transaction.
-- =============================================================================

create or replace function public.bridge_inquiry_to_leads()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.leads (name, email, mobile, notes, source, status)
  values (
    new.full_name,
    new.email,
    new.contact_number,
    'WEBSITE INQUIRY — ' ||
      case
        when new.source = 'breakthrough_inquiry'       then 'Breakthrough'
        when new.source = 'discovery_inquiry'          then 'Discovery'
        when new.source = 'discovery_teens_inquiry'    then 'Discovery Teens'
        -- Date is TBA: these people asked to be told first when it is announced.
        when new.source = 'coaching_mastery_waitlist'  then 'Coaching Mastery — WAITLIST (call when date is set)'
        -- Unknown source: name it rather than hiding it as 'I AM+', so the next
        -- new form is obvious in the dashboard instead of silently generic.
        when new.source is not null and new.source <> '' then 'I AM+ (' || new.source || ')'
        else 'I AM+'
      end
      || coalesce(E'\n\n' || nullif(new.message, ''), ''),
    'manual_admin',
    'Active'
  );
  return new;
exception when others then
  -- Deliberate: a CRM-mirror failure must never block the website's own
  -- capture. The row is already safe in website_leads. Downside is that a
  -- failure is invisible unless someone reads Postgres logs — see the
  -- reconciliation query at the bottom of this file.
  raise warning 'bridge_inquiry_to_leads failed for website_leads.id=%: %', new.id, sqlerrm;
  return new;
end; $function$;

notify pgrst, 'reload schema';


-- =============================================================================
-- VERIFY (read-only) — run after the above. Expect one row per inquiry source,
-- and every label to be specific rather than a bare 'I AM+'.
-- =============================================================================

-- select w.source,
--        count(*) as inquiries,
--        count(l.id) as bridged,
--        min(split_part(l.notes, E'\n', 1)) as sample_label
-- from public.website_leads w
-- left join public.leads l
--   on lower(l.email) = lower(w.email) and l.source = 'manual_admin'
-- where w.type = 'inquiry'
-- group by 1 order by 2 desc;


-- =============================================================================
-- OPEN ITEM — one inquiry from before the trigger existed
-- -----------------------------------------------------------------------------
-- website_leads holds 4 inquiries (earliest 2026-07-16 06:21), but leads holds
-- only 3 manual_admin rows (earliest 2026-07-16 08:02). The most likely reading
-- is that the trigger was installed between those two times, so the very first
-- inquiry predates it and never bridged.
--
-- The diagnostic's missing_from_leads=0 does NOT rule this out: it matches on
-- email, and that person may already exist in leads via a 'transaction' row.
--
-- To confirm (read-only):
--
-- select w.created_at, w.source, w.full_name, w.email
-- from public.website_leads w
-- where w.type = 'inquiry'
--   and not exists (select 1 from public.leads l
--                   where lower(l.email) = lower(w.email)
--                     and l.source = 'manual_admin');
--
-- If that returns a row, backfill just that one (safe, idempotent-ish — check
-- the select first so you don't double-insert):
--
-- insert into public.leads (name, email, mobile, notes, source, status)
-- select w.full_name, w.email, w.contact_number,
--        'WEBSITE INQUIRY — Discovery (backfilled 2026-07-28)'
--          || coalesce(E'\n\n' || nullif(w.message,''), ''),
--        'manual_admin', 'Active'
-- from public.website_leads w
-- where w.type='inquiry'
--   and not exists (select 1 from public.leads l
--                   where lower(l.email)=lower(w.email) and l.source='manual_admin');
-- =============================================================================
