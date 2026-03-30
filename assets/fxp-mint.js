/**
 * fxp-mint.js  —  Founder Expansion Pack mint module
 *
 * Uses UMI to BUILD the mintV2 transaction, then bypasses UMI's identity/signing
 * pipeline entirely. Instead we:
 *   1. Partially sign with the generated nft keypair (web3.js)
 *   2. Call provider.signTransaction() directly — this opens Phantom/Solflare
 *   3. Submit the fully-signed transaction via RPC fetch
 *
 * Exports: window.FXPMint = { fetchStats, initUmi, isUmiReady, mint }
 */

import { createUmi }                  from 'https://esm.sh/@metaplex-foundation/umi-bundle-defaults@0.9.2';
import { mplCandyMachine, mintV2 }    from 'https://esm.sh/@metaplex-foundation/mpl-candy-machine@1.1.0';
import { mplTokenMetadata }           from 'https://esm.sh/@metaplex-foundation/mpl-token-metadata@3.2.1';
import {
  publicKey        as umiPk,
  signerIdentity,
  createNoopSigner,
  createSignerFromKeypair,
  some,
  transactionBuilder,
}                                     from 'https://esm.sh/@metaplex-foundation/umi@0.9.2';
import { setComputeUnitLimit }        from 'https://esm.sh/@metaplex-foundation/mpl-toolbox@0.9.4';
import {
  toWeb3JsTransaction,
  toWeb3JsKeypair,
}                                     from 'https://esm.sh/@metaplex-foundation/umi-web3js-adapters@0.9.2';

// ── FXP constants ──────────────────────────────────────────────────────────
const FXP_CM_ID      = 'DPi8Xm3s3CHKgEGmTr64YT7rp7YRoUvm5imKJDyj6u2a';
const FXP_GUARD_ID   = 'DAk3yfQzAej5iSZbQhegDuKUNk1Bi9k1CpfpUidnGNQz';
const FXP_COLLECTION = 'GDhWXBvj4VgPhm7htMpVMC8MrCzS6PoGiWCzRLb7QoAp';
const FXP_AUTHORITY  = '9eMPEUrH46tbj67Y1uESNg9mzna7wi3J6ZoefsFkivcx';
const BURG_MINT      = '6disLregVtZ8qKpTTGyW81mbfAS9uwvHwjKfy6LApump';
const BURG_DEST_ATA  = 'DwJMwznfQEiFLUNQq3bMKhcBEqM9t5zS8nR5QvmUS9s4';
const HELIUS_RPC     = 'https://mainnet.helius-rpc.com/?api-key=a88e4b38-304e-407a-89c8-91c904b08491';
const FXP_SUPPLY     = 25;

let _umi = null;

// ── fetchStats ─────────────────────────────────────────────────────────────
async function fetchStats() {
  const res  = await fetch(HELIUS_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'fxp-stats',
      method: 'getAccountInfo',
      params: [FXP_CM_ID, { encoding: 'base64' }],
    }),
  });
  const data  = await res.json();
  const b64   = data?.result?.value?.data?.[0];
  if (!b64) return { minted: 0, remaining: FXP_SUPPLY };
  const buf   = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const view  = new DataView(buf.buffer);
  const minted    = view.getUint32(168, true); // itemsRedeemed offset in CM account
  const remaining = Math.max(0, FXP_SUPPLY - minted);
  return { minted, remaining };
}

// ── initUmi ────────────────────────────────────────────────────────────────
async function initUmi(walletAddress) {
  _umi = createUmi(HELIUS_RPC)
    .use(mplCandyMachine())
    .use(mplTokenMetadata())
    // Noop identity — we sign manually in mint(), not through UMI's pipeline
    .use(signerIdentity(createNoopSigner(umiPk(walletAddress))));
}

function isUmiReady() { return !!_umi; }

// ── mint ───────────────────────────────────────────────────────────────────
async function mint(walletType, walletProvider) {
  if (!_umi) throw new Error('UMI not initialised');

  // Resolve the correct provider for signing
  const provider = walletProvider
    || (walletType === 'solflare' ? window.solflare : window.phantom?.solana)
    || window.solana;
  if (!provider?.publicKey) throw new Error('Wallet not connected');

  const walletPk = provider.publicKey.toBase58();

  // Update UMI identity pubkey to match the connected wallet (no-op signer)
  _umi.use(signerIdentity(createNoopSigner(umiPk(walletPk))));

  // Generate a fresh keypair for the new NFT mint account
  // We keep the raw keypair so we can partially sign the web3.js tx ourselves
  const nftKeypair = _umi.eddsa.generateKeypair();
  const nftSigner  = createSignerFromKeypair(_umi, nftKeypair);

  // Build the mintV2 instruction with UMI
  const builder = transactionBuilder()
    .add(setComputeUnitLimit(_umi, { units: 400_000 }))
    .add(mintV2(_umi, {
      candyMachine:              umiPk(FXP_CM_ID),
      candyGuard:                umiPk(FXP_GUARD_ID),
      nftMint:                   nftSigner,
      collectionMint:            umiPk(FXP_COLLECTION),
      collectionUpdateAuthority: umiPk(FXP_AUTHORITY),
      mintArgs: {
        token2022Payment: some({
          mint:           umiPk(BURG_MINT),
          destinationAta: umiPk(BURG_DEST_ATA),
        }),
        mintLimit: some({ id: 1 }),
      },
    }));

  // Build with a fresh blockhash — produces an UNSIGNED UMI transaction
  const umiTx = await builder.buildWithLatestBlockhash(_umi);

  // Convert to a web3.js VersionedTransaction
  const web3Tx = toWeb3JsTransaction(umiTx);

  // ── Step 1: Partial-sign with the nft mint keypair ──────────────────────
  // The NFT mint account must be signed by the keypair that owns it.
  const nftWeb3Keypair = toWeb3JsKeypair(nftKeypair);
  web3Tx.sign([nftWeb3Keypair]);

  // ── Step 2: Send to wallet for the minter's signature ───────────────────
  // THIS is the call that opens Phantom / Solflare and shows the tx details.
  const signedTx = await provider.signTransaction(web3Tx);

  // ── Step 3: Broadcast ───────────────────────────────────────────────────
  const rawB64 = _uint8ToBase64(signedTx.serialize());
  const sendRes = await fetch(HELIUS_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'fxp-send',
      method: 'sendTransaction',
      params: [rawB64, { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed' }],
    }),
  });
  const sendData = await sendRes.json();
  if (sendData.error) throw new Error(sendData.error.message || 'sendTransaction failed');
  const sig = sendData.result; // base58 signature

  // ── Step 4: Confirm ─────────────────────────────────────────────────────
  await _confirmTx(sig);

  const stats = await fetchStats().catch(() => ({ minted: 1, remaining: FXP_SUPPLY - 1 }));
  return { ...stats, sig };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function _uint8ToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function _confirmTx(sig, maxAttempts = 30, interval = 1500) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 'fxp-confirm',
        method: 'getSignatureStatuses',
        params: [[sig], { searchTransactionHistory: true }],
      }),
    });
    const data   = await res.json();
    const status = data?.result?.value?.[0];
    if (status) {
      if (status.err) throw new Error('Transaction failed: ' + JSON.stringify(status.err));
      if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') return;
    }
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error('Confirmation timeout — check Solscan for tx status');
}

// ── Export ─────────────────────────────────────────────────────────────────
window.FXPMint = { fetchStats, initUmi, isUmiReady, mint };
