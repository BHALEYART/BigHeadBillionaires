// api/ah-listings.js
// Returns all active listings for the BHB collection from the Auction House

import { PublicKey } from '@solana/web3.js';

function json(res, status, body) { return res.status(status).json(body); }

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });

    const rpc              = process.env.SOLANA_RPC_URL;
    const auctionHouseAddr = process.env.AUCTION_HOUSE_ADDRESS;
    if (!rpc || !auctionHouseAddr) return json(res, 500, { error: 'Missing env vars: SOLANA_RPC_URL and AUCTION_HOUSE_ADDRESS required' });

    const COLLECTION_ID = 'ECRmV6D1boYEs1mnsG96LE4W81pgTmkTAUR4uf4WyGqN';
    const AH_PROGRAM    = 'hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk';

    // 1. Fetch all minted NFTs in the collection
    const assetsResp = await fetch(rpc, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: '1',
        method:  'getAssetsByGroup',
        params:  { groupKey: 'collection', groupValue: COLLECTION_ID, page: 1, limit: 1000 },
      }),
    });
    const { result: assetsResult } = await assetsResp.json();
    const mints = (assetsResult?.items ?? []).map((a) => a.id);

    if (!mints.length) return json(res, 200, { listings: [] });

    // 2. For each mint, check for an active listing receipt in the AH program
    const listings = [];

    await Promise.all(mints.map(async (mintAddr) => {
      try {
        const resp = await fetch(rpc, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: '1',
            method:  'getProgramAccounts',
            params:  [
              AH_PROGRAM,
              {
                encoding: 'base64',
                filters: [
                  { dataSize: 160 }, // ListingReceipt account size
                  { memcmp: { offset: 8,  bytes: auctionHouseAddr } },
                  { memcmp: { offset: 72, bytes: mintAddr } },
                ],
              },
            ],
          }),
        });

        const { result: accounts } = await resp.json();
        if (!accounts?.length) return;

        for (const acct of accounts) {
          const data   = Buffer.from(acct.account.data[0], 'base64');
          const price  = Number(data.readBigUInt64LE(136)) / 1e9; // lamports → SOL
          const seller = new PublicKey(data.slice(40, 72)).toBase58();

          // 3. Fetch NFT name + image via DAS
          const metaResp = await fetch(rpc, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0', id: '1',
              method:  'getAsset',
              params:  { id: mintAddr },
            }),
          });
          const { result: asset } = await metaResp.json();

          listings.push({
            mint:    mintAddr,
            seller,
            price,
            receipt: acct.pubkey,
            name:    asset?.content?.metadata?.name || 'Big Head Billionaire',
            image:   asset?.content?.links?.image   || '',
          });
        }
      } catch (e) {
        console.warn(`ah-listings: skipped ${mintAddr}:`, e.message);
      }
    }));

    return json(res, 200, { listings });

  } catch (e) {
    console.error('ah-listings error:', e);
    return json(res, 500, { error: e.message });
  }
}

