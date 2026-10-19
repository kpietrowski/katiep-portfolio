// POST /api/design-unlock  { id, first_name?, email, phone?, sms_consent?, referrer?, company? }
// Step 2 of the App Design Builder: adds the visitor to Kit (tags "App Design
// Kit" and the waitlist; the kit link as a custom field so a Kit automation can
// email it), unlocks the kit and returns its URL.
//
// Kit automation: trigger "tag added: App Design System" → email with
// {{ subscriber.design_kit_url }}.

import { readSignup, subscribe, WAITLIST_TAG } from './_kit.js';
import { loadDoc, saveDoc } from './_idea.js';

export const DESIGN_TAG = process.env.KIT_DESIGN_TAG || 'App Design System';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.body?.company) return res.status(200).json({ ok: true });

  const s = readSignup(req.body);
  if (s.error) return res.status(400).json({ error: s.error });
  if (!process.env.KIT_API_KEY) return res.status(500).json({ error: 'Not configured' });

  try {
    const kit = await loadDoc('design', req.body?.id);
    if (!kit) return res.status(404).json({ error: "I couldn't find that design system. Please make it again." });

    const url = `https://katiep.me/design/kit?id=${kit.id}`;
    await subscribe({
      ...s,
      page: req.body?.referrer || 'katiep.me/design',
      fields: { 'Design kit URL': url, 'Design app name': kit.brand.names?.[0]?.name },
      tags: [DESIGN_TAG, WAITLIST_TAG],
    });

    if (!kit.unlocked) {
      kit.unlocked = true;
      kit.unlocked_at = new Date().toISOString();
      kit.first_name = s.firstName || '';
      await saveDoc('design', kit);
    }
    return res.status(200).json({ ok: true, url });
  } catch (err) {
    console.error('design-unlock:', err.message);
    return res.status(502).json({ error: 'Something went wrong saving your kit. Please try again.' });
  }
}
