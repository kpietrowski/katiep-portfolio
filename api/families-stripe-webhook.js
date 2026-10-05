// POST /api/families-stripe-webhook   (Stripe webhook: checkout.session.completed)
// When someone buys the Families 101 bundle through the Keepsake editor's
// checkout (edit.katiep.me, product "core"), tag her in Kit as a buyer. The Kit
// nurture sequence excludes that tag, so the sales emails stop.
//
// This is a second webhook endpoint on the same Stripe account. Access to the
// course, looks and editor is granted by the editor's own webhook; this one
// only keeps Kit in sync.
//
// Env: FAMILIES_STRIPE_WEBHOOK_SECRET (whsec_..., the signing secret of THIS endpoint),
//      KIT_API_KEY, KIT_BUYER_TAG_ID, FAMILIES_PRODUCT_ID (optional, default "core").

import crypto from 'node:crypto';

const KIT = 'https://api.kit.com/v4';

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Stripe signature check (same scheme as stripe.webhooks.constructEvent).
function verify(raw, header, secret, toleranceSec = 300) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => p.split('=')).filter((kv) => kv.length === 2 && kv[0] !== 'v1')
  );
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return sigs.some((s) => s.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

async function kit(path, body) {
  const r = await fetch(KIT + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Kit-Api-Key': process.env.KIT_API_KEY },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Kit ${path} ${r.status}: ${(await r.text().catch(() => '')).slice(0, 300)}`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Read the raw body before anything touches req.body (Vercel parses lazily).
  const raw = await readRaw(req);
  if (!verify(raw.toString('utf8'), req.headers['stripe-signature'], process.env.FAMILIES_STRIPE_WEBHOOK_SECRET || '')) {
    return res.status(400).send('Bad signature');
  }

  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).send('Bad JSON'); }
  if (event.type !== 'checkout.session.completed') return res.status(200).json({ ignored: event.type });

  const s = event.data.object;
  const wanted = process.env.FAMILIES_PRODUCT_ID || 'core';
  if ((s.metadata && s.metadata.product_id) !== wanted) return res.status(200).json({ ignored: 'other product' });
  if (s.payment_status !== 'paid') return res.status(200).json({ ignored: 'unpaid' });

  const email = (s.customer_details && s.customer_details.email) || s.customer_email;
  if (!email) return res.status(200).json({ ignored: 'no email' });
  const first = ((s.customer_details && s.customer_details.name) || '').split(' ')[0] || undefined;

  try {
    await kit('/subscribers', { email_address: email.toLowerCase(), first_name: first });
    await kit(`/tags/${process.env.KIT_BUYER_TAG_ID}/subscribers`, { email_address: email.toLowerCase() });
  } catch (err) {
    console.error('families-stripe-webhook:', err.message);
    return res.status(500).send('Kit error'); // Stripe will retry
  }
  return res.status(200).json({ ok: true });
}
