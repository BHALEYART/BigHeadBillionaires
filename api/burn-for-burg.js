// api/burn-for-burg.js
// Verifies an old BHB NFT burn tx, then sends 100k BURG (or an Expansion Pack for special mints)

import bs58 from "bs58";
import {
  Keypair,
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

function json(res, status, body) { return res.status(status).json(body); }

// ── Constants ─────────────────────────────────────────────────────────────────

const OLD_COLLECTION_MINT = "CJir4j1rtvbKRquYr3B8Yaq1ZADfPVsLDVGCgNjmrai9";
const BURG_MINT           = "6disLregVtZ8qKpTTGyW81mbfAS9uwvHwjKfy6LApump";
const BURG_DECIMALS       = 6; // token2022 — adjust if different
const BURG_AMOUNT         = 100_000 * Math.pow(10, BURG_DECIMALS);

// ── TODO: Replace placeholders before going live ──────────────────────────────

// Wallet that receives burned NFTs (set up a dedicated wallet)
const BURN_WALLET = "PLACEHOLDER_BURN_WALLET";

// Wallet that holds BURG to distribute (fund this before launch)
// Env var: BURG_TREASURY_SECRET_KEY (bs58 encoded)

// Wallet that holds pre-minted Expansion Pack NFTs
// Env var: EXPANSION_VAULT_SECRET_KEY (bs58 encoded)

// The 25 old collection mint addresses that trigger an Expansion Pack instead of BURG
// TODO: Populate with the specific mint addresses once confirmed
const EXPANSION_PACK_MINTS = new Set([
  // "MintAddress1Here",
  // "MintAddress2Here",
  // ... 25 total
]);

// ── Verify the burn tx happened on-chain ─────────────────────────────────────

async function verifyBurnTx(connection, burnTxSig, userWallet, nftMint) {
  const tx = await connection.getParsedTransaction(burnTxSig, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });

  if (!tx) throw new Error("Transaction not found");
  if (tx.meta?.err) throw new Error("Transaction failed on-chain");

  // Check the NFT moved from user wallet to burn wallet
  const instructions = tx.transaction.message.instructions;
  const innerInstructions = tx.meta?.innerInstructions ?? [];

  // Look for a token transfer of this NFT mint from user to burn wallet
  const allIxs = [
    ...instructions,
    ...innerInstructions.flatMap(i => i.instructions),
  ];

  const transferFound = allIxs.some(ix => {
    if (ix.program !== "spl-token") return false;
    const parsed = ix.parsed;
    if (!parsed) return false;
    if (parsed.type !== "transfer" && parsed.type !== "transferChecked") return false;
    const info = parsed.info;
    return (
      info.mint === nftMint &&
      info.authority === userWallet &&
      info.destination && // token account owned by BURN_WALLET
      info.amount === "1"
    );
  });

  if (!transferFound) {
    // Fallback: check pre/post token balances
    const preBalances  = tx.meta?.preTokenBalances  ?? [];
    const postBalances = tx.meta?.postTokenBalances ?? [];

    const userHadNft = preBalances.some(
      b => b.mint === nftMint && b.owner === userWallet && Number(b.uiTokenAmount.amount) === 1
    );
    const userLostNft = postBalances.some(
      b => b.mint === nftMint && b.owner === userWallet && Number(b.uiTokenAmount.amount) === 0
    ) || !postBalances.some(
      b => b.mint === nftMint && b.owner === userWallet
    );
    const burnWalletReceivedNft = postBalances.some(
      b => b.mint === nftMint && b.owner === BURN_WALLET && Number(b.uiTokenAmount.amount) === 1
    );

    if (!userHadNft || !userLostNft || !burnWalletReceivedNft) {
      throw new Error("Could not verify NFT transfer to burn wallet");
    }
  }

  return true;
}

// ── Check NFT belongs to old collection ──────────────────────────────────────

async function verifyOldCollection(rpc, nftMint) {
  const resp = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: "1",
      method: "getAsset",
      params: { id: nftMint },
    }),
  });
  const { result } = await resp.json();
  if (!result) throw new Error("NFT not found");

  const grouping = result.grouping ?? [];
  const inCollection = grouping.some(
    g => g.group_key === "collection" && g.group_value === OLD_COLLECTION_MINT
  );

  if (!inCollection) throw new Error("NFT is not from the old Big Head Billionaires collection");
  return true;
}

// ── Send BURG tokens ──────────────────────────────────────────────────────────

async function sendBurg(connection, recipientAddress) {
  const secret = process.env.BURG_TREASURY_SECRET_KEY;
  if (!secret) throw new Error("BURG_TREASURY_SECRET_KEY not set");

  const treasury = Keypair.fromSecretKey(bs58.decode(secret));
  const recipient = new PublicKey(recipientAddress);
  const burgMint  = new PublicKey(BURG_MINT);

  // Get/create token accounts
  const fromAta = await getOrCreateAssociatedTokenAccount(
    connection, treasury, burgMint, treasury.publicKey
  );
  const toAta = await getOrCreateAssociatedTokenAccount(
    connection, treasury, burgMint, recipient
  );

  const tx = new Transaction().add(
    createTransferInstruction(
      fromAta.address,
      toAta.address,
      treasury.publicKey,
      BigInt(BURG_AMOUNT),
      [],
      TOKEN_PROGRAM_ID
    )
  );

  const sig = await connection.sendTransaction(tx, [treasury]);
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

// ── Send Expansion Pack NFT ───────────────────────────────────────────────────

async function sendExpansionPack(connection, recipientAddress, nftMint) {
  const secret = process.env.EXPANSION_VAULT_SECRET_KEY;
  if (!secret) throw new Error("EXPANSION_VAULT_SECRET_KEY not set — expansion packs not yet configured");

  // TODO: Once expansion pack NFTs are minted and loaded into the vault,
  // implement logic here to select which expansion pack to send based on
  // which of the 25 special mints was burned (nftMint param).
  // For now this is a placeholder.
  throw new Error("Expansion pack distribution not yet implemented — coming soon");
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "POST only" });

    const { userWallet, nftMint, burnTxSig } = req.body ?? {};
    if (!userWallet || !nftMint || !burnTxSig)
      return json(res, 400, { error: "Missing required fields: userWallet, nftMint, burnTxSig" });

    const rpc = process.env.SOLANA_RPC_URL;
    if (!rpc) return json(res, 500, { error: "SOLANA_RPC_URL not set" });

    if (BURN_WALLET === "PLACEHOLDER_BURN_WALLET")
      return json(res, 503, { error: "Burn wallet not configured yet" });

    const connection = new Connection(rpc, "confirmed");

    // 1. Verify NFT is from old collection
    await verifyOldCollection(rpc, nftMint);

    // 2. Verify burn tx happened on-chain
    await verifyBurnTx(connection, burnTxSig, userWallet, nftMint);

    // 3. Send reward — Expansion Pack or BURG
    let rewardType, rewardSig;

    if (EXPANSION_PACK_MINTS.has(nftMint)) {
      rewardType = "expansion_pack";
      rewardSig  = await sendExpansionPack(connection, userWallet, nftMint);
    } else {
      rewardType = "burg";
      rewardSig  = await sendBurg(connection, userWallet);
    }

    return json(res, 200, {
      success: true,
      rewardType,
      rewardSignature: rewardSig,
      burgAmount: rewardType === "burg" ? 100000 : 0,
    });

  } catch (e) {
    console.error("burn-for-burg error:", e);
    return json(res, 500, { error: e.message });
  }
}
