/**
 * BHB Rewards — Season Data API (GET only)  [CommonJS]
 *
 * GET /api/rewards/season?action=status                → current season + leaderboard + recent
 * GET /api/rewards/season?action=archive               → list of past completed seasons
 * GET /api/rewards/season?action=season&n=3            → specific season snapshot
 * GET /api/rewards/season?action=export&n=3            → CSV download for season n (or current if omitted)
 *
 * Reuses GAMES_JWT_SECRET so arcade sign-ins carry over (auth is optional here —
 * used only to flag the viewer's own row "me" on the board).
 *
 * npm i @upstash/redis jose
 * Env: KV_REST_API_URL, KV_REST_API_TOKEN, GAMES_JWT_SECRET, SITE_ORIGIN, SEASON_1_START_MS (optional)
 */

const { Redis }     = require('@upstash/redis');
const { jwtVerify } = require('jose');

const kv = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const ORIGIN     = process.env.SITE_ORIGIN || 'https://bigheadbillionaires.com';
const JWT_SECRET = new TextEncoder().encode(
  process.env.GAMES_JWT_SECRET || 'bhb-games-change-this-secret'
);

// ── Season math ──────────────────────────────────────────────────────────────
const DAY_MS          = 24 * 60 * 60 * 1000;
const ACTIVE_DAYS     = 28;
const DISPLAY_DAYS    = 2;
const CYCLE_DAYS      = ACTIVE_DAYS + DISPLAY_DAYS;       // 30-day cycle
const BURG_PER_CLIP   = 15_000;
const PERFECT_PAYOUT  = 500_000;                          // all-28-clips bonus
const MAX_CLIPS       = ACTIVE_DAYS;

// ── CORS ─────────────────────────────────────────────────────────────────────
function setCors(res, req) {
  const allowed = [ORIGIN, 'https://bhaleyart.github.io'];
  const origin  = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin',  allowed.includes(origin) ? origin : ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function short(addr) {
  return addr ? addr.slice(0, 4) + '…' + addr.slice(-4) : '???';
}
function computePayout(clips) {
  const c = Math.min(clips, MAX_CLIPS);
  return c >= MAX_CLIPS ? PERFECT_PAYOUT : c * BURG_PER_CLIP;
}

async function verifyJWTOptional(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const { payload } = await jwtVerify(authHeader.slice(7), JWT_SECRET);
    return payload;
  } catch { return null; }
}

// Lazy-init season 1 start. First call creates it; subsequent calls read it.
// Can also be overridden via SEASON_1_START_MS env var.
async function getSeason1Start() {
  if (process.env.SEASON_1_START_MS) return Number(process.env.SEASON_1_START_MS);
  let cfg = await kv.get('rewards:config');
  if (!cfg?.season1StartMs) {
    cfg = { season1StartMs: Date.now() };
    await kv.set('rewards:config', cfg);
  }
  return cfg.season1StartMs;
}

async function currentSeasonInfo() {
  const s1    = await getSeason1Start();
  const now   = Date.now();

  // Pre-season: everything points at Season 1 but status is "pending".
  if (now < s1) {
    const startMs     = s1;
    const activeEndMs = startMs + ACTIVE_DAYS * DAY_MS;
    const endMs       = startMs + CYCLE_DAYS  * DAY_MS;
    return {
      number: 1, startMs, activeEndMs, endMs, status: 'pending',
      dayOfSeason: 0,
      msUntilLocked: activeEndMs - now,     // time until submissions *would* close (informational)
      msUntilReset:  endMs - now,
      msUntilStart:  startMs - now,          // most useful field in pending state
      activeDays: ACTIVE_DAYS, displayDays: DISPLAY_DAYS,
      burgPerClip: BURG_PER_CLIP, perfectPayout: PERFECT_PAYOUT, maxClips: MAX_CLIPS,
    };
  }

  const number      = Math.floor((now - s1) / (CYCLE_DAYS * DAY_MS)) + 1;
  const startMs     = s1 + (number - 1) * CYCLE_DAYS * DAY_MS;
  const activeEndMs = startMs + ACTIVE_DAYS * DAY_MS;
  const endMs       = startMs + CYCLE_DAYS  * DAY_MS;
  const status      = now < activeEndMs ? 'active' : 'displaying';

  const dayOfSeason   = Math.max(0, Math.min(ACTIVE_DAYS, Math.floor((now - startMs) / DAY_MS) + 1));
  const msUntilReset  = Math.max(0, endMs - now);
  const msUntilLocked = Math.max(0, activeEndMs - now);

  return {
    number, startMs, activeEndMs, endMs, status,
    dayOfSeason, msUntilLocked, msUntilReset,
    msUntilStart: 0,
    activeDays: ACTIVE_DAYS, displayDays: DISPLAY_DAYS,
    burgPerClip: BURG_PER_CLIP, perfectPayout: PERFECT_PAYOUT, maxClips: MAX_CLIPS,
  };
}

