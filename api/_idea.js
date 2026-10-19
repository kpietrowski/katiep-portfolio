// Shared pieces of the App Idea Report Card (katiep.me/idea).
// Files in /api that start with "_" are not routes.
//
// Env: OPENAI_API_KEY, KV_REST_API_URL + KV_REST_API_TOKEN (Vercel KV / Upstash).
// Optional: OPENAI_IDEA_MODEL (default tries gpt-5-mini, then older models).

import crypto from 'node:crypto';
import { createClient } from '@vercel/kv';

// Find the Upstash/Vercel KV REST credentials whatever prefix the integration
// used: KV_REST_API_URL, STORAGE_KV_REST_API_URL, UPSTASH_REDIS_REST_URL, …
export function kvEnv() {
  const env = process.env;
  const urlKey = Object.keys(env).find((k) => /(^|_)KV_REST_API_URL$/.test(k))
    || Object.keys(env).find((k) => /(^|_)UPSTASH_REDIS_REST_URL$/.test(k));
  if (!urlKey) return null;
  const tokenKey = urlKey.replace(/_URL$/, '_TOKEN');
  return env[tokenKey] ? { url: env[urlKey], token: env[tokenKey] } : null;
}

// Names (never values) of anything that looks like storage config, for diagnosing.
export const kvEnvNames = () => Object.keys(process.env).filter((k) => /KV|REDIS|UPSTASH/.test(k));

let client;
const kv = new Proxy({}, {
  get(_, prop) {
    if (!client) {
      const c = kvEnv();
      if (!c) throw new Error('KV not configured');
      client = createClient(c);
    }
    const v = client[prop];
    return typeof v === 'function' ? v.bind(client) : v;
  },
});

export const REPORT_TTL = 60 * 60 * 24 * 365; // keep reports for a year
export const reportKey = (id) => `idea:${id}`;
export const newId = () => crypto.randomBytes(9).toString('base64url'); // 12 url-safe chars

export async function saveReport(report) {
  await kv.set(reportKey(report.id), JSON.stringify(report), { ex: REPORT_TTL });
}

