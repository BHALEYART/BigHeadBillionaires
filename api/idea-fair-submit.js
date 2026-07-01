// /api/idea-fair-submit.js
// Vercel serverless function — handles FINAL submissions.
// Looks up the registrant by email (from idea-fair-register.js) and merges
// the submission into their existing record, rather than creating a new one.
//
// Storage layout in Upstash Redis:
//   idea-fair:reg:{email}       -> registration record, now extended with submission fields
//   idea-fair:submissions       -> Redis list of emails that have submitted, in order
//
// Env vars required (same as idea-fair-register.js):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN

const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async (req, res) => {
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

    // Must already be registered — this is what makes the submission
    // "recognize" the user instead of creating a duplicate/orphan entry.
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
    return res.status(500).json({ error: 'Submission failed' });
  }
};
