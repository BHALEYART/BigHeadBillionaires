// /api/idea-fair-submit.js
// ESM version — use this if your package.json has "type": "module".
// Looks up the registrant by email and merges the submission into their
// existing record rather than creating a new one.

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, idea, details } = req.body || {};

    if (!email || !idea || !details) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const key = `idea-fair:reg:${normalizedEmail}`;

    const existing = await redis.get(key);
    if (!existing) {
      return res.status(404).json({ error: 'No registration found for that email' });
    }

    const alreadySubmitted = Boolean(existing.submittedAt);

    const updated = {
      ...existing,
      finalIdea: String(idea).trim(),
      submissionLinks: String(details).trim(),
      submittedAt: existing.submittedAt || new Date().toISOString(),
      lastSubmittedAt: new Date().toISOString(),
    };

    await redis.set(key, updated);

    if (!alreadySubmitted) {
      await redis.rpush('idea-fair:submissions', normalizedEmail);
    }

    return res.status(200).json({ success: true, alreadySubmitted });
  } catch (err) {
    console.error('idea-fair-submit error:', err);
    return res.status(500).json({ error: 'Submission failed', detail: err.message });
  }
}
