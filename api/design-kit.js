// GET /api/design-kit?id=…            → the unlocked design system as JSON
// GET /api/design-kit?id=…&format=md  → brand.md for the App in 30 Days course
//   (Day 3 project setup turns it into DesignSystem/Theme.swift).

import { loadDoc } from './_idea.js';
import { toBrandMarkdown, STYLES } from './_design.js';
// (STYLES: kits made before the AI chose the style stored a style key.)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const kit = await loadDoc('design', req.query?.id);
    if (!kit || !kit.unlocked) return res.status(404).json({ error: 'Design system not found.' });

    if (req.query?.format === 'md') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      if (req.query?.download) res.setHeader('Content-Disposition', 'attachment; filename="brand.md"');
      return res.status(200).send(toBrandMarkdown(kit));
    }
    const { id, created, input, brand, first_name } = kit;
    return res.status(200).json({ id, created, input: { ...input, style_label: brand.style || STYLES[input.style]?.label }, brand, first_name });
  } catch (err) {
    console.error('design-kit:', err.message);
    return res.status(500).json({ error: 'Could not load the design system.' });
  }
}
