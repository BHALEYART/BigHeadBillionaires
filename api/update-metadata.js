import nacl from "tweetnacl";
import bs58 from "bs58";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  mplTokenMetadata,
  updateV1,
  fetchMetadataFromSeeds,
  collectionToggle,
  usesToggle,
  collectionDetailsToggle,
  ruleSetToggle,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  keypairIdentity,
  createSignerFromKeypair,
  publicKey as umiPublicKey,
  some,
  none,
} from "@metaplex-foundation/umi";

function json(res, status, body) { return res.status(status).json(body); }

function verifySignature({ owner, mint, metadataUri, nonce, signature }) {
  const msg = JSON.stringify({ action: "BHB_UPDATE_METADATA", owner, mint, metadataUri, nonce });
  return nacl.sign.detached.verify(
    Buffer.from(msg, "utf8"),
    bs58.decode(signature),
    new PublicKey(owner).toBytes()
  );
}

async function holderOwnsMint(connection, ownerPk, mintPk) {
  const resp = await connection.getParsedTokenAccountsByOwner(ownerPk, { mint: mintPk });
  return resp.value.some((a) => a.account.data.parsed.info.tokenAmount.uiAmount > 0);
}

async function fetchAssetData(mintAddress, rpc) {
  const resp = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "1", method: "getAsset", params: { id: mintAddress } }),
  });
  const { result } = await resp.json();
  const name     = result?.content?.metadata?.name?.replace(/\0/g, "").trim() || "Big Head Billionaire";
  const creators = (result?.creators || []).map(c => ({
    address: umiPublicKey(c.address), verified: c.verified, share: c.share,
  }));
  return { name, creators };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "POST only" });

    const { owner, mint, metadataUri, nonce, signature } = req.body ?? {};
    if (!owner || !mint || !metadataUri || !nonce || !signature)
      return json(res, 400, { error: "Missing required fields" });

    if (!verifySignature({ owner, mint, metadataUri, nonce, signature }))
      return json(res, 401, { error: "Invalid signature" });

    const rpc = process.env.SOLANA_RPC_URL;
    if (!rpc) return json(res, 500, { error: "SOLANA_RPC_URL not set" });

    const secret = process.env.UPDATE_AUTHORITY_SECRET_KEY;
    if (!secret) return json(res, 500, { error: "UPDATE_AUTHORITY_SECRET_KEY not set" });

    // Verify holder ownership via web3.js
    const connection = new Connection(rpc, "confirmed");
    const owns = await holderOwnsMint(connection, new PublicKey(owner), new PublicKey(mint));
    if (!owns) return json(res, 403, { error: "Wallet does not hold this NFT" });

    // Fetch name + creators from Helius DAS
    const { name, creators } = await fetchAssetData(mint, rpc);

    // Set up UMI with authority keypair
    const web3Keypair = Keypair.fromSecretKey(bs58.decode(secret));
    const umi         = createUmi(rpc).use(mplTokenMetadata());
    const umiKeypair  = umi.eddsa.createKeypairFromSecretKey(web3Keypair.secretKey);
    umi.use(keypairIdentity(createSignerFromKeypair(umi, umiKeypair)));

    const umiMint = umiPublicKey(mint);

    // Fetch existing on-chain metadata (name, symbol, sfbp etc)
    const metadata = await fetchMetadataFromSeeds(umi, { mint: umiMint });

    // Update only the URI — preserve everything else exactly as-is
    const sig = await updateV1(umi, {
      mint:      umiMint,
      authority: umi.identity,
      data: {
        name:                 metadata.name,
        symbol:               metadata.symbol,
        uri:                  metadataUri,
        sellerFeeBasisPoints: metadata.sellerFeeBasisPoints,
        creators:             creators.length ? some(creators) : metadata.creators,
        collection:           metadata.collection,
        uses:                 metadata.uses,
      },
      collection:        collectionToggle("None"),
      uses:              usesToggle("None"),
      collectionDetails: collectionDetailsToggle("None"),
      ruleSet:           ruleSetToggle("None"),
    }).sendAndConfirm(umi);

    const sigStr = bs58.encode(sig.signature);
    return json(res, 200, { signature: sigStr });

  } catch (e) {
    console.error("update-metadata error:", e);
    return json(res, 500, { error: e.message, stack: e.stack });
  }
}