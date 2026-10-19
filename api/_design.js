// Shared pieces of the App Design Builder (katiep.me/design).
// Files in /api that start with "_" are not routes.

export const STYLES = {
  'soft-calm':     { label: 'Soft & calm',     hint: 'gentle pastels, lots of breathing room, rounded shapes, a soft serif or rounded sans; reassuring' },
  'bold-playful':  { label: 'Bold & playful',  hint: 'saturated, joyful colours, chunky rounded type, big friendly shapes; energetic' },
  'clean-minimal': { label: 'Clean & minimal', hint: 'mostly white or off-white with near-black text and ONE confident accent; precise sans-serif; calm and focused' },
  'warm-earthy':   { label: 'Warm & earthy',   hint: 'terracotta, sand, olive, cream; an elegant serif; cosy and grounded' },
  'dark-sleek':    { label: 'Dark & sleek',    hint: 'deep dark background, one luminous accent, geometric sans; premium and modern. The LIGHT palette is still needed but can be a quieter version' },
  'bright-fresh':  { label: 'Bright & fresh',  hint: 'clean white with fresh greens, aquas or citrus; geometric sans; optimistic and healthy' },
};

// Google Fonts the kit may use (all free for commercial use).
export const FONTS = ['Fraunces', 'Lora', 'Playfair Display', 'DM Serif Display', 'Fredoka', 'Baloo 2', 'Poppins',
  'Outfit', 'Manrope', 'Inter', 'Inter Tight', 'Space Grotesk', 'Sora', 'Nunito', 'DM Sans', 'Karla', 'Lato',
  'Work Sans', 'Quicksand', 'Rubik'];

// Lucide icons (ISC licence), loaded on the kit page from lucide-static@0.460.0.
export const ICONS = 'heart baby timer clock moon sun star sparkles leaf flower flower-2 sprout droplet waves flame zap book-open graduation-cap pencil notebook-pen camera image video mic music headphones message-circle users user house shopping-cart wallet piggy-bank dollar-sign chart-line dumbbell activity bike footprints apple utensils coffee chef-hat dog cat paw-print plane map-pin compass calendar list-checks circle-check bell gift palette brush scissors shirt gem crown smile brain stethoscope pill bed alarm-clock hourglass target trophy lightbulb rocket shield lock key mail phone car tree-pine mountain tent fish salad carrot cake candy wine hand-heart sparkle bird snowflake umbrella cloud-sun glasses book bookmark library pen-tool shapes puzzle gamepad-2 dice-5 ticket film clapperboard newspaper receipt calculator briefcase building-2 store package truck hammer wrench'.split(' ');

// ---------- colour checks ----------

const HEX = /^#[0-9A-Fa-f]{6}$/;
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
const best = (bg, options) => options.slice().sort((a, b) => contrast(b, bg) - contrast(a, bg))[0];

// Make a palette safe to use: valid hex everywhere, readable text, readable
// text on the accent button. Returns the fixed palette and what was changed.
export function fixPalette(p, fallbackBg) {
  const keys = ['background', 'card', 'text', 'secondary', 'accent', 'accentText'];
  const out = {};
  keys.forEach((k) => { out[k] = HEX.test(p?.[k] || '') ? p[k].toUpperCase() : null; });
  out.background = out.background || fallbackBg;
  out.card = out.card || out.background;
  out.text = out.text && contrast(out.text, out.background) >= 7 ? out.text : best(out.background, ['#1A1A1A', '#F5F2EE', out.text || '#1A1A1A']);
  out.secondary = out.secondary && contrast(out.secondary, out.background) >= 4.5 ? out.secondary : out.text;
  out.accent = out.accent || '#FF6B6B';
  // Text on the accent is a bold button label (large text: 3:1 is enough). Prefer white.
  out.accentText = out.accentText && contrast(out.accentText, out.accent) >= 3 ? out.accentText
    : contrast('#FFFFFF', out.accent) >= 3 ? '#FFFFFF' : '#1A1A1A';
  return out;
}

// ---------- App Store name check ----------

export async function nameClash(name) {
  try {
    const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=software&country=us&limit=10`);
    const j = await r.json();
    const n = name.toLowerCase().trim();
    const hit = (j.results || []).find((a) => {
      const t = String(a.trackName || '').toLowerCase();
      return t === n || t.startsWith(n + ':') || t.startsWith(n + ' -') || t.startsWith(n + ' –') || t.startsWith(n + ' ');
    });
    return hit ? { taken: true, app: hit.trackName } : { taken: false };
  } catch {
    return { taken: null };
  }
}

// ---------- brand.md for the course (Day 3 reads it) ----------

export function toBrandMarkdown(kit) {
  const b = kit.brand;
  const row = (k, label) => `| ${label} | \`${b.palette.light[k]}\` | \`${b.palette.dark[k]}\` |`;
  return [
    '# App Brand Kit',
    '',
    `Made at katiep.me/design on ${kit.created.slice(0, 10)}. Kit link: https://katiep.me/design/kit?id=${kit.id}`,
    '',
    '## The app', '', kit.input.app, '',
    `## Style: ${STYLES[kit.input.style]?.label || kit.input.style}`, '', b.personality, '', `Words: ${(b.adjectives || []).join(', ')}`, '',
    '## Name ideas', '',
    ...b.names.map((n) => `- **${n.name}** — ${n.why}${n.check?.taken ? ` (similar name already on the App Store: ${n.check.app})` : ''}`),
    '', 'Check the name is free on the App Store, as a domain and on Instagram before you commit.', '',
    '## Colours (for DesignSystem/Theme.swift)', '',
    '| Token | Light | Dark |', '| --- | --- | --- |',
    row('background', 'appBackground'), row('card', 'appCard'), row('text', 'appText'),
    row('secondary', 'appSecondary'), row('accent', 'appAccent'), row('accentText', 'appAccentText (text on the accent)'),
    '',
    '## Fonts', '',
    `- Headings: **${b.fonts.heading}** (Google Fonts)`, `- Body: **${b.fonts.body}** (Google Fonts)`,
    `- If you'd rather not bundle fonts in the app: use ${b.fonts.system_fallback || 'SF Pro Rounded'} (built into iPhone).`, '',
    '## App icon', '',
    `Symbol: \`${b.icon.glyph}\` (Lucide icon set) on a ${b.icon.background === 'gradient' ? 'gradient' : 'solid'} of the accent colour. ${b.icon.note || ''}`, '',
    '## Screen copy', '',
    `- Launch screen tagline: "${b.screens.launch.tagline}"`,
    `- Onboarding question: "${b.screens.onboarding.question}" — ${b.screens.onboarding.why}`,
    ...b.screens.onboarding.answers.map((a) => `  - ${a}`),
    `- Paywall headline: "${b.screens.paywall.headline}"`,
    ...b.screens.paywall.benefits.map((x) => `  - ${x}`),
    ...(b.screens.paywall.plans || []).map((p) => `  - Plan: ${p.label} ${p.price}${p.note ? ` (${p.note})` : ''}`),
    ...(b.screens.paywall.trial ? [`  - Trial line: "${b.screens.paywall.trial}"`] : []),
    `- Paywall button: "${b.screens.paywall.cta}" (example prices only; set real prices on Day 2)`,
  ].join('\n');
}
