// api/pinata-upload.js
// Accepts: POST { data: "<base64>", contentType: "image/png"|"application/json", filename: "..." }
// Returns: { url, uri, hash }

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

    // Decode base64 → Buffer → File
    const buffer = Buffer.from(data, "base64");
    const blob   = new Blob([buffer], { type: contentType });
    const file   = new File([blob], filename || "bhb-upload", { type: contentType });

    const fd = new FormData();
    fd.append("file", file);
    fd.append("network", "public");  // required by Pinata V3

    // Pinata V3 endpoint
    const r = await fetch("https://uploads.pinata.cloud/v3/files", {
      method:  "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body:    fd,
    });

    const j = await r.json();
    if (!r.ok) return res.status(r.status).json(j);

    // V3 response shape: { data: { cid, ... } }
    const cid = j?.data?.cid;
    if (!cid) return res.status(500).json({ error: "No CID in Pinata response", raw: j });

    const url = `https://gateway.pinata.cloud/ipfs/${cid}`;
    const uri = `ipfs://${cid}`;
    return res.status(200).json({ url, uri: url, hash: cid });

  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
}
