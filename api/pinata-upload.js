// api/pinata-upload.js
// Accepts: POST { data: "<base64>", contentType: "image/png"|"application/json", filename: "..." }
// Returns: { url, hash }

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { data, contentType, filename } = req.body;

    if (!data || !contentType) {
      return res.status(400).json({ error: "Missing data or contentType" });
    }

    const jwt = process.env.PINATA_JWT;
    if (!jwt) return res.status(500).json({ error: "Missing PINATA_JWT env var" });

    // Decode base64 → Buffer → Blob
    const buffer = Buffer.from(data, "base64");
    const blob   = new Blob([buffer], { type: contentType });

    const fd = new FormData();
    fd.append("file", blob, filename || `bhb-upload`);

    const r = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method:  "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body:    fd,
    });

    const j = await r.json();
    if (!r.ok) return res.status(r.status).json(j);

    const url = `https://gateway.pinata.cloud/ipfs/${j.IpfsHash}`;
    return res.status(200).json({ url, hash: j.IpfsHash });

  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
}
