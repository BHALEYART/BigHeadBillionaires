/**
 * BHB Chat API — WebRTC signaling relay + presence + text chat  [CommonJS]
 *
 * Public (no auth):
 *   GET  /api/chat?action=state                  → presence list
 *   GET  /api/chat?action=messages-list&since=ms → recent chat messages
 *
 * Auth required (Bearer JWT issued by /api/games/auth):
 *   POST /api/chat?action=join          body:{pfpMint, traits, female, displayName}
 *   POST /api/chat?action=leave
 *   POST /api/chat?action=heartbeat
 *   POST /api/chat?action=signal        body:{target, type:'offer'|'answer'|'ice', payload}
 *   GET  /api/chat?action=poll          → {peers, signals (popped from inbox)}
 *   POST /api/chat?action=messages-send body:{text}
 *
 * Reuses GAMES_JWT_SECRET so arcade sign-ins carry over.
 *
 * npm i @upstash/redis jose
 * Env: KV_REST_API_URL, KV_REST_API_TOKEN, GAMES_JWT_SECRET, SITE_ORIGIN
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

// ── Config ───────────────────────────────────────────────────────────────────
const ROOM_KEY        = 'chat:room:peers';   // ZSET — score = lastSeen ms
const MESSAGES_KEY    = 'chat:messages';     // LIST — newest first
const MAX_PEERS       = 8;
const PEER_STALE_MS   = 30_000;              // peers inactive >30s are pruned
const PEER_TTL_SEC    = 60;                  // TTL on peer:* hash
const INBOX_CAP       = 100;
const MESSAGES_CAP    = 200;
const MESSAGE_MAX_LEN = 500;
const SIGNAL_TYPES    = new Set(['offer', 'answer', 'ice']);

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

// Drop peers that haven't heartbeat in PEER_STALE_MS ms.
// Called as a side-effect of every read so the ZSET stays clean.
async function pruneStale() {
  const cutoff = Date.now() - PEER_STALE_MS;
  await kv.zremrangebyscore(ROOM_KEY, 0, cutoff);
}

// Resolve a peer list to the metadata stored on chat:peer:${wallet}
async function getPeers() {
  await pruneStale();
  const wallets = await kv.zrange(ROOM_KEY, 0, -1);
  if (!wallets.length) return [];
  const metas = await Promise.all(wallets.map(w => kv.get(`chat:peer:${w}`)));
  // Filter out any wallets whose peer:* expired between zrange and the gets
  return wallets.map((w, i) => metas[i]).filter(Boolean);
}

// ═════════════════════════════════════════════════════════════════════════════
//  HANDLER
// ═════════════════════════════════════════════════════════════════════════════
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = (req.query.action || '').toLowerCase();

  try {
    // ─────────────────────────────────────────────────────────────────────
    //  PUBLIC ACTIONS — no auth, used by viewers
    // ─────────────────────────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'state') {
      const peers = await getPeers();
      return res.status(200).json({
        peers,
        peerCount: peers.length,
        maxPeers:  MAX_PEERS,
        ts:        Date.now(),
      });
    }

    if (req.method === 'GET' && action === 'messages-list') {
      const since = parseInt(req.query.since || '0', 10);
      const raw   = await kv.lrange(MESSAGES_KEY, 0, MESSAGES_CAP - 1);
      const all   = (raw || [])
        .map(x => typeof x === 'string' ? safeParse(x) : x)
        .filter(Boolean);
      // List is newest-first; client wants chronological (oldest-first)
      const filtered = since ? all.filter(m => m.ts > since) : all;
      filtered.reverse();
      return res.status(200).json({ messages: filtered, ts: Date.now() });
    }

    // ─────────────────────────────────────────────────────────────────────
    //  AUTH-GATED ACTIONS
    // ─────────────────────────────────────────────────────────────────────
    let payload;
    try { payload = await verifyJWT(req.headers.authorization); }
    catch { return res.status(401).json({ error: 'Please sign in with your wallet first.' }); }
    const wallet = payload.sub;
    if (!wallet) return res.status(401).json({ error: 'Invalid session.' });

    // ── JOIN ──────────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'join') {
      const body = req.body || {};
      const pfpMint = String(body.pfpMint || '').trim();
      if (!pfpMint) return res.status(400).json({ error: 'PFP required to join the stage.' });

      // Validate the user actually has this PFP set on their profile
      const user = await kv.get(`user:${wallet}`);
      if (!user?.pfpMint)        return res.status(403).json({ error: 'Set a PFP on your profile before joining.' });
      if (user.pfpMint !== pfpMint) return res.status(400).json({ error: 'PFP mismatch — refresh and try again.' });

      // Capacity check (after pruning stale)
      await pruneStale();
      const alreadyIn = (await kv.zscore(ROOM_KEY, wallet)) !== null;
      if (!alreadyIn) {
        const count = await kv.zcard(ROOM_KEY);
        if (count >= MAX_PEERS) {
          return res.status(409).json({ error: `Stage is full (${MAX_PEERS}/${MAX_PEERS}). Wait for a slot.` });
        }
      }

      // Store presence + peer metadata. Traits/female are trusted client input
      // (cosmetic only — spoofing affects only how the spoofer looks to others).
      const now = Date.now();
      const meta = {
        wallet,
        shortWallet: short(wallet),
        displayName: user.displayName || body.displayName || short(wallet),
        pfpMint,
        traits:      body.traits || {},
        female:      !!body.female,
        joinedAt:    now,
      };
      await kv.zadd(ROOM_KEY, { score: now, member: wallet });
      await kv.set(`chat:peer:${wallet}`, meta, { ex: PEER_TTL_SEC });

      const peers = await getPeers();
      return res.status(200).json({ joined: true, me: meta, peers });
    }

    // ── HEARTBEAT (also implicit on poll) ─────────────────────────────────
    if (req.method === 'POST' && action === 'heartbeat') {
      const now = Date.now();
      const wasIn = (await kv.zscore(ROOM_KEY, wallet)) !== null;
      if (!wasIn) return res.status(410).json({ error: 'Not in room — re-join.' });
      await kv.zadd(ROOM_KEY, { score: now, member: wallet });
      await kv.expire(`chat:peer:${wallet}`, PEER_TTL_SEC);
      return res.status(200).json({ ok: true, ts: now });
    }

    // ── LEAVE ─────────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'leave') {
      await Promise.all([
        kv.zrem(ROOM_KEY, wallet),
        kv.del(`chat:peer:${wallet}`),
        kv.del(`chat:inbox:${wallet}`),
      ]);
      return res.status(200).json({ left: true });
    }

    // ── SIGNAL — relay WebRTC offer/answer/ICE to a target peer ──────────
    if (req.method === 'POST' && action === 'signal') {
      const { target, type, payload: sigPayload } = req.body || {};
      if (!target || !type)            return res.status(400).json({ error: 'target and type required.' });
      if (!SIGNAL_TYPES.has(type))     return res.status(400).json({ error: 'Invalid signal type.' });
      if (target === wallet)           return res.status(400).json({ error: 'Cannot signal yourself.' });

      // Sender must be in the room (otherwise it's just spam)
      const senderIn = (await kv.zscore(ROOM_KEY, wallet)) !== null;
      if (!senderIn) return res.status(403).json({ error: 'Join the stage before signaling.' });

      const msg = { from: wallet, type, payload: sigPayload, ts: Date.now() };
      await kv.lpush(`chat:inbox:${target}`, JSON.stringify(msg));
      await kv.ltrim(`chat:inbox:${target}`, 0, INBOX_CAP - 1);
      return res.status(200).json({ sent: true });
    }

    // ── POLL — bundled call: presence + signals + heartbeat side-effect ──
    if (req.method === 'GET' && action === 'poll') {
      const now = Date.now();

      // Implicit heartbeat — only if already in room (don't auto-add)
      const wasIn = (await kv.zscore(ROOM_KEY, wallet)) !== null;
      if (wasIn) {
        await kv.zadd(ROOM_KEY, { score: now, member: wallet });
        await kv.expire(`chat:peer:${wallet}`, PEER_TTL_SEC);
      }

      // Pop any pending signals destined for me
      const popped = await kv.lpop(`chat:inbox:${wallet}`, 50);
      const signals = popped
        ? (Array.isArray(popped) ? popped : [popped])
            .map(s => typeof s === 'string' ? safeParse(s) : s)
            .filter(Boolean)
        : [];

      const peers = await getPeers();
      return res.status(200).json({ peers, signals, inRoom: wasIn, ts: now });
    }

    // ── MESSAGES-SEND ─────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'messages-send') {
      const text = String(req.body?.text || '').trim();
      if (!text)                       return res.status(400).json({ error: 'Message text required.' });
      if (text.length > MESSAGE_MAX_LEN) return res.status(400).json({ error: `Message too long (${MESSAGE_MAX_LEN} max).` });

      const user = await kv.get(`user:${wallet}`);
      const message = {
        from:        wallet,
        shortWallet: short(wallet),
        displayName: user?.displayName || short(wallet),
        pfpMint:     user?.pfpMint || null,
        text,
        ts:          Date.now(),
      };
      await kv.lpush(MESSAGES_KEY, JSON.stringify(message));
      await kv.ltrim(MESSAGES_KEY, 0, MESSAGES_CAP - 1);
      return res.status(200).json({ saved: true, message });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  } catch (err) {
    console.error('[chat] error:', err);
    return res.status(500).json({
      error:  'Server error.',
      detail: err?.message || String(err),
      where:  action,
    });
  }
};
