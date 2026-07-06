// /api/idea-fair-register.js
// ESM version — use this if your package.json has "type": "module"
// (same root cause as the earlier uuid ERR_REQUIRE_ESM crash on /api/redeem-nft).

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, xhandle, idea } = req.body || {};

    if (!name || !email || !xhandle || !idea) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedHandle = String(xhandle).trim().replace(/^@/, '');
    const key = `idea-fair:reg:${normalizedEmail}`;

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
      registeredAt: new Date().toISOString(),
    };

    await redis.set(key, record);
    await redis.rpush('idea-fair:registrations', normalizedEmail);

    return res.status(200).json({ success: true, alreadyRegistered: false });
  } catch (err) {
    console.error('idea-fair-register error:', err);
    return res.status(500).json({ error: 'Registration failed', detail: err.message });
  }
}
