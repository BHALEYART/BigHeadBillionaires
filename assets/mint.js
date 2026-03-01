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

// ── Pre-build the transaction so mint() only needs to sign ────────────────────
// Call this BEFORE the user clicks mint (e.g. on wallet connect).
// Solflare requires signTransaction to be called synchronously from a user gesture.
// Any await before signing breaks the trusted-event chain and causes "not authorized".
async function prepMintTx() {
  if (!_umi || !_cm) throw new Error('Call initUmi first');

  const m   = await loadMods();
  const web3 = await import('https://esm.sh/@solana/web3.js@1.95.3');
  const conn = new web3.Connection(RPC_ENDPOINT, 'confirmed');

  // Generate nftMint keypair via web3.js so we have a proper 64-byte secretKey
  const nftMintWeb3 = web3.Keypair.generate();
  // Wrap as UMI signer for mintV2
  const nftMint = {
    publicKey:       m.publicKey(nftMintWeb3.publicKey.toBase58()),
    secretKey:       nftMintWeb3.secretKey,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
    signMessage: async (msg) => msg,
  };

  // Build UMI transaction
  const builder = m.transactionBuilder().add(m.mintV2(_umi, {
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

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const pubkeyStr = _umi._walletPubkey || getPubkeyStr();
  const walletPubkey = new web3.PublicKey(pubkeyStr);

  // Build UMI tx → serialize → VersionedTransaction
  const umiTx   = await builder.buildWithLatestBlockhash(_umi);
  const txBytes = _umi.transactions.serialize(umiTx);
  const vtx     = web3.VersionedTransaction.deserialize(txBytes);

  // Pre-sign with nftMint keypair
  vtx.sign([nftMintWeb3]);

  console.log('[prepMintTx] staticKeys:', vtx.message.staticAccountKeys?.length, '| ixs:', vtx.message.compiledInstructions?.length);
  _prepared = { vtx, conn, blockhash, lastValidBlockHeight };
  console.log('[prepMintTx] transaction ready');
}

// ── mint() — call directly from click handler, no awaits before signing ───────
async function mint() {
  if (!_prepared) throw new Error('Transaction not prepared — call prepMintTx first');

  const { vtx, conn, blockhash, lastValidBlockHeight } = _prepared;
  _prepared = null; // consume

  const provider = getProvider();
  if (!provider) throw new Error('Wallet not connected');

  // Solflare legacy: signAndSendTransaction(tx) → returns signature string
  // Phantom legacy: signTransaction(tx) → returns signed tx → sendRawTransaction
  let sig;
  if (provider.signAndSendTransaction) {
    console.log('[mint] using signAndSendTransaction | isWalletStandard:', provider.isWalletStandard, '| isConnected:', provider.isConnected, '| connected:', provider.connected);
    // Call directly — Solflare handles re-auth internally
    console.log('[mint] calling signAndSendTransaction directly on window.solflare');
    const solflareProvider = window.solflare?.isSolflare ? window.solflare : provider;
    const rawResult = await solflareProvider.signAndSendTransaction(vtx);
    console.log('[mint] raw result:', JSON.stringify(rawResult), '| type:', typeof rawResult);
    sig = rawResult?.signature ?? rawResult?.publicKey ?? rawResult;
    if (typeof sig !== 'string') sig = sig?.toString?.();
    console.log('[mint] sig:', sig);
  } else {
    console.log('[mint] using signTransaction');
    const signedVtx = await provider.signTransaction(vtx);
    sig = await conn.sendRawTransaction(signedVtx.serialize(), { skipPreflight: false });
  }
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

  const m = await loadMods();
  _cm = await m.fetchCandyMachine(_umi, m.publicKey(CANDY_MACHINE_ID));
  return { minted: Number(_cm.itemsRedeemed), remaining: Number(_cm.itemsLoaded) - Number(_cm.itemsRedeemed) };
}

// ── BURG fee for customizer ───────────────────────────────────────────────────
async function payBurgFee() {
  const provider = getProvider();
  const pubkeyStr = getPubkeyStr();
  if (!provider || !pubkeyStr) throw new Error('Wallet not connected');

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

  const signedTx = await provider.signTransaction(tx);
  const sig      = await connection.sendRawTransaction(signedTx.serialize());
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
  if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
  const { uri } = await res.json();
  return uri;
}

// wallet-connected: handled by game page _backgroundPrep, not reset here
document.addEventListener('bhb:wallet-disconnected', () => { _umi = null; _cm = null; _cg = null; _prepared = null; });

window.BHBMint = { initUmi, fetchStats, prepMintTx, mint, payBurgFee, uploadFile };
