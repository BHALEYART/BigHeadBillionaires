import nacl from "tweetnacl";
import bs58 from "bs58";
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { updateMetadataAccountV2 } from "@metaplex-foundation/mpl-token-metadata";

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

const enc = new TextEncoder();

// 🔥 HARD CODED COLLECTION DATA (since all NFTs share same config)
const COLLECTION_NAME = "BigHead Billionaires";
const COLLECTION_SYMBOL = "BHB";
const SELLER_FEE = 300; // 3% = 300 basis points

function json(res, status, body) {
  res.status(status).json(body);
}

function getAuthority() {
  const secret = process.env.UPDATE_AUTHORITY_SECRET_KEY;
  const secretBytes = bs58.decode(secret);
  return Keypair.fromSecretKey(secretBytes);
}

async function holderOwnsMint(connection, owner, mint) {
  const resp = await connection.getParsedTokenAccountsByOwner(owner, {
    mint,
  });

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

  return nacl.sign.detached.verify(
    enc.encode(msg),
    bs58.decode(signature),
    new PublicKey(owner).toBytes()
  );
}

function deriveMetadataPda(mint) {
  return PublicKey.findProgramAddressSync(
    [enc.encode("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST")
      return json(res, 405, { error: "POST only" });

    const { owner, mint, metadataUri, nonce, signature } = req.body;

    if (!verifySignature({ owner, mint, metadataUri, nonce, signature })) {
      return json(res, 401, { error: "Invalid signature" });
    }

    const connection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");

    const ownerPk = new PublicKey(owner);
    const mintPk = new PublicKey(mint);

    const owns = await holderOwnsMint(connection, ownerPk, mintPk);
    if (!owns) {
      return json(res, 403, { error: "Wallet does not hold NFT" });
    }

    const authority = getAuthority();
    const metadataPda = deriveMetadataPda(mintPk);

    const dataV2 = {
      name: COLLECTION_NAME,
      symbol: COLLECTION_SYMBOL,
      uri: metadataUri,
      sellerFeeBasisPoints: SELLER_FEE,
      creators: null,
      collection: null,
      uses: null,
    };

    const ix = updateMetadataAccountV2(
      {
        metadata: metadataPda,
        updateAuthority: authority.publicKey,
      },
      {
        updateMetadataAccountArgsV2: {
          data: dataV2,
          updateAuthority: null,
          primarySaleHappened: null,
          isMutable: null,
          newUpdateAuthority: null,
        },
      }
    );

    const tx = new Transaction().add(ix);

    const sig = await sendAndConfirmTransaction(
      connection,
      tx,
      [authority],
      { commitment: "confirmed" }
    );

    return json(res, 200, { signature: sig });

  } catch (e) {
    return json(res, 500, { error: e.message });
  }
}
