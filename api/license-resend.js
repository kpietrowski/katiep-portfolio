// POST /api/license-resend  { email }
// "I lost my key": re-tags the student in Kit so the "Course key resend"
// automation emails {{ subscriber.course_key }} again. Always gives the same
// answer, so it can't be used to check who bought the course.

import { keysForEmail, getLicence, normEmail, clientIp } from './_license.js';
import { overLimit } from './_idea.js';
import { kit, tagId, subscribe } from './_kit.js';

export const RESEND_TAG = process.env.KIT_RESEND_TAG || 'Course key resend';
const SAME = { ok: true, message: "If that email bought App in 30 Days, your key is on its way. Check your inbox (and spam) in a few minutes." };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const email = normEmail(req.body?.email);
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Please enter your email.' });
  try {
    if (await overLimit(clientIp(req), 5, 'lic-resend-rl')) return res.status(200).json(SAME);
    const keys = await keysForEmail(email);
    const lics = (await Promise.all(keys.map(getLicence))).filter((l) => l && l.status === 'active');
    const lic = lics[lics.length - 1];
    if (lic) {
      // Make sure the key is in their Kit profile, then take the tag off and put
      // it back on so the automation runs again.
      await subscribe({ address: email, page: 'katiep.me/app/key', fields: { 'Course key': lic.key }, tags: [] });
      const id = await tagId(RESEND_TAG);
      const sub = await kit(`/subscribers?email_address=${encodeURIComponent(email)}`, null, 'GET').catch(() => null);
      const subId = sub?.subscribers?.[0]?.id;
      if (subId) await kit(`/tags/${id}/subscribers/${subId}`, null, 'DELETE').catch(() => null);
      await kit(`/tags/${id}/subscribers`, { email_address: email });
    }
    return res.status(200).json(SAME);
  } catch (err) {
    console.error('license-resend:', err.message);
    return res.status(200).json(SAME);
  }
}
