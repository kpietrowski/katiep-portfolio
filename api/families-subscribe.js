// POST /api/families-subscribe  { first_name, email, referrer? }
// Adds the visitor to Kit and to the "Posing Guide" form. Joining that form is
// what starts the Kit automation (guide delivery email + nurture sequence).
//
// Env: KIT_API_KEY (Kit > Settings > Developer, v4 key), KIT_FORM_ID.

const KIT = 'https://api.kit.com/v4';

async function kit(path, body) {
  const r = await fetch(KIT + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Kit-Api-Key': process.env.KIT_API_KEY },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`Kit ${path} ${r.status}: ${text.slice(0, 300)}`);
  }
  return r.json().catch(() => ({}));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { first_name = '', email = '', referrer } = req.body || {};
  const address = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    return res.status(400).json({ error: 'Please enter a valid email.' });
  }
  if (!process.env.KIT_API_KEY || !process.env.KIT_FORM_ID) {
    console.error('families-subscribe: KIT_API_KEY or KIT_FORM_ID is not set');
    return res.status(500).json({ error: 'Not configured' });
  }

  try {
    // Create (or update) the subscriber, then add them to the form.
    await kit('/subscribers', {
      email_address: address,
      first_name: String(first_name).trim().slice(0, 80) || undefined,
    });
    await kit(`/forms/${process.env.KIT_FORM_ID}/subscribers`, {
      email_address: address,
      referrer: typeof referrer === 'string' ? referrer.slice(0, 500) : undefined,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('families-subscribe:', err.message);
    return res.status(502).json({ error: 'Could not subscribe right now.' });
  }
}
