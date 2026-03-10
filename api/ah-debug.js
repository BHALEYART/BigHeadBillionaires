// api/ah-debug.js — TEMPORARY: dumps raw ListingReceipt bytes for offset debugging
// DELETE THIS FILE after fixing the price offset

const AH_PROGRAM = 'hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk';

export default async function handler(req, res) {
  const endpoint = process.env.SOLANA_RPC_URL;
  const ahAddr   = process.env.AUCTION_HOUSE_ADDRESS;

  const r = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: '1', method: 'getProgramAccounts',
      params: [AH_PROGRAM, {
        encoding: 'base64',
        filters: [{ dataSize: 236 }, { memcmp: { offset: 72, bytes: ahAddr } }]
      }]
    })
  });
  const { result, error } = await r.json();
  if (error || !result?.length) return res.status(200).json({ error, count: result?.length ?? 0 });

  const accounts = result.map(acct => {
    const data = Buffer.from(acct.account.data[0], 'base64');
    // Dump every 8-byte window as a u64 LE value with its SOL equivalent
    const windows = [];
    for (let off = 160; off <= 230; off++) {
      const lo = data[off] | (data[off+1]<<8) | (data[off+2]<<16) | (data[off+3]*16777216);
      const hi = data[off+4] | (data[off+5]<<8) | (data[off+6]<<16) | (data[off+7]*16777216);
      const lamports = hi * 4294967296 + lo;
      windows.push({ off, lo, hi, lamports, sol: lamports / 1e9 });
    }
    return {
      pubkey: acct.pubkey,
      dataLen: data.length,
      hex: data.toString('hex'),
      windows,
    };
  });

  return res.status(200).json({ accounts });
}
