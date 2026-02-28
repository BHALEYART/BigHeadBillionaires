// assets/mint.js

const CANDY_MACHINE_ID = 'BiqLN985cYm9nmXpZwP7kDJnoW41Fq7Vy129pUb8ndVA';
const CANDY_GUARD_ID   = 'EwuGsMoNnFQ9XDumF1VxvLHVLew2ayxNQamwTvyXQBYL';

const TOKEN_MINT       = '6disLregVtZ8qKpTTGyW81mbfAS9uwvHwjKfy6LApump';
const TOKEN_DEST_ATA   = 'DwJMwznfQEiFLUNQq3bMKhcBEqM9t5zS8nR5QvmUS9s4';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

const RPC_ENDPOINT = 'https://mainnet.helius-rpc.com/?api-key=a88e4b38-304e-407a-89c8-91c904b08491';

// BURG fee recipient + amount (Token-2022 transferChecked)
const CUSTOMIZER_FEE_DEST   = '9eMPEUrH46tbj67Y1uESNg9mzna7wi3J6ZoefsFkivcx';
const CUSTOMIZER_FEE_AMOUNT = 100_000_000_000n; // 100,000 BURG with 6 decimals

let _umi  = null;
let _cm   = null;
let _cg   = null;
let _mods = null;

function getProvider() {
  // Prefer whatever wallet the user selected via the BHB modal
  if (window.BHB?.walletProvider) return window.BHB.walletProvider;
  // Legacy fallbacks
  return window.phantom?.solana || window.solflare || window.backpack || window.solana || null;
}

async function loadMods() {
  if (_mods) return _mods;

  const [umiCorePkg, umiPkg, cmPkg, tmPkg, adapterPkg] = await Promise.all([
    import('https://esm.sh/@metaplex-foundation/umi@1.5.1'),
    import('https://esm.sh/@metaplex-foundation/umi-bundle-defaults@1.5.1'),
    import('https://esm.sh/@metaplex-foundation/mpl-candy-machine@6.1.0'),
    import('https://esm.sh/@metaplex-foundation/mpl-token-metadata@3.4.0'),
    import('https://esm.sh/@metaplex-foundation/umi-signer-wallet-adapters@1.5.1'),
  ]);

  _mods = { ...umiCorePkg, ...umiPkg, ...cmPkg, ...tmPkg, ...adapterPkg };
  return _mods;
}

async function initUmi(addressOverride) {
  const provider  = getProvider();
  const rawKey    = provider?.publicKey;
  // Accept explicit address, or read from provider (string or object), or BHB.walletAddress
  const pubkeyStr = addressOverride
                    || (typeof rawKey === 'string' ? rawKey : rawKey?.toString?.())
                    || window.BHB?.walletAddress;

  console.log('[initUmi] pubkeyStr:', pubkeyStr);

  if (!pubkeyStr) {
    console.error('[initUmi] No pubkey — wallet not connected');
    return false;
  }

  const m = await loadMods();
  console.log('[initUmi] mods loaded, createNoopSigner available:', !!m.createNoopSigner, '| signerIdentity:', !!m.signerIdentity);

  const umiPubkey  = m.publicKey(pubkeyStr);
  const noopSigner = m.createNoopSigner(umiPubkey);

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
    console.error('[initUmi] fetchCandyMachine failed:', e.message, e);
    return false;
  }
}

async function fetchStats() {
  try {
    const m = await loadMods();
    const readUmi = m.createUmi(RPC_ENDPOINT).use(m.mplCandyMachine());
    const cm = await m.fetchCandyMachine(readUmi, m.publicKey(CANDY_MACHINE_ID));
    return {
      minted: Number(cm.itemsRedeemed),
      remaining: Number(cm.itemsLoaded) - Number(cm.itemsRedeemed),
    };
  } catch (e) {
    console.warn('fetchStats failed:', e);
    return null;
  }
}

// Pre-built transaction cache — populated by prepMintTx(), consumed by mint()
let _preparedTx = null;

