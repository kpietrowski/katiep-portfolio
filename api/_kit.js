// Shared Kit (ConvertKit v4) helpers for the App in 30 Days funnels.
// Files in /api that start with "_" are not routes.
//
// Env: KIT_API_KEY.
//
// Tags and custom fields are created on first use: Kit's create endpoints are
// idempotent (an existing tag/field with that name is returned, not
// duplicated), so this is safe on every cold start.

const KIT = 'https://api.kit.com/v4';

export const WAITLIST_TAG = process.env.KIT_WAITLIST_TAG || 'App in 30 Days waitlist';

// Added by both free tools, so Katie can filter everyone who has told her their
// app idea. The idea itself is in the "App idea" custom field.
export const IDEA_SHARED_TAG = process.env.KIT_IDEA_SHARED_TAG || 'Shared an app idea';

// Must match the words shown next to the SMS checkbox on /app and /idea.
// Bump it whenever that text changes, so each consent record says what was agreed to.
export const CONSENT_VERSION = 'app30-sms-v1';

export async function kit(path, body, method = 'POST') {
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

const tagIds = new Map();
const fieldKeys = new Map();

export async function tagId(name) {
  if (!tagIds.has(name)) {
    tagIds.set(name, kit('/tags', { name }).then((j) => j.tag.id).catch((e) => { tagIds.delete(name); throw e; }));
  }
  return tagIds.get(name);
}

export async function fieldKey(label) {
  if (!fieldKeys.has(label)) {
    fieldKeys.set(label, kit('/custom_fields', { label }).then((j) => j.custom_field.key).catch((e) => { fieldKeys.delete(label); throw e; }));
  }
  return fieldKeys.get(label);
}

export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// US-first: 10 digits gets +1; anything starting with + is kept as given.
// Returns '' for empty, null for invalid.
export function normalizePhone(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const digits = s.replace(/\D/g, '');
  if (s.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? '+' + digits : null;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return null;
}

// Validates a signup body. Returns { error } or { address, firstName, mobile }.
export function readSignup(body) {
  const { first_name = '', email = '', phone = '', sms_consent = false } = body || {};
  const address = String(email).trim().toLowerCase();
  if (!isEmail(address)) return { error: 'Please enter a valid email.' };
  const mobile = normalizePhone(phone);
  if (mobile === null) return { error: 'Please check your mobile number.' };
  if (mobile && sms_consent !== true) return { error: 'Tick the box to get texts, or leave the number blank.' };
  return { address, firstName: String(first_name).trim().slice(0, 80), mobile };
}

// Creates/updates the subscriber with any extra custom fields (label → value),
// adds the SMS fields when there's a consented number, and applies the tags.
export async function subscribe({ address, firstName, mobile, page, fields = {}, tags = [] }) {
  const out = {};
  for (const [label, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && value !== '') out[await fieldKey(label)] = String(value);
  }
  if (mobile) {
    out[await fieldKey('Phone')] = mobile;
    out[await fieldKey('SMS consent')] = `yes | ${new Date().toISOString()} | ${CONSENT_VERSION} | ${String(page || '').slice(0, 200)}`;
  }
  await kit('/subscribers', {
    email_address: address,
    first_name: firstName || undefined,
    fields: Object.keys(out).length ? out : undefined,
  });
  for (const name of tags) {
    await kit(`/tags/${await tagId(name)}/subscribers`, { email_address: address });
  }
}
