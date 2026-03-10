// api/ah-list.js
// Builds + submits a listing transaction on the BHB Auction House.
// The seller signs it client-side via their wallet before posting here.
// POST { seller, mint, price (SOL), nonce, signature (of intent msg), txSignature (of the actual tx) }
//
// Flow:
//   1. Client signs intent message (proves ownership of wallet)
//   2. Client builds + signs the list tx via their wallet
//   3. Client POSTs the serialised signed tx here
//   4. Server verifies intent sig + submits tx to network

import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';

function json(res, status, body) { return res.status(status).json(body); }

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });

    const { seller, mint, price, nonce, signature, serialisedTx } = req.body ?? {};
    if (!seller || !mint || !price || !nonce || !signature || !serialisedTx)
      return json(res, 400, { error: 'Missing required fields' });

    // 1. Verify the intent signature (proves the seller owns the wallet)
    const msg = JSON.stringify({ action: 'BHB_LIST_NFT', seller, mint, price, nonce });
    const verified = nacl.sign.detached.verify(
      Buffer.from(msg, 'utf8'),
      bs58.decode(signature),
      new PublicKey(seller).toBytes()
    );
    if (!verified) return json(res, 401, { error: 'Invalid signature' });

    const rpc = process.env.SOLANA_RPC_URL;
    if (!rpc) return json(res, 500, { error: 'Missing env: SOLANA_RPC_URL' });

    // 2. Deserialise the pre-signed transaction and send it
    const connection = new Connection(rpc, 'confirmed');
    const txBytes    = Buffer.from(serialisedTx, 'base64');
    const tx         = Transaction.from(txBytes);

    // Verify the seller actually signed the tx (not someone else)
    const sellerKey  = new PublicKey(seller);
    const hasSig     = tx.signatures.some(
      s => s.publicKey.equals(sellerKey) && s.signature
    );
    if (!hasSig) return json(res, 401, { error: 'Transaction not signed by seller' });

    const txid = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    await connection.confirmTransaction(txid, 'confirmed');

    return json(res, 200, { success: true, txid });

  } catch (e) {
    console.error('ah-list error:', e);
    return json(res, 500, { error: e.message });
  }
}
