// POST /api/design-generate  { app, idea?, company? }
// Step 1 of the App Design Engine. `app` is one free-text answer (typed or
// spoken): what the app is and who it's for. No style picker: the AI chooses
// the look from the topic and from studying the top competitors' icons and
// screenshots on the App Store (inspiration, never copying).
// Builds names, palette, fonts, icon and screen copy, checks names against the
// App Store and colours for readability, stores the kit (locked) and returns
// { id, teaser }. `idea` is an optional App Idea Engine id.

import { newId, saveDoc, overLimit, askJSON, kvEnv, loadReport, findCompetitors, SEARCH_SYSTEM } from './_idea.js';
import { FONTS, ICONS, fixPalette, nameClash } from './_design.js';

const HEX = /^#[0-9A-Fa-f]{6}$/;

const SYSTEM = `You are Katie Pietrowski's App Design Engine. Katie teaches non-technical people to build a simple, paid iPhone app in 30 days. You create a starter brand kit for the visitor's app: a visual style, names, colours, fonts, an icon and the words on three key screens. Make it feel specific to THIS app and THIS person, never generic.

How to choose the look:
- Start from the topic and the person using the app: how should they feel when they open it (calm, energised, safe, delighted, focused)?
- You may get the top competing apps on the App Store, with their icons and screenshots. Study them like a designer: what colours and styles this category uses, what signals trust here, what looks dated or crowded. Take notes and inspiration, then choose a look that clearly belongs in the category but stands apart.
- Never copy a competitor: do not reuse the main colour pairing or icon idea of any competitor shown, and make the accent clearly different from the biggest competitor's.
- Choose ONE clear style and stay true to it across palette, fonts and icon.

Rules:
- "style": a 2-4 word name for the look you chose, e.g. "Soft & calm", "Bold & playful", "Clean & minimal", "Warm & earthy".
- Names: 5 ideas. Short (1-2 words), easy to say and spell, no hyphens or numbers, not an existing famous brand and not a competitor's name. Each with a one-line "why".
- Palette: hex colours for light AND dark mode. "text" must be very readable on "background"; "accentText" (button label, usually #FFFFFF) must be readable on "accent". Background should rarely be pure #FFFFFF or #000000.
- Fonts: pick "heading" and "body" ONLY from this list: ${FONTS.join(', ')}. "system_fallback": "SF Pro Rounded", "SF Pro" or "New York" (iPhone's built-in fonts), whichever is closest in feel.
- Icon: "glyph" ONLY from this list: ${ICONS.join(', ')}. "background": "gradient" or "solid". "note": one sentence on why this symbol.
- Screens follow Katie's method:
  - launch: a tagline of 3-7 words.
  - onboarding: ONE question the user would obviously expect this app to ask (never "why are they asking me this?"), a short "why we ask" line, and 3-4 answers in the user's own words.
  - paywall: a headline that names the outcome, 3 short benefits, two plans (yearly first and marked "Best value", plus weekly or monthly), a free-trial line, and a button label. Prices are examples only.
- "personality": 2 sentences describing the brand's feel. "adjectives": 3 words.
- "inspiration": only about the competitors you were shown (empty "apps" if none). Use their exact names. "colors": 2-3 hex colours you see in their icon and screens. "takeaway": one short note, what works or what to avoid. Plain, friendly words.

Return JSON exactly:
{
  "style": "",
  "personality": "...", "adjectives": ["", "", ""],
  "inspiration": {
    "category": "1-2 sentences: what apps in this space tend to look like",
    "apps": [{"name": "", "colors": ["#", "#"], "takeaway": ""}],
    "standout": "1-2 sentences: how your look fits the category but stands apart"
  },
  "names": [{"name": "", "why": ""}],
  "palette": {
    "light": {"background": "#", "card": "#", "text": "#", "secondary": "#", "accent": "#", "accentText": "#"},
    "dark":  {"background": "#", "card": "#", "text": "#", "secondary": "#", "accent": "#", "accentText": "#"}
  },
  "fonts": {"heading": "", "body": "", "system_fallback": ""},
  "icon": {"glyph": "", "background": "gradient", "note": ""},
  "screens": {
    "launch": {"tagline": ""},
    "onboarding": {"question": "", "why": "", "answers": ["", "", ""]},
    "paywall": {"headline": "", "benefits": ["", "", ""], "plans": [{"label": "Yearly", "price": "", "note": "Best value"}, {"label": "", "price": "", "note": ""}], "trial": "", "cta": ""}
  }
}`;

const clean = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

