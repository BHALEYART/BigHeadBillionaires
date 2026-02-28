import nacl from "tweetnacl";
import bs58 from "bs58";
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

// Hard-coded collection config
const COLLECTION_NAME   = "Big Head Billionaire #";
const COLLECTION_SYMBOL = "BHB";
const SELLER_FEE        = 300; // 3%

function json(res, status, body) {
  return res.status(status).json(body);
}

function getAuthority() {
  const secret = process.env.UPDATE_AUTHORITY_SECRET_KEY;
  if (!secret) throw new Error("UPDATE_AUTHORITY_SECRET_KEY not set");
  return Keypair.fromSecretKey(bs58.decode(secret));
}

function deriveMetadataPda(mint) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

async function holderOwnsMint(connection, ownerPk, mintPk) {
  const resp = await connection.getParsedTokenAccountsByOwner(ownerPk, { mint: mintPk });
  return resp.value.some(
    (a) => a.account.data.parsed.info.tokenAmount.uiAmount > 0
  );
}

function verifySignature({ owner, mint, metadataUri, nonce, signature }) {
  const msg = JSON.stringify({
    action: "BHB_UPDATE_METADATA",
    owner,
    mint,
    metadataUri,
    nonce,
  });
  const msgBytes = Buffer.from(msg, "utf8");
  const sigBytes = bs58.decode(signature);
  const pubBytes = new PublicKey(owner).toBytes();
  return nacl.sign.detached.verify(msgBytes, sigBytes, pubBytes);
}

// Build raw UpdateMetadataAccountV2 instruction (discriminator = 15)
// Layout: u8(15) + UpdateMetadataAccountArgsV2
//   Option<DataV2>:
//     u8(1) + name(4+bytes) + symbol(4+bytes) + uri(4+bytes) + u16(sfbp)
//     + Option<creators>=0x00
//     + Option<collection>=0x00
//     + Option<uses>=0x00
//   Option<newUpdateAuthority>=0x00
//   Option<primarySaleHappened>=0x00
//   Option<isMutable>=0x00
function buildUpdateIx(metadataPda, authorityPk, name, symbol, uri, sfbp) {
  const enc  = (s) => Buffer.from(s, "utf8");
  const nameB   = enc(name);
  const symbolB = enc(symbol);
  const uriB    = enc(uri);

  const size =
    1 +                        // discriminator
    1 +                        // Option<DataV2> = Some
    4 + nameB.length +
    4 + symbolB.length +
    4 + uriB.length +
    2 +                        // sellerFeeBasisPoints u16
    1 +                        // creators = None
    1 +                        // collection = None
    1 +                        // uses = None
    1 +                        // newUpdateAuthority = None
    1 +                        // primarySaleHappened = None
    1;                         // isMutable = None

  const buf = Buffer.alloc(size);
  let o = 0;

  buf[o++] = 15;               // UpdateMetadataAccountV2 discriminator

  buf[o++] = 1;                // data = Some
  buf.writeUInt32LE(nameB.length,   o); o += 4; nameB.copy(buf, o);   o += nameB.length;
  buf.writeUInt32LE(symbolB.length, o); o += 4; symbolB.copy(buf, o); o += symbolB.length;
  buf.writeUInt32LE(uriB.length,    o); o += 4; uriB.copy(buf, o);    o += uriB.length;
  buf.writeUInt16LE(sfbp, o); o += 2;
  buf[o++] = 0;                // creators = None
  buf[o++] = 0;                // collection = None
  buf[o++] = 0;                // uses = None

  buf[o++] = 0;                // newUpdateAuthority = None
  buf[o++] = 0;                // primarySaleHappened = None
  buf[o++] = 0;                // isMutable = None

  return new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: metadataPda,  isSigner: false, isWritable: true  },
      { pubkey: authorityPk,  isSigner: true,  isWritable: false },
    ],
    data: buf,
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST")
      return json(res, 405, { error: "POST only" });

    const { owner, mint, metadataUri, nonce, signature } = req.body ?? {};

    if (!owner || !mint || !metadataUri || !nonce || !signature)
      return json(res, 400, { error: "Missing required fields" });

    // 1. Verify holder signed the exact payload
    if (!verifySignature({ owner, mint, metadataUri, nonce, signature }))
      return json(res, 401, { error: "Invalid signature" });

    const rpc = process.env.SOLANA_RPC_URL;
    if (!rpc) return json(res, 500, { error: "SOLANA_RPC_URL not set" });

    const connection = new Connection(rpc, "confirmed");
    const ownerPk    = new PublicKey(owner);
    const mintPk     = new PublicKey(mint);

    // 2. Confirm holder owns the NFT
    const owns = await holderOwnsMint(connection, ownerPk, mintPk);
    if (!owns)
      return json(res, 403, { error: "Wallet does not hold this NFT" });

    // 3. Build + send update tx as authority
    const authority   = getAuthority();
    const metadataPda = deriveMetadataPda(mintPk);

    const ix = buildUpdateIx(
      metadataPda,
      authority.publicKey,
      COLLECTION_NAME,
      COLLECTION_SYMBOL,
      metadataUri,
      SELLER_FEE
    );

    const tx  = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(connection, tx, [authority], {
      commitment: "confirmed",
    });

    return json(res, 200, { signature: sig });

  } catch (e) {
    console.error("update-metadata error:", e);
    return json(res, 500, { error: e.message, stack: e.stack });
  }
}
