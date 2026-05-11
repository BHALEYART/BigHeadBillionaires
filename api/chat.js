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
const ROOM_KEY        = 'chat:room:peers';      // ZSET — speakers, score = lastSeen ms
const LISTENERS_KEY   = 'chat:room:listeners';  // ZSET — listeners (audio-receive-only)
const MESSAGES_KEY    = 'chat:msgs';            // ZSET — score = ts ms
const MAX_PEERS       = 8;
const MAX_LISTENERS   = 12;                     // tune for upload bandwidth headroom
const PEER_STALE_MS   = 30_000;                 // peers inactive >30s are pruned
const PEER_TTL_SEC    = 60;                     // TTL on peer:* hash
const INBOX_CAP       = 100;
const MESSAGES_CAP    = 200;
const MESSAGE_TTL_MS  = 30 * 60 * 1000;         // chat messages expire after 30 min
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

async function pruneStaleListeners() {
  const cutoff = Date.now() - PEER_STALE_MS;
  await kv.zremrangebyscore(LISTENERS_KEY, 0, cutoff);
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

async function getListeners() {
  await pruneStaleListeners();
  const wallets = await kv.zrange(LISTENERS_KEY, 0, -1);
  if (!wallets.length) return [];
  const metas = await Promise.all(wallets.map(w => kv.get(`chat:listener:${w}`)));
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
      const since  = parseInt(req.query.since || '0', 10);
      const cutoff = Date.now() - MESSAGE_TTL_MS;
      // Lazy-prune anything past the TTL so old data never gets served
      await kv.zremrangebyscore(MESSAGES_KEY, 0, cutoff);
      // ZRANGE BYSCORE returns chronological (oldest → newest), exactly what
      // the client wants for in-order appending.
      const raw = await kv.zrange(MESSAGES_KEY, cutoff, '+inf', { byScore: true });
      const all = (raw || [])
        .map(x => typeof x === 'string' ? safeParse(x) : x)
        .filter(Boolean);
      const filtered = since ? all.filter(m => m.ts > since) : all;
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
      // If they were listening, remove them from the listener pool — a wallet
      // can only be in one role at a time. Also drop any pending signals from
      // the previous role to keep the WebRTC state machine clean.
      await Promise.all([
        kv.zrem(LISTENERS_KEY, wallet),
        kv.del(`chat:listener:${wallet}`),
        kv.del(`chat:inbox:${wallet}`),
      ]);

      const peers     = await getPeers();
      const listeners = await getListeners();
      return res.status(200).json({ joined: true, me: meta, peers, listeners });
    }

    // ── HEARTBEAT (also implicit on poll) ─────────────────────────────────
    if (req.method === 'POST' && action === 'heartbeat') {
      const now = Date.now();
      const isSpeaker  = (await kv.zscore(ROOM_KEY,      wallet)) !== null;
      const isListener = (await kv.zscore(LISTENERS_KEY, wallet)) !== null;
      if (!isSpeaker && !isListener) return res.status(410).json({ error: 'Not in room — re-join.' });
      if (isSpeaker) {
        await kv.zadd(ROOM_KEY, { score: now, member: wallet });
        await kv.expire(`chat:peer:${wallet}`, PEER_TTL_SEC);
      }
      if (isListener) {
        await kv.zadd(LISTENERS_KEY, { score: now, member: wallet });
        await kv.expire(`chat:listener:${wallet}`, PEER_TTL_SEC);
      }
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

      // Sender must be in the room as either a speaker or a listener
      const isSpeaker  = (await kv.zscore(ROOM_KEY,      wallet)) !== null;
      const isListener = (await kv.zscore(LISTENERS_KEY, wallet)) !== null;
      if (!isSpeaker && !isListener) return res.status(403).json({ error: 'Join the stage or listen-in before signaling.' });

      const msg = { from: wallet, type, payload: sigPayload, ts: Date.now() };
      await kv.lpush(`chat:inbox:${target}`, JSON.stringify(msg));
      await kv.ltrim(`chat:inbox:${target}`, 0, INBOX_CAP - 1);
      return res.status(200).json({ sent: true });
    }

    // ── POLL — bundled call: presence + signals + heartbeat side-effect ──
    if (req.method === 'GET' && action === 'poll') {
      const now = Date.now();

      // Implicit heartbeat — refresh whichever role they're in
      const isSpeaker  = (await kv.zscore(ROOM_KEY,      wallet)) !== null;
      const isListener = (await kv.zscore(LISTENERS_KEY, wallet)) !== null;
      if (isSpeaker) {
        await kv.zadd(ROOM_KEY, { score: now, member: wallet });
        await kv.expire(`chat:peer:${wallet}`, PEER_TTL_SEC);
      }
      if (isListener) {
        await kv.zadd(LISTENERS_KEY, { score: now, member: wallet });
        await kv.expire(`chat:listener:${wallet}`, PEER_TTL_SEC);
      }

      // Pop any pending signals destined for me
      const popped = await kv.lpop(`chat:inbox:${wallet}`, 50);
      const signals = popped
        ? (Array.isArray(popped) ? popped : [popped])
            .map(s => typeof s === 'string' ? safeParse(s) : s)
            .filter(Boolean)
        : [];

      const peers     = await getPeers();
      const listeners = await getListeners();
      return res.status(200).json({
        peers, listeners, signals,
        inRoom:      isSpeaker,
        isListening: isListener,
        ts: now,
      });
    }

    // ── LISTEN — register as audio-receiving spectator ────────────────────
    if (req.method === 'POST' && action === 'listen') {
      await pruneStaleListeners();
      const alreadyListening = (await kv.zscore(LISTENERS_KEY, wallet)) !== null;
      if (!alreadyListening) {
        const count = await kv.zcard(LISTENERS_KEY);
        if (count >= MAX_LISTENERS) {
          return res.status(409).json({ error: `Audience full (${MAX_LISTENERS}/${MAX_LISTENERS}).` });
        }
      }
      // Can't be a speaker AND a listener — drop speaker presence if they had it.
      // Also drop any pending signals from the previous role so we don't
      // process stale offers/answers/ICE meant for a connection that no
      // longer exists.
      await Promise.all([
        kv.zrem(ROOM_KEY, wallet),
        kv.del(`chat:peer:${wallet}`),
        kv.del(`chat:inbox:${wallet}`),
      ]);

      const user = await kv.get(`user:${wallet}`);
      const now  = Date.now();
      const meta = {
        wallet,
        shortWallet: short(wallet),
        displayName: user?.displayName || short(wallet),
        joinedAt:    now,
      };
      await kv.zadd(LISTENERS_KEY, { score: now, member: wallet });
      await kv.set(`chat:listener:${wallet}`, meta, { ex: PEER_TTL_SEC });

      const peers     = await getPeers();
      const listeners = await getListeners();
      return res.status(200).json({ listening: true, me: meta, peers, listeners });
    }

    // ── UNLISTEN ──────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'unlisten') {
      await Promise.all([
        kv.zrem(LISTENERS_KEY, wallet),
        kv.del(`chat:listener:${wallet}`),
        kv.del(`chat:inbox:${wallet}`),
      ]);
      return res.status(200).json({ unlistened: true });
    }

    // ── MESSAGES-SEND ─────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'messages-send') {
      const text = String(req.body?.text || '').trim();
      if (!text)                         return res.status(400).json({ error: 'Message text required.' });
      if (text.length > MESSAGE_MAX_LEN) return res.status(400).json({ error: `Message too long (${MESSAGE_MAX_LEN} max).` });

      const user = await kv.get(`user:${wallet}`);
      const now = Date.now();
      // Random suffix keeps ZSET members unique even if two messages land
      // in the same millisecond (their JSON would otherwise be identical).
      const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
      const message = {
        id,
        from:        wallet,
        shortWallet: short(wallet),
        displayName: user?.displayName || short(wallet),
        pfpMint:     user?.pfpMint || null,
        text,
        ts:          now,
      };
      await kv.zadd(MESSAGES_KEY, { score: now, member: JSON.stringify(message) });
      // Drop anything past the TTL on every write
      await kv.zremrangebyscore(MESSAGES_KEY, 0, now - MESSAGE_TTL_MS);
      // Hard cap on count as a safety net (unlikely with 30-min TTL but cheap)
      const total = await kv.zcard(MESSAGES_KEY);
      if (total > MESSAGES_CAP) {
        await kv.zremrangebyrank(MESSAGES_KEY, 0, total - MESSAGES_CAP - 1);
      }
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
