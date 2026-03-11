// api/ah-listings.js — reads active BHB Auction House listings directly from on-chain
// ListingReceipt account layout (236 bytes):
//   0:   discriminator [8]
//   8:   tradeState    [32]
//   40:  bookkeeper    [32]
//   72:  auctionHouse  [32]
//   104: seller        [32]
//   136: metadata      [32]  ← Metaplex metadata PDA (not mint)
//   168: purchaseReceipt tag (0=None → 1 byte only; 1=Some → 33 bytes)
//   169: price u64 LE [8]    ← when purchaseReceipt tag=0 (None)
//   177: tokenSize u64 LE [8]
//   185: bump [1]
//   186: tradeStateBump [1]
//   187: createdAt i64 [8]
//   195: canceledAt tag [1]
//   196: canceledAt i64 [8] (if Some)

const AH_PROGRAM    = 'hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk';
const COLLECTION_ID = 'ECRmV6D1boYEs1mnsG96LE4W81pgTmkTAUR4uf4WyGqN';

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

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });

    const endpoint = process.env.SOLANA_RPC_URL;
    const ahAddr   = process.env.AUCTION_HOUSE_ADDRESS;

    if (!endpoint) return json(res, 500, { error: 'Missing env: SOLANA_RPC_URL' });
    if (!ahAddr)   return json(res, 200, { listings: [], warn: 'AUCTION_HOUSE_ADDRESS not configured' });

    // 1. Fetch collection assets + receipt accounts in parallel — saves one round trip
    const [assetsResult, accounts] = await Promise.all([
      rpcPost(endpoint, 'getAssetsByGroup', {
        groupKey: 'collection', groupValue: COLLECTION_ID, page: 1, limit: 1000,
      }),
      rpcPost(endpoint, 'getProgramAccounts', [
        AH_PROGRAM,
        {
          encoding: 'base64',
          filters: [
            { dataSize: 236 },
            { memcmp: { offset: 0,  bytes: Buffer.from([240,71,225,94,200,75,84,231]).toString('base64'), encoding: 'base64' } },
            { memcmp: { offset: 72, bytes: ahAddr } },
          ],
        },
      ]),
    ]);

    const assets   = assetsResult?.items ?? [];
    const assetMap = Object.fromEntries(assets.map(a => [a.id, a]));

    if (!Array.isArray(accounts)) {
      return json(res, 200, { listings: [], warn: 'Could not read on-chain listing accounts' });
    }

    console.log(`ah-listings: ${accounts.length} receipt accounts`);

    // 2. Parse receipts — collect valid ones and their metadata addresses
    const candidates = [];
    for (const acct of accounts) {
      try {
        const data = Buffer.from(acct.account.data[0], 'base64');
        if (data.length < 196) continue;

        const purchaseTag = data[168];
        const canceledTag = data[195];
        if (purchaseTag === 1 || canceledTag === 1) continue;

        const priceLo = data[169] | (data[170]<<8) | (data[171]<<16) | (data[172]*16777216);
        const priceHi = data[173] | (data[174]<<8) | (data[175]<<16) | (data[176]*16777216);
        const price   = (priceHi * 4294967296 + priceLo) / 1_000_000_000;
        if (price === 0) continue;

        const seller   = b58Encode(data.slice(104, 136));
        const mintMeta = b58Encode(data.slice(136, 168));

        candidates.push({ pubkey: acct.pubkey, seller, mintMeta, price });
      } catch (e) {
        console.warn('ah-listings: parse error', acct.pubkey, e.message);
      }
    }

    console.log(`ah-listings: ${candidates.length} candidates after filtering`);
    if (candidates.length === 0) return json(res, 200, { listings: [] });

    // 3. Batch-fetch all metadata accounts in ONE getMultipleAccounts call
    const metaAddrs = candidates.map(c => c.mintMeta);
    const metaAccts = await rpcPost(endpoint, 'getMultipleAccounts', [
      metaAddrs, { encoding: 'base64' },
    ]);
    const metaValues = metaAccts?.value ?? [];

    // 4. Build final listings
    const listings = [];
    for (let i = 0; i < candidates.length; i++) {
      try {
        const { pubkey, seller, price } = candidates[i];
        const metaVal = metaValues[i];
        if (!metaVal) { console.log(`  ${pubkey}: skip — no metadata`); continue; }

        const metaData = Buffer.from(metaVal.data[0], 'base64');
        const mint = b58Encode(metaData.slice(33, 65));

        if (!assetMap[mint]) { console.log(`  ${pubkey}: skip — mint not in collection`); continue; }

        console.log(`  ✅ ${pubkey}: mint=${mint.slice(0,8)} price=${price} SOL`);
        listings.push({
          mint, seller, price,
          receipt: pubkey,
          name:  assetMap[mint]?.content?.metadata?.name || 'Big Head Billionaire',
          image: assetMap[mint]?.content?.links?.image   || '',
        });
      } catch (e) {
        console.warn('ah-listings: build error', candidates[i]?.pubkey, e.message);
      }
    }

    return json(res, 200, { listings });

  } catch (e) {
    console.error('ah-listings error:', e);
    return json(res, 500, { error: e.message });
  }
}
