// api/ah-listings.js — reads active BHB Auction House listings directly from on-chain
// ListingReceipt account layout (236 bytes):
//   0:   discriminator [8]
//   8:   tradeState    [32]
//   40:  bookkeeper    [32]
//   72:  auctionHouse  [32]
//   104: seller        [32]
//   136: metadata      [32]
//   168: purchaseReceipt tag (0=None → 1 byte; 1=Some → 33 bytes)
//   169: price u64 LE [8]   ← when purchaseReceipt is None (tag=0)
//   177: tokenSize u64 LE [8]
//   185: bump [1]
//   186: tradeStateBump [1]
//   187: createdAt i64 [8]
//   195: canceledAt tag [1]
//   196: canceledAt i64 [8] (if Some)

const AH_PROGRAM    = 'hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk';
const COLLECTION_ID = 'ECRmV6D1boYEs1mnsG96LE4W81pgTmkTAUR4uf4WyGqN';

// ListingReceipt discriminator = [240,71,225,94,200,75,84,231]
const LISTING_DISCRIMINATOR = Buffer.from([240,71,225,94,200,75,84,231]).toString('base64');

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
  const { result, error } = await r.json();
  if (error) throw new Error(`${method}: ${error.message}`);
  return result;
}

function json(res, status, body) { return res.status(status).json(body); }

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });

    const endpoint = process.env.SOLANA_RPC_URL;
    const ahAddr   = process.env.AUCTION_HOUSE_ADDRESS;

    if (!endpoint) return json(res, 500, { error: 'Missing env: SOLANA_RPC_URL' });
    if (!ahAddr)   return json(res, 200, { listings: [], warn: 'AUCTION_HOUSE_ADDRESS not configured' });

    // 1. Fetch all minted NFTs for name/image lookup
    const assetsResult = await rpcPost(endpoint, 'getAssetsByGroup', {
      groupKey: 'collection', groupValue: COLLECTION_ID, page: 1, limit: 1000,
    });
    const assets = assetsResult?.items ?? [];
    const assetMap = Object.fromEntries(assets.map(a => [a.id, a]));

    // 2. Scan ListingReceipt accounts for this Auction House using two tight filters:
    //    - discriminator at offset 0 (identifies account type)
    //    - auctionHouse pubkey at offset 72 (scoped to our AH only)
    // This is a targeted filter — not a full program scan — so Helius allows it.
    const b58AH = ahAddr; // already base58
    const accounts = await rpcPost(endpoint, 'getProgramAccounts', [
      AH_PROGRAM,
      {
        encoding: 'base64',
        filters: [
          { dataSize: 236 },
          { memcmp: { offset: 0,  bytes: Buffer.from([240,71,225,94,200,75,84,231]).toString('base64'), encoding: 'base64' } },
          { memcmp: { offset: 72, bytes: b58AH } },
        ],
      },
    ]);

    if (!Array.isArray(accounts)) {
      console.error('getProgramAccounts returned non-array:', accounts);
      return json(res, 200, { listings: [], warn: 'Could not read on-chain listing accounts' });
    }

    console.log(`ah-listings: found ${accounts.length} receipt accounts`);
    const listings = [];

    for (const acct of accounts) {
      try {
        const data = Buffer.from(acct.account.data[0], 'base64');
        if (data.length < 236) { console.log(`  ${acct.pubkey}: skip short data ${data.length}`); continue; }

        const purchaseTag = data[168];
        const canceledTag = data[195];
        const seller      = b58Encode(data.slice(104, 136));
        const mintMeta    = b58Encode(data.slice(136, 168));

        // Price u64 LE at offset 169 (purchaseReceipt is 1 byte when None)
        const priceLo = data[169] | (data[170]<<8) | (data[171]<<16) | (data[172]*16777216);
        const priceHi = data[173] | (data[174]<<8) | (data[175]<<16) | (data[176]*16777216);
        const price   = (priceHi * 4294967296 + priceLo) / 1_000_000_000;

        console.log(`  receipt ${acct.pubkey}: seller=${seller.slice(0,8)} purchaseTag=${purchaseTag} canceledTag=${canceledTag} price=${price}`);

        if (purchaseTag === 1) { console.log('    skip: sold'); continue; }
        if (canceledTag === 1) { console.log('    skip: canceled'); continue; }
        if (price === 0)       { console.log('    skip: price=0'); continue; }

        // Resolve metadata account → mint
        const metaInfo = await rpcPost(endpoint, 'getAccountInfo', [mintMeta, { encoding: 'base64' }]);
        if (!metaInfo?.value) { console.log('    skip: no metadata account'); continue; }
        const metaData = Buffer.from(metaInfo.value.data[0], 'base64');
        const mint = b58Encode(metaData.slice(33, 65));

        if (!assetMap[mint]) { console.log(`    skip: mint ${mint.slice(0,8)} not in collection`); continue; }

        console.log(`    ✅ listing: mint=${mint.slice(0,8)} price=${price}`);
        listings.push({
          mint, seller, price,
          receipt: acct.pubkey,
          name:    assetMap[mint]?.content?.metadata?.name || 'Big Head Billionaire',
          image:   assetMap[mint]?.content?.links?.image   || '',
        });
      } catch (e) {
        console.warn('ah-listings: skipped receipt', acct.pubkey, e.message);
      }
    }

    return json(res, 200, { listings });

  } catch (e) {
    console.error('ah-listings error:', e);
    return json(res, 500, { error: e.message });
  }
}
