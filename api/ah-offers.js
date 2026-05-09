// api/ah-offers.js — reads active BHB Auction House bids (offers) directly from on-chain
// and joins with off-chain expiration metadata stored in Upstash Redis.
//
// BidReceipt account layout (269 bytes):
//   0:   discriminator [8]
//   8:   tradeState    [32]
//   40:  bookkeeper    [32]
//   72:  auctionHouse  [32]
//   104: buyer         [32]
//   136: metadata      [32]  ← Metaplex metadata PDA (not mint)
//   168: tokenAccount  Option<Pubkey>  (1 tag + 32) → 33 bytes; tag=0 (None) for public_buy
//   201: purchaseRcpt  Option<Pubkey>  → 33 bytes; tag=0 (None) for active
//   234: price         u64 LE          → 8 bytes
//   242: tokenSize     u64 LE          → 8 bytes
//   250: bump          [1]
//   251: tradeStateBump[1]
//   252: createdAt     i64 LE          → 8 bytes
//   260: canceledAt    Option<i64>     → 9 bytes; tag=0 (None) for active

import { Redis } from '@upstash/redis';

const AH_PROGRAM    = 'hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk';
const COLLECTION_ID = 'ECRmV6D1boYEs1mnsG96LE4W81pgTmkTAUR4uf4WyGqN';

// sha256("account:BidReceipt").slice(0, 8)
const BID_RECEIPT_DISC = Buffer.from([186, 150, 141, 135, 59, 122, 39, 99]);

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58Encode(u8) {
  let n = 0n; for (const b of u8) n = n*256n + BigInt(b);
  let s = ''; while (n > 0n) { s = B58[Number(n%58n)] + s; n /= 58n; }
  for (const b of u8) { if (b) break; s = '1' + s; } return s;
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
const CACHE_TTL_MS = 30_000;

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) {
    return json(res, 200, _cache);
  }
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });

    const endpoint = process.env.SOLANA_RPC_URL;
    const ahAddr   = process.env.AUCTION_HOUSE_ADDRESS;
    if (!endpoint) return json(res, 500, { error: 'Missing env: SOLANA_RPC_URL' });
    if (!ahAddr)   return json(res, 200, { offers: [], warn: 'AUCTION_HOUSE_ADDRESS not configured' });

    // 1. Fetch collection assets + bid receipt accounts in parallel
    const [assetsResult, accounts] = await Promise.all([
      rpcPost(endpoint, 'getAssetsByGroup', {
        groupKey: 'collection', groupValue: COLLECTION_ID, page: 1, limit: 1000,
      }),
      rpcPost(endpoint, 'getProgramAccounts', [
        AH_PROGRAM,
        {
          encoding: 'base64',
          filters: [
            { dataSize: 269 },
            { memcmp: { offset: 0,  bytes: BID_RECEIPT_DISC.toString('base64'), encoding: 'base64' } },
            { memcmp: { offset: 72, bytes: ahAddr } },
          ],
        },
      ]),
    ]);

    const assets   = assetsResult?.items ?? [];
    const assetMap = Object.fromEntries(assets.map(a => [a.id, a]));

    if (!Array.isArray(accounts)) {
      return json(res, 200, { offers: [], warn: 'Could not read on-chain bid accounts' });
    }

    console.log(`ah-offers: ${accounts.length} bid receipt accounts`);

    // 2. Parse receipts — collect valid (non-canceled, non-purchased, non-zero price)
    const candidates = [];
    for (const acct of accounts) {
      try {
        const data = Buffer.from(acct.account.data[0], 'base64');
        if (data.length < 269) continue;

        const purchaseTag = data[201];
        const canceledTag = data[260];
        if (purchaseTag === 1 || canceledTag === 1) continue;

        // Read u64 LE at offset 234 — use BigInt for safety, then convert to SOL
        const priceLo = data[234] | (data[235]<<8) | (data[236]<<16) | (data[237]*16777216);
        const priceHi = data[238] | (data[239]<<8) | (data[240]<<16) | (data[241]*16777216);
        const priceLamports = priceHi * 4294967296 + priceLo;
        if (priceLamports === 0) continue;
        const price = priceLamports / 1_000_000_000;

        // Read i64 LE createdAt at offset 252
        const ctLo = data[252] | (data[253]<<8) | (data[254]<<16) | (data[255]*16777216);
        const ctHi = data[256] | (data[257]<<8) | (data[258]<<16) | (data[259]*16777216);
        const createdAt = ctHi * 4294967296 + ctLo;

        const tradeState = b58Encode(data.slice(8, 40));
        const buyer      = b58Encode(data.slice(104, 136));
        const mintMeta   = b58Encode(data.slice(136, 168));

        candidates.push({
          pubkey: acct.pubkey,
          tradeState, buyer, mintMeta, price, createdAt,
        });
      } catch (e) {
        console.warn('ah-offers: parse error', acct.pubkey, e.message);
      }
    }

    console.log(`ah-offers: ${candidates.length} candidates after filtering`);
    if (candidates.length === 0) { _cache = { offers: [] }; _cacheTime = Date.now(); return json(res, 200, _cache); }

    // 3. Batch-fetch metadata accounts to resolve mint addresses
    const metaAddrs = candidates.map(c => c.mintMeta);
    const metaAccts = await rpcPost(endpoint, 'getMultipleAccounts', [
      metaAddrs, { encoding: 'base64' },
    ]);
    const metaValues = metaAccts?.value ?? [];

    // 4. Pull expiration metadata from Redis (one round trip)
    let expirations = {};
    try {
      const keys = candidates.map(c => `offer:${c.pubkey}`);
      // Upstash mget returns array in same order; null for missing keys
      const vals = await redis.mget(...keys);
      candidates.forEach((c, i) => {
        const v = vals[i];
        if (v) {
          // Upstash auto-deserializes JSON
          expirations[c.pubkey] = typeof v === 'string' ? JSON.parse(v) : v;
        }
      });
    } catch (e) {
      console.warn('ah-offers: redis mget failed, treating all as no-expiry:', e.message);
    }

    const now = Math.floor(Date.now() / 1000);

    // 5. Build final offer list
    const offers = [];
    for (let i = 0; i < candidates.length; i++) {
      try {
        const c = candidates[i];
        const metaVal = metaValues[i];
        if (!metaVal) continue;

        const metaData = Buffer.from(metaVal.data[0], 'base64');
        const mint = b58Encode(metaData.slice(33, 65));

        if (!assetMap[mint]) continue; // not in our collection

        const meta = expirations[c.pubkey] || null;
        const expiresAt = meta?.expiresAt ?? null; // null = never
        const isExpired = expiresAt !== null && expiresAt <= now;

        offers.push({
          mint,
          buyer:      c.buyer,
          price:      c.price,
          receipt:    c.pubkey,
          tradeState: c.tradeState,
          createdAt:  c.createdAt,
          expiresAt,                  // unix seconds | null
          isExpired,
          name:  assetMap[mint]?.content?.metadata?.name || 'Big Head Billionaire',
          image: assetMap[mint]?.content?.links?.image   || '',
        });
      } catch (e) {
        console.warn('ah-offers: build error', candidates[i]?.pubkey, e.message);
      }
    }

    const result = { offers };
    _cache = result;
    _cacheTime = Date.now();
    return json(res, 200, result);

  } catch (e) {
    console.error('ah-offers error:', e);
    return json(res, 500, { error: e.message });
  }
}
