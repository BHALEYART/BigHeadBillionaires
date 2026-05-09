/**
 * BHB Profile API — User profile, PFP, and aggregated history  [CommonJS]
 *
 * GET  /api/profile?action=overview              → user info + scores + season + voting (JWT)
 * GET  /api/profile?action=my-nfts               → metadata for held BHB NFTs (JWT)
 * POST /api/profile?action=set-pfp   body:{mint} → save selected PFP mint   (JWT)
 * POST /api/profile?action=clear-pfp             → unset PFP                (JWT)
 * POST /api/profile?action=set-name  body:{displayName}                     (JWT)
 *
 * Reuses GAMES_JWT_SECRET so arcade sign-ins carry over — same auth shape as
 * games/scores, rewards/season, and voting.
 *
 * npm i @upstash/redis jose
 * Env: KV_REST_API_URL, KV_REST_API_TOKEN, GAMES_JWT_SECRET, SITE_ORIGIN, SOLANA_RPC_URL
 */

const { Redis }     = require('@upstash/redis');
const { jwtVerify } = require('jose');
const { VERIFIED_MINTS } = require('./rewards/_mints');

const kv = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const ORIGIN     = process.env.SITE_ORIGIN || 'https://bigheadbillionaires.com';
const JWT_SECRET = new TextEncoder().encode(
  process.env.GAMES_JWT_SECRET || 'bhb-games-change-this-secret'
);

// Solana RPC chain — first entry is Helius (env), with public fallbacks.
// Note: Helius DAS methods (getAsset, getAssetBatch) only work on Helius RPC;
// the fallbacks are only useful for getTokenAccountsByOwner.
const RPCS = [
  process.env.SOLANA_RPC_URL,
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
].filter(Boolean);

const TOKEN_PROGRAM_ID      = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const NFT_CACHE_TTL         = 60;       // shared with voting.js — short, since balances shift

const VALID_GAMES_MODES = [
  ['burgerbreaker', 'campaign'],
  ['burgerbreaker', 'endless'],
  ['burgerdrop',    'campaign'],
  ['burgerdrop',    'endless'],
];

// Season constants — kept in sync with rewards/season.js
const DAY_MS         = 24 * 60 * 60 * 1000;
const ACTIVE_DAYS    = 28;
const DISPLAY_DAYS   = 2;
const CYCLE_DAYS     = ACTIVE_DAYS + DISPLAY_DAYS;
const BURG_PER_CLIP  = 15_000;
const PERFECT_PAYOUT = 500_000;
const MAX_CLIPS      = ACTIVE_DAYS;

// ── CORS ─────────────────────────────────────────────────────────────────────
function setCors(res, req) {
  const allowed = [ORIGIN, 'https://bhaleyart.github.io'];
  const origin  = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin',  allowed.includes(origin) ? origin : ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function short(addr) { return addr ? addr.slice(0, 4) + '…' + addr.slice(-4) : '???'; }
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

async function verifyJWT(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) throw new Error('no token');
  const { payload } = await jwtVerify(authHeader.slice(7), JWT_SECRET);
  return payload;
}

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
    } catch { continue; }
  }
  throw new Error('All RPC endpoints failed');
}

// ── Helius DAS — fetch metadata for a list of mints ──────────────────────────
async function fetchAssetsBatch(mints) {
  if (!mints.length) return [];
  // Helius getAssetBatch: up to 1000 ids per call
  try {
    const result = await rpcCall('getAssetBatch', { ids: mints });
    if (Array.isArray(result)) return result.filter(Boolean);
  } catch { /* fall through */ }
  // Per-asset fallback (concurrent)
  const settled = await Promise.allSettled(mints.map(id => rpcCall('getAsset', { id })));
  return settled.filter(s => s.status === 'fulfilled' && s.value).map(s => s.value);
}

function parseAsset(asset) {
  if (!asset) return null;
  const meta  = asset.content?.metadata || {};
  const links = asset.content?.links    || {};
  const files = asset.content?.files    || [];
  const imageFromFiles = files.find(f => f.mime?.startsWith('image/'))?.uri;
  const image = links.image || imageFromFiles || null;
  return {
    mint:        asset.id,
    name:        meta.name || (asset.id ? asset.id.slice(0, 8) : 'Unknown'),
    image,
    attributes:  Array.isArray(meta.attributes) ? meta.attributes : [],
  };
}

