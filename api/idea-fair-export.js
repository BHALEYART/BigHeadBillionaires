// /api/idea-fair-export.js
// Vercel serverless function — downloads all Idea Fair registrations as a CSV.
//
// Usage: GET /api/idea-fair-export?key=YOUR_SECRET
// (opening that URL in a browser will trigger a file download)
//
// Env vars required:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//   IDEA_FAIR_EXPORT_KEY   <- set this to any secret string you choose

const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const providedKey = req.query.key;
  if (!process.env.IDEA_FAIR_EXPORT_KEY || providedKey !== process.env.IDEA_FAIR_EXPORT_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Full list of emails in submission order
    const emails = await redis.lrange('idea-fair:registrations', 0, -1);

    const columns = ['name', 'email', 'xhandle', 'idea', 'details', 'registeredAt'];
    const rows = [columns.join(',')];

    for (const email of emails) {
      const record = await redis.get(`idea-fair:reg:${email}`);
      if (!record) continue; // skip if somehow missing
      rows.push(columns.map((col) => csvEscape(record[col])).join(','));
    }

    const csv = rows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="idea-fair-registrations.csv"');
    return res.status(200).send(csv);
  } catch (err) {
    console.error('idea-fair-export error:', err);
    return res.status(500).json({ error: 'Export failed' });
  }
};
