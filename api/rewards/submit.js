/**
 * BHB Rewards — Submission API (POST only)  [CommonJS]
 *
 * POST /api/rewards/submit?action=verify   (JWT)
 *   → Checks wallet holds a verified BHB NFT, marks registered for current season.
 *   Body: {}   (wallet is derived from JWT.sub)
 *
 * POST /api/rewards/submit?action=submit   (JWT)
 *   → Submit a clip URL for the current season. Enforces:
 *       • Must be registered (auto-runs verify if not)
 *       • Platform must be IG / X / TikTok / YT / Facebook
 *       • 24-hour cooldown since last submission
 *       • URL not already submitted this season (normalized match)
 *       • Season must be "active" (not in display window)
 *   Body: { url: "https://…" }
 *
 * npm i @upstash/redis jose
 * Env: KV_REST_API_URL, KV_REST_API_TOKEN, GAMES_JWT_SECRET, SITE_ORIGIN, SEASON_1_START_MS (optional)
 */

const { Redis }     = require('@upstash/redis');
const { jwtVerify } = require('jose');
const { VERIFIED_MINTS } = require('./_mints');

const kv = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const ORIGIN     = process.env.SITE_ORIGIN || 'https://bigheadbillionaires.com';
const JWT_SECRET = new TextEncoder().encode(
  process.env.GAMES_JWT_SECRET || 'bhb-games-change-this-secret'
);

// Season math (mirrors season.js)
const DAY_MS       = 24 * 60 * 60 * 1000;
const ACTIVE_DAYS  = 28;
const DISPLAY_DAYS = 2;
const CYCLE_DAYS   = ACTIVE_DAYS + DISPLAY_DAYS;
const COOLDOWN_MS  = DAY_MS;          // 24-hour cooldown between submissions
const RECENT_MAX   = 10;              // cap on rolling "recent" reel
const NFT_CACHE_TTL_SEC = 60 * 60;    // 1-hour NFT-ownership cache

// Solana RPC endpoints — prefer Helius via env var, fall back to public RPCs.
// Matches /api/rpc ordering so behaviour stays consistent across the codebase.
const RPCS = [
  process.env.SOLANA_RPC_URL,
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
].filter(Boolean);
const TOKEN_PROGRAM_ID      = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

// ── CORS ─────────────────────────────────────────────────────────────────────
function setCors(res, req) {
  const allowed = [ORIGIN, 'https://bhaleyart.github.io'];
  const origin  = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin',  allowed.includes(origin) ? origin : ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function verifyJWT(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) throw new Error('no token');
  const { payload } = await jwtVerify(authHeader.slice(7), JWT_SECRET);
  return payload;
}

// ── Season math ──────────────────────────────────────────────────────────────
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
  // If we're before the configured Season 1 start, treat the upcoming season
  // as #1 in "pending" status — not active, not displaying, just waiting.
  if (now < s1) {
    const startMs = s1;
    const activeEndMs = startMs + ACTIVE_DAYS * DAY_MS;
    const endMs       = startMs + CYCLE_DAYS  * DAY_MS;
    return { number: 1, startMs, activeEndMs, endMs, status: 'pending' };
  }
  const number      = Math.floor((now - s1) / (CYCLE_DAYS * DAY_MS)) + 1;
  const startMs     = s1 + (number - 1) * CYCLE_DAYS * DAY_MS;
  const activeEndMs = startMs + ACTIVE_DAYS * DAY_MS;
  const endMs       = startMs + CYCLE_DAYS  * DAY_MS;
  const status      = now < activeEndMs ? 'active' : 'displaying';
  return { number, startMs, activeEndMs, endMs, status };
}

// ── URL validation / normalization ───────────────────────────────────────────
const PLATFORMS = [
  { key: 'youtube',   test: h => /(^|\.)youtube\.com$/.test(h) || h === 'youtu.be' || h === 'youtube-nocookie.com' },
  { key: 'tiktok',    test: h => /(^|\.)tiktok\.com$/.test(h) },
  { key: 'instagram', test: h => /(^|\.)instagram\.com$/.test(h) },
  { key: 'twitter',   test: h => /(^|\.)twitter\.com$/.test(h) || /(^|\.)x\.com$/.test(h) },
  { key: 'facebook',  test: h => /(^|\.)facebook\.com$/.test(h) || /(^|\.)fb\.com$/.test(h) || /(^|\.)fb\.watch$/.test(h) },
];

function classifyUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return { ok: false, error: 'That doesn\'t look like a valid URL.' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:')
    return { ok: false, error: 'URL must start with http(s)://' };

  const host = u.hostname.toLowerCase();
  const hit  = PLATFORMS.find(p => p.test(host));
  if (!hit)
    return { ok: false, error: 'Only Instagram, X/Twitter, TikTok, YouTube, and Facebook links are accepted.' };

  // Canonicalise for duplicate-check: host + path + whitelisted query params
  const cleanHost = host.replace(/^www\./, '');
  const cleanPath = u.pathname.replace(/\/+$/, '').toLowerCase();
  const keepKeys  = new Set(['v']); // YouTube /watch?v=XXX
  const kept = [...u.searchParams.entries()]
    .filter(([k]) => keepKeys.has(k.toLowerCase()))
    .map(([k, v]) => `${k.toLowerCase()}=${v}`)
    .sort()
    .join('&');
  const normalized = cleanHost + cleanPath + (kept ? '?' + kept : '');
  const cleanUrl   = u.toString();

  return { ok: true, platform: hit.key, normalized, url: cleanUrl };
}

// ── RPC helper: fetch token accounts under a given program ───────────────────
async function rpcCall(method, params) {
  const body = { jsonrpc: '2.0', id: 1, method, params };
  for (const url of RPCS) {
    try {
      const r = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!r.ok) continue;
      const data = await r.json();
      if (data?.error) continue;
      return data?.result;
    } catch (_) { continue; }
  }
  throw new Error('All RPC endpoints failed');
}

async function walletOwnsVerifiedNFT(wallet) {
  const cacheKey = `rewards:nftcache:${wallet}`;
  const cached   = await kv.get(cacheKey);
  if (cached && typeof cached.verified === 'boolean') return cached.verified;

  // Check BOTH standard Token program and Token-2022 (belt-and-suspenders)
  const programs = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
  let owned = false;
  for (const pid of programs) {
    try {
      const result = await rpcCall('getTokenAccountsByOwner', [
        wallet,
        { programId: pid },
        { encoding: 'jsonParsed' },
      ]);
      const accounts = result?.value || [];
      for (const acc of accounts) {
        const info = acc?.account?.data?.parsed?.info;
        if (!info) continue;
        const amt  = info.tokenAmount;
        if (!amt) continue;
        // NFT heuristic: decimals 0 + exactly 1 held
        if (amt.decimals === 0 && amt.uiAmount === 1 && VERIFIED_MINTS.has(info.mint)) {
          owned = true; break;
        }
      }
    } catch (_) { /* try next program */ }
    if (owned) break;
  }

  await kv.set(cacheKey, { verified: owned, at: Date.now() }, { ex: NFT_CACHE_TTL_SEC });
  return owned;
}

// ── Registration ─────────────────────────────────────────────────────────────
async function registerWalletForSeason(wallet, seasonNum) {
  await kv.sadd(`rewards:season:${seasonNum}:registered`, wallet);
}

