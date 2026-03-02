// api/burn-for-burg.js
// Atomic burn: builds a single transaction combining NFT transfer + BURG transfer.
// Treasury signs server-side, user signs client-side. One approval in wallet.

import bs58 from "bs58";
import {
  Keypair,
  Connection,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

function json(res, status, body) { return res.status(status).json(body); }

// ── Constants ─────────────────────────────────────────────────────────────────

const OLD_COLLECTION_MINT  = "CJir4j1rtvbKRquYr3B8Yaq1ZADfPVsLDVGCgNjmrai9";
const BURG_MINT            = "6disLregVtZ8qKpTTGyW81mbfAS9uwvHwjKfy6LApump";
const BURG_DECIMALS        = 6;
const BURG_AMOUNT_STANDARD = BigInt(100_000  * Math.pow(10, BURG_DECIMALS));
const BURG_AMOUNT_SPECIAL  = BigInt(5_000_000 * Math.pow(10, BURG_DECIMALS));
const TREASURY_ADDRESS     = "9eMPEUrH46tbj67Y1uESNg9mzna7wi3J6ZoefsFkivcx";

// Animated & Unique (1/1) NFTs — receive 5M BURG instead of 100k
const SPECIAL_MINTS = new Set([
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

// ── Verify NFT belongs to old collection ──────────────────────────────────────

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

  const inCollection = (result.grouping ?? []).some(
    g => g.group_key === "collection" && g.group_value === OLD_COLLECTION_MINT
  );
  if (!inCollection) throw new Error("NFT is not from the original Big Head Billionaires collection");
}

// ── Verify user actually holds the NFT ───────────────────────────────────────

async function verifyOwnership(connection, userWallet, nftMint) {
  const userPk  = new PublicKey(userWallet);
  const mintPk  = new PublicKey(nftMint);
  const resp    = await connection.getParsedTokenAccountsByOwner(userPk, { mint: mintPk });
  const holds   = resp.value.some(a => a.account.data.parsed.info.tokenAmount.uiAmount > 0);
  if (!holds) throw new Error("Wallet does not hold this NFT");
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "POST only" });

    const { action, userWallet, nftMint } = req.body ?? {};
    if (!userWallet || !nftMint) return json(res, 400, { error: "Missing userWallet or nftMint" });

    const rpc    = process.env.SOLANA_RPC_URL;
    const secret = process.env.BURG_TREASURY_SECRET_KEY;
    if (!rpc)    return json(res, 500, { error: "SOLANA_RPC_URL not set" });
    if (!secret) return json(res, 500, { error: "BURG_TREASURY_SECRET_KEY not set" });

    const connection = new Connection(rpc, "confirmed");
    const treasury   = Keypair.fromSecretKey(bs58.decode(secret));
    const userPk     = new PublicKey(userWallet);
    const nftMintPk  = new PublicKey(nftMint);
    const burgMintPk = new PublicKey(BURG_MINT);
    const treasuryPk = treasury.publicKey;

    // ── ACTION: prepare — build + treasury-sign the transaction ──────────────
    if (action === "prepare") {

      // Validate NFT
      await verifyOldCollection(rpc, nftMint);
      await verifyOwnership(connection, userWallet, nftMint);

      const isSpecial  = SPECIAL_MINTS.has(nftMint);
      const burgAmount = isSpecial ? BURG_AMOUNT_SPECIAL : BURG_AMOUNT_STANDARD;

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: userPk });

      // ── Instruction 1: NFT transfer (user → treasury) ─────────────────────
      const nftFromAta = await getAssociatedTokenAddress(nftMintPk, userPk);
      const nftToAta   = await getAssociatedTokenAddress(nftMintPk, treasuryPk);

      // Create treasury's NFT ATA if it doesn't exist
      const nftToAtaInfo = await connection.getAccountInfo(nftToAta);
      if (!nftToAtaInfo) {
        tx.add(createAssociatedTokenAccountInstruction(userPk, nftToAta, treasuryPk, nftMintPk));
      }

      tx.add(createTransferInstruction(nftFromAta, nftToAta, userPk, 1, [], TOKEN_PROGRAM_ID));

      // ── Instruction 2: BURG transfer (treasury → user) ───────────────────
      const burgFromAta = await getAssociatedTokenAddress(burgMintPk, treasuryPk);

      // Create user's BURG ATA if needed — treasury pays for this
      const burgToAta     = await getAssociatedTokenAddress(burgMintPk, userPk);
      const burgToAtaInfo = await connection.getAccountInfo(burgToAta);
      if (!burgToAtaInfo) {
        tx.add(createAssociatedTokenAccountInstruction(treasuryPk, burgToAta, userPk, burgMintPk));
      }

      tx.add(createTransferInstruction(burgFromAta, burgToAta, treasuryPk, burgAmount, [], TOKEN_PROGRAM_ID));

      // Treasury signs its instructions (BURG transfer + any ATA creation it pays for)
      tx.partialSign(treasury);

      // Serialize and return to client for user signature
      const serialized = tx.serialize({ requireAllSignatures: false });
      const txBase64   = Buffer.from(serialized).toString("base64");

      return json(res, 200, {
        txBase64,
        blockhash,
        lastValidBlockHeight,
        isSpecial,
        burgAmount: isSpecial ? 5_000_000 : 100_000,
      });
    }

    // ── ACTION: confirm — verify the tx landed and return success ────────────
    if (action === "confirm") {
      const { txSig } = req.body;
      if (!txSig) return json(res, 400, { error: "Missing txSig" });

      await connection.confirmTransaction(txSig, "confirmed");
      const isSpecial = SPECIAL_MINTS.has(nftMint);

      return json(res, 200, {
        success: true,
        txSig,
        burgAmount: isSpecial ? 5_000_000 : 100_000,
        rewardType: isSpecial ? "special" : "standard",
      });
    }

    return json(res, 400, { error: "Invalid action — use 'prepare' or 'confirm'" });

  } catch (e) {
    console.error("burn-for-burg error:", e);
    return json(res, 500, { error: e.message });
  }
}