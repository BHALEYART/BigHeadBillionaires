// api/redeem-nft.js
// Swap 1 of 100 eligible NFTs → 1% of treasury's current BURG balance
//
// Env:
//   BURG_TREASURY_SECRET_KEY — base58 string or JSON array of 64 bytes
//   SOLANA_RPC_URL           — full RPC endpoint (e.g. Helius URL with api-key)

import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getMint,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';

// ── Config ──────────────────────────────────────────────────────────────────
const BURG_MINT = new PublicKey('6disLregVtZ8qKpTTGyW81mbfAS9uwvHwjKfy6LApump');
const TREASURY  = new PublicKey('9eMPEUrH46tbj67Y1uESNg9mzna7wi3J6ZoefsFkivcx');
const RPC_URL   = process.env.SOLANA_RPC_URL;

// Eligible NFT mints (1 per redemption, user must own it)
export const ELIGIBLE_MINTS = new Set([
  'JCKNLJLmLg5ftkDk31N7AJYjFSkFHhXAfMkMUU8WfDq2',
  'J5S1MrhtuyvMY62yaQywoHcJmBFhWQio22EEE4HjKhEP',
  'HjELUiDynmuwAdXtkau9igu3y4kV6jxzjEoeUXg5pPpx',
  'HfYd5CuPjNNS5c57HxmyiWbzj57dAcSrJcNp5mnmoCBu',
  'HT3AX5jeg5ibwFKv8UbVYmAaftohaqogEf4zUyN6ECFL',
  'HGg3WbHLX1fpmjEzxaxBkTjEdJbgbD69m8DwypWHxbFa',
  'H92tJs3pkpEP5mp77ULUggZyeiLJHWz1M93jbQCm9Dw6',
  'H8zkmf4EhX4tPRJQhjqV1HzEAxonoXzVfmZHeiNRuG89',
  'GjrCoeB6DEJbqR9yewzMJqufomB2LmeTiRAMUMXau7Uz',
  'GjkVjmNbTFXBpXfGyduyYKPD2bphn6xCdEQBj7DvcYpZ',
  'Gie1qtYY4xTiHHQWRd9ZXqTj2C7ni1Rx3ZbmZPTMDV1P',
  'GfZzTDStWU8wiimWfqsw7EZSzYyXqeYevh66XwmZvywM',
  'Gf9VCogf4X9HiMJX41BzhW7qVKVejrDPjaLZtVyY6k1w',
  'G9B8mV2uHsaU3kjhMyk36uimkHkb4Vf4W26m5rvFseua',
  'FmnXGn49rk4sr85ntMQzjgJU44rk93P92GZUUWyBkQ1X',
  'F3xewLFxMYSfJivZx2yiH42D3oSTcCUyd1tfWUzsaE9V',
  'EoynicJcHyLu2bbcZLR9ScFDuuHmiVCoZX3SvDcem5gj',
  'EcngzbQJbBhXdeR8TdLHoTFZP8B3KHtkAVznRoB2u58K',
  'EMRLsVkdBvXzPtHJ7JabQQkxvoPdcuFMhoghTMrjgHRJ',
  'ELBTBCYLPPgp5MvNaEdW2ekua4n93kZ8jNwJdniirY6s',
  'EDS9oo6mr5U9edtsk6k1936xMgQKmajCczYxhaouYhFc',
  'ECKkKnn8658ZsDE2QUEA9atWpcjoCzhPUEf2gQJZoNYF',
  'E6RaGZuXHJcr6U6dDoB8nhFnLciuSQCHARuYwJk9dSBP',
  'DdbM2acqD1KmdB12khew6pNhu5wisrWHDKsjVJGjcozr',
  'DcBGegKZZRzhBJhwyAMJgfMPjqrgsFBq3gPrGECkPuML',
  'DJt1k9iNLSYmu2BLf1xiYJUFv3YmWDYRrkRmQuME2Qa1',
  'DE61s1m3o9CdSRdKThPN6PbcqubWH6mnYUNbpo2K2WFE',
  'DCSHSvJjE5PA5XmjdkpRwuPKXXCRmu3HKGoBT6EgRDnW',
  'D3Bj9Pcpy7EfMJ2xmQwvfUmnw7oUuhvsYB7ezTJ1jX1E',
  'CvLUuYRfearLFkQMvhyvYxmviDNcGTWkich5kDao6Ake',
  'CfiwpvAVym7sS5Nq5kVvfpZXxWXq7hEVZo4HBfm9AdDA',
  'CbjjHNhN6M9Rxx45e7zWFL55dvUJULNBmcNbo2wBeq9i',
  'CYhXPaMsUDXtM43jZF1vkeetN53YGDcRnbfZq1tEcms9',
  'CWkqSgaX5RYxJf8Z6TdP1GxKA9qzoiDd3xxBUuNAvVhp',
  'CTPyyHEN9gAjqvX1LmR54bfUNcYqxdhLEtouyGq6DodM',
  'CPz5NYrqMTKpnX4ki7Hr4yqBs7dC9aJ44PSf4RE4uHKR',
  'CNvyugvxdaSNVxyAFdQNXRB7aMHhrocD7JxfixF5LoaQ',
  'CNUQ8LbF4SAYuLkZTjMzCmnoBx5ejgSJeYdmX7gzHuLd',
  'C136TAQBWsuCrUYthGNjExMDdRGqeTwMBr6RwJLFDoNU',
  'BNVMQGp5Lz8Q4ViiJmdx6gE16sfQqjKNh8fNSHhiEJiT',
  'BNMgg3cekqM4oQmXouij9Wwztymw1SiBL83uiFXZU6YL',
  'B9Q2ZhR1pEXgVZ8KenphMmFbLe8sCFGoE9JF5cDgcmQf',
  'AcvZDBid5f6HKzFveBUm74pgod1y2JBSM3Rgse6GnQnM',
  'AaV5JDoUTRQctwSM4oYnSVpwVu5g8x4nmHc9D3XuEyH1',
  'APBXgycnFivmBAgzjub149hfjEWPsgPmjhPbkbhFjmaa',
  'AKk9gkdjzNEVmd923D7n48s5ee56cn8JLTcChNpbfT4V',
  'ADe6rdeDA4k9NnMsh4yo9h86Sizmn2Q8g6EbCZ76dkqo',
  'A22PQc13Qfv2Yz47eY5CzwBDufzxyNjCecVJNqi5zXew',
  '9vHzd8ptXuQuiXXHiQHfPrtZdZeYtt24NABgLCeqPmgr',
  '9kwGuwdwpG9MkQuL9a6rmhz6hTQZsxi2StLdC86QhQeg',
  '9bYgAEFzKg6NPxNo8shxYGrG9SaVMmsFgRJwNjfE3zuG',
  '94WXEYAuswijeAybc78z3bHpbmmBvQgHDdzm8s5rKgKN',
  '93LwrFu7h7ssxKYv8FRbYabdUrVRg7enu9i2kKKcX12a',
  '8oiVtU2XYdcew5phyvrMfHQqakRN3sudtq3vdL2Ne9ue',
  '8cC752XUaUw5Do8onHgAUcXrERrfcn31hFwaC2WEuCoD',
  '8QGundbnA44MV1N5Y2LWzaXkaAGSASKjfpqE6HfwZg6n',
  '8FQMu2aC7zaBaX4CvMu6P8J84GAw9upBEZe4z7yM7A1W',
  '7wWjiofdc4HKNTFe1TWck25CcBJs2B7sjuihnnohrchQ',
  '7vuM3joc5FV9qbQK1qYmohYWRwUWUgXMV3xcxMc7AYqK',
  '7kdreDq8Cih5QfbSpmXMFvnsDWaPgbKyPHkEwEVRrcjH',
  '7es6x24p2h87xT3xV2hLUXpP9jUMf7wLnmA596ycjE3k',
  '7P7ZrXxC9pWhaad2W3BA1oUDcPkEUdoehEnpan7yqrCo',
  '7DJcBon4pBFyWXomFGq31PkXyVt8BiF1k3kYx4o9ERN1',
  '7Ci8JtUNWunwXVWCFqytQ5PPegNYNHWV45GAQNBPC9Pw',
  '6jesdcpxvyNXYQUhAURaKjf5jxUx1v9XAJBnHbKuFpJV',
  '6LdTMonp5CdruaUavZD9Ab19iVpocNaRiTvN6x9aFptG',
  '64XW8yqxWoeueLgpJLRUM1U6VeCRSdeKoecdSp8C8X87',
  '5oj7ykME1cfYqJUvXm8v4Rm6qYcM6sVWY5UHALmibyHn',
  '5m59ToWvTUWVsyJphshfg1B4pdwyFhgzvwvqVs7Hgm8p',
  '5SouFV8747DUSrQNk7QUK6uH1AcKGJJv4Xg1fyVPENKX',
  '5PhYusTK2CkxJNdEvy9ak9QFgD6SXh8W2marSfJMahC4',
  '5GRkD5Bwq1RfUp8958Me2iWjFTK6TswLVmWGJ885bNDH',
  '5Cyun7D3dWr66cPcdCNndxDQccN48mVa4H3axRvHZSPo',
  '5CSUbEe4x1ggR7JR2EaHpUxQTHKA6JFb8ZMBynVhN25E',
  '59jvrPmTSBLiKRXswNM4NMySEYY9C1CTvWavVzQxWd5u',
  '53ybsDJ95BBb2kz62NVQqXEzB2jwamgRDeHnbMqcJo9D',
  '4yXzcr8aSj7FeTpyH7KoUpHQUoEq9m45zerGiSiumbCH',
  '4hH8jBhswL6NFWNSW4krbj3nbLv8N95xZV5xW1DT893B',
  '4gecjruSmD9UZPScq5EePSeW7uwg7MHHCF81gq1nJFeb',
  '4UyXucADehQYcfo1yNcL15m3ieW7ELeXLmie32ZskYox',
  '3xt8xbMY1vXA2g6MXarW5SUNRYALPHzutmF4dvoxCSRS',
  '3nZvVL4Y4vDBaT2FG1rYYEwRvCoZSsqrqcJXQ8x3RNky',
  '3dViE1VorLsjunECqVQNG84CXxRMDtJQQJ1dcwebQtQk',
  '3dMaxve7HFaDsMBoM6DY9P5Ce3RwMi3ybS2MJo3AfR1t',
  '3bPKqUYyb85wVKwcXpJnuJKSwEn7xNuy5Y2EctWyX5qd',
  '3Cre3gNgxMGMTsWDbz5rPdTjwdHQBwcD5Geb1QZKNn8f',
  '2xzZ7xysZeLQA4CFsQwnsEcWBHBPzdDN64jDvV4YQE7o',
  '2o2DDTjaNsBjSaEGGUGWuDjmYKufMuUh6gH1DMVWDMH5',
  '2fchcWWp75TCxX6X2ccqvBXK8gjiHjtRmAZCeVKS3LyV',
  '2eT9BknUGCnHn18RNsMPUvUqP6tLp4Y9rp8bpkUFgF4K',
  '2bBgE6CfhR3kKG1n5mdcVmM3kSGQ8tbUrQ2FboReBV9L',
  '2a2cMKJvh4mCjy5jQbi1pgBRMGkifj69FTP5hnuevwXP',
  '2PYVvYRHszjersNkyD1JPVhFDVWLybqgGUTdFQz2tfBb',
  '2C144nnVTGhGer5EhkUsCTFYc2a2jPHBtkpVaLq4P4mM',
  '25tBEHNrjveN3ci8ii1X1YZDxZtC84WpMiLQNwUseGwb',
  'wj2tMGC9nf4YS4R5VwjwALr35rAKkMbtrUDUFBBgGgU',
  'n9EnGGtMA4FqGdcTYbFCwo8G6QV7ttutXsTKMvSH9j9',
  'Nv6KNcNodTRT539t7hWZP14dCFSmRpMqDzgZqpQECrL',
  'HE3hagogZnRjgjrE3DbhgUNqtHtS8BnuMnTpRmAcuqb',
  'Ei9Gbq6vwnEhZEZYomfGs7G7SbtAGXSCYdZvnftgXz3',
]);

