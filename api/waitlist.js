// POST /api/waitlist  { first_name?, email, phone?, sms_consent?, referrer?, company? }
// The App in 30 Days waitlist (katiep.me/app). Adds the visitor to Kit, saves
// their mobile number (only with SMS consent) and tags them "App in 30 Days
// waitlist". Point a Kit automation at that tag to send the welcome email.
//
// Kit does not send texts. The phone number and a consent record are stored as
// custom fields so they can be exported to an SMS tool later.
//
// Env: KIT_API_KEY (already set for the Families funnel).
// Optional: KIT_WAITLIST_TAG (tag name, default "App in 30 Days waitlist").
//
// The tag and the two custom fields ("Phone", "SMS consent") are created on
// first use: Kit's create endpoints return the existing one when the name is
// already taken, so this is safe to run on every cold start.

const KIT = 'https://api.kit.com/v4';
const TAG_NAME = process.env.KIT_WAITLIST_TAG || 'App in 30 Days waitlist';

// Must match the words shown next to the checkbox on /app (bump the version
// whenever that text changes, so every consent record says what was agreed to).
const CONSENT_VERSION = 'app30-sms-v1';

async function kit(path, body, method = 'POST') {
  const r = await fetch(KIT + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Kit-Api-Key': process.env.KIT_API_KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`Kit ${method} ${path} ${r.status}: ${text.slice(0, 300)}`);
  }
  return r.json().catch(() => ({}));
}

// Cached for the life of a warm function instance.
let setup;
function ensureSetup() {
  if (!setup) {
    setup = Promise.all([
      kit('/tags', { name: TAG_NAME }),
      kit('/custom_fields', { label: 'Phone' }),
      kit('/custom_fields', { label: 'SMS consent' }),
    ]).then(([t, phone, consent]) => ({
      tagId: t.tag.id,
      phoneKey: phone.custom_field.key,
      consentKey: consent.custom_field.key,
    })).catch((err) => { setup = undefined; throw err; });
  }
  return setup;
}

// US-first: 10 digits gets +1; anything starting with + is kept as given.
function normalizePhone(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const digits = s.replace(/\D/g, '');
  if (s.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? '+' + digits : null;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { first_name = '', email = '', phone = '', sms_consent = false, referrer, company } = req.body || {};

  // Honeypot: real people never see or fill this field.
  if (company) return res.status(200).json({ ok: true });

  const address = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    return res.status(400).json({ error: 'Please enter a valid email.' });
  }

  const mobile = normalizePhone(phone);
  if (mobile === null) {
    return res.status(400).json({ error: 'Please check your mobile number.' });
  }
  if (mobile && sms_consent !== true) {
    return res.status(400).json({ error: 'Tick the box to get texts, or leave the number blank.' });
  }

  if (!process.env.KIT_API_KEY) {
    console.error('waitlist: KIT_API_KEY is not set');
    return res.status(500).json({ error: 'Not configured' });
  }

  try {
    const { tagId, phoneKey, consentKey } = await ensureSetup();

    const fields = {};
    if (mobile) {
      fields[phoneKey] = mobile;
      const page = typeof referrer === 'string' ? referrer.slice(0, 200) : 'katiep.me/app';
      fields[consentKey] = `yes | ${new Date().toISOString()} | ${CONSENT_VERSION} | ${page}`;
    }

    await kit('/subscribers', {
      email_address: address,
      first_name: String(first_name).trim().slice(0, 80) || undefined,
      fields: Object.keys(fields).length ? fields : undefined,
    });
    await kit(`/tags/${tagId}/subscribers`, { email_address: address });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('waitlist:', err.message);
    return res.status(502).json({ error: 'Could not add you right now.' });
  }
}
