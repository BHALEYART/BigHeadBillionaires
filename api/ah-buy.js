// api/ah-buy.js
// Submits a pre-signed buy transaction on the BHB Auction House.
// POST { buyer, seller, mint, price (SOL), nonce, signature (intent), serialisedTx }

import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';

function json(res, status, body) { return res.status(status).json(body); }

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });

    const { buyer, seller, mint, price, nonce, signature, serialisedTx } = req.body ?? {};
    if (!buyer || !seller || !mint || !price || !nonce || !signature || !serialisedTx)
      return json(res, 400, { error: 'Missing required fields' });

    const msg = JSON.stringify({ action: 'BHB_BUY_NFT', buyer, seller, mint, price, nonce });
    const verified = nacl.sign.detached.verify(
      Buffer.from(msg, 'utf8'),
      bs58.decode(signature),
      new PublicKey(buyer).toBytes()
    );
    if (!verified) return json(res, 401, { error: 'Invalid signature' });

    const rpc = process.env.SOLANA_RPC_URL;
    if (!rpc) return json(res, 500, { error: 'Missing env: SOLANA_RPC_URL' });

    const connection = new Connection(rpc, 'confirmed');
    const txBytes    = Buffer.from(serialisedTx, 'base64');
    const tx         = Transaction.from(txBytes);

    const buyerKey = new PublicKey(buyer);
    const hasSig   = tx.signatures.some(s => s.publicKey.equals(buyerKey) && s.signature);
    if (!hasSig) return json(res, 401, { error: 'Transaction not signed by buyer' });

    const txid = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false, preflightCommitment: 'confirmed',
    });
    await connection.confirmTransaction(txid, 'confirmed');

    return json(res, 200, { success: true, txid });

  } catch (e) {
    console.error('ah-buy error:', e);
    return json(res, 500, { error: e.message });
  }
}
