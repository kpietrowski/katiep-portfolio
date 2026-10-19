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
// The call pack (4 one-hour calls with Katie) is sold two ways:
//   • added at checkout as a Stripe cross-sell on the course link: the webhook
//     reads the order's line items (needs STRIPE_SECRET_KEY, a restricted key
//     with read access to Checkout Sessions) and looks for STRIPE_CALLS_PRODUCT;
//   • bought after, from the welcome page: its own Payment Link with metadata
//     product = app30-calls (that link gets ?client_reference_id=<course key>).
// Either way the buyer is tagged in Kit ("App in 30 Days calls") so a Kit
// automation emails the booking link, and the licence records the calls.
// Refunding only the calls never switches off the course key.
//
// Env: STRIPE_WEBHOOK_SECRET (whsec_…), optional STRIPE_COURSE_LINKS (plink_…,plink_…),
//      STRIPE_SECRET_KEY (rk_…), STRIPE_CALLS_PRODUCT (prod_…), optional STRIPE_CALLS_LINKS

import crypto from 'node:crypto';
import { kv } from './_idea.js';
import { createLicence, getLicence, setStatus, saveLicence, keysForEmail, normKey } from './_license.js';
import { subscribe } from './_kit.js';

export const config = { api: { bodyParser: false } };
export const STUDENT_TAG = process.env.KIT_STUDENT_TAG || 'App in 30 Days student';
export const CALLS_TAG = process.env.KIT_CALLS_TAG || 'App in 30 Days calls';

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

function isCallsLink(session) {
  if (session.metadata?.product === 'app30-calls') return true;
  const links = String(process.env.STRIPE_CALLS_LINKS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return !!session.payment_link && links.includes(session.payment_link);
}

// Did this checkout include the call pack (a cross-sell on the course link)?
async function callsLineItem(session) {
  const key = process.env.STRIPE_SECRET_KEY, product = process.env.STRIPE_CALLS_PRODUCT;
  if (!key || !product) return null;
  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${session.id}/line_items?limit=20`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!r.ok) throw new Error(`Stripe line items ${r.status}`);
  const j = await r.json();
  return (j.data || []).find((li) => (li.price?.product === product)) || null;
}

async function giveCalls(lic, { session, payment_intent, amount, separate }) {
  lic.calls = { status: 'active', bought_at: new Date().toISOString(), session, payment_intent, amount, separate: !!separate };
  await saveLicence(lic);
  if (separate && payment_intent) await kv.set(`lic-calls-pi:${payment_intent}`, lic.key);
}

async function tagCalls(email, name) {
  try {
    await subscribe({ address: email, firstName: (name || '').split(' ')[0] || '', page: 'stripe checkout (calls)', fields: {}, tags: [CALLS_TAG] });
  } catch (err) {
    console.error('stripe-webhook: Kit calls tag failed:', err.message);
  }
}

// The call pack bought on its own (from the welcome page, or anywhere).
async function onCallsPaid(session) {
  if (await kv.get(`calls-ref:${session.id}`)) return 'already done';
  const email = session.customer_details?.email || session.customer_email;
  const name = session.customer_details?.name || '';
  await kv.set(`calls-ref:${session.id}`, '1');
  let lic = await getLicence(normKey(session.client_reference_id));
  if (!lic && email) {
    const keys = await keysForEmail(email);
    lic = await getLicence(keys[keys.length - 1]);
  }
  if (lic) await giveCalls(lic, { session: session.id, payment_intent: session.payment_intent, amount: session.amount_total, separate: true });
  if (email) await tagCalls(email, name);
  return lic ? `calls added to ${lic.key.slice(0, 10)}…` : 'calls bought without a course key';
}

async function onPaid(session) {
  if (session.payment_status !== 'paid') return 'not paid yet';
  if (isCallsLink(session)) return onCallsPaid(session);
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
  let calls = null;
  try { calls = await callsLineItem(session); } catch (err) { console.error('stripe-webhook: line items:', err.message); }
  if (calls) {
    await giveCalls(lic, { session: session.id, payment_intent: session.payment_intent, amount: calls.amount_total, separate: false });
    await tagCalls(lic.email, name);
  }
  return `created ${lic.key.slice(0, 10)}…${calls ? ' with calls' : ''}`;
}

// Refunds: a refund of the call pack alone marks the calls refunded and keeps
// the course key; a full refund of a course order switches the key off.
async function onRefund(charge) {
  const pi = charge.payment_intent;
  const callsKey = pi && await kv.get(`lic-calls-pi:${pi}`);
  if (callsKey) {
    const lic = await getLicence(callsKey);
    if (lic?.calls && charge.refunded) { lic.calls.status = 'refunded'; await saveLicence(lic); return 'calls refunded, key kept'; }
    return 'partial calls refund';
  }
  if (charge.refunded) return revokeByPaymentIntent(pi, 'refunded');
  // Course + calls in one order, and only the calls refunded.
  const key = pi && await kv.get(`lic-pi:${pi}`);
  const lic = key && await getLicence(key);
  if (lic?.calls && lic.calls.status === 'active' && charge.amount_refunded >= (lic.calls.amount || Infinity)) {
    lic.calls.status = 'refunded'; await saveLicence(lic);
    return 'calls refunded, key kept';
  }
  return 'partial refund, key kept';
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
      result = await onRefund(o);
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