// ── Enumerate wallet's owned verified BHB mints ──────────────────────────────
// Reuses the same cache key as voting.js so a user voting then opening their
// profile doesn't double-pay the RPC cost.
async function walletOwnedVerifiedMints(wallet) {
  const cacheKey = `voting:ownedmints:${wallet}`;
  const cached   = await kv.get(cacheKey);
  if (cached && Array.isArray(cached.mints)) return cached.mints;

  const found = new Set();
  for (const pid of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    try {
      const result = await rpcCall('getTokenAccountsByOwner', [
        wallet, { programId: pid }, { encoding: 'jsonParsed' },
      ]);
      const accounts = result?.value || [];
      for (const acc of accounts) {
        const info = acc?.account?.data?.parsed?.info;
        if (!info) continue;
        const amt = info.tokenAmount;
        if (!amt) continue;
        if (amt.decimals === 0 && amt.uiAmount === 1 && VERIFIED_MINTS.has(info.mint)) {
          found.add(info.mint);
        }
      }
    } catch { /* try next program */ }
  }
  const mints = Array.from(found);
  await kv.set(cacheKey, { mints, at: Date.now() }, { ex: NFT_CACHE_TTL });
  return mints;
}

// ── Season number for current submission lookup ──────────────────────────────
async function getSeason1Start() {
  if (process.env.SEASON_1_START_MS) return Number(process.env.SEASON_1_START_MS);
  const cfg = await kv.get('rewards:config');
  return cfg?.season1StartMs || Date.now();
}
async function currentSeasonNumber() {
  const s1  = await getSeason1Start();
  const now = Date.now();
  if (now < s1) return 1;
  return Math.floor((now - s1) / (CYCLE_DAYS * DAY_MS)) + 1;
}
function computePayout(clips) {
  const c = Math.min(clips, MAX_CLIPS);
  return c >= MAX_CLIPS ? PERFECT_PAYOUT : c * BURG_PER_CLIP;
}

// ── Aggregators ──────────────────────────────────────────────────────────────
async function fetchArcade(wallet) {
  const out = {};
  await Promise.all(VALID_GAMES_MODES.map(async ([game, mode]) => {
    const lbKey = `lb:${game}:${mode}`;
    const pbKey = `pb:${game}:${mode}:${wallet}`;
    const [pb, rankIdx] = await Promise.all([
      kv.get(pbKey),
      kv.zrevrank(lbKey, wallet),
    ]);
    out[`${game}_${mode}`] = pb ? {
      score: Number(pb.score),
      level: pb.level || null,
      at:    pb.at    || null,
      rank:  rankIdx !== null ? rankIdx + 1 : null,
    } : null;
  }));
  return out;
}

async function fetchSeason(wallet, currentSeason) {
  const [registered, clipScore, subsRaw, lastMs] = await Promise.all([
    kv.sismember(`rewards:season:${currentSeason}:registered`, wallet),
    kv.zscore(`rewards:season:${currentSeason}:lb`, wallet),
    kv.lrange(`rewards:season:${currentSeason}:subs:${wallet}`, 0, -1),
    kv.get(`rewards:season:${currentSeason}:last:${wallet}`),
  ]);
  const clips = Number(clipScore || 0);
  const submissions = (subsRaw || [])
    .map(x => typeof x === 'string' ? safeParse(x) : x)
    .filter(Boolean);
  return {
    seasonNumber: currentSeason,
    registered:   !!registered,
    clips,
    payout:       computePayout(clips),
    perfect:      clips >= MAX_CLIPS,
    submissions,
    lastSubmittedAt: lastMs ? Number(lastMs) : null,
  };
}

function stripIssue(issue) {
  return {
    id:           issue.id,
    title:        issue.title,
    optionType:   issue.optionType,
    option1:      issue.option1,
    option2:      issue.option2,
    nominee:      issue.nominee || null,
    status:       issue.status,
    winner:       issue.winner ?? null,
    tieBroken:    !!issue.tieBroken,
    createdAt:    issue.createdAt,
    endsAt:       issue.endsAt,
    resolvedAt:   issue.resolvedAt || null,
    finalTallies: issue.finalTallies || null,
  };
}

