// POST /api/waitlist  { first_name?, email, phone?, sms_consent?, referrer?, company? }
// The App in 30 Days waitlist (katiep.me/app). Adds the visitor to Kit, saves
// their mobile number (only with SMS consent) and tags them "App in 30 Days
// waitlist". Point a Kit automation at that tag to send the welcome email.
//
// Kit does not send texts. The phone number and a consent record are stored as
// custom fields ("Phone", "SMS consent") so they can be exported to an SMS tool.
//
// Env: KIT_API_KEY. Optional: KIT_WAITLIST_TAG.

import { readSignup, subscribe, WAITLIST_TAG } from './_kit.js';
import { recordLead } from './_leads.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Honeypot: real people never see or fill this field.
  if (req.body?.company) return res.status(200).json({ ok: true });

  const s = readSignup(req.body);
  if (s.error) return res.status(400).json({ error: s.error });

  if (!process.env.KIT_API_KEY) {
    console.error('waitlist: KIT_API_KEY is not set');
    return res.status(500).json({ error: 'Not configured' });
  }

  try {
    await subscribe({ ...s, page: req.body?.referrer || 'katiep.me/app', tags: [WAITLIST_TAG] });
    await recordLead(s.address, { first_name: s.firstName, source: 'waitlist' });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('waitlist:', err.message);
    return res.status(502).json({ error: 'Could not add you right now.' });
  }
}
