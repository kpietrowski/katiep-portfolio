// POST /api/manychat  — Instagram (ManyChat) → Kit waitlist.
// ManyChat's "External Request" action calls this after someone replies to a
// story and gives their email. They're added to Kit exactly like a waitlist
// form signup (tag "App in 30 Days waitlist"), plus a source tag so you can see
// what Instagram brings in.
//
// ManyChat setup: POST https://katiep.me/api/manychat
//   Header  X-ManyChat-Secret: <MANYCHAT_SECRET from Vercel>
//   Body (JSON): {"email": "{{email}}", "first_name": "{{first_name}}",
//                 "ig_username": "{{ig_username}}", "source": "story"}
// Responds {"ok": true} or {"ok": false, "message": "..."} (always HTTP 200 for
// a bad email, so the flow can branch on "ok" and ask again).
//
// Env: MANYCHAT_SECRET, KIT_API_KEY. Optional KIT_INSTAGRAM_TAG.

import crypto from 'node:crypto';
import { subscribe, isEmail, WAITLIST_TAG } from './_kit.js';
import { recordLead } from './_leads.js';

export const INSTAGRAM_TAG = process.env.KIT_INSTAGRAM_TAG || 'Source: Instagram DM';

function authorised(req) {
  const want = process.env.MANYCHAT_SECRET || '';
  const got = String(req.headers['x-manychat-secret'] || '');
  if (want.length < 16 || got.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' });
  if (!process.env.MANYCHAT_SECRET || !process.env.KIT_API_KEY) return res.status(500).json({ ok: false, message: 'Not configured' });
  if (!authorised(req)) return res.status(401).json({ ok: false, message: 'Wrong secret' });

  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  if (!isEmail(email)) {
    return res.status(200).json({ ok: false, message: "Hmm, that email doesn't look quite right. Can you send it again?" });
  }
  // ManyChat sends the literal "{{first_name}}" when a field is empty.
  const clean = (v, n) => { const s = String(v || '').trim(); return /^\{\{.*\}\}$/.test(s) ? '' : s.slice(0, n); };
  const firstName = clean(b.first_name, 80);
  const ig = clean(b.ig_username, 60).replace(/^@/, '');
  const source = clean(b.source, 40) || 'story';

  try {
    await subscribe({
      address: email,
      firstName,
      page: `instagram ${source} (ManyChat)`,
      fields: { 'Instagram': ig ? `@${ig}` : '' },
      tags: [WAITLIST_TAG, INSTAGRAM_TAG],
    });
    await recordLead(email, { first_name: firstName, source: 'instagram', instagram: ig ? `@${ig}` : '' });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('manychat:', err.message);
    return res.status(502).json({ ok: false, message: 'Something went wrong on my end. Try again in a minute.' });
  }
}
