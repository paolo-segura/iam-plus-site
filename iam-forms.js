/* =========================================================================
   I AM+ — shared behavior for the utility / lead-capture pages.
   - sticky nav state + mobile drawer (mirrors programs.html v10 nav)
   - lightweight scroll reveals (no GSAP dependency on these pages)
   - generic form -> Supabase insert (anon key + RLS anon-INSERT-only)
   Forms declare: data-iam-form  data-table="leads"  data-type="corporate"
   Named inputs become the row payload; empty optionals are dropped.
   ========================================================================= */
(function () {
  "use strict";

  /* ---- sticky nav ---- */
  var top = document.getElementById("top");
  if (top) {
    var onScroll = function () { top.classList.toggle("scrolled", window.scrollY > 40); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---- mobile drawer ---- */
  var drawer = document.getElementById("mobileNav");
  var navToggle = document.getElementById("navToggle");
  var lastFocus = null;
  var bgEls = function () {
    return [].slice.call(document.querySelectorAll("body > *:not(#mobileNav):not(script)"));
  };
  var openDrawer = function () {
    drawer.classList.add("open"); document.body.classList.add("menu-open");
    navToggle.setAttribute("aria-expanded", "true");
    lastFocus = document.activeElement;
    bgEls().forEach(function (el) { el.inert = true; });
    var f = drawer.querySelector(".drawer__nav a"); if (f) f.focus();
  };
  var closeDrawer = function () {
    drawer.classList.remove("open"); document.body.classList.remove("menu-open");
    navToggle.setAttribute("aria-expanded", "false");
    bgEls().forEach(function (el) { el.inert = false; });
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  };
  if (drawer && navToggle) {
    navToggle.addEventListener("click", function () {
      drawer.classList.contains("open") ? closeDrawer() : openDrawer();
    });
    drawer.querySelectorAll("[data-drawer-close],.drawer__nav a,.drawer__cta").forEach(function (el) {
      el.addEventListener("click", closeDrawer);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && drawer.classList.contains("open")) closeDrawer();
    });
  }

  /* ---- scroll reveals (progressive enhancement; content visible by default) ---- */
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var revs = [].slice.call(document.querySelectorAll("[data-reveal]"));
  if (revs.length && !reduce && "IntersectionObserver" in window) {
    document.documentElement.classList.add("reveal-on"); // CSS now hides + transitions them
    var reveal = function (el) { el.classList.add("in"); };
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          var el = e.target;
          var d = parseInt(el.getAttribute("data-reveal-delay") || "0", 10);
          setTimeout(function () { reveal(el); }, d);
          ro.unobserve(el);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
    revs.forEach(function (el) { ro.observe(el); });
    // safety net — never leave any content hidden, even if the observer misses one
    setTimeout(function () { revs.forEach(reveal); }, 2400);
  }

  /* ---- forms ---- */
  var SB_URL = window.IAMPLUS_SUPABASE_URL;
  var SB_ANON = window.IAMPLUS_SUPABASE_ANON;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function fieldWrap(input) { return input.closest(".field") || input.parentElement; }
  function setBad(input, on) { var w = fieldWrap(input); if (w) w.classList.toggle("field--bad", !!on); }

  function validate(form) {
    var ok = true, firstBad = null;
    [].slice.call(form.querySelectorAll("[name]")).forEach(function (input) {
      if (input.type === "hidden") return;
      setBad(input, false);
      var val = (input.value || "").trim();
      var required = input.hasAttribute("required");
      if (required && !val) { setBad(input, true); ok = false; firstBad = firstBad || input; return; }
      if (input.type === "email" && val && !EMAIL_RE.test(val)) { setBad(input, true); ok = false; firstBad = firstBad || input; }
    });
    if (firstBad) firstBad.focus();
    return ok;
  }

  function buildPayload(form) {
    var payload = {};
    [].slice.call(form.querySelectorAll("[name]")).forEach(function (input) {
      var name = input.getAttribute("name");
      var val = (input.value || "").trim();
      if (val) payload[name] = val;
    });
    if (form.dataset.type) payload.type = form.dataset.type;
    payload.source = form.dataset.source || (form.dataset.type ? form.dataset.type + "_form" : "website");
    return payload;
  }

  function showNote(form, kind, html) {
    var scope = form.closest(".card") || form;
    var note = scope.querySelector(".formnote");
    if (!note) return;
    note.className = "formnote show formnote--" + (kind === "ok" ? "ok" : "err");
    note.innerHTML =
      (kind === "ok"
        ? '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7"/></svg>'
        : '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>') +
      "<span>" + html + "</span>";
  }

  [].slice.call(document.querySelectorAll("form[data-iam-form]")).forEach(function (form) {
    var card = form.closest(".card") || form;
    var btn = form.querySelector("[type=submit]");
    var btnLabel = btn ? btn.innerHTML : "";

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      // honeypot — bots fill the hidden "company_url" trap; humans never see it
      var hp = form.querySelector('input[name="company_url"]');
      if (hp && hp.value) { return; }

      if (!validate(form)) {
        showNote(form, "err", "Please fix the highlighted fields and try again.");
        return;
      }
      if (!SB_URL || !SB_ANON) {
        showNote(form, "err", "This form isn’t connected yet. Please try again shortly, or message us on Facebook.");
        return;
      }

      var note = card.querySelector(".formnote");
      if (note) note.className = "formnote";
      if (btn) { btn.disabled = true; btn.innerHTML = "Sending…"; }

      var table = form.dataset.table;
      var payload = buildPayload(form);
      delete payload.company_url; // never store the honeypot

      fetch(SB_URL + "/rest/v1/" + table, {
        method: "POST",
        headers: {
          "apikey": SB_ANON,
          "Authorization": "Bearer " + SB_ANON,
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (!res.ok) { return res.text().then(function (t) { throw new Error("HTTP " + res.status + " " + t); }); }
        card.classList.add("is-done");
        try { card.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_) {}
      }).catch(function (err) {
        if (btn) { btn.disabled = false; btn.innerHTML = btnLabel; }
        showNote(form, "err", "Sorry — something went wrong sending that. Please try again, or message us on Facebook.");
        if (window.console) console.warn("[iam-forms]", err && err.message);
      });
    });
  });
})();
