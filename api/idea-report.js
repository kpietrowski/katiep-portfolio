// GET /api/idea-report?id=…            → the unlocked report as JSON
// GET /api/idea-report?id=…&format=md  → the same report as Markdown, for the
//   App in 30 Days Day 1 skill (it becomes the student's docs/research.md).

import { loadReport, toMarkdown } from './_idea.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const report = await loadReport(req.query?.id);
    if (!report || !report.unlocked) return res.status(404).json({ error: 'Report not found.' });

    if (req.query?.format === 'md') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      if (req.query?.download) res.setHeader('Content-Disposition', 'attachment; filename="research.md"');
      return res.status(200).send(toMarkdown(report));
    }
    const { input, created, competitors, reviews_sampled, analysis, first_name, id } = report;
    return res.status(200).json({ id, created, input, competitors, reviews_sampled, analysis, first_name });
  } catch (err) {
    console.error('idea-report:', err.message);
    return res.status(500).json({ error: 'Could not load the report.' });
  }
}
