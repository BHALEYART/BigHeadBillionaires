// api/ah-offers.js — reads active BHB Auction House bids (offers) directly from on-chain
// and joins with off-chain expiration metadata stored in Upstash Redis.
//
// BidReceipt account layout — Anchor with Borsh, two known versions:
//
//   v2 layout (269 bytes, current): adds `token_account: Option<Pubkey>`
//     0:   discriminator     [8]
//     8:   tradeState        [32]
//     40:  bookkeeper        [32]
//     72:  auctionHouse      [32]
//     104: buyer             [32]
//     136: metadata          [32]
//     168: tokenAccount tag  [1] + pubkey [32]   (tag=0 None for public_buy)
//     201: purchaseRcpt tag  [1] + pubkey [32]
//     234: price             u64 LE  [8]
//     242: tokenSize         u64 LE  [8]
//     250: bump              [1]
//     251: tradeStateBump    [1]
//     252: createdAt         i64 LE  [8]
//     260: canceledAt tag    [1] + i64 LE [8]
//
//   v1 layout (237 bytes, older program builds): no `token_account` field — all subsequent
//   offsets shift down by 33 bytes.
//
// We don't filter by dataSize because the deployed AH program at hausS13... has been seen
// in both versions across redeployments. The 8-byte discriminator is already unique.
//
// Query params:
//   ?fresh=1  — bypass the 10s in-memory cache
//   ?debug=1  — return extra diagnostics (account counts, parse outcomes)

import { Redis } from '@upstash/redis';

const AH_PROGRAM    = 'hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk';
const COLLECTION_ID = 'ECRmV6D1boYEs1mnsG96LE4W81pgTmkTAUR4uf4WyGqN';

// sha256("account:BidReceipt").slice(0, 8) — same Anchor convention as ListingReceipt
const BID_RECEIPT_DISC = Buffer.from([186, 150, 141, 135, 59, 122, 39, 99]);

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58Encode(u8) {
  let n = 0n; for (const b of u8) n = n*256n + BigInt(b);
  let s = ''; while (n > 0n) { s = B58[Number(n%58n)] + s; n /= 58n; }
  for (const b of u8) { if (b) break; s = '1' + s; } return s;
}

function readU64LE(data, off) {
  const lo = data[off]   | (data[off+1]<<8) | (data[off+2]<<16) | (data[off+3]*16777216);
  const hi = data[off+4] | (data[off+5]<<8) | (data[off+6]<<16) | (data[off+7]*16777216);
  return hi * 4294967296 + lo;
}

// Parse a BidReceipt into its meaningful fields. Returns { ok: false, reason } on layouts we don't recognize.
function parseBidReceipt(data) {
  if (data.length < 168) return { ok: false, reason: 'too-short-header' };

  const tradeState = b58Encode(data.slice(8, 40));
  const buyer      = b58Encode(data.slice(104, 136));
  const metadata   = b58Encode(data.slice(136, 168));

  let hasTokenAccount;
  if (data.length === 269)      hasTokenAccount = true;
  else if (data.length === 237) hasTokenAccount = false;
  else return { ok: false, reason: `unknown-size-${data.length}` };

  // Offsets shift by 33 if token_account field exists
  const shift = hasTokenAccount ? 33 : 0;
  const purchaseTagOff = 168 + shift;        // 201 (v2) or 168 (v1)
  const priceOff       = 201 + shift;        // 234 (v2) or 201 (v1)
  const createdAtOff   = 219 + shift;        // 252 (v2) or 219 (v1)
  const canceledTagOff = 227 + shift;        // 260 (v2) or 227 (v1)

  const purchaseTag   = data[purchaseTagOff];
  const canceledTag   = data[canceledTagOff];
  const priceLamports = readU64LE(data, priceOff);
  const createdAt     = readU64LE(data, createdAtOff); // i64; fine while > 0

  return {
    ok: true,
    layout: hasTokenAccount ? 'v2' : 'v1',
    tradeState, buyer, metadata,
    purchaseTag, canceledTag,
    priceLamports, createdAt,
  };
}

