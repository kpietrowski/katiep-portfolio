// POST /api/license-devices  { key, email, action: 'list' | 'reset' }
// katiep.me/app/devices: a student sees which computers use their key and can
// clear them all once every 30 days. Needs both the key and the email it was
// bought with.

import { getLicence, saveLicence, normEmail, nextReset, studentView } from './_license.js';
import { overLimit } from './_idea.js';
import { clientIp } from './_license.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (await overLimit(clientIp(req), 20, 'lic-dev-rl')) return res.status(429).json({ error: 'Too many tries. Please wait an hour and try again.' });
    const lic = await getLicence(req.body?.key);
    if (!lic || lic.email !== normEmail(req.body?.email)) {
      return res.status(404).json({ error: "That key and email don't match. Use the email you bought the course with." });
    }
    if (req.body?.action === 'reset') {
      const wait = nextReset(lic);
      if (wait) return res.status(429).json({ error: `You can clear your computers again on ${new Date(wait).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. Need help sooner? Email katie@katiepietrowski.com.`, ...studentView(lic) });
      lic.devices = [];
      lic.resets = [...lic.resets, new Date().toISOString()].slice(-24);
      await saveLicence(lic);
    }
    return res.status(200).json(studentView(lic));
  } catch (err) {
    console.error('license-devices:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
