// /api/idea-fair-register.js
// Vercel serverless function — Node/CommonJS, matches BHB's existing Upstash Redis pattern.
//
// Storage layout in Upstash Redis:
//   idea-fair:reg:{email}      -> JSON registration record (recognizes returning users)
//   idea-fair:registrations    -> Redis list of emails, in submission order (for CSV export)
//
// Env vars required (same ones your other BHB endpoints already use):
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
    const { name, email, xhandle, idea, details } = req.body || {};

    if (!name || !email || !xhandle || !idea) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedHandle = String(xhandle).trim().replace(/^@/, '');
    const key = `idea-fair:reg:${normalizedEmail}`;

    // Recognize returning users — don't overwrite an existing registration
    const existing = await redis.get(key);
    if (existing) {
      return res.status(200).json({
        success: true,
        alreadyRegistered: true,
        registeredAt: existing.registeredAt,
      });
    }

    const record = {
      name: String(name).trim(),
      email: normalizedEmail,
      xhandle: normalizedHandle,
      idea: String(idea).trim(),
      details: details ? String(details).trim() : '',
      registeredAt: new Date().toISOString(),
    };

    await redis.set(key, record);
    await redis.rpush('idea-fair:registrations', normalizedEmail);

    return res.status(200).json({ success: true, alreadyRegistered: false });
  } catch (err) {
    console.error('idea-fair-register error:', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
};
