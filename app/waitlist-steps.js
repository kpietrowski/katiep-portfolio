// Two-step waitlist (katiep.me/waitlist-2).
// Step 1: first name + email → /api/waitlist (Kit, waitlist tag).
// Step 2: a video from Katie, then an optional mobile number with SMS consent,
// posted to /api/waitlist again so Kit stores "Phone" and "SMS consent".
(function () {
  var card = document.querySelector('.join-card');
  if (!card) return;
  var join = card.querySelector('#join');
  var s2 = card.querySelector('#step2');
  var done = card.querySelector('#step-done');
  var pf = card.querySelector('#phone-form');
  var steps = card.querySelectorAll('.steps .step');
  var line = card.querySelector('.steps .line');
  var PREVIEW = !!window.KP_PREVIEW;
  var me = { first_name: '', email: '' };

  function post(body) {
    if (PREVIEW) return new Promise(function (r) { setTimeout(r, 500); });
    return fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j && j.error || 'failed');
      });
    });
  }
  function friendly(e) {
    var m = e && e.message;
    return m && m !== 'failed' && m !== 'Not configured' && m.indexOf('Could not') !== 0 ? m : 'Something went wrong. Please try again in a moment.';
  }
  function setStep(n) {
    [0, 1].forEach(function (i) {
      var el = steps[i], k = i + 1;
      el.classList.toggle('is-on', n === k);
      el.classList.toggle('is-done', n > k);
      el.querySelector('.dot').textContent = n > k ? '\u2713' : String(k);
      if (n === k) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
    });
    line.classList.toggle('is-done', n > 1);
  }
  function show(pane) {
    [join, s2, done].forEach(function (p) { p.hidden = p !== pane; });
    var top = card.getBoundingClientRect().top;
    var phone = window.matchMedia && matchMedia('(max-width: 900px)').matches;
    if (top < 0 || (phone && top > 24)) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function smsDone() { try { return localStorage.getItem('kp_sms') === '1'; } catch (e) { return false; } }
  function finish(text) {
    done.querySelector('.done-title').textContent = text;
    setStep(3);
    show(done);
    var v = s2.querySelector('video'); if (v) v.pause();
  }
  function toStep2() {
    var n = s2.querySelector('.s2-name');
    if (n) n.textContent = me.first_name ? ', ' + me.first_name : '';
    if (smsDone()) return finish("You're all set. I'll be in touch the moment doors open.");
    setStep(2);
    show(s2);
  }
  function err(form, msg, field) {
    var e = form.querySelector('.form-error');
    e.textContent = msg; e.hidden = false;
    if (field) field.focus();
  }

  // Step 1
  join.addEventListener('submit', function (e) {
    e.preventDefault();
    join.querySelector('.form-error').hidden = true;
    var email = join.email.value.trim();
    if (!email || email.indexOf('@') < 1) return err(join, 'Please enter your email so I can let you know when doors open.', join.email);
    var btn = join.querySelector('button[type=submit]'), label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Adding you…';
    me = { first_name: join.first_name.value.trim(), email: email };
    post({ first_name: me.first_name, email: email, company: join.company.value, referrer: location.href })
      .then(function () {
        if (window.kpMe) kpMe.save(me.first_name, email);
        btn.disabled = false; btn.textContent = label;
        toStep2();
      })
      .catch(function (e2) { btn.disabled = false; btn.textContent = label; err(join, friendly(e2)); });
  });

  // Step 2
  pf.addEventListener('submit', function (e) {
    e.preventDefault();
    pf.querySelector('.form-error').hidden = true;
    var phone = pf.phone.value.trim();
    if (phone.replace(/\D/g, '').length < 10) return err(pf, 'Please enter your mobile number, or tap "No thanks" below.', pf.phone);
    if (!pf.sms_consent.checked) return err(pf, 'Tick the box so I can text you.', pf.sms_consent);
    var btn = pf.querySelector('button[type=submit]'), label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Saving…';
    post({ first_name: me.first_name, email: me.email, phone: phone, sms_consent: true, referrer: location.href })
      .then(function () {
        try { localStorage.setItem('kp_sms', '1'); } catch (x) {}
        finish("Perfect. I'll text you the moment doors open.");
      })
      .catch(function (e2) { btn.disabled = false; btn.textContent = label; err(pf, friendly(e2)); });
  });
  pf.querySelector('.skip-link').addEventListener('click', function () {
    finish("No problem. Watch your inbox: I'll email you the moment doors open.");
  });

  // Returning visitor who already joined on this browser: go straight to step 2.
  var known = window.kpMe && kpMe.get();
  if (known && join.classList.contains('known-waitlist')) {
    me = { first_name: known.first_name || '', email: known.email };
    toStep2();
  }
  // Desktop: put the cursor in the first field so people can just type.
  // (Not on phones: it would pop the keyboard over the page.)
  if (window.matchMedia && matchMedia('(pointer: fine)').matches && !join.hidden && join.first_name) {
    try { join.first_name.focus({ preventScroll: true }); } catch (x) {}
  }
})();
