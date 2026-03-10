// api/ah-buy.js
// Executes a purchase on the BHB Auction House
// POST { buyer, seller, mint, price (in SOL), signature, nonce }

import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  mplAuctionHouse,
  fetchAuctionHouse,
  createBid,
  executeSale,
  findListingReceiptPda,
  findBidReceiptPda,
  findPurchaseReceiptPda,
} from '@metaplex-foundation/mpl-auction-house';
import {
  keypairIdentity,
  createSignerFromKeypair,
  publicKey as umiPublicKey,
} from '@metaplex-foundation/umi';

function json(res, status, body) { return res.status(status).json(body); }

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });

    const { buyer, seller, mint, price, nonce, signature } = req.body ?? {};
    if (!buyer || !seller || !mint || !price || !nonce || !signature)
      return json(res, 400, { error: 'Missing required fields' });

    // Verify buyer signed the purchase intent
    const msg = JSON.stringify({ action: 'BHB_BUY_NFT', buyer, seller, mint, price, nonce });
    const verified = nacl.sign.detached.verify(
      Buffer.from(msg, 'utf8'),
      bs58.decode(signature),
      new PublicKey(buyer).toBytes()
    );
    if (!verified) return json(res, 401, { error: 'Invalid signature' });

    const rpc             = process.env.SOLANA_RPC_URL;
    const auctionHouseAddr = process.env.AUCTION_HOUSE_ADDRESS;
    const secret          = process.env.UPDATE_AUTHORITY_SECRET_KEY;
    if (!rpc || !auctionHouseAddr || !secret)
      return json(res, 500, { error: 'Missing env vars' });

    const umi        = createUmi(rpc).use(mplAuctionHouse());
    const keypair    = umi.eddsa.createKeypairFromSecretKey(bs58.decode(secret));
    umi.use(keypairIdentity(createSignerFromKeypair(umi, keypair)));

    const auctionHouse    = await fetchAuctionHouse(umi, umiPublicKey(auctionHouseAddr));
    const priceInLamports = BigInt(Math.round(price * 1e9));

    // 1. Create a matching bid at the listing price
    const { buyerTradeState } = await createBid(umi, {
      auctionHouse,
      buyer:     umiPublicKey(buyer),
      mint:      umiPublicKey(mint),
      price:     priceInLamports,
      tokenSize: 1n,
    }).sendAndConfirm(umi);

    // 2. Execute the sale — matches the bid against the existing listing
    const { signature: saleSig } = await executeSale(umi, {
      auctionHouse,
      buyer:     umiPublicKey(buyer),
      seller:    umiPublicKey(seller),
      mint:      umiPublicKey(mint),
      price:     priceInLamports,
      tokenSize: 1n,
    }).sendAndConfirm(umi);

    return json(res, 200, { success: true, signature: bs58.encode(saleSig) });

  } catch (e) {
    console.error('ah-buy error:', e);
    return json(res, 500, { error: e.message });
  }
}
