// api/rpc.js
// Proxies Solana JSON-RPC calls server-side.
// Browser -> /api/rpc -> SOLANA_RPC_URL (Helius via env) with public fallbacks.
// Avoids CORS blocks, 403s, and — critically — keeps the Helius API key off the client.

const RPCS = [
  process.env.SOLANA_RPC_URL,                   // primary — Helius URL with key baked in
  'https://api.mainnet-beta.solana.com',        // fallback 1
  'https://rpc.ankr.com/solana',                // fallback 2
].filter(Boolean);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'POST only' });

  const body   = req.body;
  const method = body?.method || '';

  // sendTransaction and simulateTransaction are SAFE to proxy:
  //  • sendTransaction ships a pre-signed transaction — the wallet's signature
  //    is the authorization, the proxy just relays bytes.
  //  • simulateTransaction is a read-only op.
  // We only block methods that don't belong on mainnet or could be abused
  // to mint cost without user value.
  const BLOCKED = ['requestAirdrop'];
  if (BLOCKED.includes(method)) {
    return res.status(403).json({ error: 'Method not allowed via proxy: ' + method });
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
    } catch (_) { continue; }
  }

  return res.status(502).json({ error: 'All RPC endpoints failed' });
}
