/**
 * BHB Games – Wallet Auth API
 *
 * GET  /api/games/auth?action=nonce&wallet=<base58>
 *   → { nonce }
 *
 * POST /api/games/auth?action=verify
 *   body: { wallet, signature, nonce }
 *   → { token, displayName, shortWallet, isNew }
 *
 * POST /api/games/auth?action=set-name
 *   header: Authorization: Bearer <jwt>
 *   body:   { displayName }
 *   → { token, displayName }
 *
 * Dependencies: npm i @vercel/kv tweetnacl bs58 jose
 * Env vars:     GAMES_JWT_SECRET, SITE_ORIGIN
 *               KV_URL, KV_REST_API_URL, KV_REST_API_TOKEN (auto from Vercel KV)
 */

import { kv }                from '@vercel/kv';
import nacl                  from 'tweetnacl';
import bs58                  from 'bs58';
import { SignJWT, jwtVerify } from 'jose';
import { randomBytes }       from 'crypto';

const ORIGIN     = process.env.SITE_ORIGIN || 'https://bigheadbillionaires.com';
const JWT_SECRET = new TextEncoder().encode(
  process.env.GAMES_JWT_SECRET || 'bhb-games-change-this-secret'
);
const JWT_TTL  = '30d';
const NONCE_TTL = 300; // 5 minutes in seconds

function setCors(res, req) {
  const allowed = [ORIGIN, 'https://bhaleyart.github.io'];
  const origin  = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin',  allowed.includes(origin) ? origin : ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function issueToken(wallet, displayName) {
  return new SignJWT({ sub: wallet, displayName: displayName || null })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_TTL)
    .sign(JWT_SECRET);
}

async function verifyJWT(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) throw new Error('no token');
  const { payload } = await jwtVerify(authHeader.slice(7), JWT_SECRET);
  return payload;
}

function short(addr) {
  return addr.slice(0, 4) + '…' + addr.slice(-4);
}

// The exact message the frontend must sign — keep in sync with client JS
function buildMessage(nonce) {
  return `Welcome to BHB Arcade!\n\nSigning this proves wallet ownership.\nNo transaction or gas fee.\n\nNonce: ${nonce}`;
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  // ── GET NONCE ─────────────────────────────────────────────────────────────
  if (action === 'nonce') {
    if (req.method !== 'GET') return res.status(405).end();
    const { wallet } = req.query;
    if (!wallet) return res.status(400).json({ error: 'wallet param required' });
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet))
      return res.status(400).json({ error: 'Invalid wallet address' });

    const nonce = randomBytes(16).toString('hex');
    await kv.set(`nonce:${wallet}`, nonce, { ex: NONCE_TTL });
    return res.status(200).json({ nonce });
  }

  if (req.method !== 'POST') return res.status(405).end();

  // ── VERIFY WALLET SIGNATURE ───────────────────────────────────────────────
  if (action === 'verify') {
    const { wallet, signature: sigB64, nonce } = req.body || {};
    if (!wallet || !sigB64 || !nonce)
      return res.status(400).json({ error: 'wallet, signature, and nonce required' });

    // One-time nonce check
    const stored = await kv.get(`nonce:${wallet}`);
    if (!stored || stored !== nonce)
      return res.status(401).json({ error: 'Invalid or expired challenge. Please try again.' });
    await kv.del(`nonce:${wallet}`);

    // Ed25519 verification
    try {
      const msgBytes = new TextEncoder().encode(buildMessage(nonce));
      const pubBytes = bs58.decode(wallet);
      const sigBytes = Buffer.from(sigB64, 'base64');
      if (!nacl.sign.detached.verify(msgBytes, sigBytes, pubBytes))
        return res.status(401).json({ error: 'Signature invalid.' });
    } catch {
      return res.status(401).json({ error: 'Could not verify signature.' });
    }

    // Load or create user record
    const userKey = `user:${wallet}`;
    let user = await kv.get(userKey);
    const isNew = !user;
    if (!user) {
      user = { wallet, displayName: null, createdAt: Date.now() };
      await kv.set(userKey, user);
    }

    const token = await issueToken(wallet, user.displayName);
    return res.status(200).json({
      token,
      wallet,
      displayName: user.displayName,
      shortWallet: short(wallet),
      isNew,
    });
  }

  // ── SET / UPDATE DISPLAY NAME ─────────────────────────────────────────────
  if (action === 'set-name') {
    let payload;
    try { payload = await verifyJWT(req.headers.authorization); }
    catch { return res.status(401).json({ error: 'Please sign in first.' }); }

    const trimmed = (req.body?.displayName || '').trim().slice(0, 24);
    if (trimmed.length < 2)
      return res.status(400).json({ error: 'Display name must be at least 2 characters.' });

    const userKey = `user:${payload.sub}`;
    const user    = await kv.get(userKey) || { wallet: payload.sub, createdAt: Date.now() };
    user.displayName = trimmed;
    await kv.set(userKey, user);
    await kv.set(`dname:${payload.sub}`, trimmed); // fast lookup for leaderboard

    const token = await issueToken(payload.sub, trimmed);
    return res.status(200).json({ token, displayName: trimmed, wallet: payload.sub });
  }

  return res.status(400).json({ error: 'Unknown action.' });
}
