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

const COLLECTION_SYMBOL = "BHB";
const SELLER_FEE        = 300;

function json(res, status, body) { return res.status(status).json(body); }

function getAuthority() {
  const secret = process.env.UPDATE_AUTHORITY_SECRET_KEY;
  if (!secret) throw new Error("UPDATE_AUTHORITY_SECRET_KEY not set");
  return Keypair.fromSecretKey(bs58.decode(secret));
}

function deriveMetadataPda(mint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
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
  const msg = JSON.stringify({ action: "BHB_UPDATE_METADATA", owner, mint, metadataUri, nonce });
  return nacl.sign.detached.verify(
    Buffer.from(msg, "utf8"),
    bs58.decode(signature),
    new PublicKey(owner).toBytes()
  );
}

// Fetch existing creators from on-chain metadata so we can pass them through unchanged
async function fetchExistingCreators(connection, metadataPda) {
  try {
    const info = await connection.getParsedAccountInfo(metadataPda);
    const creators = info?.value?.data?.parsed?.info?.data?.creators;
    if (creators?.length) return creators; // [{ address, verified, share }]
  } catch (_) {}
  // Hard-coded fallback for this collection (CM as verified creator)
  return [
    { address: "BiqLN985cYm9nmXpZwP7kDJnoW41Fq7Vy129pUb8ndVA", verified: true,  share: 0   },
    { address: "9eMPEUrH46tbj67Y1uESNg9mzna7wi3J6ZoefsFkivcx",  verified: false, share: 100 },
  ];
}

// Fetch NFT name from on-chain metadata (e.g. "Big Head Billionaire #42")
async function fetchExistingName(connection, metadataPda) {
  try {
    const info = await connection.getParsedAccountInfo(metadataPda);
    const name = info?.value?.data?.parsed?.info?.data?.name;
    if (name) return name.replace(/\0/g, "").trim();
  } catch (_) {}
  return "Big Head Billionaire";
}

// Build raw UpdateMetadataAccountV2 instruction (discriminator = 15)
// Passes existing creators through to avoid "verified creators cannot be removed"
function buildUpdateIx(metadataPda, authorityPk, name, symbol, uri, sfbp, creators) {
  const str = (s) => {
    const b = Buffer.from(s, "utf8");
    const len = Buffer.alloc(4);
    len.writeUInt32LE(b.length, 0);
    return Buffer.concat([len, b]);
  };

  const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); return b; };
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; };

  // Serialize creators: Some([...]) = 0x01 + u32(count) + per: pubkey(32)+verified(1)+share(1)
  const creatorBufs = creators.map(c => {
    const b = Buffer.alloc(34);
    new PublicKey(c.address).toBuffer().copy(b, 0);
    b[32] = c.verified ? 1 : 0;
    b[33] = c.share;
    return b;
  });
  const creatorsBytes = Buffer.concat([
    Buffer.from([1]),       // Some
    u32(creators.length),
    ...creatorBufs,
  ]);

  const data = Buffer.concat([
    Buffer.from([15]),      // discriminator: UpdateMetadataAccountV2
    Buffer.from([1]),       // data = Some
    str(name),
    str(symbol),
    str(uri),
    u16(sfbp),
    creatorsBytes,          // creators = Some([...existing...])
    Buffer.from([0]),       // collection = None
    Buffer.from([0]),       // uses = None
    Buffer.from([0]),       // newUpdateAuthority = None
    Buffer.from([0]),       // primarySaleHappened = None
    Buffer.from([0]),       // isMutable = None
  ]);

  return new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: metadataPda,  isSigner: false, isWritable: true  },
      { pubkey: authorityPk,  isSigner: true,  isWritable: false },
    ],
    data,
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST")
      return json(res, 405, { error: "POST only" });

    const { owner, mint, metadataUri, nonce, signature } = req.body ?? {};

    if (!owner || !mint || !metadataUri || !nonce || !signature)
      return json(res, 400, { error: "Missing required fields" });

    if (!verifySignature({ owner, mint, metadataUri, nonce, signature }))
      return json(res, 401, { error: "Invalid signature" });

    const rpc = process.env.SOLANA_RPC_URL;
    if (!rpc) return json(res, 500, { error: "SOLANA_RPC_URL not set" });

    const connection = new Connection(rpc, "confirmed");
    const ownerPk    = new PublicKey(owner);
    const mintPk     = new PublicKey(mint);

    const owns = await holderOwnsMint(connection, ownerPk, mintPk);
    if (!owns)
      return json(res, 403, { error: "Wallet does not hold this NFT" });

    const authority   = getAuthority();
    const metadataPda = deriveMetadataPda(mintPk);

    // Fetch existing name + creators so we don't wipe them
    const [name, creators] = await Promise.all([
      fetchExistingName(connection, metadataPda),
      fetchExistingCreators(connection, metadataPda),
    ]);

    const ix = buildUpdateIx(
      metadataPda,
      authority.publicKey,
      name,
      COLLECTION_SYMBOL,
      metadataUri,
      SELLER_FEE,
      creators
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