// POST /api/design-generate  { app, style, idea?, company? }
// `app` is one free-text answer (typed or spoken): what the app is and who it's for.
// Step 1 of the App Design Builder. Builds a brand kit (names, palette, fonts,
// icon, screen copy), checks the names against the App Store and the colours
// for readability, and stores it (locked). Returns { id, teaser }.
// `idea` is an optional App Idea Report Card id: its findings are used too.

import { newId, saveDoc, overLimit, askJSON, kvEnv, loadReport } from './_idea.js';
import { STYLES, FONTS, ICONS, fixPalette, nameClash } from './_design.js';

const SYSTEM = `You are Katie Pietrowski's App Design Builder. Katie teaches non-technical people to build a simple, paid iPhone app in 30 days. You create a starter brand kit for the visitor's app: names, colours, fonts, an icon and the words on three key screens. Make it feel specific to THIS app and THIS person, never generic.

Rules:
- Names: 5 ideas. Short (1-2 words), easy to say and spell, no hyphens or numbers, not an existing famous brand. Each with a one-line "why".
- Palette: hex colours for light AND dark mode. "text" must be very readable on "background"; "accentText" (button label, usually #FFFFFF) must be readable on "accent". Background should rarely be pure #FFFFFF or #000000. Stay true to the chosen style.
- Fonts: pick "heading" and "body" ONLY from this list: ${FONTS.join(', ')}. "system_fallback": "SF Pro Rounded", "SF Pro" or "New York" (iPhone's built-in fonts), whichever is closest in feel.
- Icon: "glyph" ONLY from this list: ${ICONS.join(', ')}. "background": "gradient" or "solid". "note": one sentence on why this symbol.
- Screens follow Katie's method:
  - launch: a tagline of 3-7 words.
  - onboarding: ONE question the user would obviously expect this app to ask (never "why are they asking me this?"), a short "why we ask" line, and 3-4 answers in the user's own words.
  - paywall: a headline that names the outcome, 3 short benefits, two plans (yearly first and marked "best value", plus weekly or monthly), a free-trial line, and a button label. Prices are examples only.
- "personality": 2 sentences describing the brand's feel. "adjectives": 3 words.

Return JSON exactly:
{
  "personality": "...", "adjectives": ["", "", ""],
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.body?.company) return res.status(200).json({ id: 'ok' }); // honeypot

  const app = clean([req.body?.app, req.body?.audience].filter(Boolean).join(' '), 3000);
  const style = STYLES[req.body?.style] ? req.body.style : null;
  if (app.length < 25) return res.status(400).json({ error: 'Tell me a little more: what does your app do, and who is it for?' });
  if (!style) return res.status(400).json({ error: 'Pick a style you like.' });

  const missing = [!process.env.OPENAI_API_KEY && 'OPENAI_API_KEY', !kvEnv() && 'KV storage'].filter(Boolean);
  if (missing.length) return res.status(500).json({ error: 'Not configured', missing });

  let stage = 'limit';
  try {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    if (await overLimit(ip, 6, 'design-rl')) {
      return res.status(429).json({ error: "You've made a lot of kits this hour. Please try again a little later." });
    }

    let ideaContext = '';
    if (req.body?.idea) {
      stage = 'idea';
      const rep = await loadReport(req.body.idea).catch(() => null);
      if (rep?.unlocked) {
        const a = rep.analysis;
        ideaContext = `\n\nFROM THEIR APP IDEA REPORT CARD\nOne sentence: ${a.idea_sentence}\nThe opening: ${a.opening}\nTheir users' words: ${(a.their_words || []).join(' | ')}\nCompetitors: ${rep.competitors.map((c) => c.name).join(', ')} (avoid names that sound like these)`;
      }
    }

    stage = 'generate';
    const s = STYLES[style];
    const brand = await askJSON(SYSTEM,
      `THE APP AND WHO IT'S FOR (typed or spoken, so it may ramble: find the core of it)\n${app}\n\nCHOSEN STYLE: ${s.label} — ${s.hint}${ideaContext}`);

    // Make it safe to render and to put in an app.
    stage = 'check';
    brand.palette = {
      light: fixPalette(brand.palette?.light, '#FBF8F4'),
      dark: fixPalette(brand.palette?.dark, '#161618'),
    };
    brand.fonts = brand.fonts || {};
    if (!FONTS.includes(brand.fonts.heading)) brand.fonts.heading = 'DM Sans';
    if (!FONTS.includes(brand.fonts.body)) brand.fonts.body = 'DM Sans';
    brand.icon = brand.icon || {};
    if (!ICONS.includes(brand.icon.glyph)) { brand.icon.glyph = 'sparkles'; brand.icon.note = ''; }
    brand.names = (brand.names || []).slice(0, 5).filter((n) => n && n.name);
    const checks = await Promise.all(brand.names.map((n) => nameClash(n.name)));
    brand.names.forEach((n, i) => { n.check = checks[i]; });

    const kit = {
      id: newId(),
      created: new Date().toISOString(),
      input: { app, style, idea: ideaContext ? req.body.idea : undefined },
      brand,
      unlocked: false,
    };
    stage = 'save';
    await saveDoc('design', kit);

    return res.status(200).json({
      id: kit.id,
      teaser: { name: brand.names[0]?.name, accent: brand.palette.light.accent, background: brand.palette.light.background },
    });
  } catch (err) {
    console.error(`design-generate [${stage}]:`, err.message);
    return res.status(502).json({ error: "I couldn't finish your design kit just now. Please try again in a minute.", stage });
  }
}
