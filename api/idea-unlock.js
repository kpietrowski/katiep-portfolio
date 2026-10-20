// POST /api/idea-unlock  { id, first_name?, email, phone?, sms_consent?, referrer?, company? }
// Step 2 of the App Idea Audit. Adds the visitor to Kit (tags "App Idea
// Audit" and the waitlist; saves the report link, the one-sentence idea
// and both grades as custom fields so the Kit email can include them), unlocks
// the report and returns it.
//
// The report email itself is sent by a Kit automation:
//   trigger "tag added: App Idea Audit" → email using
//   {{ subscriber.idea_report_url }}, {{ subscriber.idea_sentence }},
//   {{ subscriber.idea_build_grade }}, {{ subscriber.idea_compete_grade }}.

import { readSignup, subscribe, WAITLIST_TAG, IDEA_SHARED_TAG } from './_kit.js';
import { recordLead, shortIdea } from './_leads.js';
import { loadReport, saveReport } from './_idea.js';

export const IDEA_TAG = process.env.KIT_IDEA_TAG || 'App Idea Audit';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.body?.company) return res.status(200).json({ ok: true });

  const s = readSignup(req.body);
  if (s.error) return res.status(400).json({ error: s.error });
  if (!process.env.KIT_API_KEY) return res.status(500).json({ error: 'Not configured' });

  try {
    const report = await loadReport(req.body?.id);
    if (!report) return res.status(404).json({ error: "I couldn't find that report. Please run it again." });

    const url = `https://katiep.me/idea/report?id=${report.id}`;
    await subscribe({
      ...s,
      page: req.body?.referrer || 'katiep.me/idea',
      fields: {
        'Idea report URL': url,
        'Idea sentence': report.analysis.idea_sentence,
        'App idea': report.analysis.idea_sentence,
        'Idea build grade': report.analysis.build?.grade,
        'Idea compete grade': report.analysis.compete?.grade,
      },
      tags: [IDEA_TAG, IDEA_SHARED_TAG, WAITLIST_TAG],
    });
    await recordLead(s.address, {
      first_name: s.firstName, source: 'idea audit',
      idea: {
        sentence: report.analysis.idea_sentence,
        typed: shortIdea(report.input?.idea || [report.input?.problem, report.input?.solution].filter(Boolean).join(' '), 600),
        build: report.analysis.build?.grade, compete: report.analysis.compete?.grade, report_url: url,
      },
    });

    if (!report.unlocked) {
      report.unlocked = true;
      report.unlocked_at = new Date().toISOString();
      report.first_name = s.firstName || '';
      await saveReport(report);
    }
    return res.status(200).json({ ok: true, url });
  } catch (err) {
    console.error('idea-unlock:', err.message);
    return res.status(502).json({ error: "Something went wrong saving your report. Please try again." });
  }
}