// The user message: text, plus each competitor's icon and first screenshot.
function buildMessage(text, comps, withImages) {
  if (!comps.length) return text;
  const list = comps.map((c, i) => `${i + 1}. ${c.name} by ${c.seller} (${c.ratings.toLocaleString('en-US')} ratings, ${c.rating ?? '–'}★, ${c.price}, ${c.genre})`).join('\n');
  const intro = `${text}\n\nTOP COMPETITORS ON THE APP STORE\n${list}`;
  if (!withImages) return intro + '\n\n(Images unavailable: judge from the names and category.)';
  const parts = [{ type: 'text', text: intro + '\n\nTheir icons and screenshots follow, in the same order.' }];
  comps.forEach((c, i) => {
    parts.push({ type: 'text', text: `${i + 1}. ${c.name}` });
    [c.icon512, (c.screenshots || [])[0]].filter(Boolean).forEach((url) => parts.push({ type: 'image_url', image_url: { url, detail: 'low' } }));
  });
  return parts;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.body?.company) return res.status(200).json({ id: 'ok' }); // honeypot

  const app = clean([req.body?.app, req.body?.audience].filter(Boolean).join(' '), 3000);
  if (app.length < 25) return res.status(400).json({ error: 'Tell me a little more: what does your app do, and who is it for?' });

  const missing = [!process.env.OPENAI_API_KEY && 'OPENAI_API_KEY', !kvEnv() && 'KV storage'].filter(Boolean);
  if (missing.length) return res.status(500).json({ error: 'Not configured', missing });

  let stage = 'limit';
  try {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    if (await overLimit(ip, 6, 'design-rl')) {
      return res.status(429).json({ error: "You've made a lot of kits this hour. Please try again a little later." });
    }

    // Optional: their App Idea Engine (its findings and search terms).
    let ideaContext = '';
    let terms = null;
    if (req.body?.idea) {
      stage = 'idea';
      const rep = await loadReport(req.body.idea).catch(() => null);
      if (rep?.unlocked) {
        const a = rep.analysis;
        terms = rep.search_terms;
        ideaContext = `\n\nFROM THEIR APP IDEA REPORT CARD\nOne sentence: ${a.idea_sentence}\nThe opening: ${a.opening}\nTheir users' words: ${(a.their_words || []).join(' | ')}`;
      }
    }

    stage = 'competitors';
    if (!terms?.length) {
      terms = (await askJSON(SEARCH_SYSTEM, app).catch(() => ({}))).search_terms || [];
    }
    const comps = terms.length ? (await findCompetitors(terms).catch(() => [])).slice(0, 4) : [];

    stage = 'generate';
    const text = `THE APP AND WHO IT'S FOR (typed or spoken, so it may ramble: find the core of it)\n${app}${ideaContext}`;
    let brand;
    try {
      brand = await askJSON(SYSTEM, buildMessage(text, comps, true));
    } catch (err) {
      // An image Apple wouldn't serve shouldn't sink the kit: retry without images.
      if (!comps.length) throw err;
      console.error('design-generate: retrying without images:', err.message);
      brand = await askJSON(SYSTEM, buildMessage(text, comps, false));
    }

    // Make it safe to render and to put in an app.
    stage = 'check';
    brand.style = clean(brand.style, 40) || 'Clean & simple';
    brand.palette = {
      light: fixPalette(brand.palette?.light, '#FBF8F4'),
      dark: fixPalette(brand.palette?.dark, '#161618'),
    };
    brand.fonts = brand.fonts || {};
    if (!FONTS.includes(brand.fonts.heading)) brand.fonts.heading = 'DM Sans';
    if (!FONTS.includes(brand.fonts.body)) brand.fonts.body = 'DM Sans';
    brand.icon = brand.icon || {};
    if (!ICONS.includes(brand.icon.glyph)) { brand.icon.glyph = 'sparkles'; brand.icon.note = ''; }

    // Inspiration: keep only apps we actually showed, with OUR icon and link.
    const insp = brand.inspiration || {};
    const said = (insp.apps || []).filter((x) => x && x.name);
    const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    brand.inspiration = {
      category: clean(insp.category, 400),
      standout: clean(insp.standout, 400),
      apps: comps.map((c) => {
        const m = said.find((x) => key(x.name) === key(c.name))
          || said.find((x) => key(c.name).startsWith(key(x.name).slice(0, 10)) || key(x.name).startsWith(key(c.name).slice(0, 10)));
        return {
          name: c.name, icon: c.icon, url: c.url,
          colors: (m?.colors || []).filter((h) => HEX.test(h)).slice(0, 3),
          takeaway: clean(m?.takeaway, 200),
        };
      }).filter((a) => a.takeaway || a.colors.length),
    };

    brand.names = (brand.names || []).slice(0, 5).filter((n) => n && n.name);
    const checks = await Promise.all(brand.names.map((n) => nameClash(n.name)));
    brand.names.forEach((n, i) => { n.check = checks[i]; });

    const kit = {
      id: newId(),
      created: new Date().toISOString(),
      input: { app, idea: ideaContext ? req.body.idea : undefined },
      brand,
      unlocked: false,
    };
    stage = 'save';
    await saveDoc('design', kit);

    return res.status(200).json({
      id: kit.id,
      teaser: { name: brand.names[0]?.name, accent: brand.palette.light.accent, competitors: brand.inspiration.apps.length },
    });
  } catch (err) {
    console.error(`design-generate [${stage}]:`, err.message);
    return res.status(502).json({ error: "Your design system couldn't finish just now. Please try again in a minute.", stage });
  }
}
