/**
 * BHB Voting — DAO Issue / Vote API  [CommonJS]
 *
 * GET  /api/voting?action=list                       → active + archived issues (summary)
 * GET  /api/voting?action=issue&id=XXX               → single issue detail + viewer status
 * POST /api/voting?action=raise      (JWT)           → create new issue (requires BURG payment tx)
 *      Body: {
 *        title, description,
 *        optionType: 'text' | 'nomination',
 *        option1, option1Link?,    option2, option2Link?,
 *        creatorMint,              tiebreak: 1 | 2,
 *        paymentTxSig
 *      }
 * POST /api/voting?action=vote       (JWT)           → cast vote
 *      Body: { issueId, choice: 1 | 2 | 0 (=abstain), anonymous?: boolean }
 * POST /api/voting?action=veto       (JWT, treasury) → nullify an issue
 *      Body: { issueId }
 *
 * Reuses GAMES_JWT_SECRET so arcade sign-ins carry over.
 *
 * npm i @upstash/redis jose
 * Env: KV_REST_API_URL, KV_REST_API_TOKEN, GAMES_JWT_SECRET, SITE_ORIGIN,
 *      SOLANA_RPC_URL (optional), BURG_MINT, BURG_DECIMALS, TREASURY_WALLET, ISSUE_FEE_BURG (optional overrides)
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

// ── Config ───────────────────────────────────────────────────────────────────
const DAY_MS          = 24 * 60 * 60 * 1000;
const VOTING_DAYS     = 28;
const VOTING_MS       = VOTING_DAYS * DAY_MS;
const MAX_CONCURRENT  = 5;
const NFT_CACHE_TTL   = 60;            // seconds — short since wallet balances shift
const RECENT_MAX      = 15;
const TITLE_MAX       = 140;
const DESC_MAX        = 800;
const OPT_TEXT_MAX    = 80;

const TREASURY_WALLET = process.env.TREASURY_WALLET || '9eMPEUrH46tbj67Y1uESNg9mzna7wi3J6ZoefsFkivcx';
const BURG_MINT       = process.env.BURG_MINT       || '6disLregVtZ8qKpTTGyW81mbfAS9uwvHwjKfy6LApump';
const BURG_DECIMALS   = Number(process.env.BURG_DECIMALS || 6);
const ISSUE_FEE_BURG  = Number(process.env.ISSUE_FEE_BURG || 100_000);
// Fee expressed in base units (BigInt)
const ISSUE_FEE_RAW   = BigInt(ISSUE_FEE_BURG) * (10n ** BigInt(BURG_DECIMALS));

// Solana RPC — prefer Helius via env, fall back to public RPCs
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function short(addr) { return addr ? addr.slice(0, 4) + '…' + addr.slice(-4) : '???'; }
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
function genId() {
  // millisecond timestamp + 6 random base36 chars → sortable + unique
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function verifyJWT(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) throw new Error('no token');
  const { payload } = await jwtVerify(authHeader.slice(7), JWT_SECRET);
  return payload;
}
async function verifyJWTOptional(authHeader) {
  try { return await verifyJWT(authHeader); } catch { return null; }
}

// ── Solana RPC call with fallback ────────────────────────────────────────────
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

// ── Enumerate wallet's owned verified BHB mints ──────────────────────────────
async function walletOwnedVerifiedMints(wallet) {
  const cacheKey = `voting:ownedmints:${wallet}`;
  const cached   = await kv.get(cacheKey);
  if (cached && Array.isArray(cached.mints)) return cached.mints;

  const found = new Set();
  for (const pid of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
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
        const amt = info.tokenAmount;
        if (!amt) continue;
        if (amt.decimals === 0 && amt.uiAmount === 1 && VERIFIED_MINTS.has(info.mint)) {
          found.add(info.mint);
        }
      }
    } catch (_) { /* try next program */ }
  }

  const mints = Array.from(found);
  await kv.set(cacheKey, { mints, at: Date.now() }, { ex: NFT_CACHE_TTL });
  return mints;
}

