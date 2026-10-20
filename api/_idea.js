// Shared pieces of the App Idea Engine (katiep.me/idea).
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

export { kv }; // shared with the course licence code

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
// Generic storage for the other freebies (design systems, …), same TTL.
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

// Shared by the idea audit and the design system.
export const SEARCH_SYSTEM = `You turn an iPhone app idea into App Store search terms.
Return JSON: {"search_terms": [3 short phrases a person would type into the App Store search box to find apps that solve this problem, most specific first, 1-4 words each]}.`;

// ---------- Apple: public search + public reviews feed ----------

async function getJSON(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'katiep.me idea audit' } });
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
    priceValue: Number(app.price) || 0,
    released: app.releaseDate || null,
    genre: app.primaryGenreName,
    description: String(app.description || '').slice(0, 600),
  }));
}

// ---------- Revenue estimate ----------
// Apple doesn't publish what apps earn. This is a rough, explainable estimate
// from public signals: US rating count, months on the App Store, the upfront
// price and the in-app purchase prices listed on the app's App Store page.
//   monthly US downloads ≈ ratings × 100 (or × 40 for paid apps) ÷ months live (6–48)
//   subscriptions: 2–5% of downloaders pay; each is worth ~1.3 × the yearly
//   price (or 5 × monthly, or 10 × weekly) in its first year
//   one-time purchases: 2–5% × the typical purchase price
//   paid apps: downloads × price (0.6–1.2×)
// Gross, before Apple's cut. Shown as a range and labelled as an estimate.

export async function getInAppPurchases(appId) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 7000);
  try {
    const r = await fetch(`https://apps.apple.com/us/app/id${appId}`, {
      signal: ctl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', 'Accept-Language': 'en-US' },
    });
    if (!r.ok) return null;
    const html = await r.text();
    const i = html.indexOf('>In-App Purchases<');
    // No list: only trust "nothing to buy" if the page layout is what we expect.
    if (i < 0) return html.includes('>Age Rating<') && html.includes('>Category<') ? [] : null;
    const block = html.slice(i, html.indexOf('</ul>', i) + 5);
    const out = [];
    const re = /<span>([^<]{1,90})<\/span>\s*<span>\$([\d,]+\.\d{2})<\/span>/g;
    let m;
    while ((m = re.exec(block)) && out.length < 12) out.push({ name: m[1].replace(/&amp;/g, '&').trim(), price: Number(m[2].replace(/,/g, '')) });
    return out;
  } catch {
    return null; // unknown, not "none"
  } finally {
    clearTimeout(t);
  }
}

export const round2 = (n) => { if (n < 100) return Math.round(n); const p = 10 ** (Math.floor(Math.log10(n)) - (n >= 1e5 ? 0 : 1)); return Math.round(n / p) * p; };
export function money(n) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '')}K`;
  return `$${Math.round(n)}`;
}

export function estimateRevenue(c, iaps) {
  // Ratings pile up over an app's whole life; count at most the last 4 years.
  const months = Math.min(48, Math.max(6, c.released ? (Date.now() - Date.parse(c.released)) / 2.63e9 : 24));
  const paid = c.priceValue > 0;
  const downloads = (c.ratings || 0) * (paid ? 40 : 100) / months;
  const plan = (re) => (iaps || []).filter((x) => re.test(x.name) && x.price > 0).sort((a, b) => b.price - a.price)[0];
  const yearly = plan(/annual|year|12[ -]?month/i);
  const monthly = !yearly && plan(/month/i);
  const weekly = !yearly && !monthly && plan(/week/i);
  let low = 0, high = 0, basis, model;
  if (paid) {
    basis = 'paid'; model = { name: 'Paid app', price: c.priceValue };
    low = downloads * c.priceValue * 0.6; high = downloads * c.priceValue * 1.2;
  } else if (yearly || monthly || weekly) {
    basis = 'subscription';
    model = yearly || monthly || weekly;
    const value = yearly ? yearly.price * 1.3 : monthly ? monthly.price * 5 : weekly.price * 10;
    low = downloads * 0.02 * value; high = downloads * 0.05 * value;
  } else if (iaps && iaps.length) {
    basis = 'purchases';
    const prices = iaps.map((x) => x.price).filter((x) => x > 0).sort((a, b) => a - b);
    model = { name: 'In-app purchases', price: prices[Math.floor(prices.length / 2)] || 0 };
    low = downloads * 0.02 * model.price; high = downloads * 0.05 * model.price;
  } else if (iaps) {
    basis = 'free'; model = null; // free, nothing to buy
  } else {
    return null; // couldn't read the App Store page
  }
  return {
    basis, plan: model, months: Math.round(months), downloads: round2(downloads),
    low: round2(low), high: round2(high),
    label: basis === 'free' ? 'Free, nothing to buy' : high < 100 ? 'Under $100/mo' : `${money(round2(low))}–${money(round2(high))}/mo`,
  };
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
  lines.push(`# App Idea Engine`, '');
  lines.push(`Made at katiep.me/idea on ${rep.created.slice(0, 10)}. Report link: https://katiep.me/idea/report?id=${rep.id}`, '');
  lines.push(`## The idea, as entered`, '', ...(rep.input.idea ? [rep.input.idea] : [`**Problem:** ${rep.input.problem}`, '', `**How the app solves it:** ${rep.input.solution}`]), '');
  lines.push(`## One sentence`, '', a.idea_sentence, '');
  lines.push(`## Grades`, '', `- Build: ${a.build.grade} (${a.build.label}) — ${a.build.why}`, `- Compete: ${a.compete.grade} (${a.compete.label}) — ${a.compete.why}`, '');
  lines.push(`## Verdict`, '', a.verdict, '');
  lines.push(`## Competitors`, '');
  if (rep.market) lines.push(`Together these apps make an estimated **${rep.market.label}** on the US App Store (before Apple's cut). Rough estimate from ratings, time on the App Store and their prices; Apple doesn't publish real figures.`, '');
  lines.push('| App | Rating | Ratings | Price / plans | Est. revenue | Loved for | Complaints |', '| --- | --- | --- | --- | --- | --- | --- |');
  rep.competitors.forEach((c) => {
    const n = (a.competitors || []).find((x) => x.name === c.name) || {};
    const plans = (c.plans || []).map((x) => `${x.name} $${x.price}`).join('; ') || c.price;
    lines.push(`| [${c.name}](${c.url}) | ${c.rating ?? '–'} | ${c.ratings.toLocaleString('en-US')} | ${plans} | ${c.revenue?.label || '–'} | ${n.loved_for || ''} | ${n.complaints || ''} |`);
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