export async function loadReport(id) {
  if (!/^[A-Za-z0-9_-]{8,20}$/.test(String(id || ''))) return null;
  const raw = await kv.get(reportKey(id));
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

// Simple per-IP limit so nobody can run up the AI bill.
// Generic storage for the other freebies (design kits, …), same TTL.
export async function saveDoc(prefix, doc) {
  await kv.set(`${prefix}:${doc.id}`, JSON.stringify(doc), { ex: REPORT_TTL });
}
export async function loadDoc(prefix, id) {
  if (!/^[A-Za-z0-9_-]{8,20}$/.test(String(id || ''))) return null;
  const raw = await kv.get(`${prefix}:${id}`);
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

export async function overLimit(ip, max = 6, prefix = 'idea-rl') {
  const key = `${prefix}:${ip}:${Math.floor(Date.now() / 3.6e6)}`;
  const n = await kv.incr(key);
  if (n === 1) await kv.expire(key, 3600);
  return n > max;
}

// ---------- OpenAI (JSON mode), with a model fallback chain ----------

const MODELS = [process.env.OPENAI_IDEA_MODEL, 'gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o-mini'].filter(Boolean);

export async function askJSON(system, user) {
  let lastErr;
  for (const model of [...new Set(MODELS)]) {
    const body = {
      model,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    };
    if (model.startsWith('gpt-5')) body.reasoning_effort = 'low';
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const j = await r.json();
      return JSON.parse(j.choices[0].message.content);
    }
    const text = await r.text().catch(() => '');
    lastErr = new Error(`OpenAI ${model} ${r.status}: ${text.slice(0, 200)}`);
    // Only fall back when the model itself is the problem (unknown / no access).
    if (![400, 403, 404].includes(r.status) || !/model/i.test(text)) throw lastErr;
  }
  throw lastErr;
}

// Shared by the idea report and the design kit.
export const SEARCH_SYSTEM = `You turn an iPhone app idea into App Store search terms.
Return JSON: {"search_terms": [3 short phrases a person would type into the App Store search box to find apps that solve this problem, most specific first, 1-4 words each]}.`;

// ---------- Apple: public search + public reviews feed ----------

async function getJSON(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'katiep.me idea report' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

export async function findCompetitors(terms) {
  const lists = await Promise.all(terms.slice(0, 3).map((t) =>
    getJSON(`https://itunes.apple.com/search?term=${encodeURIComponent(t)}&entity=software&country=us&limit=12`)
      .then((j) => j.results || []).catch(() => [])));
  const byId = new Map();
  lists.forEach((list) => list.forEach((a, rank) => {
    const cur = byId.get(a.trackId) || { app: a, hits: 0, bestRank: 99 };
    cur.hits += 1;
    cur.bestRank = Math.min(cur.bestRank, rank);
    byId.set(a.trackId, cur);
  }));
  const scored = [...byId.values()].map((x) => ({
    ...x,
    score: x.hits * 3 + Math.log10((x.app.userRatingCount || 0) + 1) * 2 - x.bestRank * 0.3,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 5).map(({ app }) => ({
    id: app.trackId,
    name: app.trackName,
    seller: app.sellerName || app.artistName,
    url: app.trackViewUrl,
    icon: app.artworkUrl100,
    icon512: app.artworkUrl512 || app.artworkUrl100,
    screenshots: (app.screenshotUrls || []).slice(0, 2),
    rating: app.averageUserRating ? Math.round(app.averageUserRating * 10) / 10 : null,
    ratings: app.userRatingCount || 0,
    price: app.formattedPrice || (app.price ? `$${app.price}` : 'Free'),
    genre: app.primaryGenreName,
    description: String(app.description || '').slice(0, 600),
  }));
}

const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

export async function getReviews(appId) {
  const pages = [
    `https://itunes.apple.com/us/rss/customerreviews/page=1/id=${appId}/sortby=mosthelpful/json`,
    `https://itunes.apple.com/us/rss/customerreviews/page=2/id=${appId}/sortby=mosthelpful/json`,
    `https://itunes.apple.com/us/rss/customerreviews/page=1/id=${appId}/sortby=mostrecent/json`,
  ];
  const feeds = await Promise.all(pages.map((u) => getJSON(u).catch(() => ({}))));
  const seen = new Set();
  const all = [];
  feeds.forEach((f) => (f.feed?.entry || []).forEach((e) => {
    const id = e.id?.label;
    if (!id || seen.has(id)) return;
    seen.add(id);
    const stars = Number(e['im:rating']?.label);
    if (!stars) return;
    all.push({ stars, title: clip(e.title?.label, 80), text: clip(e.content?.label, 320) });
  }));
  return {
    sampled: all.length,
    low: all.filter((r) => r.stars <= 2).slice(0, 18),
    high: all.filter((r) => r.stars === 5).slice(0, 12),
  };
}

// ---------- Markdown export (what the Day 1 course skill reads) ----------

export function toMarkdown(rep) {
  const a = rep.analysis;
  const lines = [];
  lines.push(`# App Idea Report Card`, '');
  lines.push(`Made at katiep.me/idea on ${rep.created.slice(0, 10)}. Report link: https://katiep.me/idea/report?id=${rep.id}`, '');
  lines.push(`## The idea, as entered`, '', ...(rep.input.idea ? [rep.input.idea] : [`**Problem:** ${rep.input.problem}`, '', `**How the app solves it:** ${rep.input.solution}`]), '');
  lines.push(`## One sentence`, '', a.idea_sentence, '');
  lines.push(`## Grades`, '', `- Build: ${a.build.grade} (${a.build.label}) — ${a.build.why}`, `- Compete: ${a.compete.grade} (${a.compete.label}) — ${a.compete.why}`, '');
  lines.push(`## Verdict`, '', a.verdict, '');
  lines.push(`## Competitors`, '', '| App | Rating | Ratings | Price | Loved for | Complaints |', '| --- | --- | --- | --- | --- | --- |');
  rep.competitors.forEach((c) => {
    const n = (a.competitors || []).find((x) => x.name === c.name) || {};
    lines.push(`| [${c.name}](${c.url}) | ${c.rating ?? '–'} | ${c.ratings.toLocaleString('en-US')} | ${c.price} | ${n.loved_for || ''} | ${n.complaints || ''} |`);
  });
  lines.push('');
  lines.push(`## What people love`, '', ...a.love.map((t) => `- **${t.theme}:** ${t.detail}`), '');
  lines.push(`## What people hate`, '', ...a.hate.map((t) => `- **${t.theme}:** ${t.detail}`), '');
  lines.push(`## Their words`, '', ...(a.their_words || []).map((w) => `- "${w}"`), '');
  lines.push(`## The opening`, '', a.opening, '');
  lines.push(`## Opportunities`, '', ...a.opportunities.map((o) => `- **${o.title}:** ${o.why}`), '');
  lines.push(`## A first version you could build in 30 days`, '', ...a.first_version.map((f) => `- ${f}`), '');
  lines.push(`## Pricing signals`, '', a.price_signals, '');
  lines.push(`## Watch out for`, '', a.watch_out, '');
  lines.push(`_Based on ${rep.reviews_sampled} recent and most-helpful App Store reviews of the apps above. The grades are an informed estimate, not a promise._`);
  return lines.join('\n');
}
