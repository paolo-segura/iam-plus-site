/* =========================================================================
   I AM+ — Inquire modal behavior (lead capture for the "talk to us first" path).
   Loaded on discovery.html + breakthrough.html. Self-contained IIFE:
   deliberately does NOT reuse iam-forms.js (that file also binds nav/drawer/
   scroll-reveal, which would collide with these pages' own GSAP scripts).

   Responsibilities:
     1. Open on any [data-inquire] click (event delegation).
     2. Close on X, backdrop click, Escape.
     3. Focus management: focus first field on open, trap Tab inside the dialog,
        restore focus to the trigger on close.
     4. Body scroll lock (with scrollbar-width compensation).
     5. Client-side validation + inline error / success states.
     6. Honeypot check (field name: company_url).
     7. POST to Supabase `website_leads` (type='inquiry'), anon key + RLS
        anon-INSERT-only. Per-page lead source is read from the overlay's
        data-source attribute (discovery_inquiry / breakthrough_inquiry).

   Design by the Fable sub-agent; network wiring by Claude.
   ========================================================================= */
(function () {
  'use strict';

  /* ---------- Element handles ---------- */
  var overlay   = document.getElementById('inq-overlay');
  if (!overlay) return;                       /* page has no modal — no-op */
  var modal     = document.getElementById('inq-modal');
  var closeBtn  = document.getElementById('inq-close');
  var form      = document.getElementById('inq-form');
  var alertBox  = document.getElementById('inq-alert');
  var alertText = document.getElementById('inq-alert-text');
  var submitBtn = document.getElementById('inq-submit');
  var successEl = document.getElementById('inq-success');
  var successTitle = document.getElementById('inq-success-title');
  var doneBtn   = document.getElementById('inq-done');
  var honeypot  = document.getElementById('inq-company-url');
  var messageEl = document.getElementById('inq-message');

  /* ---------- Supabase config (from /supabase-config.js) ---------- */
  var SB_URL  = window.IAMPLUS_SUPABASE_URL;
  var SB_ANON = window.IAMPLUS_SUPABASE_ANON;
  /* Which program this inquiry is for — declared per-page on the overlay. */
  var LEAD_SOURCE = overlay.getAttribute('data-source') || 'website_inquiry';

  /* Required fields: [input, field-wrapper, validator] */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var fields = [
    { input: document.getElementById('inq-name'),
      wrap:  document.getElementById('inq-field-name'),
      valid: function (v) { return v.trim().length > 0; } },
    { input: document.getElementById('inq-phone'),
      wrap:  document.getElementById('inq-field-phone'),
      valid: function (v) { return v.trim().length > 0; } },
    { input: document.getElementById('inq-email'),
      wrap:  document.getElementById('inq-field-email'),
      valid: function (v) { return EMAIL_RE.test(v.trim()); } }
  ];

  var triggerEl = null;       /* element that opened the modal */
  var isOpen    = false;
  var wasSubmitted = false;   /* success shown → reset next open */
  var pointerDownOnBackdrop = false;

  /* ---------- Focus trap helpers ---------- */
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function getFocusable() {
    /* Recomputed on every Tab so it stays correct after the form ↔ success
       swap. Skips the honeypot + hidden nodes. */
    return Array.prototype.filter.call(
      modal.querySelectorAll(FOCUSABLE),
      function (el) {
        return el.id !== 'inq-company-url' && el.getClientRects().length > 0;
      }
    );
  }

  /* ---------- Scroll lock ---------- */
  var savedOverflow = '', savedPadRight = '';
  function lockScroll() {
    var gap = window.innerWidth - document.documentElement.clientWidth;
    savedOverflow = document.body.style.overflow;
    savedPadRight = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    if (gap > 0) document.body.style.paddingRight = gap + 'px'; /* no layout jump */
  }
  function unlockScroll() {
    document.body.style.overflow = savedOverflow;
    document.body.style.paddingRight = savedPadRight;
  }

  /* ---------- State helpers ---------- */
  function showAlert(msg) {
    alertText.textContent = msg;
    alertBox.classList.add('is-visible');
  }
  function hideAlert() {
    alertBox.classList.remove('is-visible');
    alertText.textContent = '';
  }
  function markInvalid(f)  { f.wrap.classList.add('is-invalid'); f.input.setAttribute('aria-invalid', 'true'); }
  function clearInvalid(f) { f.wrap.classList.remove('is-invalid'); f.input.removeAttribute('aria-invalid'); }

  function showSuccess() {
    wasSubmitted = true;
    hideAlert();
    form.style.display = 'none';
    successEl.classList.add('is-visible');
    successTitle.focus(); /* announce the confirmation to AT users */
  }
  function resetToForm() {
    wasSubmitted = false;
    form.reset();
    fields.forEach(clearInvalid);
    hideAlert();
    setSubmitting(false);
    successEl.classList.remove('is-visible');
    form.style.display = '';
  }
  function setSubmitting(busy) {
    submitBtn.disabled = busy;
    submitBtn.innerHTML = busy
      ? 'Sending&hellip;'
      : 'Send my inquiry <span aria-hidden="true">&rarr;</span>';
  }

  /* ---------- Open / close ---------- */
  function openModal(trigger) {
    if (isOpen) return;
    isOpen = true;
    triggerEl = trigger || document.activeElement;

    if (wasSubmitted) resetToForm(); /* fresh form on re-open */

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    lockScroll();
    document.addEventListener('keydown', onKeydown, true);

    /* Focus the first field once the overlay is visible.
       (rAF: ensures visibility has flipped so .focus() lands.) */
    requestAnimationFrame(function () {
      var target = wasSubmitted ? closeBtn : fields[0].input;
      target.focus({ preventScroll: true });
    });
  }

  function closeModal() {
    if (!isOpen) return;
    isOpen = false;

    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    unlockScroll();
    document.removeEventListener('keydown', onKeydown, true);

    /* Return focus to whatever opened the modal */
    if (triggerEl && typeof triggerEl.focus === 'function') {
      triggerEl.focus();
    }
    triggerEl = null;
  }

  /* ---------- Keyboard: Escape + Tab trap ---------- */
  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
      return;
    }
    if (e.key !== 'Tab') return;

    var focusable = getFocusable();
    if (focusable.length === 0) return;

    var first = focusable[0];
    var last  = focusable[focusable.length - 1];
    var active = document.activeElement;

    if (e.shiftKey) {
      /* Shift+Tab off the first element → wrap to last */
      if (active === first || !modal.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      /* Tab off the last element → wrap to first */
      if (active === last || !modal.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  /* ---------- Wire: open triggers (event delegation) ---------- */
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-inquire]');
    if (!trigger) return;
    e.preventDefault();
    openModal(trigger);
  });

  /* ---------- Wire: close paths ---------- */
  closeBtn.addEventListener('click', closeModal);
  doneBtn.addEventListener('click', closeModal);

  /* Backdrop click: require pointerdown AND click on the overlay itself, so a
     drag that starts inside the card (e.g. selecting text) and ends outside
     doesn't close it. */
  overlay.addEventListener('pointerdown', function (e) {
    pointerDownOnBackdrop = (e.target === overlay);
  });
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay && pointerDownOnBackdrop) closeModal();
    pointerDownOnBackdrop = false;
  });

  /* ---------- Live validation cleanup ---------- */
  fields.forEach(function (f) {
    f.input.addEventListener('input', function () {
      if (f.wrap.classList.contains('is-invalid') && f.valid(f.input.value)) {
        clearInvalid(f);
      }
    });
  });

  /* ---------- Submit ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    hideAlert();

    /* Honeypot: bots fill it, humans never see it. Silently pretend success
       so the bot learns nothing (no row is ever written). */
    if (honeypot && honeypot.value) {
      showSuccess();
      return;
    }

    /* Validate */
    var firstInvalid = null;
    fields.forEach(function (f) {
      if (f.valid(f.input.value)) {
        clearInvalid(f);
      } else {
        markInvalid(f);
        if (!firstInvalid) firstInvalid = f.input;
      }
    });

    if (firstInvalid) {
      showAlert('Please check the highlighted fields below.');
      firstInvalid.focus();
      return;
    }

    if (!SB_URL || !SB_ANON) {
      showAlert("This form isn’t connected yet. Please try again shortly, or message us on Facebook.");
      return;
    }

    /* Payload maps 1:1 to public.website_leads columns. `type='inquiry'` is
       required by the (widened) CHECK constraint; `status` is omitted so the
       column default 'new' applies and passes the RLS with-check. The optional
       message is only sent when non-empty (empty optionals are dropped). */
    var payload = {
      type: 'inquiry',
      full_name: fields[0].input.value.trim(),
      contact_number: fields[1].input.value.trim(),
      email: fields[2].input.value.trim(),
      source: LEAD_SOURCE
    };
    var msg = (messageEl && messageEl.value.trim()) || '';
    if (msg) payload.message = msg;

    setSubmitting(true);

    fetch(SB_URL + '/rest/v1/website_leads', {
      method: 'POST',
      headers: {
        'apikey': SB_ANON,
        'Authorization': 'Bearer ' + SB_ANON,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) { return res.text().then(function (t) { throw new Error('HTTP ' + res.status + ' ' + t); }); }
      showSuccess();
    }).catch(function (err) {
      setSubmitting(false);
      showAlert('Something went wrong on our end — please try again, or message us on Facebook.');
      if (window.console) console.warn('[inquiry-modal]', err && err.message);
    });
  });

})();