// ═════════════════════════════════════════════════════════════════════════════
//  HANDLER
// ═════════════════════════════════════════════════════════════════════════════
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'POST only.' });

  // Every POST action requires a valid arcade JWT
  let payload;
  try { payload = await verifyJWT(req.headers.authorization); }
  catch { return res.status(401).json({ error: 'Please sign in with your wallet first.' }); }

  const wallet = payload.sub;
  if (!wallet) return res.status(401).json({ error: 'Invalid session.' });

  const action = (req.query.action || '').toLowerCase();

  try {
    // ── VERIFY NFT + REGISTER ───────────────────────────────────────────────
    if (action === 'verify') {
      const season = await currentSeasonInfo();
      const verified = await walletOwnsVerifiedNFT(wallet);
      if (!verified)
        return res.status(403).json({
          error: 'No Big Head Billionaires NFT found in this wallet. You need to hold one to register.',
          verified: false,
        });

      const alreadyRegistered = await kv.sismember(`rewards:season:${season.number}:registered`, wallet);
      if (!alreadyRegistered) await registerWalletForSeason(wallet, season.number);

      return res.status(200).json({
        verified: true,
        registered: true,
        wasAlreadyRegistered: !!alreadyRegistered,
        seasonNumber: season.number,
      });
    }

    // ── SUBMIT A CLIP ───────────────────────────────────────────────────────
    if (action === 'submit') {
      const season = await currentSeasonInfo();
      if (season.status === 'pending')
        return res.status(403).json({
          error: 'Season ' + season.number + ' hasn\'t started yet. Submissions open on ' + new Date(season.startMs).toLocaleString() + '.',
        });
      if (season.status !== 'active')
        return res.status(403).json({
          error: 'Season ' + season.number + ' is over. Final results are displayed — new submissions open when the next season begins.',
        });

      const rawUrl = (req.body?.url || '').trim();
      if (!rawUrl) return res.status(400).json({ error: 'A clip URL is required.' });
      if (rawUrl.length > 500) return res.status(400).json({ error: 'URL is too long.' });

      const cls = classifyUrl(rawUrl);
      if (!cls.ok) return res.status(400).json({ error: cls.error });

      // Auto-register (and NFT-check) if not yet registered for this season
      const isRegistered = await kv.sismember(`rewards:season:${season.number}:registered`, wallet);
      if (!isRegistered) {
        const verified = await walletOwnsVerifiedNFT(wallet);
        if (!verified)
          return res.status(403).json({
            error: 'No Big Head Billionaires NFT found in this wallet. You need to hold one to submit clips.',
            verified: false,
          });
        await registerWalletForSeason(wallet, season.number);
      }

      // 24-hour cooldown
      const lastKey = `rewards:season:${season.number}:last:${wallet}`;
      const lastAt  = await kv.get(lastKey);
      if (lastAt) {
        const elapsed = Date.now() - Number(lastAt);
        if (elapsed < COOLDOWN_MS) {
          const remaining = COOLDOWN_MS - elapsed;
          return res.status(429).json({
            error: 'You can only submit once every 24 hours.',
            nextAllowedAt: Number(lastAt) + COOLDOWN_MS,
            msRemaining:   remaining,
          });
        }
      }

      // Per-season clip cap (defence-in-depth; cooldown normally prevents this)
      const currentCount = Number(await kv.zscore(`rewards:season:${season.number}:lb`, wallet) || 0);
      if (currentCount >= ACTIVE_DAYS)
        return res.status(403).json({ error: 'You\'ve already submitted the maximum of 28 clips this season. 🎉' });

      // Duplicate URL check — SADD is atomic; 0 means the key was already in the set
      const urlsKey = `rewards:season:${season.number}:urls`;
      const added   = await kv.sadd(urlsKey, cls.normalized);
      if (added === 0)
        return res.status(409).json({ error: 'That link has already been submitted this season.' });

      const user = await kv.get(`user:${wallet}`);
      const displayName = user?.displayName || null;

      const entry = {
        url:        cls.url,
        normalized: cls.normalized,
        platform:   cls.platform,
        at:         Date.now(),
        wallet,
        shortWallet: wallet.slice(0, 4) + '…' + wallet.slice(-4),
        displayName,
      };

      // Persist in parallel
      await Promise.all([
        kv.lpush(`rewards:season:${season.number}:subs:${wallet}`, JSON.stringify(entry)),
        kv.zincrby(`rewards:season:${season.number}:lb`, 1, wallet),
        kv.set(lastKey, entry.at, { ex: Math.ceil(COOLDOWN_MS / 1000) }),
        (async () => {
          const recentKey = `rewards:season:${season.number}:recent`;
          await kv.lpush(recentKey, JSON.stringify(entry));
          await kv.ltrim(recentKey, 0, RECENT_MAX - 1);
        })(),
      ]);

      const newCount = currentCount + 1;
      const payout   = newCount >= ACTIVE_DAYS ? 500_000 : newCount * 15_000;

      return res.status(200).json({
        saved: true,
        clips: newCount,
        payout,
        perfect: newCount >= ACTIVE_DAYS,
        nextAllowedAt: entry.at + COOLDOWN_MS,
        entry,
      });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  } catch (err) {
    console.error('[rewards/submit] error:', err);
    return res.status(500).json({ error: 'Server error while processing submission.' });
  }
};
