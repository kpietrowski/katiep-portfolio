// Families 101 funnel — opt-in form + passing the email through to checkout.
(function () {
  var KEY = 'families_email';
  function store(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }

  // Opt-in form on /families
  var form = document.getElementById('optin');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type=submit]');
      var err = document.getElementById('optin-error');
      var first = form.first_name.value.trim();
      var email = form.email.value.trim();
      err.hidden = true;
      if (!email || email.indexOf('@') < 1) {
        err.textContent = 'Please enter your email so I can send the guide.';
        err.hidden = false;
        form.email.focus();
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Sending…';
      fetch('/api/families-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: first, email: email, referrer: location.href })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.j && res.j.error || 'failed');
          store(KEY, email);
          location.href = '/families/thanks';
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = 'Send me the free guide';
          err.textContent = 'Something went wrong. Please try again in a moment.';
          err.hidden = false;
        });
    });
  }

})();

// Hide the floating bar while the main button is already on screen, so the
// first screen never shows two of the same button.
(function () {
  var bar = document.querySelector('.buy-bar');
  var hero = document.querySelector('[data-hero-cta]');
  if (!bar || !hero || !('IntersectionObserver' in window)) return;
  bar.style.transition = 'transform .2s ease';
  new IntersectionObserver(function (entries) {
    var visible = entries[0].isIntersecting;
    bar.style.transform = visible ? 'translateY(110%)' : 'none';
    bar.setAttribute('aria-hidden', visible ? 'true' : 'false');
  }).observe(hero);
})();

// /families/guide?print opens the device's Save-as-PDF once fonts are ready.
(function () {
  if (!/[?&]print\b/.test(location.search)) return;
  var go = function () { setTimeout(function () { window.print(); }, 300); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else window.addEventListener('load', go);
})();
