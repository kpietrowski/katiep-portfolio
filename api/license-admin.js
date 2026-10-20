// Katie's admin API for App in 30 Days licences and course content.
// Every call needs:  Authorization: Bearer <APP30_ADMIN_TOKEN>
//
// GET  ?q=<email or key>   → matching licences, with their recent course use
// GET  ?flagged=1          → licences with something worth a look
// GET  ?stats=1            → totals, and how many course files are published
// GET  ?paths=1            → every published course file path
// GET  ?leads=1            → everyone from the waitlist and free tools, with their app ideas
// POST { action: 'create', email, name }             → a free key (comp a student)
// POST { action: 'revoke' | 'restore', key, reason }
// POST { action: 'clear_devices' | 'unflag', key }
// POST { action: 'publish', files: [{ path, content }] } → upload course files
// POST { action: 'unpublish', paths: [...] }

import crypto from 'node:crypto';
import { kv } from './_idea.js';
import { getLicence, saveLicence, keysForEmail, createLicence, setStatus, normKey, studentView } from './_license.js';
import { subscribe } from './_kit.js';
import { STUDENT_TAG } from './stripe-webhook.js';
import { listLeads } from './_leads.js';

const PATH = /^app30-[a-z0-9-]+\/[A-Za-z0-9._\/-]{1,160}$/;

function authorised(req) {
  const want = process.env.APP30_ADMIN_TOKEN || '';
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (want.length < 24 || got.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

async function withLog(lic) {
  const log = (await kv.lrange(`lic-log:${lic.key}`, 0, 29)).map((x) => (typeof x === 'string' ? JSON.parse(x) : x));
  const lastStep = log.find((l) => /SKILL\.md$/.test(l.what))?.what.split('/')[0] || null;
  return { ...lic, last_step: lastStep, recent: log };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.APP30_ADMIN_TOKEN) return res.status(500).json({ error: 'Set APP30_ADMIN_TOKEN in Vercel first.' });
  if (!authorised(req)) return res.status(401).json({ error: 'Wrong admin token.' });

  try {
    if (req.method === 'GET') {
      if (req.query?.stats) {
        const keys = await kv.smembers('lic-all');
        const lics = (await Promise.all(keys.map(getLicence))).filter(Boolean);
        return res.status(200).json({
          licences: lics.length,
          active: lics.filter((l) => l.status === 'active').length,
          revoked: lics.filter((l) => l.status === 'revoked').length,
          flagged: await kv.scard('lic-flagged'),
          course_files: await kv.scard('course:paths'),
        });
      }
      if (req.query?.leads) return res.status(200).json({ leads: await listLeads(1000) });
      if (req.query?.paths) return res.status(200).json({ paths: (await kv.smembers('course:paths')).sort(), published: await kv.get('course:published') });
      if (req.query?.flagged) {
        const keys = await kv.smembers('lic-flagged');
        const lics = (await Promise.all(keys.map(getLicence))).filter(Boolean);
        return res.status(200).json({ licences: await Promise.all(lics.map(withLog)) });
      }
      const q = String(req.query?.q || '').trim();
      if (!q) return res.status(400).json({ error: 'Search by email or key.' });
      const keys = normKey(q) ? [normKey(q)] : await keysForEmail(q);
      const lics = (await Promise.all(keys.map(getLicence))).filter(Boolean);
      return res.status(200).json({ licences: await Promise.all(lics.map(withLog)) });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const b = req.body || {};

    if (b.action === 'publish') {
      const files = Array.isArray(b.files) ? b.files : [];
      const bad = files.find((f) => !PATH.test(f.path || '') || f.path.includes('..') || typeof f.content !== 'string');
      if (bad) return res.status(400).json({ error: `Bad file: ${bad.path}` });
      for (const f of files) {
        await kv.set(`course:f:${f.path}`, f.content);
        await kv.sadd('course:paths', f.path);
      }
      await kv.set('course:published', new Date().toISOString());
      return res.status(200).json({ ok: true, published: files.length });
    }
    if (b.action === 'unpublish') {
      const paths = (b.paths || []).filter((p) => PATH.test(p));
      for (const p of paths) { await kv.del(`course:f:${p}`); await kv.srem('course:paths', p); }
      return res.status(200).json({ ok: true, removed: paths.length });
    }
    if (b.action === 'create') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email || ''))) return res.status(400).json({ error: 'Email needed.' });
      const lic = await createLicence({ email: b.email, name: b.name, source: 'manual' });
      // Same welcome email as a paying student (Kit automation on the student tag).
      let emailed = true;
      try {
        await subscribe({ address: lic.email, firstName: String(b.name || '').split(' ')[0], page: 'admin', fields: { 'Course key': lic.key }, tags: [STUDENT_TAG] });
      } catch (err) { emailed = false; console.error('license-admin create: Kit', err.message); }
      return res.status(200).json({ ok: true, licence: lic, emailed });
    }

    const lic = await getLicence(b.key);
    if (!lic) return res.status(404).json({ error: 'No licence with that key.' });
    if (b.action === 'revoke') await setStatus(lic, 'revoked', String(b.reason || 'by Katie').slice(0, 120));
    else if (b.action === 'restore') await setStatus(lic, 'active');
    else if (b.action === 'clear_devices') { lic.devices = []; await saveLicence(lic); }
    else if (b.action === 'unflag') { lic.flags = []; await saveLicence(lic); await kv.srem('lic-flagged', lic.key); }
    else return res.status(400).json({ error: 'Unknown action.' });
    return res.status(200).json({ ok: true, licence: { ...lic, view: studentView(lic) } });
  } catch (err) {
    console.error('license-admin:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
