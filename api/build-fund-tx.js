// api/build-fund-tx.js
// Builds the complete atomic funding transaction server-side using @solana/spl-token.
// Returns a base64-serialized transaction ready for the wallet to sign.
// Instructions: BURG fee → create bot SOL account → create bot USDC ATA → send USDC

import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

const USDC_MINT        = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const SOL_INIT_AMOUNT  = 0.2 * LAMPORTS_PER_SOL;
const HELIUS_RPC       = 'https://mainnet.helius-rpc.com/?api-key=a88e4b38-304e-407a-89c8-91c904b08491';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { userWallet, botWallet, usdcAmount } = req.body;

  if (!userWallet || !botWallet || !usdcAmount) {
    return res.status(400).json({ error: 'userWallet, botWallet, usdcAmount required' });
  }

  try {
    const connection  = new Connection(HELIUS_RPC, 'confirmed');
    const userPk      = new PublicKey(userWallet);
    const botPk       = new PublicKey(botWallet);
    const usdcLamports = BigInt(Math.round(parseFloat(usdcAmount) * 1_000_000));

    // ── Derive ATAs ────────────────────────────────────────────────────────
    const userUsdcATA = await getAssociatedTokenAddressSync(USDC_MINT, userPk, false, TOKEN_PROGRAM_ID);
    const botUsdcATA  = getAssociatedTokenAddressSync(USDC_MINT, botPk,  false, TOKEN_PROGRAM_ID);

    // ── Check what needs creating ──────────────────────────────────────────
    const [botAcctInfo, botAtaInfo] = await Promise.all([
      connection.getAccountInfo(botPk),
      connection.getAccountInfo(botUsdcATA),
    ]);
    const botExists    = botAcctInfo !== null;
    const botAtaExists = botAtaInfo  !== null;

    // ── Build transaction ──────────────────────────────────────────────────
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: userPk });

    // 1. SOL → bot wallet (initialize account + cover fees)
    tx.add(SystemProgram.transfer({
      fromPubkey: userPk,
      toPubkey:   botPk,
      lamports:   SOL_INIT_AMOUNT,
    }));

    // 2. Create bot USDC ATA if needed
    if (!botAtaExists) {
      tx.add(createAssociatedTokenAccountInstruction(
        userPk,       // payer
        botUsdcATA,   // ata
        botPk,        // owner
        USDC_MINT,    // mint
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      ));
    }

    // 3. USDC transfer: user → bot
    tx.add(createTransferCheckedInstruction(
      userUsdcATA,
      USDC_MINT,
      botUsdcATA,
      userPk,
      usdcLamports,
      6,
      [],
      TOKEN_PROGRAM_ID
    ));

    // Serialize for signing (no signers yet — wallet will sign)
    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const txBase64   = serialized.toString('base64');

    return res.status(200).json({
      transaction:         txBase64,
      blockhash,
      lastValidBlockHeight,
      botUsdcATA:          botUsdcATA.toBase58(),
      botAtaExists,
      botExists,
    });

  } catch(e) {
    console.error('[build-fund-tx]', e);
    return res.status(500).json({ error: e.message });
  }
}
