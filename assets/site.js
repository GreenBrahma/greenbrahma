/* GreenBrahma — site behaviour. No dependencies. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     Contact settings. Leave a value empty to keep that path switched off.
     email:   public contact address shown on the site
     sms:     mobile number in international format, e.g. "+15555550123"
     booking: full scheduling link, e.g. "https://calendly.com/name/intro"
     The note form does not depend on any of these.
     ------------------------------------------------------------------ */
  var CONTACT = {
    email: '',
    sms: '',
    booking: ''
  };

  var doc = document;
  doc.documentElement.classList.add('js');

  /* ---------- analytics hook: fires only if a tag is installed ---------- */
  function track(name, detail) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: name }, detail || {}));
      if (typeof window.gtag === 'function') window.gtag('event', name, detail || {});
      if (typeof window.plausible === 'function') window.plausible(name, { props: detail || {} });
    } catch (e) { /* never block the page on tracking */ }
  }
  doc.addEventListener('click', function (e) {
    var el = e.target.closest('[data-track]');
    if (el) track(el.getAttribute('data-track'), { location: el.getAttribute('data-loc') || '' });
  });
  var view = doc.body.getAttribute('data-view');
  if (view) track(view, { path: location.pathname });

  /* ---------- optional contact paths ---------- */
  doc.querySelectorAll('[data-path="sms"]').forEach(function (el) {
    if (!CONTACT.sms) return;
    if (el.tagName === 'A') el.href = 'sms:' + CONTACT.sms;
    el.querySelectorAll('a[data-sms]').forEach(function (a) { a.href = 'sms:' + CONTACT.sms; });
    el.hidden = false;
  });
  doc.querySelectorAll('[data-path="booking"]').forEach(function (el) {
    if (!CONTACT.booking) return;
    if (el.tagName === 'A') el.href = CONTACT.booking;
    el.querySelectorAll('a[data-booking]').forEach(function (a) { a.href = CONTACT.booking; });
    el.hidden = false;
  });
  doc.querySelectorAll('[data-path="email"]').forEach(function (el) {
    if (!CONTACT.email) return;
    var links = el.tagName === 'A' ? [el] : el.querySelectorAll('a[data-email]');
    links.forEach(function (a) {
      a.href = 'mailto:' + CONTACT.email;
      if (!a.textContent.trim()) a.textContent = CONTACT.email;
    });
    el.hidden = false;
  });
  doc.querySelectorAll('[data-paths]').forEach(function (el) {
    el.hidden = !(CONTACT.email || CONTACT.sms || CONTACT.booking);
  });
  doc.querySelectorAll('[data-fallback]').forEach(function (el) {
    var need = el.getAttribute('data-fallback');
    if (CONTACT[need]) el.hidden = true;
  });

  /* ---------- mobile action bar: appears once the hero buttons scroll away ---------- */
  var bar = doc.querySelector('.actionbar');
  if (bar && doc.querySelector('.hero')) {
    var syncBar = function () { bar.classList.toggle('is-off', window.scrollY < 420); };
    syncBar();
    window.addEventListener('scroll', syncBar, { passive: true });
  }

  /* ---------- mobile menu ---------- */
  var menuBtn = doc.querySelector('.menu-btn');
  var overlay = doc.getElementById('menu');
  if (menuBtn && overlay) {
    var closeBtn = overlay.querySelector('.menu-close');
    var openMenu = function () {
      overlay.hidden = false;
      menuBtn.setAttribute('aria-expanded', 'true');
      doc.body.style.overflow = 'hidden';
      closeBtn.focus();
    };
    var closeMenu = function () {
      overlay.hidden = true;
      menuBtn.setAttribute('aria-expanded', 'false');
      doc.body.style.overflow = '';
      menuBtn.focus();
    };
    menuBtn.addEventListener('click', openMenu);
    closeBtn.addEventListener('click', closeMenu);
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeMenu(); return; }
      if (e.key !== 'Tab') return;
      var f = overlay.querySelectorAll('a[href],button');
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    window.matchMedia('(min-width:860px)').addEventListener('change', function (m) {
      if (m.matches && !overlay.hidden) closeMenu();
    });
  }

  /* ---------- problems: one answer open at a time ---------- */
  var problems = doc.querySelector('.problems');
  if (problems) {
    var qs = Array.prototype.slice.call(problems.querySelectorAll('.problem-q'));
    var wide = window.matchMedia('(min-width:960px)');
    var show = function (btn, open) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      doc.getElementById(btn.getAttribute('aria-controls')).hidden = !open;
    };
    qs.forEach(function (btn, i) {
      show(btn, i === 0);
      btn.addEventListener('click', function () {
        var isOpen = btn.getAttribute('aria-expanded') === 'true';
        if (wide.matches && isOpen) return;          /* side-by-side: always keep one open */
        qs.forEach(function (b) { show(b, false); });
        show(btn, wide.matches ? true : !isOpen);
        track('problem_open', { problem: btn.textContent.trim().slice(0, 60) });
      });
    });
    wide.addEventListener('change', function (m) {
      if (m.matches && !qs.some(function (b) { return b.getAttribute('aria-expanded') === 'true'; })) show(qs[0], true);
    });
  }

  /* ---------- contact form ---------- */
  var form = doc.getElementById('contact-form');
  if (form) {
    form.setAttribute('novalidate', '');
    var started = false;
    var statusBox = doc.getElementById('form-status');
    var phoneField = doc.getElementById('phone-field');
    var phone = doc.getElementById('phone');

    form.addEventListener('input', function () {
      if (!started) { started = true; track('contact_form_start'); }
    });

    var syncPhone = function () {
      var v = (form.querySelector('input[name="reply-by"]:checked') || {}).value;
      var need = v === 'Phone' || v === 'Text';
      phoneField.hidden = !need;
      phone.required = need;
      if (!need) clearError(phone);
    };
    form.querySelectorAll('input[name="reply-by"]').forEach(function (r) { r.addEventListener('change', syncPhone); });
    syncPhone();

    function errorEl(input) { return doc.getElementById(input.id + '-error'); }
    function setError(input, msg) {
      var el = errorEl(input);
      el.textContent = msg; el.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      var d = (input.getAttribute('data-desc') || '');
      input.setAttribute('aria-describedby', (d + ' ' + el.id).trim());
    }
    function clearError(input) {
      var el = errorEl(input);
      if (!el) return;
      el.textContent = ''; el.hidden = true;
      input.removeAttribute('aria-invalid');
      var d = input.getAttribute('data-desc');
      if (d) input.setAttribute('aria-describedby', d); else input.removeAttribute('aria-describedby');
    }
    function check(input) {
      var v = input.value.trim();
      if (input.required && !v) return input.getAttribute('data-missing');
      if (input.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'That email address looks incomplete. Check it and try again.';
      if (input.type === 'tel' && v && v.replace(/\D/g, '').length < 7) return 'That number looks too short. Include the area code.';
      return '';
    }
    var inputs = ['name', 'email', 'message', 'phone'].map(function (id) { return doc.getElementById(id); });
    inputs.forEach(function (input) {
      input.addEventListener('blur', function () {
        if (input.getAttribute('aria-invalid') === 'true' && !check(input)) clearError(input);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      statusBox.hidden = true;
      var firstBad = null;
      inputs.forEach(function (input) {
        if (input === phone && phoneField.hidden) return;
        var msg = check(input);
        if (msg) { setError(input, msg); firstBad = firstBad || input; } else clearError(input);
      });
      if (firstBad) { firstBad.focus(); return; }

      var btn = form.querySelector('button[type="submit"]');
      var label = btn.textContent;
      btn.disabled = true; btn.textContent = 'Sending…';

      var data = new URLSearchParams(new FormData(form));
      fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: data.toString() })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          track('contact_form_submit', { reply_by: data.get('reply-by') || '' });
          form.hidden = true;
          var sent = doc.getElementById('sent');
          sent.hidden = false;
          sent.focus();
        })
        .catch(function () {
          btn.disabled = false; btn.textContent = label;
          statusBox.hidden = false;
          statusBox.focus();
        });
    });
  }
})();
