// assets/mint.js
// Build: bhb-mint-2026-05-29-solflare-historical  ← back to signAndSendTransaction (the historical working path) + skipPreflight via direct window.solflare
console.log('[BHBMint] build: bhb-mint-2026-05-29-solflare-historical');

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
    import('https://esm.sh/@metaplex-foundation/umi@1.5.1?bundle'),
    import('https://esm.sh/@metaplex-foundation/umi-bundle-defaults@1.5.1?bundle'),
    import('https://esm.sh/@metaplex-foundation/mpl-candy-machine@6.1.0?bundle'),
    import('https://esm.sh/@metaplex-foundation/mpl-token-metadata@3.4.0?bundle'),
    import('https://esm.sh/@metaplex-foundation/umi-signer-wallet-adapters@1.5.1?bundle'),
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
    import('https://esm.sh/@solana/web3.js@1.95.3?bundle'),
    import('https://esm.sh/@metaplex-foundation/mpl-toolbox@0.9.4?bundle'),
  ]);
  _prepared = true;
  console.log('[prepMintTx] modules warmed, ready to mint');
}

// ── Shared tx builder — used by both wallet paths ────────────────────────────
async function _buildMintVtx() {
  if (!_umi || !_cm) throw new Error('Call initUmi first');
  const m    = await loadMods();
  const web3 = await import('https://esm.sh/@solana/web3.js@1.95.3?bundle');
  const conn = new web3.Connection(RPC_ENDPOINT, 'confirmed');

  const nftMintWeb3 = web3.Keypair.generate();
  const nftMint = {
    publicKey:           m.publicKey(nftMintWeb3.publicKey.toBase58()),
    secretKey:           nftMintWeb3.secretKey,
    signTransaction:     async (tx) => tx,
    signAllTransactions: async (txs) => txs,
    signMessage:         async (msg) => msg,
  };

  const toolbox = await import('https://esm.sh/@metaplex-foundation/mpl-toolbox@0.9.4?bundle');
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
    _prepared = null;

    // Retry up to 3 times — Solflare desktop runs its own preflight simulation
    // which can fail due to stale RPC account state (esp. Token2022 ATAs on new
    // wallets). A short wait lets the network propagate before retrying.
    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY  = 2500; // ms
    let lastErr;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        // Always build a fresh tx with a live blockhash on each attempt
        const { vtx, conn, blockhash, lastValidBlockHeight, m } = await _buildMintVtx();

        const rawResult = await sf.signAndSendTransaction(vtx);
        let sig = rawResult?.signature ?? rawResult?.publicKey ?? rawResult;
        if (typeof sig !== 'string') sig = sig?.toString?.();
        await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

        _cm = await m.fetchCandyMachine(_umi, m.publicKey(CANDY_MACHINE_ID));
        return { minted: Number(_cm.itemsRedeemed), remaining: Number(_cm.itemsLoaded) - Number(_cm.itemsRedeemed), sig };

      } catch (e) {
        lastErr = e;
        const msg = e?.message ?? '';
        // Don't retry on user cancellation or definitive on-chain rejections
        const isHard = msg.includes('cancelled') || msg.includes('rejected')
                    || msg.includes('0x179')      // already minted
                    || msg.includes('0x1')         // insufficient tokens
                    || msg.includes('insufficient lamports');
        if (isHard) throw e;
        if (attempt < MAX_ATTEMPTS) {
          console.warn(`[mint] Solflare attempt ${attempt} failed, retrying in ${RETRY_DELAY}ms:`, msg);
          await new Promise(r => setTimeout(r, RETRY_DELAY));
        }
      }
    }
    throw lastErr;

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
      sig = await conn.sendRawTransaction(signedVtx.serialize(), { skipPreflight: true, maxRetries: 3 });
    }

    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

    _cm = await m.fetchCandyMachine(_umi, m.publicKey(CANDY_MACHINE_ID));
    return { minted: Number(_cm.itemsRedeemed), remaining: Number(_cm.itemsLoaded) - Number(_cm.itemsRedeemed), sig };
  }
}



// ── BURG fee for customizer ───────────────────────────────────────────────────
// MOBILE FIX: Was previously using `await import('https://esm.sh/@solana/web3.js')`
// and `await import('https://esm.sh/@solana/spl-token')`. Both cascade through
// transitive ESM deps (jayson → uuid) which fails on mobile Safari / wallet
// in-app browsers: "TypeError: null is not an object (evaluating 'r.v4')".
// jsdelivr's `/+esm` has the same problem with different framing.
//
// Solution: load Solana's official browser UMD build (single self-contained
// file, jayson already bundled and tested) via a regular <script> tag, and
// hand-build the two SPL-Token-2022 instructions we need (transferChecked +
// optional createAssociatedTokenAccount). No more dynamic ESM, no @solana/
// spl-token dependency at all in this path.

