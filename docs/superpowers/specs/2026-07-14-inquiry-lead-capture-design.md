# I AM+ — "Inquire" lead capture (Discovery & Breakthrough)

**Date:** 2026-07-14
**Status:** Built on branch `feat/inquiry-lead-capture` — NOT pushed, NOT deployed, migration NOT run. For Paolo's morning review.
**Author:** Claude (Opus) + Fable sub-agent (modal visual/interaction design)

---

## 1. Problem

Discovery (₱15K) and Breakthrough (₱35K–50K) currently offer **only one action: Reserve** → straight to Jericson's checkout. People who aren't ready to commit that money without talking to a human have no path — they bounce. We want to capture those warm-but-hesitant visitors as **leads the team can call**.

## 2. Goal

Add an **"Inquire"** button next to every primary **"Reserve"** CTA on Discovery & Breakthrough. Clicking it opens an on-page **modal** with a short form (full name, mobile, email, optional message). Submissions become leads that show up in the **same dashboard "leads section" as abandoned carts**, so the team works one list.

## 3. Scope

**In:**
- Inquire button paired with Reserve on `discovery.html` and `breakthrough.html`.
- A modal lead-capture form (name / mobile / email / message + honeypot).
- Persistence into `website_leads` (`type='inquiry'`), then a DB bridge into the CRM `public.leads` so it lands in the dashboard leads section.

**Out (not this change):**
- Abundance (already by-application via `abundance_applications`) and Coaching Mastery.
- Any change to Jericson's dashboard app code or the checkout flow.
- Notifications (SMS/email to the team on new inquiry) — the team reads the dashboard leads section, same as abandoned carts. Can be a follow-up.

## 4. Button styling (matches Paolo's ask exactly)

The existing design system already has the two treatments:
- **Reserve** = `.btn` — solid cyan/teal (`--cyan:#5CE1E6`), primary.
- **Inquire** = `.btn--ghost` — transparent with a hairline border, secondary.

So "Reserve solid teal, Inquire translucent" is a direct reuse — no new button styling invented.

**Placement:** beside the Reserve CTA in the price/reserve section of each page (the anchor "Reserve my seat" block). Optionally mirrored in the hero. Per-venue "Reserve" chips and the sticky seatbar are left as-is (they are per-city checkout links; the Inquire path is program-level, not city-level).

## 5. Architecture

Three small, independent units:

1. **Front-end trigger + modal** (`inquiry-modal.css`, `inquiry-modal.js`, markup in the two pages).
   - Any element with `data-inquire` opens `#inquiryModal`.
   - Modal is `role="dialog" aria-modal="true"`, focus-trapped, closes on X / backdrop / Escape, locks body scroll, respects `prefers-reduced-motion`, and is a bottom-sheet on mobile.
   - Self-contained IIFE — deliberately does **not** reuse `iam-forms.js`, because that file also binds nav/drawer/scroll-reveal and would collide with Discovery/Breakthrough's own GSAP scripts. The modal only needs open/close + validate + POST, so it ships as an isolated ~small module.
   - Reads Supabase URL/anon key from the already-present `supabase-config.js`.

2. **Capture table — `website_leads`** (existing, anon-INSERT-only under RLS).
   - Payload: `full_name`, `email`, `contact_number`, `message`, `type='inquiry'`, `source='discovery_inquiry'|'breakthrough_inquiry'`. `status` defaults to `'new'` (RLS `with check (status='new')`).
   - Migration **Part A**: widen the `type` CHECK to allow `'inquiry'`. This is the only DB change required for capture to work.

3. **Bridge — `website_leads` → `public.leads`** (migration **Part B**, pending Jericson).
   - A `SECURITY DEFINER` `AFTER INSERT` trigger (fires only `when new.type='inquiry'`) copies the row into the CRM `public.leads` server-side.
   - Chosen over "direct anon INSERT into public.leads" so the public anon key never gets write access to the core CRM table. The trigger runs privileged; anon only ever touches `website_leads`.
   - The trigger swallows/logs errors so a CRM-mirror failure can never block the site's own capture (the row is already safe in `website_leads`).

### Data flow
```
Visitor clicks "Inquire"
   → modal form (name / mobile / email / message)
   → POST (anon key) → public.website_leads  [type=inquiry]     ← PART A
        → AFTER INSERT trigger (SECURITY DEFINER)
             → INSERT public.leads (source='website_inquiry',   ← PART B
                                     program=Discovery|Breakthrough)
                  → appears in dashboard leads section (with abandoned carts)
```

## 6. Migration phasing (de-risks the Jericson dependency)

- **Part A — run now (morning):** widens the CHECK. Inquiries are captured in `website_leads` immediately, independent of Jericson. If Part B slips, no lead is lost — the team can read them via the admin in the interim.
- **Part B — run after schema confirmed:** the bridge into `public.leads`. The SQL is written with the mapping columns marked `<<>>` and a checklist of exactly what to confirm with Jericson (real column names, NOT NULL set, how abandoned carts set source/status, his OK on the trigger). See `db/2026-07-14-inquiry-lead-capture.sql`.

## 7. Error handling

- **Client:** required-field + email-format validation; first bad field highlighted + focused; inline error line for validation and network failure; honeypot (`company_url`) silently drops bots.
- **Network:** on POST failure, the modal shows a retry-able error and points to Messenger as a fallback; the submit button re-enables.
- **DB bridge:** trigger `exception when others` → `raise warning`, returns the row — never blocks capture.

## 8. Testing

- **Local (tonight):** open each page, verify the modal opens/closes (X, backdrop, Escape), focus trap, mobile bottom-sheet at 360px, validation, and the simulated success state. No live POST (migration not run).
- **After Part A runs (morning):** submit one real inquiry from each page; confirm a `website_leads` row with the right `type`/`source`.
- **After Part B runs:** submit one inquiry; confirm it appears in the dashboard leads section, correctly labelled Discovery/Breakthrough.

## 9. Open items for the morning

1. **Jericson's `public.leads` schema** — the one true blocker for Part B (real columns, NOT NULL set, abandoned-cart source/status convention, his sign-off on the trigger).
2. Confirm mirror placement in the hero (in addition to the price-card CTA), or keep the Inquire button to the reserve section only.
3. Optional follow-up: notify the team on a new inquiry (vs. relying on them watching the dashboard).

## 10. Guardrails honored

Nothing pushed to `origin`, nothing deployed to Vercel/Dokploy, no SQL run against the live database. All work sits on `feat/inquiry-lead-capture` (front-end + migration file + this spec) for review.