// Do all async work upfront so mint() can sign immediately on user click
async function prepMintTx() {
  const m = await loadMods();
  if (!_umi || !_cm) throw new Error('UMI not initialized');

  const provider = getProvider();
  const rawKey   = provider?.publicKey;
  const walletPubkeyStr = (typeof rawKey === 'string' ? rawKey : rawKey?.toString?.())
                          || _umi?._walletPubkey || window.BHB?.walletAddress;
  if (!walletPubkeyStr) throw new Error('Wallet not connected');

  const web3       = await import('https://esm.sh/@solana/web3.js@1.95.3');
  const connection = new web3.Connection(RPC_ENDPOINT, 'confirmed');
  const walletPubkey = new web3.PublicKey(walletPubkeyStr);
  const nftMint      = m.generateSigner(_umi);

  const builder = m.transactionBuilder()
    .add(m.mintV2(_umi, {
      candyMachine: _cm.publicKey,
      candyGuard:   _cg?.publicKey ?? m.none(),
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

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const umiTx   = await builder.buildWithLatestBlockhash(_umi);
  const txBytes = _umi.transactions.serialize(umiTx);
  const vtx     = web3.VersionedTransaction.deserialize(txBytes);

  // CU budget ix
  const cuData = new Uint8Array(9);
  cuData[0] = 2;
  new DataView(cuData.buffer).setUint32(1, 400_000, true);
  const cuIx = new web3.TransactionInstruction({
    programId: new web3.PublicKey('ComputeBudget111111111111111111111111111111'),
    keys: [], data: cuData,
  });

  const origMsg    = vtx.message;
  const staticKeys = origMsg.staticAccountKeys;
  const allIxs     = [cuIx];
  for (const ix of origMsg.compiledInstructions) {
    const programId = staticKeys[ix.programIdIndex];
    const keys = ix.accountKeyIndexes.map(i => ({
      pubkey: staticKeys[i], isSigner: origMsg.isAccountSigner(i), isWritable: origMsg.isAccountWritable(i),
    }));
    allIxs.push(new web3.TransactionInstruction({
      programId, keys,
      data: ix.data instanceof Uint8Array ? ix.data : new Uint8Array(ix.data),
    }));
  }

  const msgV0 = new web3.TransactionMessage({
    payerKey: walletPubkey, recentBlockhash: blockhash, instructions: allIxs,
  }).compileToV0Message();
  const versionedTx = new web3.VersionedTransaction(msgV0);

  // Pre-sign with nftMint keypair
  const s32 = nftMint.secretKey;
  const pub  = new web3.PublicKey(nftMint.publicKey.toString()).toBytes();
  const s64  = new Uint8Array(64); s64.set(s32, 0); s64.set(pub, 32);
  versionedTx.sign([web3.Keypair.fromSecretKey(s64)]);

  _preparedTx = { versionedTx, connection, blockhash, lastValidBlockHeight };
  console.log('[prepMintTx] transaction ready');
}

async function mint() {
  // Transaction must be pre-built — all async work done before this point
  if (!_preparedTx) throw new Error('Transaction not prepared');
  const { versionedTx, connection, blockhash, lastValidBlockHeight } = _preparedTx;
  _preparedTx = null; // consume it

  const provider = getProvider();

  // Sign and send immediately — minimal async gap for Solflare's user-gesture requirement
  let sig;
  if (provider.signAndSendTransaction) {
    const result = await provider.signAndSendTransaction(versionedTx);
    sig = result.signature ?? result;
  } else {
    const signedTx = await provider.signTransaction(versionedTx);
    sig = await connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: false });
  }
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

  const m = await loadMods();
  _cm = await m.fetchCandyMachine(_umi, m.publicKey(CANDY_MACHINE_ID));
  return {
    minted:    Number(_cm.itemsRedeemed),
    remaining: Number(_cm.itemsLoaded) - Number(_cm.itemsRedeemed),
  };
}

// ── Pay 100k BURG fee for customizer save ─────────────
async function payBurgFee() {
  const provider = getProvider();
  const _rawKey3 = provider?.publicKey;
  const burgWalletPubkeyStr = (typeof _rawKey3 === 'string' ? _rawKey3 : _rawKey3?.toString?.())
                              || window.BHB?.walletAddress;
  if (!provider || !burgWalletPubkeyStr) throw new Error('Wallet not connected');

  const [web3, splToken] = await Promise.all([
    import('https://esm.sh/@solana/web3.js@1.95.3'),
    import('https://esm.sh/@solana/spl-token@0.4.9'),
  ]);

  const connection   = new web3.Connection(RPC_ENDPOINT, 'confirmed');
  const walletPubkey = new web3.PublicKey(burgWalletPubkeyStr);
  const mintPubkey   = new web3.PublicKey(TOKEN_MINT);
  const destPubkey   = new web3.PublicKey(CUSTOMIZER_FEE_DEST);

  const TOKEN_2022_PUBKEY = new web3.PublicKey(TOKEN_2022_PROGRAM);

  // Derive ATAs for sender and recipient (Token-2022)
  const senderAta = splToken.getAssociatedTokenAddressSync(
    mintPubkey,
    walletPubkey,
    false,
    TOKEN_2022_PUBKEY
  );

  const recipientAta = splToken.getAssociatedTokenAddressSync(
    mintPubkey,
    destPubkey,
    false,
    TOKEN_2022_PUBKEY
  );

  const recipientAcct = await connection.getAccountInfo(recipientAta);
  const tx = new web3.Transaction();

  if (!recipientAcct) {
    tx.add(
      splToken.createAssociatedTokenAccountInstruction(
        walletPubkey,
        recipientAta,
        destPubkey,
        mintPubkey,
        TOKEN_2022_PUBKEY,
        splToken.ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }

  // transferChecked — 100,000 BURG with 6 decimals
  tx.add(
    splToken.createTransferCheckedInstruction(
      senderAta,
      mintPubkey,
      recipientAta,
      walletPubkey,
      CUSTOMIZER_FEE_AMOUNT,
      6,
      [],
      TOKEN_2022_PUBKEY
    )
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = walletPubkey;

  const signed = await provider.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

  console.log('BURG fee paid:', sig);
  return sig;
}

// ── Upload file via Vercel backend (NO JWT IN BROWSER) ─────────────
async function uploadFile(blob, contentType) {
  const ext      = contentType === 'image/png' ? 'png' : 'json';
  const filename = `bhb-${Date.now()}.${ext}`;

  // Convert blob → base64 (chunked to avoid stack overflow on large files)
  const arrayBuffer = await blob.arrayBuffer();
  const bytes       = new Uint8Array(arrayBuffer);
  let binary        = '';
  const chunkSize   = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);

  const resp = await fetch('/api/pinata-upload', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ data: base64, contentType, filename }),
  });

  const out = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(out?.error || out?.details?.error || JSON.stringify(out) || `Upload failed (${resp.status})`);
  }

  if (!out.url) throw new Error('Upload response missing url');
  return out.url;
}

// Reset UMI when wallet changes so it reinitializes with the new provider
document.addEventListener('bhb:wallet-connected', () => { _umi = null; _cm = null; _cg = null; });
document.addEventListener('bhb:wallet-disconnected', () => { _umi = null; _cm = null; _cg = null; });

window.BHBMint = { initUmi, fetchStats, prepMintTx, mint, payBurgFee, uploadFile };