# I AM+ public site — deploy notes

Static site (HTML + Tailwind + vanilla JS). Pages: `/` = Programs hub, plus
`/discovery` `/breakthrough` `/abundance`. Buyers click **Reserve** → handed to
Jericson's checkout at `<config.js CHECKOUT_BASE>/checkout/<sku>`; the order lands
in the shared Supabase + his dashboard. Products already loaded (SKUs match).

## Deploy (on wifi)
1. **Git:** init + push this `site/` folder to a new GitHub repo (e.g. `iam-plus-site`).
2. **Dokploy** ("Digital Outer Box" → *I Am Plus* project) → **Create Application**
   → source = the GitHub repo → build type = **Dockerfile**.
3. **Domain:** app → **Domains** → Generate → a `…sslip.io` staging URL for OUR site.
4. **Deploy.** (Or API: `POST /api/application.deploy` with `x-api-key`.)
5. **Verify:** open `<our-staging>/` and `/discovery`; click **Reserve** → it must
   land on Jericson's `…/checkout/<sku>` showing the real product + price.

## At cutover (later, per CLEAN-CUTOVER-CHECKLIST.md)
- Change **one line** in `config.js` → real app domain (e.g. `https://app.iampluscoaching.net`).
- Point `iampluscoaching.net` DNS at THIS app (+ TLS); `app.` subdomain → Jericson's app.
- Old site stays up as rollback.

## Notes
- Assets currently load from `i-am-plus-coaching.vercel.app` (keep that host up). Self-host into `assets/` later if desired.
- Nav links are root-relative; nginx serves extensionless URLs (`/discovery` → `discovery.html`).