// ── Helpers ─────────────────────────────────────────────────────────────────
function loadTreasuryKeypair() {
  const secret = process.env.BURG_TREASURY_SECRET_KEY;
  if (!secret) throw new Error('BURG_TREASURY_SECRET_KEY not configured');
  const trimmed = secret.trim();
  if (trimmed.startsWith('[')) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed)));
  }
  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

async function getTreasuryBurgState(connection) {
  const treasuryBurgAta = getAssociatedTokenAddressSync(
    BURG_MINT, TREASURY, false, TOKEN_2022_PROGRAM_ID
  );
  const [acct, mintInfo] = await Promise.all([
    getAccount(connection, treasuryBurgAta, 'confirmed', TOKEN_2022_PROGRAM_ID),
    getMint(connection, BURG_MINT, 'confirmed', TOKEN_2022_PROGRAM_ID),
  ]);
  return {
    balanceRaw: acct.amount,            // bigint, atomic units
    decimals:   mintInfo.decimals,      // number
    treasuryBurgAta,
  };
}

function rawToUi(raw, decimals) {
  // Safe conversion for display only — never use this for on-chain math
  const s = raw.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, -decimals) || '0';
  const frac  = decimals ? s.slice(-decimals).replace(/0+$/, '') : '';
  return Number(frac ? `${whole}.${frac}` : whole);
}

// ── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS (remove if same-origin only)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  if (!RPC_URL) return res.status(500).json({ error: 'SOLANA_RPC_URL not configured' });

  const { action } = req.body || {};
  try {
    if (action === 'info')    return await handleInfo(req, res);
    if (action === 'prepare') return await handlePrepare(req, res);
    if (action === 'send')    return await handleSend(req, res);
    if (action === 'confirm') return await handleConfirm(req, res);
    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[redeem-nft]', e);
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
}

// ── info: current treasury balance + preview payout ────────────────────────
async function handleInfo(req, res) {
  const connection = new Connection(RPC_URL, 'confirmed');
  const { balanceRaw, decimals } = await getTreasuryBurgState(connection);
  const payoutRaw = balanceRaw / 100n; // floor 1%
  return res.status(200).json({
    treasuryBalanceRaw: balanceRaw.toString(),
    treasuryBalanceUi:  rawToUi(balanceRaw, decimals),
    payoutRaw:          payoutRaw.toString(),
    payoutUi:           rawToUi(payoutRaw, decimals),
    decimals,
  });
}

// ── prepare: validate, build tx, treasury partial-signs ─────────────────────
async function handlePrepare(req, res) {
  const { userWallet, nftMint } = req.body || {};
  if (!userWallet || !nftMint) return res.status(400).json({ error: 'Missing params' });
  if (!ELIGIBLE_MINTS.has(nftMint)) return res.status(400).json({ error: 'NFT not eligible' });

  const user = new PublicKey(userWallet);
  const nft  = new PublicKey(nftMint);
  const connection = new Connection(RPC_URL, 'confirmed');

  // Verify user actually owns the NFT (SPL Token)
  const userNftAta = getAssociatedTokenAddressSync(nft, user, false, TOKEN_PROGRAM_ID);
  let userNftBalance = 0n;
  try {
    const acct = await getAccount(connection, userNftAta, 'confirmed', TOKEN_PROGRAM_ID);
    userNftBalance = acct.amount;
  } catch {
    return res.status(400).json({ error: 'NFT not found in your wallet' });
  }
  if (userNftBalance < 1n) return res.status(400).json({ error: 'NFT not found in your wallet' });

  // Fetch current treasury BURG state & compute 1% (live, at tx-build time)
  const { balanceRaw, decimals, treasuryBurgAta } = await getTreasuryBurgState(connection);
  const payoutRaw = balanceRaw / 100n;
  if (payoutRaw === 0n) return res.status(400).json({ error: 'Treasury balance too low' });

  // Derive receiver ATAs
  const treasuryNftAta = getAssociatedTokenAddressSync(nft, TREASURY, false, TOKEN_PROGRAM_ID);
  const userBurgAta    = getAssociatedTokenAddressSync(
    BURG_MINT, user, false, TOKEN_2022_PROGRAM_ID
  );

  // Build transaction
  const treasuryKeypair = loadTreasuryKeypair();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction({ feePayer: user, recentBlockhash: blockhash });

  // Optional: bump priority fee (small; user pays)
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }));

  // 1. Idempotent create treasury NFT ATA (user pays rent if new)
  tx.add(createAssociatedTokenAccountIdempotentInstruction(
    user, treasuryNftAta, TREASURY, nft, TOKEN_PROGRAM_ID
  ));

  // 2. Idempotent create user BURG ATA (Token-2022)
  tx.add(createAssociatedTokenAccountIdempotentInstruction(
    user, userBurgAta, user, BURG_MINT, TOKEN_2022_PROGRAM_ID
  ));

  // 3. User → Treasury : 1 NFT (SPL Token, decimals=0)
  tx.add(createTransferCheckedInstruction(
    userNftAta, nft, treasuryNftAta, user,
    1n, 0, [], TOKEN_PROGRAM_ID
  ));

  // 4. Treasury → User : 1% BURG (Token-2022)
  tx.add(createTransferCheckedInstruction(
    treasuryBurgAta, BURG_MINT, userBurgAta, TREASURY,
    payoutRaw, decimals, [], TOKEN_2022_PROGRAM_ID
  ));

  // Treasury partial-signs now; user signs + broadcasts from client
  tx.partialSign(treasuryKeypair);

  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });

  return res.status(200).json({
    txBase64: Buffer.from(serialized).toString('base64'),
    blockhash,
    lastValidBlockHeight,
    payoutRaw:          payoutRaw.toString(),
    payoutUi:           rawToUi(payoutRaw, decimals),
    treasuryBalanceUi:  rawToUi(balanceRaw, decimals),
    decimals,
  });
}

