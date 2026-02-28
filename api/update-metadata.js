import nacl from "tweetnacl";
import bs58 from "bs58";
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";

const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const SYSVAR_INSTRUCTIONS       = new PublicKey("Sysvar1nstructions1111111111111111111111111");
const COLLECTION_MINT           = new PublicKey("ECRmV6D1boYEs1mnsG96LE4W81pgTmkTAUR4uf4WyGqN");

const COLLECTION_SYMBOL = "BHB";
const SELLER_FEE        = 300;

function json(res, status, body) { return res.status(status).json(body); }

function getAuthority() {
  const secret = process.env.UPDATE_AUTHORITY_SECRET_KEY;
  if (!secret) throw new Error("UPDATE_AUTHORITY_SECRET_KEY not set");
  return Keypair.fromSecretKey(bs58.decode(secret));
}

function derivePda(seeds) {
  return PublicKey.findProgramAddressSync(seeds, TOKEN_METADATA_PROGRAM_ID)[0];
}

function deriveMetadataPda(mint) {
  return derivePda([Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()]);
}

function deriveEditionPda(mint) {
  return derivePda([Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer(), Buffer.from("edition")]);
}

function deriveCollectionMetadataPda() {
  return deriveMetadataPda(COLLECTION_MINT);
}

async function holderOwnsMint(connection, ownerPk, mintPk) {
  const resp = await connection.getParsedTokenAccountsByOwner(ownerPk, { mint: mintPk });
  return resp.value.some((a) => a.account.data.parsed.info.tokenAmount.uiAmount > 0);
}

function verifySignature({ owner, mint, metadataUri, nonce, signature }) {
  const msg = JSON.stringify({ action: "BHB_UPDATE_METADATA", owner, mint, metadataUri, nonce });
  return nacl.sign.detached.verify(
    Buffer.from(msg, "utf8"),
    bs58.decode(signature),
    new PublicKey(owner).toBytes()
  );
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
    address: c.address, verified: c.verified, share: c.share,
  }));
  return { name, creators };
}

// Build Token Metadata UpdateV1 instruction (discriminator=50, updateV1Discriminator=0)
// This is the modern instruction that supports verified collections
function buildUpdateV1Ix(accounts, name, symbol, uri, sfbp, creators) {
  const str = (s) => {
    const b   = Buffer.from(s, "utf8");
    const len = Buffer.alloc(4);
    len.writeUInt32LE(b.length, 0);
    return Buffer.concat([len, b]);
  };
  const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); return b; };
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; };

  // Serialize creators: Some([...])
  const creatorBufs = creators.map(c => {
    const b = Buffer.alloc(34);
    new PublicKey(c.address).toBuffer().copy(b, 0);
    b[32] = c.verified ? 1 : 0;
    b[33] = c.share;
    return b;
  });
  const creatorsBytes = Buffer.concat([
    Buffer.from([1]),         // Some
    u32(creators.length),
    ...creatorBufs,
  ]);

  // UpdateV1 data layout:
  // u8(50)                     outer discriminator
  // u8(0)                      updateV1Discriminator
  // Option<pubkey>(None)       newUpdateAuthority
  // Option<DataV2>(Some)       data
  //   str name, str symbol, str uri, u16 sfbp
  //   Option<creators> Some([...])
  //   Option<collection> None
  //   Option<uses> None
  // Option<bool> None          primarySaleHappened
  // Option<bool> None          isMutable
  // CollectionToggle None      (u8=0)
  // UsesToggle None            (u8=0)
  // CollectionDetailsToggle None (u8=0)
  // RuleSetToggle None         (u8=0)
  // Option<AuthData> None      (u8=0)

  const data = Buffer.concat([
    Buffer.from([50, 0]),     // discriminator + updateV1Discriminator
    Buffer.from([0]),         // newUpdateAuthority = None
    Buffer.from([1]),         // data = Some
    str(name),
    str(symbol),
    str(uri),
    u16(sfbp),
    creatorsBytes,            // creators = Some([...])
    Buffer.from([0]),         // collection = None
    Buffer.from([0]),         // uses = None
    Buffer.from([0]),         // primarySaleHappened = None
    Buffer.from([0]),         // isMutable = None
    Buffer.from([0]),         // collectionToggle = None
    Buffer.from([0]),         // usesToggle = None
    Buffer.from([0]),         // collectionDetailsToggle = None
    Buffer.from([0]),         // ruleSetToggle = None
    Buffer.from([0]),         // authorizationData = None
  ]);

  const { authority, metadata, mint, edition, payer, collectionMetadata } = accounts;

  return new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: authority,           isSigner: true,  isWritable: false }, // 0 authority
      { pubkey: PublicKey.default,   isSigner: false, isWritable: false }, // 1 delegateRecord (none)
      { pubkey: PublicKey.default,   isSigner: false, isWritable: false }, // 2 token (none)
      { pubkey: mint,                isSigner: false, isWritable: false }, // 3 mint
      { pubkey: metadata,            isSigner: false, isWritable: true  }, // 4 metadata
      { pubkey: edition,             isSigner: false, isWritable: false }, // 5 edition
      { pubkey: payer,               isSigner: true,  isWritable: true  }, // 6 payer
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // 7 system
      { pubkey: SYSVAR_INSTRUCTIONS, isSigner: false, isWritable: false }, // 8 sysvar instructions
      { pubkey: PublicKey.default,   isSigner: false, isWritable: false }, // 9 authRulesProgram (none)
      { pubkey: PublicKey.default,   isSigner: false, isWritable: false }, // 10 authRules (none)
    ],
    data,
  });
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

    const connection = new Connection(rpc, "confirmed");
    const ownerPk    = new PublicKey(owner);
    const mintPk     = new PublicKey(mint);

    const owns = await holderOwnsMint(connection, ownerPk, mintPk);
    if (!owns) return json(res, 403, { error: "Wallet does not hold this NFT" });

    const { name, creators } = await fetchAssetData(mint, rpc);
    const authority          = getAuthority();

    const ix = buildUpdateV1Ix(
      {
        authority:          authority.publicKey,
        metadata:           deriveMetadataPda(mintPk),
        mint:               mintPk,
        edition:            deriveEditionPda(mintPk),
        payer:              authority.publicKey,
        collectionMetadata: deriveCollectionMetadataPda(),
      },
      name,
      COLLECTION_SYMBOL,
      metadataUri,
      SELLER_FEE,
      creators
    );

    const tx  = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(connection, tx, [authority], { commitment: "confirmed" });

    return json(res, 200, { signature: sig });

  } catch (e) {
    console.error("update-metadata error:", e);
    return json(res, 500, { error: e.message, stack: e.stack });
  }
}