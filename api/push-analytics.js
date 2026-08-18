import { createHash, timingSafeEqual } from 'node:crypto';

// The dashboard at /tide/analytics used to call Supabase directly, which meant
// the admin token had to live in the browser. Now the browser only ever sends a
// password, and PUSH_ADMIN_TOKEN stays here in Vercel's environment.
const ANALYTICS_FN = 'https://flvshacazleoplaetyab.functions.supabase.co/push-analytics';

// Hashing first means the comparison is constant-time regardless of length, so
// a wrong guess can't be distinguished from a short one by how long it takes.
const digest = (value) => createHash('sha256').update(String(value), 'utf8').digest();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const password = process.env.ANALYTICS_PASSWORD;
  const adminToken = process.env.PUSH_ADMIN_TOKEN;

  // Fail closed. Without both env vars set this must never fall through to an
  // unauthenticated fetch.
  if (!password || !adminToken) {
    return res.status(500).json({
      error: 'Dashboard is not configured — set ANALYTICS_PASSWORD and PUSH_ADMIN_TOKEN in Vercel.',
    });
  }

  const supplied = req.body?.password;
  if (typeof supplied !== 'string' || !timingSafeEqual(digest(supplied), digest(password))) {
    return res.status(401).json({ error: "That password wasn't accepted." });
  }

  res.setHeader('Cache-Control', 'no-store');

  try {
    const upstream = await fetch(ANALYTICS_FN, { headers: { 'x-admin-token': adminToken } });

    if (!upstream.ok) {
      // A 403 here is our own misconfiguration, not the visitor's problem —
      // say so plainly rather than making a correct password look wrong.
      return res.status(502).json({
        error: upstream.status === 403
          ? 'Supabase rejected PUSH_ADMIN_TOKEN — check the value set in Vercel.'
          : `The analytics function returned ${upstream.status}.`,
      });
    }

    return res.status(200).json(await upstream.json());
  } catch {
    return res.status(502).json({ error: 'Could not reach the analytics function.' });
  }
}
