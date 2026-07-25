// I AM+ site — single source of truth for where checkout lives.
// Our static pages send buyers to: <CHECKOUT_BASE>/checkout/<sku>
// They pay on Jericson's app; the order lands in the shared Supabase + his dashboard.
//
// CUTOVER DONE 2026-07-25 — was the Dokploy staging host
// (http://i-am-plus-dashboard-5qd9jv-34cce4-76-13-188-119.sslip.io), which served
// the checkout over plain HTTP from a raw sslip.io IP hostname: buyers got a
// browser "Not secure" warning on the payment step. Verified before switching —
// both hostnames return byte-identical checkout pages off the same Supabase, so
// this is the same app behind a branded HTTPS door, not a different environment.
window.IAMPLUS_CHECKOUT_BASE = "https://dashboard.iampluscoaching.com";
