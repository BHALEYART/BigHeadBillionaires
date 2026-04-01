/**
 * BHB Games – Scores API  (CommonJS)
 *
 * GET  /api/games/scores?game=burgerbreaker&mode=campaign  → top 10
 * POST /api/games/scores?game=burgerbreaker&mode=campaign  → submit (JWT required)
 *
 * npm i @upstash/redis jose
 * Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, GAMES_JWT_SECRET, SITE_ORIGIN
 */

const { Redis }  = require('@upstash/redis');
const { jwtVerify } = require('jose');

const kv = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const ORIGIN     = process.env.SITE_ORIGIN || 'https://bigheadbillionaires.com';
const JWT_SECRET = new TextEncoder().encode(
  process.env.GAMES_JWT_SECRET || 'bhb-games-change-this-secret'
);

const VALID_GAMES = new Set(['burgerbreaker', 'burgerdrop']);
const VALID_MODES = new Set(['campaign', 'endless']);

function setCors(res, req) {
  const allowed = [ORIGIN, 'https://bhaleyart.github.io'];
  const origin  = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin',  allowed.includes(origin) ? origin : ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function verifyJWT(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) throw new Error('no token');
  const { payload } = await jwtVerify(authHeader.slice(7), JWT_SECRET);
  return payload;
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const game = (req.query.game || '').toLowerCase();
  const mode = (req.query.mode || 'campaign').toLowerCase();

  if (!VALID_GAMES.has(game) || !VALID_MODES.has(mode))
    return res.status(400).json({ error: 'Invalid game or mode.' });

  const lbKey = `lb:${game}:${mode}`;

  // ── GET LEADERBOARD ────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    // zrange with rev:true returns highest scores first; withScores pairs [member, score, ...]
    const raw = await kv.zrange(lbKey, 0, 9, { rev: true, withScores: true });

    const rows = [];
    for (let i = 0; i < raw.length; i += 2) {
      const uid   = raw[i];
      const score = raw[i + 1];
      const [user, pb] = await Promise.all([
        kv.get(`user:${uid}`),
        kv.get(`pb:${game}:${mode}:${uid}`),
      ]);
      rows.push({
        rank:        rows.length + 1,
        wallet:      uid,
        displayName: user?.displayName || short(uid),
        score:       Number(score),
        level:       pb?.level || null,
        at:          pb?.at    || null,
      });
    }

    return res.status(200).json({ leaderboard: rows, game, mode });
  }

  // ── SUBMIT SCORE ───────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    let payload;
    try { payload = await verifyJWT(req.headers.authorization); }
    catch { return res.status(401).json({ error: 'Please sign in to submit scores.' }); }

    const { score, level } = req.body || {};
    if (typeof score !== 'number' || score < 0 || !Number.isFinite(score))
      return res.status(400).json({ error: 'Invalid score value.' });

    const uid   = payload.sub;
    const pbKey = `pb:${game}:${mode}:${uid}`;

    const currentPB = await kv.get(pbKey);
    const isNewBest = !currentPB || score > currentPB.score;

    if (isNewBest) {
      await kv.set(pbKey, { score, level: level || null, at: Date.now() });
      await kv.zadd(lbKey, { score, member: uid });
    }

    const rankIndex = await kv.zrevrank(lbKey, uid);
    const rank      = rankIndex !== null ? rankIndex + 1 : null;

    return res.status(200).json({ saved: true, isNewBest, rank, score });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

function short(addr) {
  return addr ? addr.slice(0, 4) + '…' + addr.slice(-4) : '???';
}
