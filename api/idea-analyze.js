// POST /api/idea-analyze  { idea, company? }  (older clients: { problem, solution })
// Step 1 of the App Idea Report Card. Finds the top competitors on the App
// Store, reads their most helpful and most recent reviews, grades the idea and
// stores the report (locked). Returns { id, teaser } — the full report is only
// returned by /api/idea-unlock, after the visitor gives their email.

import { newId, saveReport, overLimit, askJSON, findCompetitors, getReviews, kvEnv, kvEnvNames, SEARCH_SYSTEM } from './_idea.js';



const ANALYSIS_SYSTEM = `You are Katie Pietrowski's App Idea Report Card. Katie teaches non-technical people (often moms) to build and launch a simple, paid iPhone app in 30 days: one problem, one core feature, a personalized onboarding and a paywall.

You get the visitor's idea (typed or spoken, so it may ramble: find the core of it) and real App Store data: the top competing apps (rating, number of ratings, price) and a sample of their 1-2 star and 5 star reviews. Write a report that is warm, honest and specific. Plain words a beginner understands. No jargon, no hype.

Rules:
- Base every claim about competitors on the data given. Never invent apps, numbers or reviews.
- "their_words": 4-6 short phrases (under 12 words) taken from the reviews, showing how real users describe the problem. Copy the words, do not rewrite them.
- Grades use A, B, C, D or F (A is best).
  - build: how hard to build as a first app in 30 days with AI writing the code. A = a few screens, works on the phone with no accounts or server. B = needs one extra piece (notifications, simple sync, a camera/photo feature, an AI call). C = several moving parts (accounts, a server, sharing between users). D = hard (two-sided marketplace, real-time multiplayer, payments between users, heavy hardware or sensors). F = not realistic for a first app (regulated medical diagnosis, banking, social network that needs huge scale).
  - compete: how much room there is. A = few or weak competitors, or big unmet complaints. B = real competitors but clear, repeated complaints to win on. C = crowded, you need a sharp angle. D = dominated by big, well-loved apps with few complaints. F = owned by a giant (Apple, Google, a household-name brand) and loved.
  - Use the ratings counts: apps with 100,000+ ratings and 4.7+ stars are strong; under 1,000 ratings is small.
- If the idea is too big, say so kindly and show the smaller first version.
- "opening": 1-2 sentences on what all these apps get wrong that this app could get right.
- "verdict": 2-3 sentences, encouraging but honest.

Return JSON exactly in this shape:
{
  "idea_sentence": "The app in one sentence starting with a verb, e.g. 'Time contractions and tell me when to go to the hospital.'",
  "verdict": "...",
  "build": {"grade": "A|B|C|D|F", "label": "2-3 words", "why": "1-2 sentences", "needs": ["plain-language list of the moving parts, can be empty"]},
  "compete": {"grade": "A|B|C|D|F", "label": "2-3 words", "why": "1-2 sentences"},
  "competitors": [{"name": "exact app name from the data", "loved_for": "short phrase", "complaints": "short phrase"}],
  "love": [{"theme": "2-5 words", "detail": "1 sentence"}],
  "hate": [{"theme": "2-5 words", "detail": "1 sentence"}],
  "their_words": ["..."],
  "opening": "...",
  "opportunities": [{"title": "2-6 words", "why": "1-2 sentences"}],
  "first_version": ["3-5 must-have features for a 30-day first version"],
  "price_signals": "1-2 sentences on what similar apps charge and what reviews say about price",
  "watch_out": "1 sentence: the biggest risk"
}
Give 3-5 items for love, hate and opportunities.`;

const clean = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.body?.company) return res.status(200).json({ id: 'ok' }); // honeypot

  const ideaText = clean(req.body?.idea || [req.body?.problem, req.body?.solution].filter(Boolean).join(' '), 3000);
  if (ideaText.length < 25) {
    return res.status(400).json({ error: 'Tell me a little more: who would use your app, and what does it do?' });
  }
  // Name what's missing (names only, never values) so a broken deploy is easy to fix.
  const missing = [!process.env.OPENAI_API_KEY && 'OPENAI_API_KEY', !kvEnv() && 'KV storage (KV_REST_API_URL + KV_REST_API_TOKEN)'].filter(Boolean);
  if (missing.length) {
    console.error('idea-analyze: missing', missing.join(', '));
    return res.status(500).json({ error: 'Not configured', missing, storageVarsSeen: kvEnvNames() });
  }

  let stage = 'limit';
  try {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    if (await overLimit(ip)) {
      return res.status(429).json({ error: "You've run a lot of reports this hour. Please try again a little later." });
    }

    stage = 'search-terms';
    const idea = ideaText;
    const { search_terms = [] } = await askJSON(SEARCH_SYSTEM, idea);
    stage = 'app-store';
    const competitors = await findCompetitors(search_terms.length ? search_terms : [ideaText.slice(0, 40)]);

    const reviews = await Promise.all(competitors.map((c) => getReviews(c.id)));
    const sampled = reviews.reduce((n, r) => n + r.sampled, 0);

    const data = competitors.map((c, i) => ({
      name: c.name, seller: c.seller, rating: c.rating, ratings: c.ratings, price: c.price, genre: c.genre,
      description: c.description.slice(0, 300),
      low_reviews: reviews[i].low.map((r) => `${r.stars}★ ${r.title}: ${r.text}`),
      five_star_reviews: reviews[i].high.map((r) => `${r.title}: ${r.text}`),
    }));

    stage = 'analysis';
    const analysis = await askJSON(
      ANALYSIS_SYSTEM,
      `THE IDEA\n${idea}\n\nAPP STORE DATA (search terms used: ${search_terms.join(', ')})\n${JSON.stringify(data)}`
    );

    const report = {
      id: newId(),
      created: new Date().toISOString(),
      input: { idea: ideaText },
      search_terms,
      competitors: competitors.map(({ description, screenshots, icon512, ...c }) => c),
      reviews_sampled: sampled,
      analysis,
      unlocked: false,
    };
    stage = 'save';
    await saveReport(report);

    return res.status(200).json({
      id: report.id,
      teaser: { competitors: report.competitors.length, names: report.competitors.slice(0, 3).map((c) => c.name), reviews: sampled },
    });
  } catch (err) {
    console.error(`idea-analyze [${stage}]:`, err.message);
    return res.status(502).json({ error: "I couldn't finish your report just now. Please try again in a minute.", stage });
  }
}
