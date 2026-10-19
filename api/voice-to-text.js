// POST /api/voice-to-text   body: the raw audio recording (Content-Type: audio/webm,
// audio/mp4, audio/ogg …). Sends it to OpenAI Whisper and returns { text }.
// Used by the microphone button on katiep.me/idea (and later /design). Separate from /api/transcribe, which the contact form uses.
// The audio is not stored anywhere.

import { overLimit } from './_idea.js';

const MAX_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB
const EXT = { webm: 'webm', mp4: 'mp4', 'x-m4a': 'm4a', m4a: 'm4a', aac: 'm4a', ogg: 'ogg', mpeg: 'mp3', wav: 'wav', 'x-wav': 'wav' };

async function readBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BYTES) throw Object.assign(new Error('too big'), { code: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'Not configured' });

  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const ext = EXT[type.replace(/^audio\//, '').replace(/^video\//, '')];
  if (!ext) return res.status(415).json({ error: "That recording format didn't work. Please type your idea instead." });

  try {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    if (await overLimit(ip, 20, 'stt-rl')) {
      return res.status(429).json({ error: "You've recorded a lot this hour. Please type your idea instead." });
    }

    const audio = await readBody(req);
    if (audio.length > MAX_BYTES) return res.status(413).json({ error: 'That recording is too long. Try a shorter one, about 2 minutes.' });
    if (audio.length < 1000) return res.status(400).json({ error: "I didn't catch anything. Tap the microphone and try again." });

    const form = new FormData();
    form.append('file', new Blob([audio], { type }), `idea.${ext}`);
    form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1');
    form.append('language', 'en');
    form.append('prompt', 'Someone describing their iPhone app idea: who would use it and what the app does.');

    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`whisper ${r.status}: ${j.error?.message || ''}`);

    const text = String(j.text || '').trim();
    if (!text) return res.status(200).json({ text: '', error: "I didn't catch anything. Tap the microphone and try again." });
    return res.status(200).json({ text });
  } catch (err) {
    if (err.code === 413) return res.status(413).json({ error: 'That recording is too long. Try a shorter one, about 2 minutes.' });
    console.error('transcribe:', err.message);
    return res.status(502).json({ error: "I couldn't turn that into text just now. Please try again or type it." });
  }
}
