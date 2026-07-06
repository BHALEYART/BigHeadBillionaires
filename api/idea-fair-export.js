// /api/idea-fair-export.js
// ESM version — use this if your package.json has "type": "module".
// Usage: GET /api/idea-fair-export?key=YOUR_SECRET

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const providedKey = req.query.key;
  if (!process.env.IDEA_FAIR_EXPORT_KEY || providedKey !== process.env.IDEA_FAIR_EXPORT_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const emails = await redis.lrange('idea-fair:registrations', 0, -1);

    const columns = ['name', 'email', 'xhandle', 'idea', 'finalIdea', 'submissionLinks', 'submittedAt', 'registeredAt'];
    const rows = [columns.join(',')];

    for (const email of emails) {
      const record = await redis.get(`idea-fair:reg:${email}`);
      if (!record) continue;
      rows.push(columns.map((col) => csvEscape(record[col])).join(','));
    }

    const csv = rows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="idea-fair-registrations.csv"');
    return res.status(200).send(csv);
  } catch (err) {
    console.error('idea-fair-export error:', err);
    return res.status(500).json({ error: 'Export failed', detail: err.message });
  }
}
