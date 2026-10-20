// App in 30 Days waitlist forms (/app). Every form.waitlist on the page
// posts to /api/waitlist, then goes to /app/thanks.
(function () {
  var forms = document.querySelectorAll('form.waitlist');
  Array.prototype.forEach.call(forms, function (form) {
    var btn = form.querySelector('button[type=submit]');
    var err = form.querySelector('.form-error');
    var label = btn.textContent;

    function fail(msg, field) {
      err.textContent = msg;
      err.hidden = false;
      if (field) field.focus();
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.hidden = true;
      var email = form.email.value.trim();
      var phone = form.phone ? form.phone.value.trim() : '';
      var consent = !!(form.sms_consent && form.sms_consent.checked);

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
          var friendly = m && m !== 'failed' && m !== 'Not configured' && m.indexOf('Could not') !== 0;
          fail(friendly ? m : 'Something went wrong. Please try again in a moment.');
        });
    });
  });
})();
