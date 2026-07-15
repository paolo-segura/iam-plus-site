-- =============================================================================
-- I AM+ — "Inquire" lead capture + bridge into the dashboard leads section
-- Target Supabase project: dvvlxxbsxirhcqiaysfe  (the SHARED I AM+ project)
-- SQL editor: https://supabase.com/dashboard/project/dvvlxxbsxirhcqiaysfe/sql
--
-- Extends the canonical lead schema in  iam-plus/data/leadforms-tables.sql
-- (fold this in there once run, so there is one source of truth).
--
-- ⚠️  DO NOT RUN THIS WHOLE FILE BLINDLY. It is split into two parts:
--       PART A — safe to run now. Lets the site capture inquiries.
--       PART B — bridge into Jericson's CRM `public.leads`. DO NOT RUN until
--                the column mapping below is confirmed against his live table
--                (see the TODO block). Running it with a wrong mapping will make
--                every inquiry INSERT fail at runtime.
--
-- Security model is unchanged: the public site (anon key) may ONLY INSERT into
-- `website_leads`. It never touches `public.leads` directly — the PART B trigger
-- runs SECURITY DEFINER, so the privileged copy into `public.leads` happens
-- server-side. The anon key is never granted anything on `public.leads`.
-- Idempotent: safe to re-run.
-- =============================================================================


-- =============================================================================
-- PART A — capture inquiries in website_leads  (SAFE TO RUN NOW)
-- -----------------------------------------------------------------------------
-- The site's Inquire modal posts to website_leads with type='inquiry' and
-- source='discovery_inquiry' | 'breakthrough_inquiry'. website_leads already has
-- every column we need (full_name, email, contact_number, message, source,
-- status). We only need to widen the `type` CHECK so 'inquiry' is allowed.
-- =============================================================================

alter table public.website_leads
  drop constraint if exists website_leads_type_check;

alter table public.website_leads
  add constraint website_leads_type_check
  check (type in ('corporate','consultation','inquiry'));

-- Fast admin filtering of just the inquiry rows.
create index if not exists website_leads_source_idx on public.website_leads (source);

-- The existing anon-INSERT RLS policy ("anon can submit website leads",
-- with check (status = 'new')) already covers type='inquiry' rows — no policy
-- change needed. After PART A, inquiries land in website_leads and the team can
-- read them via the admin/service-role, exactly like corporate/consultation.
-- Reload PostgREST so the widened constraint is picked up immediately.
notify pgrst, 'reload schema';


-- =============================================================================
-- PART B — bridge inquiries into the dashboard "leads section" (public.leads)
-- -----------------------------------------------------------------------------
-- Paolo's requirement: inquiries must appear in the SAME dashboard leads section
-- as abandoned carts. That section reads Jericson's CRM table `public.leads`.
-- This trigger copies each new inquiry row into public.leads server-side.
--
-- 🔴 BLOCKER — CONFIRM BEFORE RUNNING PART B:
--   We do NOT yet have the real column list / NOT NULL constraints of
--   public.leads (Jericson's private app owns it: github.com/Jericson31/
--   I-Am-Plus-Dashboard). The INSERT below uses ASSUMED column names, marked
--   <<>>. Get the real ones from Jericson (or `\d public.leads` in the SQL
--   editor) and replace them. Confirm specifically:
--     1. Exact column names for: name, email, phone/mobile, message/notes,
--        source/channel, status/stage, and how a lead is tagged to a program.
--     2. Which columns are NOT NULL (must all be satisfied here).
--     3. How abandoned-cart rows set `source`/`status` — mirror that convention
--        so inquiries sort into the same view (query one sample abandoned row).
--     4. That Jericson is OK with a SECURITY DEFINER trigger writing to his table
--        (this is the safest option — the anon key still cannot touch public.leads).
-- =============================================================================

-- create or replace function public.bridge_inquiry_to_leads()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- begin
--   -- Only inquiry rows bridge across; corporate/consultation stay in website_leads.
--   if (new.type is distinct from 'inquiry') then
--     return new;
--   end if;
--
--   insert into public.leads (
--     <<name_col>>,          -- e.g. full_name / name
--     <<email_col>>,         -- e.g. email
--     <<phone_col>>,         -- e.g. phone / mobile / contact_number
--     <<message_col>>,       -- e.g. notes / message   (new.message)
--     <<source_col>>,        -- set to 'website_inquiry' (or mirror abandoned-cart source)
--     <<status_col>>,        -- set to the same "new/uncontacted" value abandoned carts use
--     <<program_col>>,       -- from new.source: 'discovery_inquiry'->'Discovery', 'breakthrough_inquiry'->'Breakthrough'
--     <<created_col>>        -- new.created_at   (omit if public.leads defaults it)
--   ) values (
--     new.full_name,
--     new.email,
--     new.contact_number,
--     new.message,
--     'website_inquiry',
--     '<<new_status_value>>',
--     case
--       when new.source = 'breakthrough_inquiry' then 'Breakthrough'
--       when new.source = 'discovery_inquiry'    then 'Discovery'
--       else 'Website'
--     end,
--     new.created_at
--   );
--
--   return new;
-- exception when others then
--   -- Never let a CRM-mirror failure block the website's own capture. The row is
--   -- already safely in website_leads (PART A); log and move on.
--   raise warning 'bridge_inquiry_to_leads failed for website_leads.id=%: %', new.id, sqlerrm;
--   return new;
-- end;
-- $$;
--
-- drop trigger if exists trg_bridge_inquiry_to_leads on public.website_leads;
-- create trigger trg_bridge_inquiry_to_leads
--   after insert on public.website_leads
--   for each row
--   when (new.type = 'inquiry')
--   execute function public.bridge_inquiry_to_leads();
--
-- notify pgrst, 'reload schema';

-- =============================================================================
-- END. After PART B is finalized + run, do a single end-to-end smoke test:
-- submit one inquiry from the Discovery modal and confirm the row appears in the
-- dashboard leads section (not just website_leads).
-- =============================================================================
