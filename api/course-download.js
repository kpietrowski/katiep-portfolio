// GET /api/course-download?session_id=cs_…        (from the welcome page)
// GET /api/course-download?key=APP30-…&email=…    (from katiep.me/app/devices)
//
// Builds the student's personal course folder as a zip, from the course you
// last published (node tools/publish.mjs):
//
//   App in 30 Days/
//     START HERE.txt             open this folder in Claude Code, type "set me up"
//     CLAUDE.md                  course rules + what "set me up" means
//     .claude/skills/…           every app30 skill (Day 0 in full, the rest as
//                                stubs that load the real steps with the key)
//     .claude/settings.json      lets Claude load lessons without asking each time
//     .app30/fetch.sh            the loader
//     .app30/key                 this student's course key, already filled in
//     .gitignore                 keeps the key out of any git repo
//     docs/                      where their app's specs will live
//
// The folder becomes the student's app project for the whole month.

import { kv } from './_idea.js';
import { getLicence, normEmail } from './_license.js';
import { zip } from './_zip.js';

const ROOT = 'App in 30 Days';
const FULL = new Set(['app30-day-zero']);
const FETCH = 'bash .app30/fetch.sh';

const read = async (p) => { const v = await kv.get(`course:f:${p}`); return v == null ? null : typeof v === 'string' ? v : JSON.stringify(v, null, 2); };

function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const get = (k) => (m[1].match(new RegExp(`^${k}:\\s*(.*)$`, 'm')) || [])[1]?.trim();
  return { name: get('name'), description: get('description'), body: md.slice(m[0].length) };
}

function stub(name, description, title, extras) {
  const files = extras.length
    ? `\nThis step also has these files. Load them the same way when the steps mention them:\n\n${extras.map((f) => `- \`${f}\``).join('\n')}\n\nTo put one into the student's project, send it to a file instead of reading it, e.g.\n\`${FETCH} ${extras[0]} > path/in/project\`\n`
    : '';
  return `---
name: ${name}
description: ${description}
---

# ${title}

This step is part of **App in 30 Days**. Its full instructions live on
katiep.me and load with the student's course key.

**Before doing anything else, run this from the course folder (the one with
CLAUDE.md) and read everything it prints:**

\`\`\`bash
${FETCH} ${name}/SKILL.md
\`\`\`

Then follow those instructions exactly, as if they were written here. When
they mention a file in this step's \`references/\` or \`assets/\` folder, load it
with the same command, e.g. \`${FETCH} ${name}/references/<file>\`.
${files}
If it prints **APP30 SETUP NEEDED**, run the \`app30-day-zero\` skill
("set me up") first, then come back here. If it prints another **APP30**
message, read it to the student in plain words and do what it says (for
example, manage computers at katiep.me/app/devices). Don't continue this step
without the real instructions.
`;
}

const CLAUDE_TOP = `# App in 30 Days

This folder is a student's **App in 30 Days** course folder, and it will become
their app project. The student is **not a developer**.

## "Set me up"

When the student says "set me up" (or "let's start", "start Day 0", or
anything like it), use the \`app30-day-zero\` skill. Their course key is already
in \`.app30/key\`, so Step 0 only needs to check it.

## Every day after that

When they say "what's next", "I'm back", or open this folder without a clear
task, use the \`app30-next\` skill. Every \`app30-…\` skill in \`.claude/skills\`
loads its real steps with \`${FETCH}\`: always run that command from this
folder.

Never show or repeat the course key in the chat, and never commit
\`.app30/key\`.

`;

const START_HERE = `App in 30 Days: start here

1. Open the Claude desktop app and click "Code".
2. Choose this folder ("App in 30 Days") as the folder to work in.
   (You can rename it to your app's name later. Keep it somewhere easy, like Documents.)
3. Type:  set me up

That's it. Claude takes it from there, one step at a time.

Your course key is already inside this folder, so please don't share the folder.
Lost something? https://katiep.me/app/devices
Questions? Post in our Slack, or email katie@katiepietrowski.com
`;

async function licenceFor(req) {
  const sid = String(req.query?.session_id || '');
  if (sid) {
    if (!/^cs_(test_|live_)?[A-Za-z0-9]{10,200}$/.test(sid)) return null;
    const key = await kv.get(`lic-ref:${sid}`);
    return key ? getLicence(key) : null;
  }
  const lic = await getLicence(req.query?.key);
  return lic && lic.email === normEmail(req.query?.email) ? lic : null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const lic = await licenceFor(req);
    if (!lic) return res.status(404).json({ error: "I couldn't find your course. Check your key and email, or use the link in your welcome email." });
    if (lic.status !== 'active') return res.status(403).json({ error: 'This course key has been switched off. Email katie@katiepietrowski.com if that seems wrong.' });

    const paths = (await kv.smembers('course:paths')).sort();
    const skills = [...new Set(paths.map((p) => p.split('/')[0]))].filter((s) => paths.includes(`${s}/SKILL.md`));
    if (!skills.length || !paths.includes('app30-day-zero/scripts/app30-fetch.sh')) {
      return res.status(503).json({ error: 'The course is being updated. Please try again in a few minutes.' });
    }

    const files = [];
    const add = (path, data, executable) => files.push({ path: `${ROOT}/${path}`, data, executable });
    for (const s of skills) {
      const own = paths.filter((p) => p.startsWith(`${s}/`));
      if (FULL.has(s)) {
        for (const p of own) add(`.claude/skills/${p}`, await read(p), p.endsWith('.sh'));
        continue;
      }
      const fm = frontmatter((await read(`${s}/SKILL.md`)) || '');
      if (!fm?.name) continue;
      const title = (fm.body.match(/^#\s+(.+)$/m) || [])[1] || s;
      add(`.claude/skills/${s}/SKILL.md`, stub(s, fm.description, title, own.filter((p) => p !== `${s}/SKILL.md`)));
    }

    let template = (await read('app30-next/references/claude-md-template.md')) || '';
    const cut = template.indexOf('\n---\n');
    template = cut >= 0 ? template.slice(cut + 5).trim() + '\n' : '';
    add('CLAUDE.md', CLAUDE_TOP + template);
    add('START HERE.txt', START_HERE);
    add('.claude/settings.json', JSON.stringify({
      permissions: { allow: ['Bash(bash .app30/fetch.sh *)', 'Bash(bash ./.app30/fetch.sh *)'] },
    }, null, 2) + '\n');
    add('.app30/fetch.sh', await read('app30-day-zero/scripts/app30-fetch.sh'), true);
    add('.app30/key', lic.key + '\n');
    add('.gitignore', '.app30/key\n.app30/cache/\n.DS_Store\n');
    add('docs/README.md', '# docs\n\nYour app\'s plans live here: the brief, pricing, onboarding, paywall and more. Claude writes and updates them as you go.\n');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${ROOT}.zip"`);
    return res.status(200).send(zip(files));
  } catch (err) {
    console.error('course-download:', err.message);
    return res.status(500).json({ error: 'Something went wrong building your download. Please try again.' });
  }
}
