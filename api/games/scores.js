/**
 * BHB Games – Scores API
 *
 * GET  /api/games/scores?game=burgerbreaker&mode=campaign   → top 10 leaderboard
 * POST /api/games/scores?game=burgerbreaker&mode=campaign   → submit score (JWT required)
 *
 * Redis data model:
 *   lb:{game}:{mode}        – sorted set, member = userId, score = game score (personal best only)
 *   pb:{game}:{mode}:{uid}  – hash { score, level, at } – personal best metadata
 *   user:{uid}              – hash { username, displayName, passwordHash, createdAt }
 */

import { kv }         from '@vercel/kv';
import { jwtVerify }  from 'jose';

const ORIGIN     = process.env.SITE_ORIGIN || 'https://bigheadbillionaires.com';
const JWT_SECRET = new TextEncoder().encode(
  process.env.GAMES_JWT_SECRET || 'bhb-games-change-this-secret'
);

const VALID_GAMES = new Set(['burgerbreaker']);
const VALID_MODES = new Set(['campaign', 'endless']);

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin',  ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function verifyToken(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) throw new Error('No token');
  const { payload } = await jwtVerify(authHeader.slice(7), JWT_SECRET);
  return payload;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const game = (req.query.game || 'burgerbreaker').toLowerCase();
  const mode = (req.query.mode || 'campaign').toLowerCase();

  if (!VALID_GAMES.has(game) || !VALID_MODES.has(mode))
    return res.status(400).json({ error: 'Invalid game or mode.' });

  const lbKey = `lb:${game}:${mode}`;

  // ── GET LEADERBOARD ────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    // zrange with REV returns highest scores first; withScores gives [member, score, ...]
    const raw = await kv.zrange(lbKey, 0, 9, { rev: true, withScores: true });

    // Resolve display names in parallel
    const rows = [];
    for (let i = 0; i < raw.length; i += 2) {
      const uid   = raw[i];
      const score = raw[i + 1];
      const pbKey = `pb:${game}:${mode}:${uid}`;
      const [user, pb] = await Promise.all([
        kv.get(`user:${uid}`),
        kv.get(pbKey),
      ]);
      rows.push({
        rank:        rows.length + 1,
        username:    uid,
        displayName: user?.displayName || uid,
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
    try { payload = await verifyToken(req.headers.authorization); }
    catch { return res.status(401).json({ error: 'Please log in to submit scores.' }); }

    const { score, level, reason } = req.body || {};
    if (typeof score !== 'number' || score < 0 || !Number.isFinite(score))
      return res.status(400).json({ error: 'Invalid score value.' });

    const uid   = payload.sub;
    const pbKey = `pb:${game}:${mode}:${uid}`;

    // Only update if this score beats the personal best
    const currentPB = await kv.get(pbKey);
    const isNewBest = !currentPB || score > currentPB.score;

    if (isNewBest) {
      await kv.set(pbKey, { score, level: level || null, at: Date.now() });
      // zadd with nx=false (default) → updates existing member's score
      await kv.zadd(lbKey, { score, member: uid });
    }

    // Get current rank (0-indexed → add 1)
    const rankIndex = await kv.zrevrank(lbKey, uid);
    const rank      = rankIndex !== null ? rankIndex + 1 : null;

    return res.status(200).json({ saved: true, isNewBest, rank, score });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