async function rpcPost(endpoint, method, params) {
  const r = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: '1', method, params }),
  });
  if (!r.ok) throw new Error(`RPC HTTP ${r.status}`);
  const body = await r.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

function json(res, status, body) { return res.status(status).json(body); }

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 10_000; // 10s — short enough not to mask a fresh bid for long

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  const debug = req.query?.debug === '1';
  const fresh = req.query?.fresh === '1';

  if (!fresh && !debug && _cache && Date.now() - _cacheTime < CACHE_TTL_MS) {
    return json(res, 200, _cache);
  }
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });

    const endpoint = process.env.SOLANA_RPC_URL;
    const ahAddr   = process.env.AUCTION_HOUSE_ADDRESS;
    if (!endpoint) return json(res, 500, { error: 'Missing env: SOLANA_RPC_URL' });
    if (!ahAddr)   return json(res, 200, { offers: [], warn: 'AUCTION_HOUSE_ADDRESS not configured' });

    const debugInfo = debug ? { ahAddr, discriminator: Array.from(BID_RECEIPT_DISC) } : null;

    // 1. Fetch collection assets + bid receipt accounts in parallel.
    //    Filter by discriminator + auctionHouse only — NOT by dataSize, so we
    //    handle both v1 (237 byte) and v2 (269 byte) BidReceipt layouts.
    const [assetsResult, accounts] = await Promise.all([
      rpcPost(endpoint, 'getAssetsByGroup', {
        groupKey: 'collection', groupValue: COLLECTION_ID, page: 1, limit: 1000,
      }),
      rpcPost(endpoint, 'getProgramAccounts', [
        AH_PROGRAM,
        {
          encoding: 'base64',
          filters: [
            { memcmp: { offset: 0,  bytes: BID_RECEIPT_DISC.toString('base64'), encoding: 'base64' } },
            { memcmp: { offset: 72, bytes: ahAddr } },
          ],
        },
      ]),
    ]);

    const assets   = assetsResult?.items ?? [];
    const assetMap = Object.fromEntries(assets.map(a => [a.id, a]));

    if (!Array.isArray(accounts)) {
      return json(res, 200, { offers: [], warn: 'Could not read on-chain bid accounts', _debug: debugInfo });
    }

    if (debug) debugInfo.accountsReturned = accounts.length;
    console.log(`ah-offers: ${accounts.length} bid receipt accounts found`);

    // 2. Parse all candidates, recording reasons we skip any
    const candidates = [];
    const skips = { tooShort: 0, unknownSize: 0, canceled: 0, purchased: 0, zeroPrice: 0, layouts: {} };
    const sizeHistogram = {};
    const debugRows = debug ? [] : null;

    for (const acct of accounts) {
      try {
        const data = Buffer.from(acct.account.data[0], 'base64');
        sizeHistogram[data.length] = (sizeHistogram[data.length] || 0) + 1;

        const p = parseBidReceipt(data);
        if (!p.ok) {
          if (p.reason === 'too-short-header') skips.tooShort++;
          else                                  skips.unknownSize++;
          if (debugRows) debugRows.push({ pubkey: acct.pubkey, dataSize: data.length, parsed: false, reason: p.reason });
          continue;
        }
        skips.layouts[p.layout] = (skips.layouts[p.layout] || 0) + 1;

        if (p.purchaseTag === 1)   { skips.purchased++;  if (debugRows) debugRows.push({ pubkey: acct.pubkey, dataSize: data.length, layout: p.layout, parsed: true, skip: 'purchased' }); continue; }
        if (p.canceledTag === 1)   { skips.canceled++;   if (debugRows) debugRows.push({ pubkey: acct.pubkey, dataSize: data.length, layout: p.layout, parsed: true, skip: 'canceled' });  continue; }
        if (p.priceLamports === 0) { skips.zeroPrice++;  if (debugRows) debugRows.push({ pubkey: acct.pubkey, dataSize: data.length, layout: p.layout, parsed: true, skip: 'zero-price' }); continue; }

        const candidate = {
          pubkey: acct.pubkey,
          tradeState: p.tradeState,
          buyer: p.buyer,
          mintMeta: p.metadata,
          price: p.priceLamports / 1_000_000_000,
          createdAt: p.createdAt,
          layout: p.layout,
        };
        candidates.push(candidate);
        if (debugRows) debugRows.push({
          pubkey: acct.pubkey, dataSize: data.length, layout: p.layout, parsed: true,
          buyer: p.buyer, price: candidate.price,
        });
      } catch (e) {
        console.warn('ah-offers: parse error', acct.pubkey, e.message);
        if (debugRows) debugRows.push({ pubkey: acct.pubkey, parseError: e.message });
      }
    }

    if (debug) {
      debugInfo.sizeHistogram = sizeHistogram;
      debugInfo.skips         = skips;
      debugInfo.candidateCount= candidates.length;
      debugInfo.rows          = debugRows;
    }

    console.log(`ah-offers: ${candidates.length} candidates after filtering, sizes=${JSON.stringify(sizeHistogram)}, skips=${JSON.stringify(skips)}`);

    if (candidates.length === 0) {
      _cache = { offers: [] }; _cacheTime = Date.now();
      return json(res, 200, debug ? { offers: [], _debug: debugInfo } : _cache);
    }

    // 3. Resolve metadata PDAs → mints in one batch RPC call
    const metaAddrs = candidates.map(c => c.mintMeta);
    const metaAccts = await rpcPost(endpoint, 'getMultipleAccounts', [
      metaAddrs, { encoding: 'base64' },
    ]);
    const metaValues = metaAccts?.value ?? [];

    // 4. Pull expiration metadata from Redis in one round trip
    let expirations = {};
    try {
      const keys = candidates.map(c => `offer:${c.pubkey}`);
      const vals = await redis.mget(...keys);
      candidates.forEach((c, i) => {
        const v = vals[i];
        if (v) expirations[c.pubkey] = typeof v === 'string' ? JSON.parse(v) : v;
      });
    } catch (e) {
      console.warn('ah-offers: redis mget failed, treating all as no-expiry:', e.message);
      if (debug) debugInfo.redisError = e.message;
    }

    const now = Math.floor(Date.now() / 1000);
    let droppedNotInCollection = 0;

    // 5. Build final offer list
    const offers = [];
    for (let i = 0; i < candidates.length; i++) {
      try {
        const c = candidates[i];
        const metaVal = metaValues[i];
        if (!metaVal) continue;

        const metaData = Buffer.from(metaVal.data[0], 'base64');
        const mint = b58Encode(metaData.slice(33, 65));

        if (!assetMap[mint]) { droppedNotInCollection++; continue; }

        const meta = expirations[c.pubkey] || null;
        const expiresAt = meta?.expiresAt ?? null;
        const isExpired = expiresAt !== null && expiresAt <= now;

        offers.push({
          mint,
          buyer:      c.buyer,
          price:      c.price,
          receipt:    c.pubkey,
          tradeState: c.tradeState,
          createdAt:  c.createdAt,
          expiresAt,
          isExpired,
          name:  assetMap[mint]?.content?.metadata?.name || 'Big Head Billionaire',
          image: assetMap[mint]?.content?.links?.image   || '',
        });
      } catch (e) {
        console.warn('ah-offers: build error', candidates[i]?.pubkey, e.message);
      }
    }
    if (debug) debugInfo.droppedNotInCollection = droppedNotInCollection;

    const result = debug ? { offers, _debug: debugInfo } : { offers };
    if (!debug) { _cache = result; _cacheTime = Date.now(); }
    return json(res, 200, result);

  } catch (e) {
    console.error('ah-offers error:', e);
    return json(res, 500, { error: e.message });
  }
}
