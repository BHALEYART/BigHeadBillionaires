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
const BURG_AMOUNT_STANDARD = 100_000 * Math.pow(10, BURG_DECIMALS);
const BURG_AMOUNT_SPECIAL  = 5_000_000 * Math.pow(10, BURG_DECIMALS);

// ── TODO: Replace placeholders before going live ──────────────────────────────

// Loaded from env at runtime
const getBurnWallet = () => process.env.BURN_WALLET || null;

// Wallet that holds BURG to distribute (fund this before launch)
// Env var: BURG_TREASURY_SECRET_KEY (bs58 encoded)

// Wallet that holds pre-minted Expansion Pack NFTs
// Env var: EXPANSION_VAULT_SECRET_KEY (bs58 encoded)

// Animated & Unique (1/1) NFTs — receive Expansion Pack instead of BURG
const EXPANSION_PACK_MINTS = new Set([
  "JARgnkCHuv85i2uVn1fWYVDkntoUHRqWkRD9YjW2N3hY",
  "J3uANFv5kUPeV9rg1XLsB3MvoFPaQDrD5TQw8KZajP3F",
  "HY6jc5vJENPcNCphsvR6KS4jjMaPc3PL9oDLATygxa1s",
  "HUuLaWK8d4HntCE35bqskDrBQiamgHpACoD6ddKnzspq",
  "H3whp2UVv5ekuDoWVJ9rTWDmvpjT1adJ4XhzSkeHHDow",
  "G5fBPbfWv2V2cRpXKuUcLaagAFGHE1A8CqCHucActpUv",
  "FTwfmfhuJs7UsEirLwiJ1F3HcHSGH4qVTfDaAk41gaz4",
  "E7TV7z3XaKB1QBBWhdF8AAUEiFWCYJTb3HVg6qeN7zfs",
  "DvSUxWzikB7nNcC9bfGmJgpNLjrYAXkWi5kkxhR9RDkp",
  "DkEQYd2KJi2nNAd3aUZjgF8Z47KabJyTwtjBnnQDKS62",
  "DQa4PBJpMwawbTrCRaDP7muHGt6pVG33tKSeJh3vvk1G",
  "CiwRee9sPT6R12ZK9umDjS6QuKxuBpq727cgQJxtRrUA",
  "BeKFa87ugf6XRjS6fG1M8wKximGmyEQKR8wh7ahposEB",
  "BZyP6Yakjda28p9esvCn9PZvGrNHFnzUHJAFF2cehXBB",
  "Aiv59PVQ9PBMfdnT9k74W2d8ySLWnFQuy6wU8HJNisdi",
  "Agoddkd74dyDq15aMUmEuyPqqvgdXkHJ2764JksehjF1",
  "AVydqGCMKbvCHyDMdaoMWoBnffvtJLBPAAV1aPizrpwB",
  "AEAEgqi8qhCU96EjpLz82qigwpEP29r8vzxEGJG5TbkF",
  "9ujFkaXdmxUfRVVCp8e9WWDM9SwGRvewsdrUc7hgZhzB",
  "82JCVM9VgXLubpRDdudb62KVzgYVEHWW3ZsngSQTnJRA",
  "7n2Avb8QCikkfuSZeU2shFgUWEgvy1TeybR3tcvxZh1j",
  "7WVKDB3vGWaX58ZqMqq3b7qyamR9CqwumjZvyvLGmNbr",
  "7TAhs5oYjtNpMydDHJrLNeVkyfFiq63xRXv7WwWvQHHG",
  "7LbJ88FLU26HxfnJgru9mEjH5JU2uCHyMrgeKM7Gcc4m",
  "7FDXhpdFCSqErzyprS6sEbF3unS7N8H39ydzNkW3yvLR",
  "6fVLB7fhUJdGAJKsCS7XXv5VGNHsas6ocuFu88qGJqbo",
  "5M9XUNWNcxiWBUh4HVD6uBywDFdzhXpUGGQzqLmpChSN",
  "5EHThjazvimcFsEaAXgQy4wzzveB4ncHkhfBTV6jCvhP",
  "4cP9udJq7Gft6s6SPSyGTDpssENRKHjxPrgWHDEwhJ61",
  "4HiP1jzKsUJ7WzjoMvRuBLSJdhY3WmM4bZRZsVVaeXtP",
  "3jdXmnxPA5VzT8y2wcZ1Fks59w88TCQD5jxEsobUYCW7",
  "3VcsrG9dc1ZaBXzgNH7cCJ4MH7Bt8wypmVnrCbDBrAuj",
  "2jii4xxMJdTCYFkQWeoHydzT2FnUKKrdMPDT7FHPP1z2",
  "2Bcs9r7ip5Zq4DVv1PoP5xK7iUEGtSp8wabTjnwodBVj",
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

async function sendBurg(connection, recipientAddress, amount) {
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
      BigInt(Math.round(amount)),
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

    if (!getBurnWallet())
      return json(res, 503, { error: "Burn wallet not configured" });

    const BURN_WALLET = getBurnWallet();

    const connection = new Connection(rpc, "confirmed");

    // 1. Verify NFT is from old collection
    await verifyOldCollection(rpc, nftMint);

    // 2. Verify burn tx happened on-chain
    await verifyBurnTx(connection, burnTxSig, userWallet, nftMint);

    // 3. Send tiered BURG reward
    const isSpecial = EXPANSION_PACK_MINTS.has(nftMint);
    const amount    = isSpecial ? BURG_AMOUNT_SPECIAL : BURG_AMOUNT_STANDARD;
    const rewardSig = await sendBurg(connection, userWallet, amount);

    return json(res, 200, {
      success: true,
      rewardType: isSpecial ? "special" : "standard",
      rewardSignature: rewardSig,
      burgAmount: isSpecial ? 5_000_000 : 100_000,
    });

  } catch (e) {
    console.error("burn-for-burg error:", e);
    return json(res, 500, { error: e.message });
  }
}