async function fetchVotingHistory(wallet, ownedMints) {
  // Active issues + most recent 200 ended
  const [activeIds, endedIds] = await Promise.all([
    kv.smembers('voting:issues:active'),
    kv.zrange('voting:issues:ended', 0, 199, { rev: true }),
  ]);
  const allIds = [...(activeIds || []), ...(endedIds || [])];
  if (!allIds.length) return { voted: [], raised: [] };

  const issues = (await Promise.all(allIds.map(id => kv.get(`voting:issue:${id}`))))
    .filter(Boolean);

  // Issues raised by user (creator match)
  const raised = issues
    .filter(i => i.creatorWallet === wallet)
    .map(stripIssue)
    .sort((a, b) => b.createdAt - a.createdAt);

  // Issues voted on — check mint membership for each.
  // Note: the creator's tiebreaker mint is also in the mints set, so we
  // explicitly exclude self-raised here to keep "voted" and "raised" cleanly separate.
  let voted = [];
  if (ownedMints.length) {
    const issueResults = await Promise.all(issues.map(async issue => {
      if (issue.creatorWallet === wallet) return null;
      const checks = await Promise.all(
        ownedMints.map(m => kv.sismember(`voting:issue:${issue.id}:mints`, m))
      );
      return checks.some(Boolean) ? issue : null;
    }));
    voted = issueResults.filter(Boolean).map(stripIssue)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  return { voted, raised };
}

// ═════════════════════════════════════════════════════════════════════════════
//  HANDLER
// ═════════════════════════════════════════════════════════════════════════════
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = (req.query.action || 'overview').toLowerCase();

  // All actions require sign-in
  let payload;
  try { payload = await verifyJWT(req.headers.authorization); }
  catch { return res.status(401).json({ error: 'Please sign in with your wallet first.' }); }
  const wallet = payload.sub;
  if (!wallet) return res.status(401).json({ error: 'Invalid session.' });

  try {
    // ── OVERVIEW ─────────────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'overview') {
      const [user, ownedMints, currentSeason] = await Promise.all([
        kv.get(`user:${wallet}`),
        walletOwnedVerifiedMints(wallet),
        currentSeasonNumber(),
      ]);

      // Validate stored PFP is still owned; clear stale pointer silently
      const pfpMint = user?.pfpMint && ownedMints.includes(user.pfpMint) ? user.pfpMint : null;
      let pfpAsset = null;
      if (pfpMint) {
        const assets = await fetchAssetsBatch([pfpMint]);
        pfpAsset = parseAsset(assets[0]);
      }

      const [arcade, season, voting] = await Promise.all([
        fetchArcade(wallet),
        fetchSeason(wallet, currentSeason),
        fetchVotingHistory(wallet, ownedMints),
      ]);

      return res.status(200).json({
        user: {
          wallet,
          shortWallet: short(wallet),
          displayName: user?.displayName || null,
          pfpMint,
          pfpAsset,
          ownedCount:  ownedMints.length,
        },
        arcade,
        season,
        voting,
      });
    }

    // ── MY-NFTS (PFP picker grid) ────────────────────────────────────────
    if (req.method === 'GET' && action === 'my-nfts') {
      const ownedMints = await walletOwnedVerifiedMints(wallet);
      if (!ownedMints.length) return res.status(200).json({ nfts: [] });
      const assets = await fetchAssetsBatch(ownedMints);
      const nfts = assets.map(parseAsset).filter(Boolean);
      // Numeric sort by trailing digits in name (e.g. "BHB #042" → 42)
      nfts.sort((a, b) => {
        const na = parseInt((a.name || '').replace(/\D/g, '') || '0', 10);
        const nb = parseInt((b.name || '').replace(/\D/g, '') || '0', 10);
        return na - nb;
      });
      return res.status(200).json({ nfts });
    }

    // ── SET PFP ──────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'set-pfp') {
      const mint = String(req.body?.mint || '').trim();
      if (!mint) return res.status(400).json({ error: 'mint is required.' });

      const ownedMints = await walletOwnedVerifiedMints(wallet);
      if (!ownedMints.includes(mint))
        return res.status(403).json({ error: 'That NFT is not in your wallet (or not a verified BHB).' });

      const user = (await kv.get(`user:${wallet}`)) || {};
      user.pfpMint      = mint;
      user.pfpUpdatedAt = Date.now();
      await kv.set(`user:${wallet}`, user);

      return res.status(200).json({ saved: true, pfpMint: mint });
    }

    // ── CLEAR PFP ────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'clear-pfp') {
      const user = (await kv.get(`user:${wallet}`)) || {};
      delete user.pfpMint;
      delete user.pfpUpdatedAt;
      await kv.set(`user:${wallet}`, user);
      return res.status(200).json({ saved: true, pfpMint: null });
    }

    // Note: display-name editing lives in /api/games/auth?action=set-name.
    // That endpoint maintains the dname: index and re-issues a fresh JWT
    // with the updated name in its payload, so the profile page calls it
    // directly instead of going through here.

    return res.status(400).json({ error: 'Unknown action or method.' });
  } catch (err) {
    console.error('[profile] error:', err);
    return res.status(500).json({
      error:  'Server error while loading profile.',
      detail: err?.message || String(err),
      where:  action,
    });
  }
};
