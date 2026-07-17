/* =========================================================================
   I AM+ — Meta Pixel (dual dataset).
   Loaded in <head> on every customer-facing page. Self-contained IIFE.

   Datasets (both receive every event — a campaign only counts its own
   dataset, so there is no per-campaign double counting):
     • Discovery  971688354293800
     • I AM+      775133364566719

   Events fired:
     PageView          every page load (base code)
     Lead              inquiry / consultation / corporate / venue form success
                       (wired from inquiry-modal.js, iam-forms.js, house-of-
                        transformation.html via window.iamTrack)
     InitiateCheckout  click on any link headed to the hosted checkout
     Purchase          the /thank-you page (Jericson's post-payment redirect)

   Advanced Matching: form handlers pass email / phone / name to window.iamTrack;
   the pixel hashes them (SHA-256, client-side) before sending — this sharply
   improves how many conversions Meta can attribute to real people.
   ========================================================================= */
(function () {
  'use strict';

  var PIXELS = ['971688354293800', '775133364566719'];

  /* ---- Standard Meta Pixel bootstrap ---- */
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
    n.queue = []; t = b.createElement(e); t.async = !0; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

  /* ---- Init both datasets, then the page view ---- */
  PIXELS.forEach(function (id) { fbq('init', id); });
  fbq('track', 'PageView');

  /* ---- Advanced-matching normaliser ---- */
  function userData(u) {
    if (!u) return null;
    var d = {};
    if (u.email) d.em = String(u.email).trim().toLowerCase();
    if (u.phone) {
      var ph = String(u.phone).replace(/[^0-9]/g, '');
      if (ph) d.ph = ph;
    }
    if (u.name) {
      var parts = String(u.name).trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (parts.length) { d.fn = parts[0]; if (parts.length > 1) d.ln = parts[parts.length - 1]; }
    }
    return Object.keys(d).length ? d : null;
  }

  /* ---- Public tracking hook (called by the form handlers) ----
     track(event, params, user, opts):
       user = {email, phone, name}  → advanced matching (attached to both pixels)
       opts = {eventID}             → dedup key (used if server-side CAPI is added) */
  function track(event, params, user, opts) {
    try {
      var ud = userData(user);
      if (ud) PIXELS.forEach(function (id) { fbq('init', id, ud); });
      if (opts && opts.eventID) fbq('track', event, params || {}, { eventID: opts.eventID });
      else fbq('track', event, params || {});
    } catch (err) {
      if (window.console) console.warn('[pixel]', err && err.message);
    }
  }
  window.iamTrack = track;

  /* ---- InitiateCheckout: any link headed to the hosted checkout ----
     Capture phase so it still records even if the click also navigates away. */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="/checkout/"]');
    if (a) track('InitiateCheckout');
  }, true);

  /* ---- Purchase: the post-payment thank-you page ----
     Jericson's checkout redirects to /thank-you?program=…&order_id=… on a
     successful Xendit payment. Amount is not in the URL yet, so value/currency
     are only sent when an amount param is present (ask Jericson to append
     &amount=&currency=PHP for revenue/ROAS). Without a value it still counts
     as a Purchase conversion. */
  if (/\/thank-you(\.html)?$/.test(location.pathname)) {
    var q = new URLSearchParams(location.search);
    var program = (q.get('program') || '').toLowerCase();
    var orderId = q.get('order_id') || '';
    var amount = parseFloat(q.get('amount') || q.get('value') || '');
    var params = { content_type: 'product' };
    if (program) { params.content_name = program; params.content_ids = [program]; }
    if (!isNaN(amount) && amount > 0) {
      params.value = amount;
      params.currency = (q.get('currency') || 'PHP').toUpperCase();
    }
    track('Purchase', params, null, orderId ? { eventID: orderId } : null);
  }
})();
