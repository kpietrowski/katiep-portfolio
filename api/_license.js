// App in 30 Days course licences. Files in /api starting with "_" are not routes.
//
// A licence key (APP30-XXXX-XXXX-XXXX) is created when someone buys through
// Stripe, is lifetime, and works on up to 3 computers. Students' installed
// skills are short stubs; each day's real instructions are fetched from
// /api/course with the key. Cloud sessions (Claude Code on the web) don't use
// up a computer, but unusual use is flagged for Katie to review.
//
// Storage (Upstash Redis via the shared KV client):
//   lic:<KEY>               the licence record (below)
//   lic-email:<email>       [KEY, …]
//   lic-ref:<checkout id>   KEY            (idempotent Stripe webhook)
//   lic-pi:<payment intent> KEY            (refunds and disputes)
//   lic-all                 set of every KEY
//   lic-flagged             set of KEYs with something worth a look
//   lic-log:<KEY>           recent course fetches (newest first, 300 kept)
//   lic-day:<KEY>:<date>    set of hashed IPs seen that day
//   course:f:<path>         a course file's text, e.g. app30-pricing/SKILL.md
//   course:paths            set of every published path

import crypto from 'node:crypto';
import { kv } from './_idea.js';

export const MAX_DEVICES = 3;
export const RESET_DAYS = 30;
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O, 1/I

export function newKey() {
  const bytes = crypto.randomBytes(12);
  const chars = [...bytes].map((b) => ALPHABET[b % 32]).join('');
  return `APP30-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}
export function normKey(k) {
  const s = String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = s.startsWith('APP30') ? s.slice(5) : s;
  if (body.length !== 12 || [...body].some((c) => !ALPHABET.includes(c))) return null;
  return `APP30-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}
export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const hashIp = (ip) => crypto.createHash('sha256').update(`app30:${ip}`).digest('hex').slice(0, 16);
export const clientIp = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

export async function getLicence(key) {
  const k = normKey(key);
  if (!k) return null;
  const v = await kv.get(`lic:${k}`);
  return v ? parse(v) : null;
}
export async function saveLicence(lic) {
  lic.updated = new Date().toISOString();
  await kv.set(`lic:${lic.key}`, JSON.stringify(lic));
}
export async function keysForEmail(email) {
  const v = await kv.get(`lic-email:${normEmail(email)}`);
  return v ? parse(v) : [];
}

// Create a licence (from Stripe, or by hand from the admin page).
export async function createLicence({ email, name = '', source = 'manual', stripe = null }) {
  const lic = {
    key: newKey(),
    email: normEmail(email),
    name: String(name || '').slice(0, 80),
    created: new Date().toISOString(),
    status: 'active',
    source,
    stripe,
    devices: [],
    resets: [],
    flags: [],
  };
  await saveLicence(lic);
  const keys = await keysForEmail(lic.email);
  await kv.set(`lic-email:${lic.email}`, JSON.stringify([...keys, lic.key]));
  await kv.sadd('lic-all', lic.key);
  if (stripe?.session) await kv.set(`lic-ref:${stripe.session}`, lic.key);
  if (stripe?.payment_intent) await kv.set(`lic-pi:${stripe.payment_intent}`, lic.key);
  return lic;
}

export async function setStatus(lic, status, reason) {
  lic.status = status;
  if (status === 'revoked') { lic.revoked_at = new Date().toISOString(); lic.revoked_reason = reason; }
  else { delete lic.revoked_at; delete lic.revoked_reason; }
  await saveLicence(lic);
}

export async function flag(lic, why) {
  const today = new Date().toISOString().slice(0, 10);
  if (lic.flags.some((f) => f.why === why && f.at.slice(0, 10) === today)) return;
  lic.flags = [...lic.flags, { why, at: new Date().toISOString() }].slice(-20);
  await saveLicence(lic);
  await kv.sadd('lic-flagged', lic.key);
}

// Can this licence clear its computers now? Returns the date it can if not.
export function nextReset(lic) {
  const last = lic.resets[lic.resets.length - 1];
  if (!last) return null;
  const next = Date.parse(last) + RESET_DAYS * 864e5;
  return next > Date.now() ? new Date(next).toISOString() : null;
}

// Public view of a licence for the student (never other students' data).
export const studentView = (lic) => ({
  key: lic.key,
  status: lic.status,
  devices: lic.devices.map((d) => ({ id: d.id.slice(0, 8), label: d.label, first: d.first, last: d.last })),
  max_devices: MAX_DEVICES,
  next_reset: nextReset(lic),
});
