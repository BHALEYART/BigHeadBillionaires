// assets/mint.js

const CANDY_MACHINE_ID   = 'BiqLN985cYm9nmXpZwP7kDJnoW41Fq7Vy129pUb8ndVA';
const CANDY_GUARD_ID     = 'EwuGsMoNnFQ9XDumF1VxvLHVLew2ayxNQamwTvyXQBYL';
const TOKEN_MINT         = '6disLregVtZ8qKpTTGyW81mbfAS9uwvHwjKfy6LApump';
const TOKEN_DEST_ATA     = 'DwJMwznfQEiFLUNQq3bMKhcBEqM9t5zS8nR5QvmUS9s4';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const RPC_ENDPOINT       = 'https://mainnet.helius-rpc.com/?api-key=a88e4b38-304e-407a-89c8-91c904b08491';
const CUSTOMIZER_FEE_DEST   = '9eMPEUrH46tbj67Y1uESNg9mzna7wi3J6ZoefsFkivcx';
const CUSTOMIZER_FEE_AMOUNT = 100_000_000_000n;

let _umi  = null;
let _cm   = null;
let _cg   = null;
let _mods = null;

// ── Pre-built transaction cache ───────────────────────────────────────────────
// prepMintTx() builds + caches everything. mint() consumes it synchronously.
let _prepared = null;

function getProvider() {
  if (window.BHB?.walletProvider) return window.BHB.walletProvider;
  return window.phantom?.solana || window.solflare || window.backpack || window.solana || null;
}

function getPubkeyStr() {
  const provider = getProvider();
  const raw = provider?.publicKey;
  return (typeof raw === 'string' ? raw : raw?.toString?.()) || window.BHB?.walletAddress || null;
}

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

async function initUmi(addressOverride) {
  const pubkeyStr = addressOverride || getPubkeyStr();
  console.log('[initUmi] pubkeyStr:', pubkeyStr);
  if (!pubkeyStr) return false;

  const m = await loadMods();
  const noopSigner = m.createNoopSigner(m.publicKey(pubkeyStr));

  _umi = m.createUmi(RPC_ENDPOINT)
    .use(m.mplCandyMachine())
    .use(m.mplTokenMetadata())
    .use(m.signerIdentity(noopSigner));
  _umi._walletPubkey = pubkeyStr;

  try {
    console.log('[initUmi] fetching candy machine...');
    _cm = await m.fetchCandyMachine(_umi, m.publicKey(CANDY_MACHINE_ID));
    _cg = await m.safeFetchCandyGuard(_umi, m.publicKey(CANDY_GUARD_ID));
    console.log('[initUmi] success! items loaded:', Number(_cm.itemsLoaded));
    return true;
  } catch (e) {
    console.error('[initUmi] failed:', e.message);
    return false;
  }
}

async function fetchStats() {
  try {
    const m = await loadMods();
    const readUmi = m.createUmi(RPC_ENDPOINT).use(m.mplCandyMachine());
    const cm = await m.fetchCandyMachine(readUmi, m.publicKey(CANDY_MACHINE_ID));
    return { minted: Number(cm.itemsRedeemed), remaining: Number(cm.itemsLoaded) - Number(cm.itemsRedeemed) };
  } catch (e) {
    console.warn('fetchStats failed:', e);
    return null;
  }
}

// ── prepMintTx — warms up module imports so mint() has less async work ────────
// NOTE: We no longer pre-build the full VersionedTransaction here.
// A cached tx with a fixed blockhash expires after ~60 slots (~30s), which is
// fatal on mobile: the user switches to the wallet app, approves, returns —
// and the blockhash is already dead. Instead, mint() always fetches a fresh
// blockhash and builds the tx at signing time. prepMintTx just pre-loads ESM
// modules so that async work is already done when the button is tapped.
async function prepMintTx() {
  if (!_umi || !_cm) throw new Error('Call initUmi first');
  // Pre-warm ESM module imports so mint() has less work at tap time
  await Promise.all([
    loadMods(),
    import('https://esm.sh/@solana/web3.js@1.95.3'),
    import('https://esm.sh/@metaplex-foundation/mpl-toolbox@0.9.4'),
  ]);
  _prepared = true;
  console.log('[prepMintTx] modules warmed, ready to mint');
}