// ── BURG payment verification ────────────────────────────────────────────────
async function verifyBurgPayment(txSig, expectedSigner) {
  if (!txSig || typeof txSig !== 'string' || txSig.length < 32 || txSig.length > 128)
    throw new Error('Missing or invalid payment transaction signature.');

  // Idempotency — same tx cannot back two issues
  const already = await kv.sismember('voting:txs:used', txSig);
  if (already) throw new Error('That payment transaction was already used.');

  // Fetch with retries — confirmation can lag briefly after signAndSend
  let tx = null;
  for (let attempt = 0; attempt < 6 && !tx; attempt++) {
    try {
      tx = await rpcCall('getTransaction', [
        txSig,
        { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' },
      ]);
    } catch (_) {}
    if (!tx) await new Promise(r => setTimeout(r, 1200));
  }
  if (!tx) throw new Error('Payment transaction not found on-chain yet — wait a few seconds and retry.');
  if (tx.meta?.err) throw new Error('Payment transaction failed on-chain.');

  // Signer check
  const keys = tx.transaction?.message?.accountKeys || [];
  const signerMatch = keys.some(k =>
    (typeof k === 'string' ? k : k.pubkey) === expectedSigner &&
    (typeof k === 'string' ? true : k.signer)
  );
  if (!signerMatch) throw new Error('Payment was not signed by your connected wallet.');

  // Delta on treasury's BURG ATA
  const pre  = tx.meta?.preTokenBalances  || [];
  const post = tx.meta?.postTokenBalances || [];
  let delta = 0n;
  for (const p of post) {
    if (p.owner !== TREASURY_WALLET || p.mint !== BURG_MINT) continue;
    const pm = pre.find(x => x.accountIndex === p.accountIndex);
    const postAmt = BigInt(p.uiTokenAmount.amount || '0');
    const preAmt  = pm ? BigInt(pm.uiTokenAmount.amount || '0') : 0n;
    delta += (postAmt - preAmt);
  }
  if (delta < ISSUE_FEE_RAW)
    throw new Error(`Payment short — treasury must receive ${ISSUE_FEE_BURG.toLocaleString()} BURG in one transaction.`);

  await kv.sadd('voting:txs:used', txSig);
  return true;
}

// ── Validation for raise-issue body ──────────────────────────────────────────
function validateRaiseBody(body) {
  const out = {};
  const title = String(body?.title || '').trim();
  if (title.length < 4)  throw new Error('Title must be at least 4 characters.');
  if (title.length > TITLE_MAX) throw new Error(`Title too long (${TITLE_MAX} max).`);
  out.title = title;

  const description = String(body?.description || '').trim();
  if (description.length > DESC_MAX) throw new Error(`Description too long (${DESC_MAX} max).`);
  out.description = description;

  const optionType = String(body?.optionType || 'text').toLowerCase();
  if (!['text', 'nomination'].includes(optionType)) throw new Error('optionType must be "text" or "nomination".');
  out.optionType = optionType;

  const op1 = String(body?.option1 || '').trim();
  const op2 = String(body?.option2 || '').trim();
  if (!op1 || !op2) throw new Error('Both options are required.');
  if (op1.length > OPT_TEXT_MAX || op2.length > OPT_TEXT_MAX) throw new Error(`Option text too long (${OPT_TEXT_MAX} max).`);
  if (op1.toLowerCase() === op2.toLowerCase()) throw new Error('Options must differ.');
  out.option1 = op1;
  out.option2 = op2;

  if (optionType === 'nomination') {
    const link1 = String(body?.option1Link || '').trim();
    const link2 = String(body?.option2Link || '').trim();
    if (!link1 || !link2) throw new Error('Nominations require profile links for both options.');
    for (const [lbl, l] of [['Option 1', link1], ['Option 2', link2]]) {
      let u;
      try { u = new URL(l); } catch { throw new Error(`${lbl} profile link is not a valid URL.`); }
      const h = u.hostname.toLowerCase();
      if (!/(^|\.)twitter\.com$/.test(h) && !/(^|\.)x\.com$/.test(h))
        throw new Error(`${lbl} must be a twitter.com or x.com profile URL.`);
    }
    out.option1Link = link1;
    out.option2Link = link2;
  }

  const tiebreak = parseInt(body?.tiebreak, 10);
  if (tiebreak !== 1 && tiebreak !== 2) throw new Error('Your tiebreaker vote must be Option 1 or Option 2.');
  out.tiebreak = tiebreak;

  const creatorMint = String(body?.creatorMint || '').trim();
  if (!creatorMint) throw new Error('creatorMint is required.');
  out.creatorMint = creatorMint;

  const paymentTxSig = String(body?.paymentTxSig || '').trim();
  if (!paymentTxSig) throw new Error('paymentTxSig is required.');
  out.paymentTxSig = paymentTxSig;

  return out;
}

// ── Resolution ───────────────────────────────────────────────────────────────
/**
 * Resolve an expired issue exactly once.
 * Rules:
 *   option1 > option2                           → winner = 1
 *   option2 > option1                           → winner = 2
 *   option1 == option2 && option1 > 0           → winner = creator's tiebreak
 *   option1 == option2 == 0                     → no winner ("closed without outcome")
 * Abstain does not affect outcome — it's participation without a stance.
 */
async function maybeResolve(issueId) {
  const lockKey = `voting:resolve:lock:${issueId}`;
  const gotLock = await kv.set(lockKey, '1', { nx: true, ex: 30 });
  if (!gotLock) return;   // another worker is resolving

  try {
    const issue = await kv.get(`voting:issue:${issueId}`);
    if (!issue || issue.status !== 'active') return;
    if (Date.now() < issue.endsAt) return;

    const tallies = (await kv.get(`voting:issue:${issueId}:tallies`)) || { option1: 0, option2: 0, abstain: 0 };
    const o1 = Number(tallies.option1 || 0);
    const o2 = Number(tallies.option2 || 0);

    let winner      = 0;           // 0 = none, 1 = option1, 2 = option2
    let tieBroken   = false;
    if (o1 === 0 && o2 === 0) {
      winner = 0;
    } else if (o1 > o2) {
      winner = 1;
    } else if (o2 > o1) {
      winner = 2;
    } else {
      winner    = issue.tiebreak;  // creator's stored tiebreak
      tieBroken = true;
    }

    const resolved = {
      ...issue,
      status:     'ended',
      winner,
      tieBroken,
      resolvedAt: Date.now(),
      finalTallies: { option1: o1, option2: o2, abstain: Number(tallies.abstain || 0) },
    };
    await kv.set(`voting:issue:${issueId}`, resolved);
    await kv.srem('voting:issues:active', issueId);
    await kv.zadd('voting:issues:ended', { score: resolved.resolvedAt, member: issueId });
  } finally {
    // Don't bother deleting the lock — it expires in 30 s
  }
}

// ── Serialize issue for the wire ─────────────────────────────────────────────
async function hydrateIssue(issue, { viewerWallet = null, viewerMints = null } = {}) {
  const tallies = (await kv.get(`voting:issue:${issue.id}:tallies`)) || { option1: 0, option2: 0, abstain: 0 };
  const total   = Number(tallies.option1 || 0) + Number(tallies.option2 || 0) + Number(tallies.abstain || 0);

  // Viewer-specific flags — ONLY if viewer is signed in
  let viewerCanVote   = false;
  let viewerHasVoted  = false;
  let viewerEligibleMints = 0;
  if (viewerWallet && issue.status === 'active' && Date.now() < issue.endsAt) {
    // "has voted" = any of their currently-owned mints is already in the issue's used set
    const mints = viewerMints ?? (await walletOwnedVerifiedMints(viewerWallet));
    if (mints.length) {
      // Check each mint against the issue's used-mints set (pipelined in parallel)
      const checks = await Promise.all(
        mints.map(m => kv.sismember(`voting:issue:${issue.id}:mints`, m))
      );
      const unusedCount = checks.filter(b => !b).length;
      viewerEligibleMints = unusedCount;
      viewerCanVote  = unusedCount > 0;
      viewerHasVoted = unusedCount < mints.length;
    }
  }

  const payload = {
    id:           issue.id,
    title:        issue.title,
    description:  issue.description || '',
    optionType:   issue.optionType,
    option1:      issue.option1,
    option2:      issue.option2,
    option1Link:  issue.option1Link || null,
    option2Link:  issue.option2Link || null,
    creator:      issue.creatorName,
    creatorShort: short(issue.creatorWallet),
    creatorWallet: issue.creatorWallet,
    createdAt:    issue.createdAt,
    endsAt:       issue.endsAt,
    status:       issue.status,
    tallies:      { option1: Number(tallies.option1 || 0), option2: Number(tallies.option2 || 0), abstain: Number(tallies.abstain || 0) },
    totalVotes:   total,
    msUntilEnd:   Math.max(0, issue.endsAt - Date.now()),
    viewer:       viewerWallet ? { canVote: viewerCanVote, hasVoted: viewerHasVoted, eligibleMints: viewerEligibleMints, isCreator: viewerWallet === issue.creatorWallet } : null,
  };
  if (issue.status === 'ended') {
    payload.winner        = issue.winner;
    payload.tieBroken     = !!issue.tieBroken;
    payload.resolvedAt    = issue.resolvedAt || null;
    payload.finalTallies  = issue.finalTallies || payload.tallies;
  }
  if (issue.status === 'vetoed') {
    payload.vetoedAt = issue.vetoedAt || null;
  }
  return payload;
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
    //  GET actions
    // ─────────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const viewer = await verifyJWTOptional(req.headers.authorization);
      const viewerWallet = viewer?.sub || null;

      // Pre-fetch viewer's owned mints once per request (used by every issue)
      const viewerMints = viewerWallet ? await walletOwnedVerifiedMints(viewerWallet) : null;

      // ── LIST: active + recent archive ──────────────────────────────────
      if (action === 'list' || action === '') {
        // Grab active set, auto-resolve any past their endsAt
        const activeIds = await kv.smembers('voting:issues:active');
        await Promise.all(activeIds.map(id => maybeResolve(id)));

        // Re-read active after any resolutions
        const remainingActive = await kv.smembers('voting:issues:active');
        const activeIssues = (await Promise.all(
          remainingActive.map(id => kv.get(`voting:issue:${id}`))
        )).filter(Boolean);

        // Recent ended (newest first)
        const endedIds = await kv.zrange('voting:issues:ended', 0, 24, { rev: true });
        const endedIssues = (await Promise.all(
          (endedIds || []).map(id => kv.get(`voting:issue:${id}`))
        )).filter(Boolean);

        const [activeOut, endedOut] = await Promise.all([
          Promise.all(activeIssues.map(i => hydrateIssue(i, { viewerWallet, viewerMints }))),
          Promise.all(endedIssues.map(i => hydrateIssue(i, { viewerWallet, viewerMints }))),
        ]);
        // Sort active by newest first
        activeOut.sort((a, b) => b.createdAt - a.createdAt);

        return res.status(200).json({
          active:       activeOut,
          ended:        endedOut,
          activeCount:  activeOut.length,
          maxConcurrent: MAX_CONCURRENT,
          feeBurg:      ISSUE_FEE_BURG,
          treasuryWallet: TREASURY_WALLET,
          burgMint:     BURG_MINT,
          burgDecimals: BURG_DECIMALS,
          votingDays:   VOTING_DAYS,
          isTreasury:   !!viewerWallet && viewerWallet === TREASURY_WALLET,
        });
      }

      // ── ISSUE detail (+ recent vote feed for that issue) ───────────────
      if (action === 'issue') {
        const id = String(req.query.id || '').trim();
        if (!id) return res.status(400).json({ error: 'id is required.' });

        // Auto-resolve if needed
        await maybeResolve(id);

        const issue = await kv.get(`voting:issue:${id}`);
        if (!issue) return res.status(404).json({ error: 'Issue not found.' });

        const hydrated = await hydrateIssue(issue, { viewerWallet, viewerMints });
        const recentRaw = await kv.lrange(`voting:issue:${id}:recent`, 0, RECENT_MAX - 1);
        const recent    = (recentRaw || [])
          .map(x => typeof x === 'string' ? safeParse(x) : x)
          .filter(Boolean);
        return res.status(200).json({ issue: hydrated, recent });
      }

      return res.status(400).json({ error: 'Unknown GET action.' });
    }

    // ─────────────────────────────────────────────────────────────────────
    //  POST actions (require JWT)
    // ─────────────────────────────────────────────────────────────────────
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    let payload;
    try { payload = await verifyJWT(req.headers.authorization); }
    catch { return res.status(401).json({ error: 'Please sign in with your wallet first.' }); }
    const wallet = payload.sub;
    if (!wallet) return res.status(401).json({ error: 'Invalid session.' });

    // ── RAISE new issue ──────────────────────────────────────────────────
    if (action === 'raise') {
      // User profile must have a display name — raising is never anonymous
      const user = await kv.get(`user:${wallet}`);
      const displayName = user?.displayName;
      if (!displayName)
        return res.status(400).json({ error: 'Set a display name before raising an issue — raising is never anonymous.' });

      // Concurrency cap
      const activeIds = await kv.smembers('voting:issues:active');
      await Promise.all(activeIds.map(id => maybeResolve(id)));
      const liveCount = await kv.scard('voting:issues:active');
      if (liveCount >= MAX_CONCURRENT)
        return res.status(409).json({ error: `Max ${MAX_CONCURRENT} issues are already live. Wait for one to close.` });

      let body;
      try { body = validateRaiseBody(req.body || {}); }
      catch (e) { return res.status(400).json({ error: e.message }); }

      // Verify creator still owns the chosen mint
      const ownedMints = await walletOwnedVerifiedMints(wallet);
      if (!ownedMints.includes(body.creatorMint))
        return res.status(403).json({ error: 'You do not own the NFT you chose for your tiebreaker.' });

      // Verify BURG payment (throws on failure, marks txSig consumed on success)
      try { await verifyBurgPayment(body.paymentTxSig, wallet); }
      catch (e) { return res.status(402).json({ error: e.message }); }

      const now = Date.now();
      const id  = genId();
      const issue = {
        id,
        title:         body.title,
        description:   body.description,
        optionType:    body.optionType,
        option1:       body.option1,
        option2:       body.option2,
        option1Link:   body.option1Link || null,
        option2Link:   body.option2Link || null,
        creatorWallet: wallet,
        creatorName:   displayName,
        creatorMint:   body.creatorMint,
        tiebreak:      body.tiebreak,
        paymentTxSig:  body.paymentTxSig,
        createdAt:     now,
        endsAt:        now + VOTING_MS,
        status:        'active',
      };

      await Promise.all([
        kv.set(`voting:issue:${id}`, issue),
        kv.sadd('voting:issues:active', id),
        kv.set(`voting:issue:${id}:tallies`, { option1: 0, option2: 0, abstain: 0 }),
        // Mark creator's chosen mint as used for this issue (tiebreaker consumes it)
        kv.sadd(`voting:issue:${id}:mints`, body.creatorMint),
      ]);

      return res.status(200).json({ saved: true, issue: await hydrateIssue(issue, { viewerWallet: wallet, viewerMints: ownedMints }) });
    }

    // ── VOTE ─────────────────────────────────────────────────────────────
    if (action === 'vote') {
      const issueId = String(req.body?.issueId || '').trim();
      const rawCh   = req.body?.choice;
      const choice  = rawCh === 0 || rawCh === '0' ? 0 : parseInt(rawCh, 10);
      const anonymous = req.body?.anonymous !== false;   // default = anonymous

      if (!issueId) return res.status(400).json({ error: 'issueId is required.' });
      if (![0, 1, 2].includes(choice))
        return res.status(400).json({ error: 'choice must be 0 (abstain), 1 (option 1), or 2 (option 2).' });

      // Auto-resolve stale issue first
      await maybeResolve(issueId);

      const issue = await kv.get(`voting:issue:${issueId}`);
      if (!issue)                        return res.status(404).json({ error: 'Issue not found.' });
      if (issue.status === 'vetoed')     return res.status(403).json({ error: 'This issue was vetoed by the treasury.' });
      if (issue.status !== 'active')     return res.status(403).json({ error: 'Voting has closed on this issue.' });
      if (Date.now() >= issue.endsAt)    return res.status(403).json({ error: 'Voting has closed on this issue.' });

      // Find an owned mint that has not yet voted on this issue
      const ownedMints = await walletOwnedVerifiedMints(wallet);
      if (!ownedMints.length)
        return res.status(403).json({ error: 'No Big Head Billionaires NFT found in this wallet.' });

      // Parallel-check each mint. Use SADD with the first unused one — SADD is atomic,
      // so if another request also picks the same mint only one wins (returns 1), other returns 0.
      let usedMint = null;
      for (const mint of ownedMints) {
        const added = await kv.sadd(`voting:issue:${issueId}:mints`, mint);
        if (added === 1) { usedMint = mint; break; }
      }
      if (!usedMint)
        return res.status(409).json({ error: 'All of your NFTs have already voted on this issue.' });

      // Name handling — anonymous by default; signed requires a display name
      let displayName = null;
      if (!anonymous) {
        const u = await kv.get(`user:${wallet}`);
        displayName = u?.displayName || null;
        if (!displayName) {
          // Undo the mint-use since we refuse the vote — roll back atomically
          await kv.srem(`voting:issue:${issueId}:mints`, usedMint);
          return res.status(400).json({ error: 'You chose to sign your vote but have no display name set. Set one or vote anonymously.' });
        }
      }

      // Increment tally (we store as a hash object since Upstash auto-parses JSON)
      const tallies = (await kv.get(`voting:issue:${issueId}:tallies`)) || { option1: 0, option2: 0, abstain: 0 };
      if (choice === 1) tallies.option1 = Number(tallies.option1 || 0) + 1;
      if (choice === 2) tallies.option2 = Number(tallies.option2 || 0) + 1;
      if (choice === 0) tallies.abstain = Number(tallies.abstain || 0) + 1;
      await kv.set(`voting:issue:${issueId}:tallies`, tallies);

      // Append to recent feed (cap + trim)
      const entry = {
        at:         Date.now(),
        choice,                                // 0 | 1 | 2
        anonymous:  !!anonymous,
        displayName: anonymous ? null : displayName,
        // shortWallet only if signed — never leak wallet info for anonymous votes
        shortWallet: anonymous ? null : (wallet.slice(0, 4) + '…' + wallet.slice(-4)),
      };
      await kv.lpush(`voting:issue:${issueId}:recent`, JSON.stringify(entry));
      await kv.ltrim(`voting:issue:${issueId}:recent`, 0, RECENT_MAX - 1);

      // Return updated hydrate
      return res.status(200).json({
        saved: true,
        usedMintShort: short(usedMint),        // for toast confirmation only
        issue: await hydrateIssue(issue, { viewerWallet: wallet, viewerMints: ownedMints }),
      });
    }

    // ── VETO (treasury only) ─────────────────────────────────────────────
    if (action === 'veto') {
      if (wallet !== TREASURY_WALLET)
        return res.status(403).json({ error: 'Only the treasury wallet may veto.' });

      const issueId = String(req.body?.issueId || '').trim();
      if (!issueId) return res.status(400).json({ error: 'issueId is required.' });

      const issue = await kv.get(`voting:issue:${issueId}`);
      if (!issue)                        return res.status(404).json({ error: 'Issue not found.' });
      if (issue.status === 'vetoed')     return res.status(200).json({ alreadyVetoed: true });

      const vetoed = { ...issue, status: 'vetoed', vetoedAt: Date.now() };
      await Promise.all([
        kv.set(`voting:issue:${issueId}`, vetoed),
        kv.srem('voting:issues:active', issueId),
        kv.zadd('voting:issues:ended', { score: Date.now(), member: issueId }),
      ]);

      return res.status(200).json({ vetoed: true, issue: await hydrateIssue(vetoed, { viewerWallet: wallet }) });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  } catch (err) {
    console.error('[voting] error:', err);
    return res.status(500).json({ error: 'Server error while processing request.' });
  }
};