// ── send: broadcast a user-signed tx (Ledger / fallback path) ───────────────
async function handleSend(req, res) {
  const { signedTxBase64 } = req.body || {};
  if (!signedTxBase64) return res.status(400).json({ error: 'Missing signedTxBase64' });

  const connection = new Connection(RPC_URL, 'confirmed');
  const txBytes = Buffer.from(signedTxBase64, 'base64');

  try {
    const txSig = await connection.sendRawTransaction(txBytes, {
      skipPreflight: false,
      maxRetries: 3,
    });
    return res.status(200).json({ txSig });
  } catch (e) {
    console.error('[redeem-nft] send failed:', e);
    // Surface the useful part of RPC errors (logs, preflight failure, etc.)
    const msg = e?.logs ? `${e.message}\n${e.logs.join('\n')}` : (e.message || 'Broadcast failed');
    return res.status(400).json({ error: msg });
  }
}

// ── confirm: optional verification + logging hook ───────────────────────────
async function handleConfirm(req, res) {
  const { userWallet, nftMint, txSig } = req.body || {};
  if (!txSig) return res.status(400).json({ error: 'Missing txSig' });

  // Lightweight verify: fetch tx, confirm it succeeded.
  // (Tightening further — e.g. checking instructions match — is optional.)
  try {
    const connection = new Connection(RPC_URL, 'confirmed');
    const status = await connection.getSignatureStatus(txSig, { searchTransactionHistory: true });
    const ok = status?.value?.confirmationStatus && !status.value.err;
    if (!ok) return res.status(400).json({ error: 'Transaction not confirmed' });
  } catch (e) {
    // Non-fatal — client already confirmed on its end
    console.warn('[redeem-nft] confirm verify skipped:', e.message);
  }

  // TODO: persist redemption record (wallet, nftMint, txSig, timestamp) if needed
  console.log(`[redeem-nft] confirmed ${nftMint} by ${userWallet} → ${txSig}`);
  return res.status(200).json({ ok: true });
}
