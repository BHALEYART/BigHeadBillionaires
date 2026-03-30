/**
 * fxp-mint.js  —  Founder Expansion Pack mint module
 * Direct mirror of assets/mint.js — same versions, same patterns, same signing flow.
 * Exposes: window.FXPMint = { fetchStats, initUmi, isUmiReady, prepMintTx, mint }
 */

const FXP_CM_ID        = 'DPi8Xm3s3CHKgEGmTr64YT7rp7YRoUvm5imKJDyj6u2a';
const FXP_GUARD_ID     = 'DAk3yfQzAej5iSZbQhegDuKUNk1Bi9k1CpfpUidnGNQz';
const TOKEN_MINT       = '6disLregVtZ8qKpTTGyW81mbfAS9uwvHwjKfy6LApump';
const TOKEN_DEST_ATA   = 'DwJMwznfQEiFLUNQq3bMKhcBEqM9t5zS8nR5QvmUS9s4';
const TOKEN_2022_PROG  = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const RPC_ENDPOINT     = 'https://mainnet.helius-rpc.com/?api-key=a88e4b38-304e-407a-89c8-91c904b08491';
const FXP_SUPPLY       = 25;

let _umi      = null;
let _cm       = null;
let _cg       = null;
let _mods     = null;
let _prepared = null;

// ── Provider helpers (mirror of mint.js) ──────────────────────────────────
function getProvider() {
  if (window.BHB?.walletProvider) return window.BHB.walletProvider;
  return window.phantom?.solana || window.solflare || window.backpack || window.solana || null;
}

function getPubkeyStr() {
  const provider = getProvider();
  const raw = provider?.publicKey;
  return (typeof raw === 'string' ? raw : raw?.toString?.()) || window.BHB?.walletAddress || null;
}

// ── Lazy-load all ESM modules (same versions as mint.js) ──────────────────
async function loadMods() {
  if (_mods) return _mods;
  const [umiCore, umiBun, cm, tm, adapter] = await Promise.all([
    import('https://esm.sh/@metaplex-foundation/umi@1.5.1'),
    import('https://esm.sh/@metaplex-foundation/umi-bundle-defaults@1.5.1'),
    import('https://esm.sh/@metaplex-foundation/mpl-candy-machine@6.1.0'),
    import('https://esm.sh/@metaplex-foundation/mpl-token-metadata@3.4.0'),
    import('https://esm.sh/@metaplex-foundation/umi-signer-wallet-adapters@1.5.1'),
  ]);
  _mods = { ...umiCore, ...umiBun, ...cm, ...tm, ...adapter };
  return _mods;
}

// ── initUmi ───────────────────────────────────────────────────────────────
async function initUmi(addressOverride) {
  const pubkeyStr = addressOverride || getPubkeyStr();
  if (!pubkeyStr) return false;

  const m          = await loadMods();
  const noopSigner = m.createNoopSigner(m.publicKey(pubkeyStr));

  _umi = m.createUmi(RPC_ENDPOINT)
    .use(m.mplCandyMachine())
    .use(m.mplTokenMetadata())
    .use(m.signerIdentity(noopSigner));
  _umi._walletPubkey = pubkeyStr;

  try {
    _cm = await m.fetchCandyMachine(_umi, m.publicKey(FXP_CM_ID));
    _cg = await m.safeFetchCandyGuard(_umi, m.publicKey(FXP_GUARD_ID));
    return true;
  } catch (e) {
    console.error('[FXPMint initUmi] failed:', e.message);
    return false;
  }
}

// ── fetchStats ────────────────────────────────────────────────────────────
async function fetchStats() {
  try {
    const m     = await loadMods();
    const readUmi = m.createUmi(RPC_ENDPOINT).use(m.mplCandyMachine());
    const cm    = await m.fetchCandyMachine(readUmi, m.publicKey(FXP_CM_ID));
    return {
      minted:    Number(cm.itemsRedeemed),
      remaining: Number(cm.itemsLoaded) - Number(cm.itemsRedeemed),
    };
  } catch (e) {
    console.warn('[FXPMint fetchStats] failed:', e);
    return null;
  }
}

// ── prepMintTx — pre-warms ESM imports, mirrors mint.js pattern ───────────
async function prepMintTx() {
  if (!_umi || !_cm) throw new Error('Call initUmi first');
  await Promise.all([
    loadMods(),
    import('https://esm.sh/@solana/web3.js@1.95.3'),
    import('https://esm.sh/@metaplex-foundation/mpl-toolbox@0.9.4'),
  ]);
  _prepared = true;
}