// Helper: ensure window.solanaWeb3 (UMD build) is loaded.
// Tries multiple CDN URLs in sequence — wallet in-app browsers sometimes
// block one CDN but not another. The official Solana README points to
// unpkg; jsdelivr is the usual fallback; cdnjs is a last resort.
const _SOLANA_WEB3_URLS = [
  'https://unpkg.com/@solana/web3.js@1.95.3/lib/index.iife.min.js',
  'https://cdn.jsdelivr.net/npm/@solana/web3.js@1.95.3/lib/index.iife.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/solana-web3.js/1.87.6/solana-web3.min.js',
];

function _loadScriptOnce(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src   = url;
    s.async = true;
    const timer = setTimeout(() => {
      s.remove();
      reject(new Error('Timeout loading ' + url));
    }, timeoutMs);
    s.onload  = () => { clearTimeout(timer); resolve(url); };
    s.onerror = () => { clearTimeout(timer); s.remove(); reject(new Error('Failed: ' + url)); };
    document.head.appendChild(s);
  });
}

function _ensureSolanaWeb3() {
  if (window.solanaWeb3) return Promise.resolve(window.solanaWeb3);
  if (!window._solanaWeb3Loading) {
    window._solanaWeb3Loading = (async () => {
      const errors = [];
      for (const url of _SOLANA_WEB3_URLS) {
        try {
          await _loadScriptOnce(url);
          if (window.solanaWeb3) return window.solanaWeb3;
          errors.push(url + ' (loaded but global missing)');
        } catch (e) {
          errors.push(e.message);
        }
      }
      // All CDNs failed — surface every URL we tried so the cause is visible
      throw new Error('Could not load solana-web3.js from any CDN. Tried:\n  ' + errors.join('\n  '));
    })();
  }
  return window._solanaWeb3Loading;
}

// The Associated Token Account program id (well-known, 44-char base58).
const ATA_PROGRAM_ID_STR = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

