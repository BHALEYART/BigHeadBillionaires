// api/solana-balance.js
// Returns USDC, USDT, and native SOL balance for a Solana wallet.

const RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
];

const MINTS = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
};

async function rpc(url, method, params) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function getTokenBalance(url, address, mint) {
  const data = await rpc(url, 'getTokenAccountsByOwner', [
    address, { mint }, { encoding: 'jsonParsed' }
  ]);
  const accounts = data?.result?.value || [];
  if (!accounts.length) return '0.00';
  return parseFloat(accounts[0].account.data.parsed.info.tokenAmount.uiAmount).toFixed(2);
}

async function getSolBalance(url, address) {
  const data = await rpc(url, 'getBalance', [address]);
  return ((data?.result?.value || 0) / 1e9).toFixed(4);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');

  const { address } = req.query;
  if (!address) return res.status(400).json({ error: 'address required' });

  for (const url of RPCS) {
    try {
      const [usdc, usdt, sol] = await Promise.all([
        getTokenBalance(url, address, MINTS.USDC),
        getTokenBalance(url, address, MINTS.USDT),
        getSolBalance(url, address),
      ]);
      return res.status(200).json({ usdc, usdt, sol });
    } catch (e) {
      continue;
    }
  }

  return res.status(200).json({ usdc: '0.00', usdt: '0.00', sol: '0.0000', error: 'RPCs failed' });
}
