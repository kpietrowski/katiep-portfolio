// Two-step waitlist (katiep.me/waitlist-2).
// Step 1: first name + email → /api/waitlist (Kit, waitlist tag).
// Step 2: a video from Katie, then an optional mobile number with SMS consent,
// posted to /api/waitlist again so Kit stores "Phone" and "SMS consent".
(function () {
  var card = document.querySelector('.join-card');
  if (!card) return;
  var join = card.querySelector('#join');
  var screen = document.getElementById('s2-screen');
  var s2 = document.getElementById('step2');
  var done = document.getElementById('step-done');
  var pf = document.getElementById('phone-form');
  var steppers = document.querySelectorAll('ol.steps');
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
    [].forEach.call(steppers, function (ol) {
      var steps = ol.querySelectorAll('.step');
      [0, 1].forEach(function (i) {
        var el = steps[i], k = i + 1;
        el.classList.toggle('is-on', n === k);
        el.classList.toggle('is-done', n > k);
        el.querySelector('.dot').textContent = n > k ? '\u2713' : String(k);
        if (n === k) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
      });
    });
  }
  // Step 1 lives in the card; step 2 and the thank-you open as a full screen.
  function show(pane) {
    var full = pane !== join;
    s2.hidden = pane !== s2;
    done.hidden = pane !== done;
    screen.hidden = !full;
    document.documentElement.classList.toggle('s2-open', full);
    if (full) screen.scrollTop = 0;
  }
  function smsDone() { try { return localStorage.getItem('kp_sms') === '1'; } catch (e) { return false; } }
  function finish(text) {
    var t = done.querySelector('.done-title'); if (t) t.textContent = text;
    setStep(3);
    show(done);
    var v = s2.querySelector('video'); if (v) v.pause();
  }
  function toStep2() {
    var n = s2.querySelector('.s2-name');
    if (n) n.textContent = me.first_name ? ', ' + me.first_name : '';
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
    if (!join.first_name.value.trim()) return err(join, 'Please enter your first name.', join.first_name);
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
    if (phone.replace(/\D/g, '').length < 10) return err(pf, 'Please enter your phone number.', pf.phone);
    var btn = pf.querySelector('button[type=submit]'), label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Saving…';
    post({ first_name: me.first_name, email: me.email, phone: phone, sms_consent: true, referrer: location.href })
      .then(function () {
        try { localStorage.setItem('kp_sms', '1'); } catch (x) {}
        finish("You're all set!");
      })
      .catch(function (e2) { btn.disabled = false; btn.textContent = label; err(pf, friendly(e2)); });
  });


  // Gray play button over the video; native controls appear once it's playing.
  (function () {
    var wrap = s2.querySelector('.katie-video'), v = wrap && wrap.querySelector('video'), b = wrap && wrap.querySelector('.play-btn');
    if (!v || !b) return;
    b.addEventListener('click', function () { v.controls = true; var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); });
    v.addEventListener('play', function () { wrap.classList.add('playing'); });
    v.addEventListener('pause', function () { wrap.classList.remove('playing'); });
    v.addEventListener('ended', function () { wrap.classList.remove('playing'); });
  })();

  // Buttons look "off" (gray) until the form is filled in.
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function gate(form, ready) {
    var b = form.querySelector('button[type=submit]');
    function sync() { var ok = ready(); b.classList.toggle('is-off', !ok); b.setAttribute('aria-disabled', ok ? 'false' : 'true'); }
    ['input', 'change', 'keyup'].forEach(function (t) { form.addEventListener(t, sync); });
    sync(); setTimeout(sync, 400); setTimeout(sync, 1500); // catch browser autofill
  }
  gate(join, function () { return join.first_name.value.trim() && EMAIL.test(join.email.value.trim()); });
  gate(pf, function () { return pf.phone.value.replace(/\D/g, '').length >= 10; });

  // Desktop: put the cursor in the first field so people can just type.
  // (Not on phones: it would pop the keyboard over the page.)
  if (window.matchMedia && matchMedia('(pointer: fine)').matches && !join.hidden && join.first_name) {
    try { join.first_name.focus({ preventScroll: true }); } catch (x) {}
  }
})();