// ── Shared tx builder — used by both wallet paths ────────────────────────────
async function _buildMintVtx() {
  if (!_umi || !_cm) throw new Error('Call initUmi first');
  const m    = await loadMods();
  const web3 = await import('https://esm.sh/@solana/web3.js@1.95.3');
  const conn = new web3.Connection(RPC_ENDPOINT, 'confirmed');

  const nftMintWeb3 = web3.Keypair.generate();
  const nftMint = {
    publicKey:           m.publicKey(nftMintWeb3.publicKey.toBase58()),
    secretKey:           nftMintWeb3.secretKey,
    signTransaction:     async (tx) => tx,
    signAllTransactions: async (txs) => txs,
    signMessage:         async (msg) => msg,
  };

  const toolbox = await import('https://esm.sh/@metaplex-foundation/mpl-toolbox@0.9.4');
  const builder = m.transactionBuilder()
    .add(toolbox.setComputeUnitLimit(_umi, { units: 800_000 }))
    .add(toolbox.setComputeUnitPrice(_umi, { microLamports: 1_000 }))
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
          tokenProgram:   m.publicKey(TOKEN_2022_PROGRAM),
        }),
      },
    }));

  // Always fetch a fresh blockhash right before building — avoids expiry on mobile
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  const umiTx   = await builder.buildWithLatestBlockhash(_umi);
  const txBytes = _umi.transactions.serialize(umiTx);
  const vtx     = web3.VersionedTransaction.deserialize(txBytes);
  vtx.sign([nftMintWeb3]);   // pre-sign with nftMint keypair

  return { vtx, conn, blockhash, lastValidBlockHeight, nftMintWeb3, web3, m };
}

// ── mint() — builds a fresh tx each time, handles both wallets ───────────────
async function mint(walletType, walletProvider) {
  if (walletType === 'solflare') {
    // ── Solflare ──────────────────────────────────────────────────────────────
    const sf = (walletProvider?.signAndSendTransaction ? walletProvider : null)
            || (window.BHB?.walletProvider?.signAndSendTransaction ? window.BHB.walletProvider : null)
            || window.solflare;
    if (!sf) throw new Error('Solflare not found');

    // Build tx fresh NOW (blockhash is seconds old, not minutes)
    const { vtx, conn, blockhash, lastValidBlockHeight, m } = await _buildMintVtx();
    _prepared = null;

    const rawResult = await sf.signAndSendTransaction(vtx);
    let sig = rawResult?.signature ?? rawResult?.publicKey ?? rawResult;
    if (typeof sig !== 'string') sig = sig?.toString?.();
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

    _cm = await m.fetchCandyMachine(_umi, m.publicKey(CANDY_MACHINE_ID));
    return { minted: Number(_cm.itemsRedeemed), remaining: Number(_cm.itemsLoaded) - Number(_cm.itemsRedeemed), sig };

  } else {
    // ── Phantom ───────────────────────────────────────────────────────────────
    const ph = window.phantom?.solana || window.solana;
    if (!ph) throw new Error('Phantom extension not found');
    _prepared = null;

    const { vtx, conn, blockhash, lastValidBlockHeight, m } = await _buildMintVtx();

    let sig;
    // Prefer signAndSendTransaction — more reliable on mobile (avoids app-switch byte loss)
    if (typeof ph.signAndSendTransaction === 'function') {
      const rawResult = await ph.signAndSendTransaction(vtx);
      sig = rawResult?.signature ?? rawResult?.publicKey ?? rawResult;
      if (typeof sig !== 'string') sig = sig?.toString?.();
    } else {
      // Desktop fallback: two-step sign + send
      const signedVtx = await ph.signTransaction(vtx);
      sig = await conn.sendRawTransaction(signedVtx.serialize(), { skipPreflight: false });
    }

    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

    _cm = await m.fetchCandyMachine(_umi, m.publicKey(CANDY_MACHINE_ID));
    return { minted: Number(_cm.itemsRedeemed), remaining: Number(_cm.itemsLoaded) - Number(_cm.itemsRedeemed), sig };
  }
}