// ── Pull a season's leaderboard + meta ───────────────────────────────────────
async function loadSeasonBoard(seasonNum, limit = 100) {
  const lbKey = `rewards:season:${seasonNum}:lb`;
  const raw   = await kv.zrange(lbKey, 0, limit - 1, { rev: true, withScores: true });
  if (!raw.length) return [];

  // Fetch display names in parallel
  const wallets = [];
  for (let i = 0; i < raw.length; i += 2) wallets.push(raw[i]);
  const users = await Promise.all(wallets.map(w => kv.get(`user:${w}`)));

  const rows = [];
  for (let i = 0; i < raw.length; i += 2) {
    const wallet = raw[i];
    const clips  = Number(raw[i + 1]);
    const user   = users[i / 2];
    rows.push({
      rank:         rows.length + 1,
      wallet,
      shortWallet:  short(wallet),
      displayName:  user?.displayName || short(wallet),
      clips,
      payout:       computePayout(clips),
      perfect:      clips >= MAX_CLIPS,
    });
  }
  return rows;
}

async function loadRecent(seasonNum, limit = 10) {
  const key  = `rewards:season:${seasonNum}:recent`;
  const list = await kv.lrange(key, 0, limit - 1);
  // Items are stored as objects — Upstash auto-parses JSON on read.
  return (list || []).map(x => (typeof x === 'string' ? safeParse(x) : x)).filter(Boolean);
}
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

async function loadMySnapshot(seasonNum, wallet) {
  if (!wallet) return null;
  const [registered, clipCount, subs, lastMs] = await Promise.all([
    kv.sismember(`rewards:season:${seasonNum}:registered`, wallet),
    kv.zscore(`rewards:season:${seasonNum}:lb`, wallet),
    kv.lrange(`rewards:season:${seasonNum}:subs:${wallet}`, 0, -1),
    kv.get(`rewards:season:${seasonNum}:last:${wallet}`),
  ]);
  const clips = Number(clipCount || 0);
  return {
    registered: !!registered,
    clips,
    payout:     computePayout(clips),
    perfect:    clips >= MAX_CLIPS,
    submissions: (subs || []).map(x => typeof x === 'string' ? safeParse(x) : x).filter(Boolean),
    lastSubmittedAt: lastMs ? Number(lastMs) : null,
    nextAllowedAt:   lastMs ? Number(lastMs) + DAY_MS : 0,
  };
}

// ── CSV builder ──────────────────────────────────────────────────────────────
function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function buildCsv(seasonNum) {
  const board = await loadSeasonBoard(seasonNum, 1000);

  // Pull every registered wallet's submissions in parallel (even 0-clip rows stay out;
  // only players on the board matter for payout export)
  const allSubs = await Promise.all(
    board.map(r => kv.lrange(`rewards:season:${seasonNum}:subs:${r.wallet}`, 0, -1))
  );

  const header = [
    'Rank', 'Wallet', 'DisplayName', 'Clips', 'IdealPayoutBURG', 'PerfectSeason',
    'SubmittedURLs', 'SubmissionTimestamps',
  ];
  const lines = [header.map(csvEscape).join(',')];

  board.forEach((row, i) => {
    const subs = (allSubs[i] || [])
      .map(x => typeof x === 'string' ? safeParse(x) : x)
      .filter(Boolean);
    const urls  = subs.map(s => s.url).join(' ; ');
    const times = subs.map(s => new Date(s.at).toISOString()).join(' ; ');
    lines.push([
      row.rank, row.wallet, row.displayName, row.clips,
      row.payout, row.perfect ? 'YES' : 'NO',
      urls, times,
    ].map(csvEscape).join(','));
  });

  return lines.join('\r\n');
}

