// api/jupiter-price.js
// Returns current price for one or more mints via Jupiter Price API v2.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=20');

  const { mints } = req.query;
  if (!mints) return res.status(400).json({ error: 'mints required (comma-separated)' });

  try {
    const r = await fetch(`https://api.jup.ag/price/v2?ids=${mints}`);
    if (!r.ok) throw new Error(`Jupiter price API: HTTP ${r.status}`);
    const data = await r.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
