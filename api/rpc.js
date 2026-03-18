// api/rpc.js
// Proxies Solana JSON-RPC calls server-side.
// Browser -> /api/rpc -> Solana mainnet RPC
// Avoids CORS blocks and 403s from direct browser RPC calls.

const RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Block dangerous methods
  const body   = req.body;
  const method = body?.method || '';
  const BLOCKED = ['sendTransaction', 'simulateTransaction'];
  if (BLOCKED.includes(method)) {
    return res.status(403).json({ error: 'Use client-side signing for ' + method });
  }

  for (const rpcUrl of RPCS) {
    try {
      const r = await fetch(rpcUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!r.ok) continue;
      const data = await r.json();
      return res.status(200).json(data);
    } catch(_) { continue; }
  }

  return res.status(502).json({ error: 'All RPC endpoints failed' });
}
