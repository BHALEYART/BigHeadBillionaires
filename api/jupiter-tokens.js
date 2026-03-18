// api/jupiter-tokens.js
// Returns top tradeable tokens from Jupiter's token list, filtered by liquidity.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  try {
    // Jupiter strict token list — verified, liquid tokens only
    const r = await fetch('https://token.jup.ag/strict');
    if (!r.ok) throw new Error(`Jupiter token list: HTTP ${r.status}`);
    const tokens = await r.json();

    // Return top 100 most common by tag priority + well-known tokens
    const prioritySymbols = ['SOL','USDC','USDT','ETH','BTC','JUP','RAY','ORCA','BONK','WIF','JTO','PYTH','JITO','MSOL'];
    const priority = tokens.filter(t => prioritySymbols.includes(t.symbol));
    const rest     = tokens.filter(t => !prioritySymbols.includes(t.symbol)).slice(0, 86);

    return res.status(200).json([...priority, ...rest].map(t => ({
      symbol:  t.symbol,
      name:    t.name,
      mint:    t.address,
      logoURI: t.logoURI,
      decimals: t.decimals,
    })));
  } catch (e) {
    console.error('[jupiter-tokens]', e.message);
    // Hardcoded fallback of most common tokens
    return res.status(200).json([
      { symbol: 'SOL',  name: 'Solana',   mint: 'So11111111111111111111111111111111111111112',    decimals: 9  },
      { symbol: 'USDC', name: 'USD Coin', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6  },
      { symbol: 'USDT', name: 'Tether',   mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6  },
      { symbol: 'JUP',  name: 'Jupiter',  mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',  decimals: 6  },
      { symbol: 'BONK', name: 'Bonk',     mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',  decimals: 5  },
      { symbol: 'WIF',  name: 'dogwifhat',mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',  decimals: 6  },
    ]);
  }
}