async function payBurgFee(walletType, walletProvider) {
  // Resolve pubkey from passed-in provider first, then fall back to global state
  const providerForKey = walletProvider || getProvider();
  const rawKey = providerForKey?.publicKey;
  const pubkeyStr = (typeof rawKey === 'string' ? rawKey : rawKey?.toString?.())
    || window.BHB?.walletAddress
    || getPubkeyStr();
  if (!pubkeyStr) throw new Error('Wallet not connected');

  // ── Load the UMD build (cached after first use; ~600 KB, one-time cost) ──
  const web3 = await _ensureSolanaWeb3();
  const { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram } = web3;

  const connection  = new Connection(RPC_ENDPOINT, 'confirmed');
  const payerPubkey = new PublicKey(pubkeyStr);
  const mintPubkey  = new PublicKey(TOKEN_MINT);
  const destPubkey  = new PublicKey(CUSTOMIZER_FEE_DEST);
  const TOKEN_PROG  = new PublicKey(TOKEN_2022_PROGRAM);
  const ATA_PROG    = new PublicKey(ATA_PROGRAM_ID_STR);

  // ── Derive ATAs (PDA from [owner, tokenProgram, mint] under ATA program) ──
  const [srcAta]  = PublicKey.findProgramAddressSync(
    [payerPubkey.toBuffer(), TOKEN_PROG.toBuffer(), mintPubkey.toBuffer()],
    ATA_PROG
  );
  const [destAta] = PublicKey.findProgramAddressSync(
    [destPubkey.toBuffer(),  TOKEN_PROG.toBuffer(), mintPubkey.toBuffer()],
    ATA_PROG
  );

  const ixs = [];

  // ── Create dest ATA if it doesn't exist (idempotent variant for safety) ──
  // getAccountInfo returns null for missing accounts (it does not throw).
  // Original code used try/catch which never fired; we use the proper check.
  const destInfo = await connection.getAccountInfo(destAta).catch(() => null);
  if (!destInfo) {
    ixs.push(new TransactionInstruction({
      programId: ATA_PROG,
      keys: [
        { pubkey: payerPubkey,             isSigner: true,  isWritable: true  },
        { pubkey: destAta,                 isSigner: false, isWritable: true  },
        { pubkey: destPubkey,              isSigner: false, isWritable: false },
        { pubkey: mintPubkey,              isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROG,              isSigner: false, isWritable: false },
      ],
      data: new Uint8Array([1]),  // 1 = CreateIdempotent (no-op if exists)
    }));
  }

  // ── Hand-built TransferChecked (SPL Token & Token-2022 share layout) ──
  // Layout: [u8 discriminator=12][u64 amount LE][u8 decimals]  →  10 bytes
  const transferData = new Uint8Array(10);
  transferData[0] = 12;
  new DataView(transferData.buffer).setBigUint64(1, CUSTOMIZER_FEE_AMOUNT, true);
  transferData[9] = 6;  // BURG decimals

  ixs.push(new TransactionInstruction({
    programId: TOKEN_PROG,
    keys: [
      { pubkey: srcAta,      isSigner: false, isWritable: true  },
      { pubkey: mintPubkey,  isSigner: false, isWritable: false },
      { pubkey: destAta,     isSigner: false, isWritable: true  },
      { pubkey: payerPubkey, isSigner: true,  isWritable: false },
    ],
    data: transferData,
  }));

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ feePayer: payerPubkey, recentBlockhash: blockhash });
  ixs.forEach(ix => tx.add(ix));

  // ── Pre-flight simulation ───────────────────────────────────────────────
  // Wallets sometimes refuse to even *prompt* the user when their internal
  // preflight rejects (this surfaces as a generic "Failed to sign transaction"
  // with no info). Running our own simulation against the RPC first gives us
  // the actual chain error — typically "insufficient funds", "Account does
  // not exist", or a specific SPL Token error — which we surface to the user
  // instead of the wallet's opaque failure.
  try {
    const sim = await connection.simulateTransaction(tx);
    if (sim?.value?.err) {
      const errStr  = (typeof sim.value.err === 'string') ? sim.value.err : JSON.stringify(sim.value.err);
      const logs    = sim.value.logs || [];
      const lastLog = logs.slice(-6).join('\n  '); // last few lines are usually the meaningful ones
      throw new Error(
        'BURG fee tx preflight rejected: ' + errStr +
        (lastLog ? '\n  ' + lastLog : '') +
        '\n\nLikely causes: this wallet has less than 100,000 BURG, or not enough SOL for the network fee.'
      );
    }
  } catch (simErr) {
    // If the error came from our own throw above, re-throw so the user sees it.
    // If simulateTransaction itself failed (RPC issue, etc.), don't block — let
    // the wallet try and report its own error.
    if (simErr.message?.startsWith('BURG fee tx preflight rejected')) throw simErr;
    console.warn('[payBurgFee] local simulation could not run (continuing to wallet anyway):', simErr.message);
  }

  let sig;
  // ── Helper: surface every field of a wallet error, not just `.message` ──
  // Wallet adapters often stash useful info on .error, .data, .code, .logs etc.
  const _wrapWalletErr = (label, e) => {
    let dump = '';
    try {
      const seen = new WeakSet();
      dump = JSON.stringify(e, (k, v) => {
        if (typeof v === 'object' && v !== null) { if (seen.has(v)) return '[circular]'; seen.add(v); }
        if (typeof v === 'bigint') return String(v) + 'n';
        return v;
      });
    } catch (_) { dump = '(unserialisable)'; }
    const msg = (e?.message || String(e)) + ' [' + label + ']';
    const wrapped = new Error(msg + (dump && dump !== '{}' ? ' :: ' + dump : ''));
    wrapped.cause = e;
    return wrapped;
  };

  if (walletType === 'solflare') {
    // Historical working pattern for mobile Solflare: signAndSendTransaction
    // (handles the wallet→app→wallet round trip cleanly). The recent silent-
    // rejection symptom is Solflare's internal preflight bailing before it
    // ever prompts the user. Passing { skipPreflight: true } turns that off.
    //
    // IMPORTANT: window.BHB.walletProvider (the wallet-standard adapter) does
    // NOT forward the options argument. Call window.solflare directly so the
    // skipPreflight flag actually reaches the wallet.
    const sf = window.solflare
            || (walletProvider?.signAndSendTransaction ? walletProvider : null)
            || (window.BHB?.walletProvider?.signAndSendTransaction ? window.BHB.walletProvider : null);
    if (!sf?.signAndSendTransaction) throw new Error('Solflare not found');

    let rawResult;
    try {
      rawResult = await sf.signAndSendTransaction(tx, { skipPreflight: true, maxRetries: 3 });
    } catch (e) {
      throw _wrapWalletErr('solflare.signAndSendTransaction', e);
    }
    sig = rawResult?.signature ?? rawResult?.publicKey ?? rawResult;
    if (typeof sig !== 'string') sig = sig?.toString?.();
  } else {
    // Phantom: signTransaction then send ourselves with skipPreflight:true.
    // This is the desktop Phantom flow that already works. Mobile Phantom
    // also handles signTransaction cleanly.
    const ph = window.phantom?.solana || window.solana;
    if (!ph) throw new Error('Phantom not found');
    let signedTx;
    try {
      signedTx = await ph.signTransaction(tx);
    } catch (e) {
      throw _wrapWalletErr('phantom.signTransaction', e);
    }
    sig = await connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true, maxRetries: 3 });
  }

  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

async function uploadFile(file, contentType) {
  // Convert blob to base64 — matches pinata-upload.js expected body: { data, contentType, filename }
  const isJson   = contentType === 'application/json' || file.type === 'application/json';
  const filename = isJson ? 'metadata.json' : 'image.png';

  const arrayBuffer = await file.arrayBuffer();
  const uint8       = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
  const base64 = btoa(binary);

  const res = await fetch('/api/pinata-upload', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ data: base64, contentType, filename }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText || String(res.status));
    throw new Error(`HTTP ${res.status}: ${errText}`);
  }
  const json = await res.json();
  // pinata-upload.js returns { url, hash } — url is the gateway URI
  if (!json.url) throw new Error('No URL in response: ' + JSON.stringify(json));
  return json.url;
}

// wallet-connected: handled by game page _backgroundPrep, not reset here
document.addEventListener('bhb:wallet-disconnected', () => { _umi = null; _cm = null; _cg = null; _prepared = null; });

window.BHBMint = { initUmi, fetchStats, prepMintTx, mint, payBurgFee, uploadFile, isUmiReady: () => !!(_umi && _cm) };
