// App Idea Audit (/idea): idea → analysis (in the background) → email → report.
(function () {
  var ideaForm = document.getElementById('step-idea');
  var stepEmail = document.getElementById('step-email');
  var unlock = document.getElementById('unlock');
  if (!ideaForm) return;

  if (window.attachMic) {
    window.attachMic({
      root: document.getElementById('mic'),
      button: document.getElementById('mic-btn'),
      status: document.getElementById('mic-status'),
      textarea: ideaForm.idea,
      orType: document.getElementById('or-type')
    });
  }

  var analysis = null;      // Promise<{id, teaser}>
  var ticker = null;

  function showError(form, msg, field) {
    var err = form.querySelector('.form-error');
    err.textContent = msg;
    err.hidden = false;
    if (field) field.focus();
  }
  function hideError(form) { form.querySelector('.form-error').hidden = true; }

  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) { if (!res.ok) throw new Error((res.j && res.j.error) || 'failed'); return res.j; });
  }

  // The progress list ticks through its steps while the real work runs, then
  // finishes all at once when the report is ready.
  function startProgress() {
    var items = stepEmail.querySelectorAll('.progress li');
    var i = 0;
    items.forEach(function (li) { li.className = ''; });
    items[0].className = 'active';
    ticker = setInterval(function () {
      if (i < items.length - 1) { items[i].className = 'done'; i++; items[i].className = 'active'; }
    }, 9000);
  }
  function finishProgress(teaser) {
    clearInterval(ticker);
    stepEmail.querySelectorAll('.progress li').forEach(function (li) { li.className = 'done'; });
    var note = document.getElementById('progress-note');
    var names = (teaser && teaser.names || []).join(', ');
    note.textContent = 'Your audit is ready. I compared your idea with ' +
      (teaser && teaser.competitors || 'the top') + ' apps' + (names ? ' (' + names + '…)' : '') +
      (teaser && teaser.reviews ? ' and read ' + teaser.reviews + ' reviews.' : '.') +
      (teaser && teaser.market ? ' Together they make an estimated ' + teaser.market.replace('/mo', ' a month') + '.' : '');
    note.className = 'progress-note ready';
  }
  function failProgress(msg) {
    clearInterval(ticker);
    var note = document.getElementById('progress-note');
    note.textContent = msg + ' ';
    var again = document.createElement('a');
    again.href = '#'; again.textContent = 'Edit my idea and try again';
    again.addEventListener('click', function (e) {
      e.preventDefault();
      stepEmail.hidden = true; ideaForm.hidden = false; analysis = null;
      ideaForm.querySelector('button').disabled = false;
    });
    note.appendChild(again);
    note.className = 'progress-note failed';
  }

  ideaForm.addEventListener('submit', function (e) {
    e.preventDefault();
    hideError(ideaForm);
    var idea = ideaForm.idea.value.trim();
    if (idea.length < 25) return showError(ideaForm, 'Tell me a little more: who would use your app, and what does it do?', ideaForm.idea);
    var mic = document.getElementById('mic');
    if (mic && /is-(recording|working|asking)/.test(mic.className)) return showError(ideaForm, 'Give me a second to finish typing up what you said.');

    ideaForm.querySelector('button').disabled = true;
    ideaForm.hidden = true;
    stepEmail.hidden = false;
    startProgress();
    stepEmail.scrollIntoView({ behavior: 'smooth', block: 'start' });

    analysis = post('/api/idea-analyze', { idea: idea, company: ideaForm.company.value });
    analysis.then(function (j) { finishProgress(j.teaser); }, function (err) { failProgress(err.message === 'failed' ? "I couldn't finish your report just now." : err.message); });
  });

  unlock.addEventListener('submit', function (e) {
    e.preventDefault();
    hideError(unlock);
    var email = unlock.email.value.trim();
    var phone = unlock.phone ? unlock.phone.value.trim() : '';
    var consent = !!(unlock.sms_consent && unlock.sms_consent.checked);
    if (!email || email.indexOf('@') < 1) return showError(unlock, 'Please enter your email so I can send your audit.', unlock.email);
    if (phone && phone.replace(/\D/g, '').length < 10) return showError(unlock, 'Please check your mobile number, or leave it blank.', unlock.phone);
    if (phone && !consent) return showError(unlock, 'Tick the box to get a text, or leave your number blank.', unlock.sms_consent);
    if (!analysis) return;

    var btn = unlock.querySelector('button[type=submit]');
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Finishing your report…';

    analysis
      .then(function (j) {
        btn.textContent = 'Opening your report…';
        return post('/api/idea-unlock', {
          id: j.id,
          first_name: unlock.first_name.value.trim(),
          email: email,
          phone: phone,
          sms_consent: !!(phone && consent),
          company: unlock.company.value,
          referrer: location.href
        });
      })
      .then(function (j) { location.href = j.url.replace('https://katiep.me', ''); })
      .catch(function (err) {
        btn.disabled = false;
        btn.textContent = label;
        var m = err && err.message;
        showError(unlock, m && m !== 'failed' && m !== 'Not configured' ? m : 'Something went wrong. Please try again in a moment.');
      });
  });
})();
