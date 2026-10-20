// One record per person who signs up anywhere in the App in 30 Days funnel,
// so Katie can see everyone's app ideas in one list (katiep.me/app/admin) and
// email the exciting ones personally.
//
//   lead:<email>   { email, first_name, first_seen, last_seen, sources[],
//                    instagram?, idea?, design? }
//   leads          sorted set of emails by last activity (newest last)
//
// recordLead never throws: a signup must not fail because of this log.

import { kv } from './_idea.js';

export async function recordLead(email, patch = {}) {
  try {
    const key = `lead:${String(email).toLowerCase()}`;
    const now = new Date().toISOString();
    const cur = (await kv.get(key)) || { email: String(email).toLowerCase(), first_seen: now, sources: [] };
    const next = { ...cur, last_seen: now };
    if (patch.first_name) next.first_name = patch.first_name;
    if (patch.source && !next.sources.includes(patch.source)) next.sources = [...next.sources, patch.source];
    if (patch.instagram) next.instagram = patch.instagram;
    if (patch.idea) next.idea = { ...patch.idea, at: now };
    if (patch.design) next.design = { ...patch.design, at: now };
    await kv.set(key, next);
    await kv.zadd('leads', { score: Date.now(), member: next.email });
  } catch (err) {
    console.error('recordLead:', err.message);
  }
}

export async function listLeads(limit = 500) {
  const emails = await kv.zrange('leads', 0, limit - 1, { rev: true });
  if (!emails.length) return [];
  const docs = await kv.mget(...emails.map((e) => `lead:${e}`));
  return docs.filter(Boolean);
}

// A short version of what someone typed, for Kit's "App idea" field.
export function shortIdea(text, max = 240) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : s;
}
