// GET /api/course?path=app30-pricing/SKILL.md   → that course file (text)
// GET /api/course?list=app30-website-and-privacy → { files: [...] } under that skill
// GET /api/course?check=1                        → { ok, devices… } (Day 0 activation)
//
// Headers (sent by ~/.app30/fetch.sh):
//   Authorization: Bearer APP30-XXXX-XXXX-XXXX
//   X-App30-Device: random id saved on the student's computer
//   X-App30-Label:  the computer's name, so students can recognise it
//   X-App30-Cloud:  1 in Claude Code on the web (doesn't use up a computer)

import { kv } from './_idea.js';
import { getLicence, saveLicence, flag, hashIp, clientIp, MAX_DEVICES, studentView } from './_license.js';

const PATH = /^app30-[a-z0-9-]+\/[A-Za-z0-9._\/-]{1,160}$/;
const MANY_PLACES = 8;   // different networks in one day
const MANY_CLOUD = 40;   // cloud fetches in one day

const deny = (res, status, code, message) => res.status(status).json({ error: code, message });

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');

  const auth = String(req.headers.authorization || '');
  const lic = await getLicence(auth.replace(/^Bearer\s+/i, '')).catch(() => null);
  if (!lic) return deny(res, 401, 'bad_key', "That course key isn't right. Check the key in your welcome email, or get it again at katiep.me/app/devices.");
  if (lic.status !== 'active') return deny(res, 403, 'revoked', 'This course key has been switched off. If you think that is a mistake, email katie@katiepietrowski.com.');

  const device = String(req.headers['x-app30-device'] || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
  const label = String(req.headers['x-app30-label'] || 'A computer').replace(/[^\w .'’()-]/g, '').slice(0, 60) || 'A computer';
  const cloud = req.headers['x-app30-cloud'] === '1';
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const ipHash = hashIp(clientIp(req));

  // Computers: up to 3. Cloud sessions don't count.
  let changed = false;
  if (!cloud) {
    if (device.length < 16) return deny(res, 400, 'no_device', 'Run the Day 0 setup again so this computer gets its ID.');
    const known = lic.devices.find((d) => d.id === device);
    if (known) {
      if (known.last.slice(0, 10) !== today) { known.last = now; changed = true; }
    } else if (lic.devices.length < MAX_DEVICES) {
      lic.devices.push({ id: device, label, first: now, last: now });
      changed = true;
    } else {
      await flag(lic, 'tried a 4th computer');
      return deny(res, 403, 'device_limit',
        `This key is already on ${MAX_DEVICES} computers. You can clear them once a month at katiep.me/app/devices, then try again.`);
    }
  }
  if (changed) await saveLicence(lic);

  // Usage, for spotting shared keys (hashed IPs only).
  const logUse = (what) => kv.lpush(`lic-log:${lic.key}`, JSON.stringify({ t: now, what: String(what).slice(0, 120), device: cloud ? 'cloud' : device.slice(0, 8), ip: ipHash.slice(0, 8) }))
    .then(() => kv.ltrim(`lic-log:${lic.key}`, 0, 299));
  const dayKey = `lic-day:${lic.key}:${today}`;
  await kv.sadd(dayKey, ipHash);
  await kv.expire(dayKey, 3 * 86400);
  if ((await kv.scard(dayKey)) > MANY_PLACES) await flag(lic, `used from more than ${MANY_PLACES} networks in a day`);
  if (cloud) {
    const c = await kv.incr(`lic-cloud:${lic.key}:${today}`);
    if (c === 1) await kv.expire(`lic-cloud:${lic.key}:${today}`, 3 * 86400);
    if (c > MANY_CLOUD) await flag(lic, `more than ${MANY_CLOUD} cloud fetches in a day`);
  }

  if (req.query?.check) { await logUse('check'); const { key, ...view } = studentView(lic); return res.status(200).json({ ok: true, ...view, name: lic.name }); }

  if (req.query?.list) {
    const skill = String(req.query.list);
    if (!/^app30-[a-z0-9-]+$/.test(skill)) return deny(res, 400, 'bad_path', 'Unknown course step.');
    await logUse(`list:${skill}`);
    const all = await kv.smembers('course:paths');
    return res.status(200).json({ files: all.filter((p) => p.startsWith(`${skill}/`)).sort() });
  }

  const path = String(req.query?.path || '');
  if (!PATH.test(path) || path.includes('..')) return deny(res, 400, 'bad_path', 'Unknown course file.');
  const file = await kv.get(`course:f:${path}`);
  if (file == null) return deny(res, 404, 'not_found', `There's no course file called ${path}.`);
  await logUse(path);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(200).send(typeof file === 'string' ? file : JSON.stringify(file));
}
