import formidable from "formidable";

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  try {
    const form = formidable();
    const { files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    const file = files.file;
    if (!file) return res.status(400).json({ error: "Missing file" });

    const jwt = process.env.PINATA_JWT;
    if (!jwt) return res.status(500).json({ error: "Missing PINATA_JWT env var" });

    const fs = await import("fs");
    const stream = fs.createReadStream(file.filepath);

    const fd = new FormData();
    fd.append("file", stream, file.originalFilename || "upload");

    const r = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: fd,
    });

    const j = await r.json();
    if (!r.ok) return res.status(r.status).json(j);

    const url = `https://gateway.pinata.cloud/ipfs/${j.IpfsHash}`;
    return res.status(200).json({ url, hash: j.IpfsHash });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
