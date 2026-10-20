// App Design System (/design): idea → kit (in the background) → email → kit page.
(function () {
  var ideaForm = document.getElementById('step-idea');
  var stepEmail = document.getElementById('step-email');
  var unlock = document.getElementById('unlock');
  if (!ideaForm) return;

  var analysis = null;      // Promise<{id, teaser}>
  var ticker = null;
  var ideaId = new URLSearchParams(location.search).get('idea');

  if (window.attachMic) {
    window.attachMic({
      root: document.getElementById('mic'),
      button: document.getElementById('mic-btn'),
      status: document.getElementById('mic-status'),
      textarea: ideaForm.app,
      orType: document.getElementById('or-type')
    });
  }

  // Coming from an App Idea Audit: bring the idea in.
  if (ideaId && /^[A-Za-z0-9_-]{6,40}$/.test(ideaId)) {
    fetch('/api/idea-report?id=' + encodeURIComponent(ideaId))
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (rep) {
        if (ideaForm.app.value.trim()) return;
        var i = rep.input || {};
        ideaForm.app.value = i.idea || [i.problem, i.solution].filter(Boolean).join(' ') || (rep.analysis && rep.analysis.idea_sentence) || '';
        document.getElementById('from-report').hidden = false;
      })
      .catch(function () { ideaId = null; });
  } else {
    ideaId = null;
  }

  function showError(form, msg, field) {
    var err = form.querySelector('.form-error');
    err.textContent = msg;
    err.hidden = false;
    if (field && field.focus) field.focus();
  }
  function hideError(form) { form.querySelector('.form-error').hidden = true; }

  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) { if (!res.ok) throw new Error((res.j && res.j.error) || 'failed'); return res.j; });
  }

  function startProgress() {
    var items = stepEmail.querySelectorAll('.progress li');
    var i = 0;
    items.forEach(function (li) { li.className = ''; });
    items[0].className = 'active';
    ticker = setInterval(function () {
      if (i < items.length - 1) { items[i].className = 'done'; i++; items[i].className = 'active'; }
    }, 8000);
  }
  function finishProgress(teaser) {
    clearInterval(ticker);
    stepEmail.querySelectorAll('.progress li').forEach(function (li) { li.className = 'done'; });
    var note = document.getElementById('progress-note');
    note.textContent = '';
    if (teaser && teaser.accent) {
      var dot = document.createElement('span');
      dot.className = 'teaser-dot';
      dot.style.background = teaser.accent;
      note.appendChild(dot);
    }
    note.appendChild(document.createTextNode(
      (teaser && teaser.competitors ? 'Studied ' + teaser.competitors + ' competitors. ' : '') +
      (teaser && teaser.name ? 'Your design system is ready. Meet "' + teaser.name + '" (plus four more name ideas).' : 'Your design system is ready.')));
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
      ideaForm.querySelector('button[type=submit]').disabled = false;
    });
    note.appendChild(again);
    note.className = 'progress-note failed';
  }

  ideaForm.addEventListener('submit', function (e) {
    e.preventDefault();
    hideError(ideaForm);
    var app = ideaForm.app.value.trim();
    var mic = document.getElementById('mic');
    if (mic && /is-(recording|working|asking)/.test(mic.className)) return showError(ideaForm, 'One second, still typing up what you said.');
    if (app.length < 25) return showError(ideaForm, 'Tell me a little more: what does your app do, and who is it for?', ideaForm.app);

    ideaForm.querySelector('button[type=submit]').disabled = true;
    ideaForm.hidden = true;
    stepEmail.hidden = false;
    startProgress();
    stepEmail.scrollIntoView({ behavior: 'smooth', block: 'start' });

    analysis = post('/api/design-generate', { app: app, idea: ideaId || undefined, company: ideaForm.company.value });
    analysis.then(function (j) { finishProgress(j.teaser); }, function (err) { failProgress(err.message === 'failed' ? "Your design system couldn't finish just now." : err.message); });
  });

  unlock.addEventListener('submit', function (e) {
    e.preventDefault();
    hideError(unlock);
    var email = unlock.email.value.trim();
    var phone = unlock.phone ? unlock.phone.value.trim() : '';
    var consent = !!(unlock.sms_consent && unlock.sms_consent.checked);
    if (!email || email.indexOf('@') < 1) return showError(unlock, 'Please enter your email so I can send your design system.', unlock.email);
    if (phone && phone.replace(/\D/g, '').length < 10) return showError(unlock, 'Please check your mobile number, or leave it blank.', unlock.phone);
    if (phone && !consent) return showError(unlock, 'Tick the box to get a text, or leave your number blank.', unlock.sms_consent);
    if (!analysis) return;

    var btn = unlock.querySelector('button[type=submit]');
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Finishing your design system…';

    analysis
      .then(function (j) {
        btn.textContent = 'Opening your design system…';
        return post('/api/design-unlock', {
          id: j.id,
          first_name: unlock.first_name.value.trim(),
          email: email,
          phone: phone,
          sms_consent: !!(phone && consent),
          company: unlock.company.value,
          referrer: location.href
        });
      })
      .then(function (j) {
        if (window.kpMe) kpMe.save(unlock.first_name.value.trim(), email);
        location.href = j.url.replace('https://katiep.me', '');
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.textContent = label;
        var m = err && err.message;
        showError(unlock, m && m !== 'failed' && m !== 'Not configured' ? m : 'Something went wrong. Please try again in a moment.');
      });
  });
})();
