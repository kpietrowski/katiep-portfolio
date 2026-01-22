import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // Simple auth check - you should use a proper secret
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      const submissions = await kv.lrange('submissions', 0, -1);
      const parsed = submissions.map(s => JSON.parse(s));
      return res.status(200).json({ submissions: parsed });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch submissions' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
