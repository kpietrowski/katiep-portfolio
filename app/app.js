// App in 30 Days waitlist form (/app).
(function () {
  var form = document.getElementById('waitlist');
  if (!form) return;
  var label = 'Join the waitlist';

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = form.querySelector('button[type=submit]');
    var err = document.getElementById('waitlist-error');
    var email = form.email.value.trim();
    var phone = form.phone.value.trim();
    var consent = form.sms_consent.checked;
    function fail(msg, field) {
      err.textContent = msg;
      err.hidden = false;
      if (field) field.focus();
    }
    err.hidden = true;

    if (!email || email.indexOf('@') < 1) return fail('Please enter your email so I can let you know when doors open.', form.email);
    if (phone && phone.replace(/\D/g, '').length < 10) return fail('Please check your mobile number, or leave it blank.', form.phone);
    if (phone && !consent) return fail('Tick the box to get a text, or leave your number blank.', form.sms_consent);

    btn.disabled = true;
    btn.textContent = 'Adding you…';
    fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: form.first_name.value.trim(),
        email: email,
        phone: phone,
        sms_consent: !!(phone && consent),
        company: form.company.value,
        referrer: location.href
      })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.j && res.j.error || 'failed');
        location.href = '/app/thanks';
      })
      .catch(function (e2) {
        btn.disabled = false;
        btn.textContent = label;
        var m = e2 && e2.message;
        fail(m && m !== 'failed' && m.indexOf('Could not') !== 0 && m !== 'Not configured'
          ? m : 'Something went wrong. Please try again in a moment.');
      });
  });
})();

// Hide the floating bar while the form is on screen.
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
