// api/ah-offer-meta.js
// Stores or deletes off-chain expiration metadata for an Auction House bid.
// On-chain bids have no expiration; this Redis row drives the UI/matching filter.
//
// POST { action: 'BHB_OFFER_META',   buyer, receipt, expiresAt, signature }
// POST { action: 'BHB_OFFER_DELETE', buyer, receipt, signature }
//
// signature = base58 nacl.sign.detached over JSON.stringify of the relevant fields
// (matches the intent-signing pattern used in ah-list.js, ah-buy.js, ah-delist.js).

import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

function json(res, status, body) { return res.status(status).json(body); }

function verifyIntent({ msgObject, signature, walletAddress }) {
  const msg = JSON.stringify(msgObject);
  return nacl.sign.detached.verify(
    Buffer.from(msg, 'utf8'),
    bs58.decode(signature),
    new PublicKey(walletAddress).toBytes()
  );
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });

    const { action, buyer, receipt, expiresAt, signature } = req.body ?? {};
    if (!action || !buyer || !receipt || !signature) {
      return json(res, 400, { error: 'Missing required fields' });
    }

    if (action === 'BHB_OFFER_META') {
      // expiresAt may be null (never expires) or a positive unix-seconds timestamp
      if (expiresAt !== null && (typeof expiresAt !== 'number' || expiresAt <= 0)) {
        return json(res, 400, { error: 'expiresAt must be null or a positive unix timestamp' });
      }
      const ok = verifyIntent({
        msgObject: { action: 'BHB_OFFER_META', buyer, receipt, expiresAt },
        signature, walletAddress: buyer,
      });
      if (!ok) return json(res, 401, { error: 'Invalid signature' });

      const payload = {
        buyer,
        expiresAt,
        createdAt: Math.floor(Date.now() / 1000),
      };

      // Auto-expire the Redis key 1 day past expiresAt to keep storage tidy.
      // If expiresAt is null, no TTL — entry lives until the bid is canceled.
      const setOpts = expiresAt
        ? { ex: Math.max(60, (expiresAt - Math.floor(Date.now() / 1000)) + 86400) }
        : undefined;

      await redis.set(`offer:${receipt}`, JSON.stringify(payload), setOpts);
      return json(res, 200, { success: true, expiresAt });
    }

    if (action === 'BHB_OFFER_DELETE') {
      const ok = verifyIntent({
        msgObject: { action: 'BHB_OFFER_DELETE', buyer, receipt },
        signature, walletAddress: buyer,
      });
      if (!ok) return json(res, 401, { error: 'Invalid signature' });

      await redis.del(`offer:${receipt}`);
      return json(res, 200, { success: true });
    }

    return json(res, 400, { error: 'Unknown action' });

  } catch (e) {
    console.error('ah-offer-meta error:', e);
    return json(res, 500, { error: e.message });
  }
}
