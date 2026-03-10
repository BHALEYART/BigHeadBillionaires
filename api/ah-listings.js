// api/ah-listings.js — reads active BHB Auction House listings directly from on-chain
// ListingReceipt account layout (236 bytes):
//   0:   discriminator [8]
//   8:   tradeState    [32]
//   40:  bookkeeper    [32]
//   72:  auctionHouse  [32]
//   104: seller        [32]
//   136: metadata      [32]
//   168: purchaseReceipt Option<[32]> (1 tag + 32 = 33)
//   201: price         u64 LE [8]
//   209: tokenSize     u64 LE [8]
//   217: bump          [1]
//   218: tradeStateBump[1]
//   219: createdAt     i64 [8]
//   227: canceledAt    Option<i64> (1 tag + 8 = 9)

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

    const listings = [];

    for (const acct of accounts) {
      try {
        const data = Buffer.from(acct.account.data[0], 'base64');
        if (data.length < 236) continue;

        // Check canceledAt option tag — if set (tag=1), listing was cancelled
        const canceledTag = data[227];
        if (canceledTag === 1) continue;

        // Check purchaseReceipt option tag — if set (tag=1), NFT was sold
        const purchaseTag = data[168];
        if (purchaseTag === 1) continue;

        const seller   = b58Encode(data.slice(104, 136));
        const mintMeta = b58Encode(data.slice(136, 168)); // this is metadata account, not mint
        // Scan for price: find a u64 LE value in the plausible lamport range (0.001–1000 SOL)
        // This is robust against minor layout variations between AH program versions.
        let price = 0;
        for (let off = 160; off <= data.length - 8; off++) {
          const lo = data[off] | (data[off+1]<<8) | (data[off+2]<<16) | (data[off+3]*16777216);
          const hi = data[off+4] | (data[off+5]<<8) | (data[off+6]<<16) | (data[off+7]*16777216);
          const lamports = hi * 4294967296 + lo;
          // Plausible NFT price: between 0.001 SOL and 10000 SOL, and hi bytes must be 0 (< 2^32 lamports)
          if (hi === 0 && lamports >= 1_000_000 && lamports <= 10_000_000_000_000) {
            price = lamports / 1_000_000_000;
            break;
          }
        }

        // Resolve metadata address → mint address via getAccountInfo
        // Metaplex metadata PDA layout: first 1 byte key, then 32 bytes update authority, then 32 bytes mint
        const metaInfo = await rpcPost(endpoint, 'getAccountInfo', [mintMeta, { encoding: 'base64' }]);
        if (!metaInfo?.value) continue;
        const metaData = Buffer.from(metaInfo.value.data[0], 'base64');
        // Metadata account layout: 1 (key) + 32 (updateAuthority) + 32 (mint) = mint at offset 33
        const mint = b58Encode(metaData.slice(33, 65));

        // Only include NFTs from our collection
        if (!assetMap[mint]) continue;

        listings.push({
          mint,
          seller,
          price,
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
