import nacl from "tweetnacl";
import bs58 from "bs58";
import { Keypair, Connection, PublicKey, Transaction } from "@solana/web3.js";
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

// ── Standard path: Phantom / Solflare signMessage ────────────────────────────
// nacl verifies the ed25519 signature directly against the raw UTF-8 message bytes.
function verifyMessageSignature({ owner, mint, metadataUri, nonce, signature }) {
  const msg = JSON.stringify({ action: "BHB_UPDATE_METADATA", owner, mint, metadataUri, nonce });
  return nacl.sign.detached.verify(
    Buffer.from(msg, "utf8"),
    bs58.decode(signature),
    new PublicKey(owner).toBytes()
  );
}

// ── Ledger path: signTransaction with Memo instruction ───────────────────────
// Ledger hardware wallets cannot sign arbitrary messages; they sign full Solana
// transactions.  The frontend embeds the auth JSON payload in a Memo instruction,
// signs the transaction, and sends us the base64-encoded signed tx + the base58
// signature extracted from it.
//
// Verification steps:
//   1. Deserialise the signed transaction.
//   2. Confirm the fee-payer matches `owner`.
//   3. Find the Memo instruction and confirm its data matches the expected payload.
//   4. Verify the ed25519 signature against the serialised transaction message bytes
//      (this is what Ledger actually signed — NOT the raw payload string).
function verifyTransactionSignature({ owner, mint, metadataUri, nonce, signature, serialisedTx }) {
  const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

  if (!serialisedTx) throw new Error("Ledger path requires serialisedTx");

  const txBytes = Buffer.from(serialisedTx, "base64");
  const tx = Transaction.from(txBytes);

  // 1. Fee-payer must be the claimed owner
  const feePayer = tx.feePayer?.toBase58();
  if (feePayer !== owner)
    throw new Error(`Transaction fee-payer (${feePayer}) does not match owner (${owner})`);

  // 2. Find the Memo instruction and verify payload contents
  const expectedPayload = JSON.stringify({ action: "BHB_UPDATE_METADATA", owner, mint, metadataUri, nonce });
  const memoIx = tx.instructions.find(
    (ix) => ix.programId.toBase58() === MEMO_PROGRAM_ID
  );
  if (!memoIx) throw new Error("No Memo instruction found in Ledger transaction");

  const memoText = memoIx.data.toString("utf8");
  if (memoText !== expectedPayload)
    throw new Error("Memo instruction payload does not match expected auth message");

  // 3. Verify the ed25519 signature against the transaction message bytes
  //    (Transaction.serializeMessage() gives the canonical bytes Ledger signed)
  const msgBytes  = tx.serializeMessage();
  const sigBytes  = bs58.decode(signature);
  const ownerBytes = new PublicKey(owner).toBytes();

  return nacl.sign.detached.verify(msgBytes, sigBytes, ownerBytes);
}

// Unified entry point — routes to the correct verifier based on signingMethod
function verifySignature(fields) {
  const { signingMethod = "message" } = fields;
  if (signingMethod === "transaction") return verifyTransactionSignature(fields);
  return verifyMessageSignature(fields);
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

    const { owner, mint, metadataUri, nonce, signature, signingMethod, serialisedTx } = req.body ?? {};
    if (!owner || !mint || !metadataUri || !nonce || !signature)
      return json(res, 400, { error: "Missing required fields" });

    // signingMethod defaults to "message" (Phantom / Solflare).
    // For Ledger it will be "transaction" and serialisedTx will also be present.
    if (signingMethod === "transaction" && !serialisedTx)
      return json(res, 400, { error: "serialisedTx required for transaction signing method" });

    let verified = false;
    try {
      verified = verifySignature({ owner, mint, metadataUri, nonce, signature, signingMethod, serialisedTx });
    } catch (verifyErr) {
      console.warn("Signature verification threw:", verifyErr.message);
      return json(res, 401, { error: "Signature verification failed: " + verifyErr.message });
    }
    if (!verified)
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