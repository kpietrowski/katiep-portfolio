// GET /api/license-claim?session_id=cs_…
// The welcome page Stripe sends buyers to after paying. Returns their key once
// the Stripe webhook has created it ({ pending: true } until then), plus the
// call-pack offer (STRIPE_CALLS_LINK_URL) or, if they have calls, the booking
// link (CALLS_BOOKING_URL). Also answers for a call-pack checkout (/app/calls).
// Checkout session ids are long and unguessable, and only the buyer has theirs.

import { kv } from './_idea.js';
import { getLicence } from './_license.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  const sid = String(req.query?.session_id || '');
  if (!/^cs_(test_|live_)?[A-Za-z0-9]{10,200}$/.test(sid)) return res.status(400).json({ error: 'Missing checkout id.' });
  try {
    const booking = process.env.CALLS_BOOKING_URL || null;
    if (await kv.get(`calls-ref:${sid}`)) return res.status(200).json({ calls: true, booking_url: booking });
    const key = await kv.get(`lic-ref:${sid}`);
    if (!key) return res.status(202).json({ pending: true });
    const lic = await getLicence(key);
    if (!lic) return res.status(202).json({ pending: true });
    const hasCalls = lic.calls?.status === 'active';
    let callsOffer = null;
    if (!hasCalls && process.env.STRIPE_CALLS_LINK_URL) {
      const u = new URL(process.env.STRIPE_CALLS_LINK_URL);
      u.searchParams.set('prefilled_email', lic.email);
      u.searchParams.set('client_reference_id', lic.key);
      callsOffer = u.toString();
    }
    return res.status(200).json({
      key: lic.key, first_name: (lic.name || '').split(' ')[0], email: lic.email, status: lic.status,
      calls: hasCalls, booking_url: hasCalls ? booking : null, calls_offer: callsOffer,
    });
  } catch (err) {
    console.error('license-claim:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Your key is also in your welcome email.' });
  }
}
