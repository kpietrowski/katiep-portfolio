// Talk-instead-of-type microphone for katiep.me tools.
// attachMic({ root, button, status, textarea, orType }) records in the browser,
// sends the audio to /api/voice-to-text (OpenAI Whisper) and adds the text to the
// textarea so the visitor can read it over and fix anything misheard.
(function () {
  var MAX_SECONDS = 180;
  var TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/aac'];

  function supported() {
    return !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.fetch);
  }
  function pickType() {
    if (!MediaRecorder.isTypeSupported) return '';
    for (var i = 0; i < TYPES.length; i++) if (MediaRecorder.isTypeSupported(TYPES[i])) return TYPES[i];
    return '';
  }
  function clock(s) { return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  window.attachMic = function (o) {
    if (!supported()) return; // stays hidden; typing still works
    o.root.hidden = false;
    if (o.orType) o.orType.hidden = false;

    var label = o.button.querySelector('.mic-label');
    var state = 'idle', rec = null, stream = null, chunks = [], started = 0, timer = null, audioCtx = null, raf = null;

    function set(s, text, status) {
      state = s;
      o.root.className = 'mic is-' + s;
      if (text) label.textContent = text;
      if (status !== undefined) o.status.textContent = status;
      o.button.disabled = s === 'working';
    }

    function cleanup() {
      clearInterval(timer);
      if (raf) cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      if (audioCtx) audioCtx.close().catch(function () {});
      stream = null; audioCtx = null; raf = null;
      o.root.style.setProperty('--level', 0);
    }

    // A ring that grows with the voice, so people can see they're being heard.
    function meter() {
      try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        audioCtx = new Ctx();
        var an = audioCtx.createAnalyser();
        an.fftSize = 512;
        audioCtx.createMediaStreamSource(stream).connect(an);
        var data = new Uint8Array(an.fftSize);
        (function tick() {
          an.getByteTimeDomainData(data);
          var sum = 0;
          for (var i = 0; i < data.length; i++) { var v = (data[i] - 128) / 128; sum += v * v; }
          o.root.style.setProperty('--level', Math.min(1, Math.sqrt(sum / data.length) * 4).toFixed(2));
          raf = requestAnimationFrame(tick);
        })();
      } catch (e) { /* the meter is a nicety */ }
    }

    function start() {
      set('asking', 'Allow the microphone', 'Your browser will ask to use the microphone.');
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
        stream = s;
        var type = pickType();
        try {
          rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined);
        } catch (e) {
          rec = new MediaRecorder(stream);
        }
        chunks = [];
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = send;
        rec.start(1000);
        started = Date.now();
        meter();
        set('recording', 'Tap to stop', 'Listening… 0:00');
        timer = setInterval(function () {
          var secs = Math.round((Date.now() - started) / 1000);
          o.status.textContent = 'Listening… ' + clock(secs) + (secs > MAX_SECONDS - 20 ? ' (' + (MAX_SECONDS - secs) + 's left)' : '');
          if (secs >= MAX_SECONDS) stop();
        }, 500);
      }).catch(function (err) {
        cleanup();
        var denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
        set('idle', 'Tap to talk', denied
          ? "I need the microphone to listen. Allow it in your browser settings, or just type your idea below."
          : "I couldn't reach your microphone. You can type your idea below instead.");
      });
    }

    function stop() {
      if (rec && rec.state !== 'inactive') rec.stop();
      clearInterval(timer);
    }

    function send() {
      var secs = (Date.now() - started) / 1000;
      var type = (rec.mimeType || (chunks[0] && chunks[0].type) || 'audio/webm');
      cleanup();
      if (secs < 1.5 || !chunks.length) {
        return set('idle', 'Tap to talk', 'That was quick! Tap and talk a little longer.');
      }
      var blob = new Blob(chunks, { type: type });
      set('working', 'Typing it up…', 'Turning what you said into words…');
      fetch('/api/voice-to-text', { method: 'POST', headers: { 'Content-Type': type.split(';')[0] }, body: blob })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          var text = res.j && res.j.text;
          if (!res.ok || !text) throw new Error((res.j && res.j.error) || '');
          var t = o.textarea;
          t.value = t.value.trim() ? t.value.trim() + '\n\n' + text : text;
          t.dispatchEvent(new Event('input', { bubbles: true }));
          set('done', 'Tap to add more', 'Got it. Read it over and fix anything I misheard, then grade your idea.');
        })
        .catch(function (err) {
          set('idle', 'Tap to talk', (err && err.message) || "I couldn't turn that into text just now. Please try again or type it.");
        });
    }

    o.button.addEventListener('click', function () {
      if (state === 'recording') stop();
      else if (state === 'idle' || state === 'done') start();
    });
  };
})();
