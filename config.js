// I AM+ site — single source of truth for where checkout lives.
// Our static pages send buyers to: <CHECKOUT_BASE>/checkout/<sku>
// They pay on Jericson's app; the order lands in the shared Supabase + his dashboard.
//
// STAGING value below (Dokploy sslip.io). At cutover, change this ONE line to the
// real app domain, e.g. "https://app.iampluscoaching.net".
window.IAMPLUS_CHECKOUT_BASE = "http://i-am-plus-dashboard-5qd9jv-34cce4-76-13-188-119.sslip.io";
