// POST /api/stripe-webhook  (Stripe → katiep.me)
// checkout.session.completed / async_payment_succeeded → create the student's
//   licence key (once per checkout), tag them in Kit and save the key in the
//   "Course key" field so the Kit welcome email can send it.
// charge.refunded (full refund) and charge.dispute.created → switch the key off.
//
// Only App in 30 Days purchases count: the Payment Link must have the metadata
// product = app30, or its id must be listed in STRIPE_COURSE_LINKS. Everything
// else on the Stripe account (other products) is ignored.
//
// Env: STRIPE_WEBHOOK_SECRET (whsec_…), optional STRIPE_COURSE_LINKS (plink_…,plink_…)

import crypto from 'node:crypto';
import { kv } from './_idea.js';
import { createLicence, getLicence, setStatus } from './_license.js';
import { subscribe } from './_kit.js';

export const config = { api: { bodyParser: false } };
export const STUDENT_TAG = process.env.KIT_STUDENT_TAG || 'App in 30 Days student';

async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

export function verify(raw, header, secret, toleranceSec = 300) {
  const parts = Object.fromEntries(String(header || '').split(',').map((p) => p.split('=')).filter((p) => p.length === 2)
    .map(([k, v]) => [k.trim(), v.trim()]));
  const sigs = String(header || '').split(',').filter((p) => p.trim().startsWith('v1=')).map((p) => p.trim().slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${raw.toString('utf8')}`).digest('hex');
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

function isCourse(session) {
  if (session.metadata?.product === 'app30') return true;
  const links = String(process.env.STRIPE_COURSE_LINKS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return !!session.payment_link && links.includes(session.payment_link);
}

async function onPaid(session) {
  if (session.payment_status !== 'paid') return 'not paid yet';
  if (!isCourse(session)) return 'not the course';
  const existing = await kv.get(`lic-ref:${session.id}`);
  if (existing) return 'already done';
  const email = session.customer_details?.email || session.customer_email;
  if (!email) return 'no email';
  const name = session.customer_details?.name || '';
  const lic = await createLicence({
    email, name, source: 'stripe',
    stripe: {
      session: session.id, payment_intent: session.payment_intent || null, customer: session.customer || null,
      amount: session.amount_total, currency: session.currency, link: session.payment_link || null,
    },
  });
  try {
    await subscribe({
      address: lic.email,
      firstName: name.split(' ')[0] || '',
      page: 'stripe checkout',
      fields: { 'Course key': lic.key },
      tags: [STUDENT_TAG],
    });
  } catch (err) {
    console.error('stripe-webhook: Kit failed (key still created):', err.message);
  }
  return `created ${lic.key.slice(0, 10)}…`;
}

async function revokeByPaymentIntent(pi, reason) {
  if (!pi) return 'no payment intent';
  const key = await kv.get(`lic-pi:${pi}`);
  if (!key) return 'no licence for that payment';
  const lic = await getLicence(key);
  if (!lic || lic.status === 'revoked') return 'already off';
  await setStatus(lic, 'revoked', reason);
  return `revoked (${reason})`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(500).json({ error: 'Not configured' });

  const raw = await rawBody(req);
  if (!verify(raw, req.headers['stripe-signature'], secret)) return res.status(400).json({ error: 'Bad signature' });

  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ error: 'Bad JSON' }); }
  const o = event.data?.object || {};

  try {
    let result = 'ignored';
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      result = await onPaid(o);
    } else if (event.type === 'charge.refunded') {
      result = o.refunded ? await revokeByPaymentIntent(o.payment_intent, 'refunded') : 'partial refund, key kept';
    } else if (event.type === 'charge.dispute.created') {
      result = await revokeByPaymentIntent(o.payment_intent, 'chargeback');
    }
    console.log(`stripe-webhook ${event.type}: ${result}`);
    return res.status(200).json({ received: true, result });
  } catch (err) {
    console.error('stripe-webhook:', event.type, err.message);
    return res.status(500).json({ error: 'Failed' }); // Stripe retries
  }
}
