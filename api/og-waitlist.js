// GET /api/og-waitlist: the 1200x630 link-share image for /waitlist-2
// (what shows in iMessage, Instagram DMs, Facebook, X, Slack...).
// Rendered on Vercel's edge with @vercel/og in the site's own fonts.

import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const C = { bg: '#FAF7EF', ink: '#0B1A45', blue: '#2B55F5', lime: '#B8F04A', muted: '#46527A' };

const LINES = ['Make your first', 'money-making app', 'with Claude Code in'];
const SERIF_TEXT = LINES.join(' ') + ' 30 days. $24,820';
const SANS_TEXT = "THE APP & YAP CHALLENGE in Tide's first 60 days Join the waitlist katiep.me";

// Google Fonts serves TrueType (what the renderer needs) when no browser
// user agent is sent; text= trims each font to just these characters.
async function font(family, axis, text) {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${family}${axis}&text=${encodeURIComponent(text)}`).then((r) => r.text());
  const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
  if (!url) throw new Error('font not found: ' + family);
  return fetch(url).then((r) => r.arrayBuffer());
}

const h = (type, style, children) => ({ type, props: { style, children } });

export default async function handler(req) {
  const [serif, sans, photo] = await Promise.all([
    font('Hedvig+Letters+Serif', ':opsz@24', SERIF_TEXT),
    font('DM+Sans', ':wght@700', SANS_TEXT),
    fetch(new URL('/app/katie.jpg', req.url)).then((r) => r.arrayBuffer()),
  ]);

  const headline = h('div', { display: 'flex', flexDirection: 'column', fontFamily: 'Hedvig', fontSize: 64, lineHeight: 1.06, color: C.ink, marginTop: 20, letterSpacing: -0.5 }, [
    ...LINES.map((t) => h('div', { display: 'flex' }, t)),
    h('div', { display: 'flex' }, [
      h('div', { display: 'flex', color: C.blue, borderBottom: `7px solid ${C.lime}`, paddingBottom: 2 }, '30 days.'),
    ]),
  ]);

  const badge = h('div', { display: 'flex', flexDirection: 'column', background: C.ink, borderRadius: 20, padding: '14px 22px', transform: 'rotate(-2deg)' }, [
    h('div', { display: 'flex', fontFamily: 'Hedvig', fontSize: 44, lineHeight: 1, color: C.lime }, '$24,820'),
    h('div', { display: 'flex', fontSize: 18, color: C.bg, marginTop: 6 }, "in Tide's first 60 days"),
  ]);

  const cta = h('div', { display: 'flex', alignItems: 'center', background: C.blue, color: '#fff', borderRadius: 999, padding: '18px 30px', fontSize: 21, letterSpacing: 1.5, marginLeft: 22 }, 'JOIN THE WAITLIST');

  const left = h('div', { display: 'flex', flexDirection: 'column', justifyContent: 'center', width: 640 }, [
    h('div', { display: 'flex', fontSize: 22, letterSpacing: 3.5, color: C.blue }, 'THE APP & YAP CHALLENGE'),
    headline,
    h('div', { display: 'flex', alignItems: 'center', marginTop: 34 }, [badge, cta]),
  ]);

  const right = h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 400 }, [
    { type: 'img', props: { src: photo, width: 380, height: 470, style: { objectFit: 'cover', borderRadius: 28, boxShadow: '0 30px 60px -20px rgba(11,26,69,.45)' } } },
    h('div', { display: 'flex', fontSize: 20, color: C.muted, marginTop: 18 }, 'katiep.me'),
  ]);

  const root = h('div', { display: 'flex', width: 1200, height: 630, background: C.bg, padding: '40px 64px', justifyContent: 'space-between', fontFamily: 'DM Sans' }, [left, right]);

  return new ImageResponse(root, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Hedvig', data: serif, weight: 400, style: 'normal' },
      { name: 'DM Sans', data: sans, weight: 700, style: 'normal' },
    ],
    headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=31536000, immutable' },
  });
}
