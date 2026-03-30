/**
 * fxp-mint.js  —  Founder Expansion Pack mint module
 * Mirrors the interface of mint.js (BHBMint) but targets the FXP Candy Machine.
 * Exposes: window.FXPMint = { fetchStats, initUmi, isUmiReady, mint }
 */

import { createUmi }                          from 'https://esm.sh/@metaplex-foundation/umi-bundle-defaults@0.9.2';
import { mplCandyMachine, mintV2, fetchCandyMachine, fetchCandyGuard }
                                              from 'https://esm.sh/@metaplex-foundation/mpl-candy-machine@1.1.0';
import { mplTokenMetadata }                   from 'https://esm.sh/@metaplex-foundation/mpl-token-metadata@3.2.1';
import { walletAdapterIdentity }              from 'https://esm.sh/@metaplex-foundation/umi-signer-wallet-adapters@0.9.2';
import { publicKey as umiPk, generateSigner, some, none, transactionBuilder }
                                              from 'https://esm.sh/@metaplex-foundation/umi@0.9.2';
import { setComputeUnitLimit }                from 'https://esm.sh/@metaplex-foundation/mpl-toolbox@0.9.4';

// ── FXP addresses ──────────────────────────────────────────────────────────
const FXP_CM_ID        = 'DPi8Xm3s3CHKgEGmTr64YT7rp7YRoUvm5imKJDyj6u2a';
const FXP_GUARD_ID     = 'DAk3yfQzAej5iSZbQhegDuKUNk1Bi9k1CpfpUidnGNQz';
const FXP_COLLECTION   = 'GDhWXBvj4VgPhm7htMpVMC8MrCzS6PoGiWCzRLb7QoAp';
const BURG_MINT        = '6disLregVtZ8qKpTTGyW81mbfAS9uwvHwjKfy6LApump';
const BURG_DEST_ATA    = 'DwJMwznfQEiFLUNQq3bMKhcBEqM9t5zS8nR5QvmUS9s4';
const BURG_AMOUNT      = BigInt('1000000000000');  // 1,000,000 BURG (6 decimals)
const HELIUS_RPC       = 'https://mainnet.helius-rpc.com/?api-key=a88e4b38-304e-407a-89c8-91c904b08491';
const FXP_SUPPLY       = 25;

// ── Module state ───────────────────────────────────────────────────────────
let _umi = null;

// ── Build a wallet adapter shim from either Phantom or Solflare provider ──
function _buildAdapter(walletType, walletProvider) {
  const provider = walletProvider
    || (walletType === 'solflare' ? window.solflare : window.phantom?.solana)
    || window.solana;

  return {
    publicKey:   provider.publicKey,
    signTransaction:     tx => provider.signTransaction(tx),
    signAllTransactions: txs => provider.signAllTransactions(txs),
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

async function fetchStats() {
  const res = await fetch(HELIUS_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'fxp-stats',
      method: 'getAccountInfo',
      params: [FXP_CM_ID, { encoding: 'base64' }]
    })
  });
  const data = await res.json();
  // Decode itemsRedeemed from Candy Machine account (offset 0xA8 = 168, u64 LE)
  const b64 = data?.result?.value?.data?.[0];
  if (!b64) return { minted: 0, remaining: FXP_SUPPLY };
  const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const view = new DataView(buf.buffer);
  // itemsRedeemed is at byte 168 as u64 little-endian (low 32 bits sufficient for small numbers)
  const minted    = view.getUint32(168, true);
  const remaining = Math.max(0, FXP_SUPPLY - minted);
  return { minted, remaining };
}

function isUmiReady() {
  return !!_umi;
}

async function initUmi(walletAddress) {
  // Build a minimal wallet shim for UMI identity (no signing needed for init)
  const provider = window.solflare?.isConnected ? window.solflare
                 : window.phantom?.solana?.isConnected ? window.phantom.solana
                 : window.solana;

  if (!provider?.publicKey) throw new Error('No wallet connected');

  _umi = createUmi(HELIUS_RPC)
    .use(mplCandyMachine())
    .use(mplTokenMetadata())
    .use(walletAdapterIdentity({
      publicKey:           provider.publicKey,
      signTransaction:     tx => provider.signTransaction(tx),
      signAllTransactions: txs => provider.signAllTransactions(txs),
    }));
}

async function mint(walletType, walletProvider) {
  if (!_umi) throw new Error('UMI not initialised — call initUmi first');

  // Re-apply identity with the correct provider for signing
  const adapter = _buildAdapter(walletType, walletProvider);
  _umi.use(walletAdapterIdentity(adapter));

  const cmPk      = umiPk(FXP_CM_ID);
  const guardPk   = umiPk(FXP_GUARD_ID);
  const nftSigner = generateSigner(_umi);

  // Fetch on-chain CM state for accurate remaining count in the response
  const [cm, guard] = await Promise.all([
    fetchCandyMachine(_umi, cmPk),
    fetchCandyGuard(_umi, guardPk),
  ]);

  const tx = transactionBuilder()
    .add(setComputeUnitLimit(_umi, { units: 400_000 }))
    .add(mintV2(_umi, {
      candyMachine:     cmPk,
      candyGuard:       guardPk,
      nftMint:          nftSigner,
      collectionMint:   umiPk(FXP_COLLECTION),
      collectionUpdateAuthority: umiPk('9eMPEUrH46tbj67Y1uESNg9mzna7wi3J6ZoefsFkivcx'),
      mintArgs: {
        token2022Payment: some({
          mint:           umiPk(BURG_MINT),
          destinationAta: umiPk(BURG_DEST_ATA),
        }),
        mintLimit: some({ id: 1 }),
      },
    }));

  const { signature } = await tx.sendAndConfirm(_umi, {
    confirm: { commitment: 'confirmed' },
    send:    { skipPreflight: false },
  });

  const sig       = Buffer.from(signature).toString('base64');
  // Convert UMI base64 sig to base58 for Solscan link
  const sigBs58   = _toBase58(signature);

  const minted    = Number(cm.itemsRedeemed) + 1;
  const remaining = Math.max(0, FXP_SUPPLY - minted);

  return { minted, remaining, sig: sigBs58 };
}

// Minimal base58 encoder for transaction signatures
function _toBase58(bytes) {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const digits = [0];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let str = '';
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) str += '1';
  for (let i = digits.length - 1; i >= 0; i--) str += ALPHABET[digits[i]];
  return str;
}

// ── Export ─────────────────────────────────────────────────────────────────
window.FXPMint = { fetchStats, initUmi, isUmiReady, mint };
