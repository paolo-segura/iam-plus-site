/* ===========================================================================
   I AM+ — floating Facebook Messenger bubble
   ---------------------------------------------------------------------------
   Self-contained: injects its own styles + markup, no dependencies, no SDK.

   Deliberately NOT Meta's Customer Chat plugin. That one pulls the whole FB
   JS SDK, needs the page whitelisted per-domain, and drops third-party
   cookies on every visitor. A plain m.me link opens the same conversation,
   costs one request, and can't break the page.

   The glyph is inline SVG so it renders instantly with the page — no extra
   asset request, and nothing to cache-bust behind Cloudflare later.

   To change the destination, edit MESSENGER_URL below. One place, all pages.
   =========================================================================== */
(function () {
  'use strict';

  var MESSENGER_URL = 'https://m.me/iampluscoaching';
  var LABEL = 'Message us';
  var ARIA = 'Message I AM+ on Facebook Messenger (opens in a new tab)';

  if (window.__iampMessengerBubble) return;   // never inject twice
  window.__iampMessengerBubble = true;

  var CSS = [
    /* Sits above the sticky seat bar (z-45) but below the nav drawer (z-49/55),
       so an open mobile menu still covers it. */
    '.iamp-msgr{position:fixed;right:20px;bottom:20px;z-index:46;display:flex;align-items:center;gap:10px;',
      'text-decoration:none;-webkit-tap-highlight-color:transparent;}',

    '.iamp-msgr__btn{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;',
      /* Meta\'s own Messenger gradient — blue through violet to coral. */
      'background:radial-gradient(circle at 32% 106%,#FF7061 0%,#FF5280 8%,#A033FF 32%,#0068FF 66%,#00B2FF 100%);',
      'box-shadow:0 10px 28px -6px rgba(0,104,255,.55),0 2px 8px rgba(0,0,0,.35);',
      'transition:transform .25s ease,box-shadow .25s ease;}',
    '.iamp-msgr__btn svg{width:31px;height:31px;display:block;}',

    /* Label is desktop-only: on a phone the circle is self-explanatory and the
       space belongs to the page. */
    '.iamp-msgr__label{display:none;order:-1;background:rgba(8,16,24,.92);color:#fff;font-family:inherit;',
      'font-size:.86rem;font-weight:600;letter-spacing:.01em;white-space:nowrap;padding:9px 15px;border-radius:999px;',
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.14),0 10px 24px -10px rgba(0,0,0,.7);',
      'opacity:0;transform:translateX(8px);transition:opacity .25s ease,transform .25s ease;pointer-events:none;}',
    '@media(min-width:900px){',
      '.iamp-msgr__label{display:block;}',
      '.iamp-msgr:hover .iamp-msgr__btn,.iamp-msgr:focus-visible .iamp-msgr__btn{transform:scale(1.06);',
        'box-shadow:0 14px 34px -6px rgba(0,104,255,.7),0 2px 8px rgba(0,0,0,.4);}',
      '.iamp-msgr:hover .iamp-msgr__label,.iamp-msgr:focus-visible .iamp-msgr__label{opacity:1;transform:translateX(0);}',
    '}',

    '.iamp-msgr:focus-visible{outline:none;}',
    '.iamp-msgr:focus-visible .iamp-msgr__btn{box-shadow:0 0 0 3px rgba(255,255,255,.9),0 0 0 6px rgba(0,104,255,.65);}',

    /* Below 720px the centred seat bar is wide enough to reach the bubble, and
       under 560px it goes edge-to-edge. Lift out of its way while it is shown
       rather than hiding either one. */
    '@media(max-width:720px){',
      '.iamp-msgr{right:16px;bottom:16px;}',
      '.iamp-msgr__btn{width:54px;height:54px;}',
      '.iamp-msgr__btn svg{width:30px;height:30px;}',
      'body:has(.seatbar.show) .iamp-msgr{bottom:98px;}',
    '}',

    '@media(prefers-reduced-motion:reduce){',
      '.iamp-msgr,.iamp-msgr__btn,.iamp-msgr__label{transition:none;}',
    '}',

    '@media print{.iamp-msgr{display:none;}}'
  ].join('');

  /* Messenger glyph: speech bubble + bolt, drawn white on the gradient. */
  var GLYPH =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="#fff">' +
      '<path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.14.26.35.27.57l.05 1.78c.02.57.6.94 1.12.71l1.99-.88c.17-.07.36-.09.54-.04.91.25 1.88.38 2.89.38 5.64 0 10-4.13 10-9.7S17.64 2 12 2z"/>' +
      '<path d="M5.99 14.54l2.94-4.66c.47-.74 1.47-.93 2.18-.4l2.34 1.75c.21.16.51.16.72 0l3.16-2.4c.42-.32.97.18.69.63l-2.94 4.66c-.47.74-1.47.93-2.18.4l-2.34-1.75c-.21-.16-.51-.16-.72 0l-3.16 2.4c-.42.32-.97-.18-.69-.63z" fill="#0068FF"/>' +
    '</svg>';

  function mount() {
    if (document.querySelector('.iamp-msgr')) return;

    var style = document.createElement('style');
    style.setAttribute('data-iamp', 'messenger-bubble');
    style.textContent = CSS;
    document.head.appendChild(style);

    var a = document.createElement('a');
    a.className = 'iamp-msgr';
    a.href = MESSENGER_URL;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', ARIA);
    a.innerHTML =
      '<span class="iamp-msgr__label">' + LABEL + '</span>' +
      '<span class="iamp-msgr__btn">' + GLYPH + '</span>';

    document.body.appendChild(a);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
