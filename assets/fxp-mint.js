/**
 * fxp-mint.js  —  Founder Expansion Pack mint module
 * Mirrors mint.js (BHBMint) interface: fetchStats, initUmi, isUmiReady, mint
 */

import { createUmi }             from 'https://esm.sh/@metaplex-foundation/umi-bundle-defaults@0.9.2';
import {
  mplCandyMachine,
  mintV2,
}                                from 'https://esm.sh/@metaplex-foundation/mpl-candy-machine@1.1.0';
import { mplTokenMetadata }      from 'https://esm.sh/@metaplex-foundation/mpl-token-metadata@3.2.1';
import { walletAdapterIdentity } from 'https://esm.sh/@metaplex-foundation/umi-signer-wallet-adapters@0.9.2';
import {
  publicKey as umiPk,
  generateSigner,
  some,
  transactionBuilder,
}                                from 'https://esm.sh/@metaplex-foundation/umi@0.9.2';
import { setComputeUnitLimit }   from 'https://esm.sh/@metaplex-foundation/mpl-toolbox@0.9.4';

const FXP_CM_ID      = 'DPi8Xm3s3CHKgEGmTr64YT7rp7YRoUvm5imKJDyj6u2a';
const FXP_GUARD_ID   = 'DAk3yfQzAej5iSZbQhegDuKUNk1Bi9k1CpfpUidnGNQz';
const FXP_COLLECTION = 'GDhWXBvj4VgPhm7htMpVMC8MrCzS6PoGiWCzRLb7QoAp';
const FXP_AUTHORITY  = '9eMPEUrH46tbj67Y1uESNg9mzna7wi3J6ZoefsFkivcx';
const BURG_MINT      = '6disLregVtZ8qKpTTGyW81mbfAS9uwvHwjKfy6LApump';
const BURG_DEST_ATA  = 'DwJMwznfQEiFLUNQq3bMKhcBEqM9t5zS8nR5QvmUS9s4';
const HELIUS_RPC     = 'https://mainnet.helius-rpc.com/?api-key=a88e4b38-304e-407a-89c8-91c904b08491';
const FXP_SUPPLY     = 25;

let _umi = null;

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
  const minted    = view.getUint32(168, true);
  const remaining = Math.max(0, FXP_SUPPLY - minted);
  return { minted, remaining };
}

async function initUmi(walletAddress) {
  const provider = window.solflare?.isConnected       ? window.solflare
                 : window.phantom?.solana?.isConnected ? window.phantom.solana
                 : window.solana;
  if (!provider?.publicKey) throw new Error('No wallet connected');
  _umi = createUmi(HELIUS_RPC)
    .use(mplCandyMachine())
    .use(mplTokenMetadata())
    .use(walletAdapterIdentity({
      publicKey:           provider.publicKey,
      signTransaction:     tx  => provider.signTransaction(tx),
      signAllTransactions: txs => provider.signAllTransactions(txs),
    }));
}

function isUmiReady() { return !!_umi; }

async function mint(walletType, walletProvider) {
  if (!_umi) throw new Error('UMI not initialised');

  // Re-apply identity with the exact provider that will sign
  const provider = walletProvider
    || (walletType === 'solflare' ? window.solflare : window.phantom?.solana)
    || window.solana;

  _umi.use(walletAdapterIdentity({
    publicKey:           provider.publicKey,
    signTransaction:     tx  => provider.signTransaction(tx),
    signAllTransactions: txs => provider.signAllTransactions(txs),
  }));

  const nftSigner = generateSigner(_umi);

  const tx = transactionBuilder()
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

  const { signature } = await tx.sendAndConfirm(_umi, {
    confirm: { commitment: 'confirmed' },
    send:    { skipPreflight: false },
  });

  const sigBs58 = _toBase58(signature);
  const stats   = await fetchStats().catch(() => ({ minted: 1, remaining: FXP_SUPPLY - 1 }));
  return { ...stats, sig: sigBs58 };
}

function _toBase58(bytes) {
  const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const d = [];
  for (let i = 0; i < bytes.length; i++) {
    let c = bytes[i];
    for (let j = 0; j < d.length; j++) { c += d[j] << 8; d[j] = c % 58; c = (c / 58) | 0; }
    while (c > 0) { d.push(c % 58); c = (c / 58) | 0; }
  }
  let s = '';
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) s += '1';
  for (let i = d.length - 1; i >= 0; i--) s += ALPHA[d[i]];
  return s;
}

window.FXPMint = { fetchStats, initUmi, isUmiReady, mint };