// ── BURG fee for customizer ───────────────────────────────────────────────────
async function payBurgFee(walletType, walletProvider) {
  // Resolve pubkey from passed-in provider first, then fall back to global state
  const providerForKey = walletProvider || getProvider();
  const rawKey = providerForKey?.publicKey;
  const pubkeyStr = (typeof rawKey === 'string' ? rawKey : rawKey?.toString?.())
    || window.BHB?.walletAddress
    || getPubkeyStr();
  if (!pubkeyStr) throw new Error('Wallet not connected');

  const web3 = await import('https://esm.sh/@solana/web3.js@1.95.3');
  const spl  = await import('https://esm.sh/@solana/spl-token@0.4.6');

  const connection  = new web3.Connection(RPC_ENDPOINT, 'confirmed');
  const payerPubkey = new web3.PublicKey(pubkeyStr);
  const mintPubkey  = new web3.PublicKey(TOKEN_MINT);
  const destPubkey  = new web3.PublicKey(CUSTOMIZER_FEE_DEST);
  const TOKEN_PROG  = new web3.PublicKey(TOKEN_2022_PROGRAM);

  const srcAta  = spl.getAssociatedTokenAddressSync(mintPubkey, payerPubkey, false, TOKEN_PROG);
  const destAta = spl.getAssociatedTokenAddressSync(mintPubkey, destPubkey,  false, TOKEN_PROG);

  const ixs = [];
  try { await connection.getAccountInfo(destAta); } catch (_) {
    ixs.push(spl.createAssociatedTokenAccountInstruction(payerPubkey, destAta, destPubkey, mintPubkey, TOKEN_PROG));
  }
  ixs.push(spl.createTransferCheckedInstruction(srcAta, mintPubkey, destAta, payerPubkey, CUSTOMIZER_FEE_AMOUNT, 6, [], TOKEN_PROG));

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new web3.Transaction({ feePayer: payerPubkey, recentBlockhash: blockhash });
  ixs.forEach(ix => tx.add(ix));

  let sig;
  if (walletType === 'solflare') {
    // Solflare: signAndSendTransaction via fallback chain
    const sf = (walletProvider?.signAndSendTransaction ? walletProvider : null)
            || (window.BHB?.walletProvider?.signAndSendTransaction ? window.BHB.walletProvider : null)
            || window.solflare;
    if (!sf) throw new Error('Solflare not found');
    const rawResult = await sf.signAndSendTransaction(tx);
    sig = rawResult?.signature ?? rawResult?.publicKey ?? rawResult;
    if (typeof sig !== 'string') sig = sig?.toString?.();
  } else {
    // Phantom: signTransaction then send
    const ph = window.phantom?.solana || window.solana;
    if (!ph) throw new Error('Phantom not found');
    const signedTx = await ph.signTransaction(tx);
    sig = await connection.sendRawTransaction(signedTx.serialize());
  }

  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

async function uploadFile(file, contentType) {
  const formData = new FormData();
  // Give the blob a proper filename so the backend can distinguish image vs. JSON
  const isJson   = contentType === 'application/json' || file.type === 'application/json';
  const filename = isJson ? 'metadata.json' : 'image.png';
  const typed    = (contentType && file.type !== contentType)
    ? new Blob([file], { type: contentType })
    : file;
  formData.append('file', typed, filename);
  const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
  if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
  const { uri } = await res.json();
  return uri;
}

// wallet-connected: handled by game page _backgroundPrep, not reset here
document.addEventListener('bhb:wallet-disconnected', () => { _umi = null; _cm = null; _cg = null; _prepared = null; });

window.BHBMint = { initUmi, fetchStats, prepMintTx, mint, payBurgFee, uploadFile, isUmiReady: () => !!(_umi && _cm) };