// ── _buildMintVtx — builds a fresh VersionedTransaction every call ────────
async function _buildMintVtx() {
  if (!_umi || !_cm) throw new Error('Call initUmi first');

  const m       = await loadMods();
  const web3    = await import('https://esm.sh/@solana/web3.js@1.95.3');
  const conn    = new web3.Connection(RPC_ENDPOINT, 'confirmed');
  const toolbox = await import('https://esm.sh/@metaplex-foundation/mpl-toolbox@0.9.4');

  // Generate a fresh NFT mint keypair the web3.js way (mirrors mint.js exactly)
  const nftMintWeb3 = web3.Keypair.generate();
  const nftMint = {
    publicKey:           m.publicKey(nftMintWeb3.publicKey.toBase58()),
    secretKey:           nftMintWeb3.secretKey,
    signTransaction:     async (tx) => tx,
    signAllTransactions: async (txs) => txs,
    signMessage:         async (msg) => msg,
  };

  const builder = m.transactionBuilder()
    .add(toolbox.setComputeUnitLimit(_umi, { units: 1_400_000 }))
    .add(toolbox.setComputeUnitPrice(_umi, { microLamports: 5_000 }))
    .add(m.mintV2(_umi, {
      candyMachine:              _cm.publicKey,
      candyGuard:                _cg?.publicKey ?? m.none(),
      nftMint,
      collectionMint:            _cm.collectionMint,
      collectionUpdateAuthority: _cm.authority,
      mintArgs: {
        token2022Payment: m.some({
          mint:           m.publicKey(TOKEN_MINT),
          destinationAta: m.publicKey(TOKEN_DEST_ATA),
          tokenProgram:   m.publicKey(TOKEN_2022_PROG),
        }),
        mintLimit: m.some({ id: 1 }),
      },
    }));

  // Always fetch a fresh blockhash right before building
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  const umiTx   = await builder.buildWithLatestBlockhash(_umi);
  const txBytes = _umi.transactions.serialize(umiTx);
  const vtx     = web3.VersionedTransaction.deserialize(txBytes);
  vtx.sign([nftMintWeb3]); // pre-sign with nft mint keypair

  return { vtx, conn, blockhash, lastValidBlockHeight, nftMintWeb3, web3, m };
}

// ── mint — mirrors mint.js exactly, including retry logic ─────────────────
async function mint(walletType, walletProvider) {
  if (walletType === 'solflare') {
    // ── Solflare ──────────────────────────────────────────────────────────
    const sf = (walletProvider?.signAndSendTransaction ? walletProvider : null)
            || (window.BHB?.walletProvider?.signAndSendTransaction ? window.BHB.walletProvider : null)
            || window.solflare;
    if (!sf) throw new Error('Solflare not found');
    _prepared = null;

    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY  = 2500;
    let lastErr;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const { vtx, conn, blockhash, lastValidBlockHeight, m } = await _buildMintVtx();

        const rawResult = await sf.signAndSendTransaction(vtx);
        let sig = rawResult?.signature ?? rawResult?.publicKey ?? rawResult;
        if (typeof sig !== 'string') sig = sig?.toString?.();
        await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

        _cm = await m.fetchCandyMachine(_umi, m.publicKey(FXP_CM_ID));
        return {
          minted:    Number(_cm.itemsRedeemed),
          remaining: Number(_cm.itemsLoaded) - Number(_cm.itemsRedeemed),
          sig,
        };
      } catch (e) {
        lastErr = e;
        const msg = e?.message ?? '';
        const isHard = msg.includes('cancelled') || msg.includes('rejected')
                    || msg.includes('0x179')
                    || msg.includes('0x1')
                    || msg.includes('insufficient lamports');
        if (isHard) throw e;
        if (attempt < MAX_ATTEMPTS) {
          console.warn(`[FXPMint] Solflare attempt ${attempt} failed, retrying in ${RETRY_DELAY}ms:`, msg);
          await new Promise(r => setTimeout(r, RETRY_DELAY));
        }
      }
    }
    throw lastErr;

  } else {
    // ── Phantom ───────────────────────────────────────────────────────────
    const ph = window.phantom?.solana || window.solana;
    if (!ph) throw new Error('Phantom extension not found');
    _prepared = null;

    const { vtx, conn, blockhash, lastValidBlockHeight, m } = await _buildMintVtx();

    let sig;
    if (typeof ph.signAndSendTransaction === 'function') {
      // Preferred: single call — more reliable on mobile
      const rawResult = await ph.signAndSendTransaction(vtx);
      sig = rawResult?.signature ?? rawResult?.publicKey ?? rawResult;
      if (typeof sig !== 'string') sig = sig?.toString?.();
    } else {
      // Desktop fallback: sign then send
      const signedVtx = await ph.signTransaction(vtx);
      sig = await conn.sendRawTransaction(signedVtx.serialize(), { skipPreflight: true, maxRetries: 3 });
    }

    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

    _cm = await m.fetchCandyMachine(_umi, m.publicKey(FXP_CM_ID));
    return {
      minted:    Number(_cm.itemsRedeemed),
      remaining: Number(_cm.itemsLoaded) - Number(_cm.itemsRedeemed),
      sig,
    };
  }
}

// ── Cleanup on disconnect ─────────────────────────────────────────────────
document.addEventListener('bhb:wallet-disconnected', () => {
  _umi = null; _cm = null; _cg = null; _prepared = null;
});

window.FXPMint = { fetchStats, initUmi, isUmiReady: () => !!(_umi && _cm), prepMintTx, mint };