// ═════════════════════════════════════════════════════════════════════════════
//  HANDLER
// ═════════════════════════════════════════════════════════════════════════════
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'GET only.' });

  const action = (req.query.action || 'status').toLowerCase();

  try {
    // ── STATUS: current season snapshot ─────────────────────────────────────
    if (action === 'status') {
      const season = await currentSeasonInfo();
      const viewer = await verifyJWTOptional(req.headers.authorization);

      const [leaderboard, recent, me] = await Promise.all([
        loadSeasonBoard(season.number, 100),
        loadRecent(season.number, 10),
        loadMySnapshot(season.number, viewer?.sub),
      ]);

      return res.status(200).json({ season, leaderboard, recent, me });
    }

    // ── ARCHIVE: list past seasons (everything before current) ──────────────
    if (action === 'archive') {
      const season  = await currentSeasonInfo();
      const prior   = Math.max(0, season.number - 1);
      if (prior === 0) return res.status(200).json({ seasons: [] });

      // For each past season, compute meta + participant/clip counts
      const summaries = await Promise.all(
        Array.from({ length: prior }, (_, i) => i + 1).map(async n => {
          const startMs = season.startMs - (season.number - n) * CYCLE_DAYS * DAY_MS;
          const activeEndMs = startMs + ACTIVE_DAYS * DAY_MS;
          const endMs       = startMs + CYCLE_DAYS  * DAY_MS;
          const [boardCount, topRow] = await Promise.all([
            kv.zcard(`rewards:season:${n}:lb`),
            kv.zrange(`rewards:season:${n}:lb`, 0, 0, { rev: true, withScores: true }),
          ]);
          let topClips = 0, topWallet = null;
          if (topRow?.length >= 2) { topWallet = topRow[0]; topClips = Number(topRow[1]); }
          return {
            number: n, startMs, activeEndMs, endMs,
            participants: Number(boardCount || 0),
            topClips,
            topWallet: topWallet ? short(topWallet) : null,
          };
        })
      );
      // newest first
      return res.status(200).json({ seasons: summaries.reverse() });
    }

    // ── SPECIFIC SEASON SNAPSHOT ────────────────────────────────────────────
    if (action === 'season') {
      const n = parseInt(req.query.n, 10);
      if (!Number.isFinite(n) || n < 1)
        return res.status(400).json({ error: 'Invalid season number.' });
      const current = await currentSeasonInfo();
      if (n > current.number) return res.status(404).json({ error: 'Season does not exist yet.' });

      const startMs     = current.startMs - (current.number - n) * CYCLE_DAYS * DAY_MS;
      const activeEndMs = startMs + ACTIVE_DAYS * DAY_MS;
      const endMs       = startMs + CYCLE_DAYS  * DAY_MS;
      const meta = {
        number: n, startMs, activeEndMs, endMs,
        status: n === current.number ? current.status : 'ended',
      };
      const [leaderboard, recent] = await Promise.all([
        loadSeasonBoard(n, 200),
        loadRecent(n, 25),
      ]);
      return res.status(200).json({ season: meta, leaderboard, recent });
    }

    // ── CSV EXPORT ──────────────────────────────────────────────────────────
    if (action === 'export') {
      const current = await currentSeasonInfo();
      const n = req.query.n ? parseInt(req.query.n, 10) : current.number;
      if (!Number.isFinite(n) || n < 1 || n > current.number)
        return res.status(400).json({ error: 'Invalid season number.' });

      const csv = await buildCsv(n);
      res.setHeader('Content-Type',        'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="bhb-season-${n}.csv"`);
      return res.status(200).send(csv);
    }

    return res.status(400).json({ error: 'Unknown action.' });
  } catch (err) {
    console.error('[rewards/season] error:', err);
    return res.status(500).json({ error: 'Server error while loading season data.' });
  }
};
