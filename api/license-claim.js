// GET /api/license-claim?session_id=cs_…
// The welcome page Stripe sends buyers to after paying. Returns their key once
// the Stripe webhook has created it ({ pending: true } until then).
// Checkout session ids are long and unguessable, and only the buyer has theirs.

import { kv } from './_idea.js';
import { getLicence } from './_license.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  const sid = String(req.query?.session_id || '');
  if (!/^cs_(test_|live_)?[A-Za-z0-9]{10,200}$/.test(sid)) return res.status(400).json({ error: 'Missing checkout id.' });
  try {
    const key = await kv.get(`lic-ref:${sid}`);
    if (!key) return res.status(202).json({ pending: true });
    const lic = await getLicence(key);
    if (!lic) return res.status(202).json({ pending: true });
    return res.status(200).json({ key: lic.key, first_name: (lic.name || '').split(' ')[0], email: lic.email, status: lic.status });
  } catch (err) {
    console.error('license-claim:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Your key is also in your welcome email.' });
  }
}
