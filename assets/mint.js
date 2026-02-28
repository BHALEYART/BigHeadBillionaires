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

async function initUmi() {
  const provider = getProvider();
  if (!provider) return false;

  const m = await loadMods();

  _umi = m.createUmi(RPC_ENDPOINT)
    .use(m.mplCandyMachine())
    .use(m.mplTokenMetadata())
    .use(m.walletAdapterIdentity(provider));

  try {
    _cm = await m.fetchCandyMachine(_umi, m.publicKey(CANDY_MACHINE_ID));
    _cg = await m.safeFetchCandyGuard(_umi, m.publicKey(CANDY_GUARD_ID));
    return true;
  } catch (e) {
    console.error('initUmi failed:', e);
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

async function mint() {
  const m = await loadMods();

  if (!_umi || !_cm) {
    const ok = await initUmi();
    if (!ok) throw new Error('Could not connect to Candy Machine');
  }

  const nftMint = m.generateSigner(_umi);

  // Request extra compute units — token2022Payment guard is CU-heavy
  const web3 = await import('https://esm.sh/@solana/web3.js@1.95.3');
  const cuIx = web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });
  const cuBuilder = m.transactionBuilder().add({
    instruction: m.fromWeb3JsInstruction(cuIx),
    signers: [],
    bytesCreatedOnChain: 0,
  });

  await cuBuilder
    .add(m.mintV2(_umi, {
      candyMachine: _cm.publicKey,
      candyGuard: _cg?.publicKey ?? m.none(),
      nftMint,
      collectionMint: _cm.collectionMint,
      collectionUpdateAuthority: _cm.authority,
      mintArgs: {
        token2022Payment: m.some({
          mint: m.publicKey(TOKEN_MINT),
          destinationAta: m.publicKey(TOKEN_DEST_ATA),
          tokenProgram: m.publicKey(TOKEN_2022_PROGRAM),
        }),
      },
    }))
    .sendAndConfirm(_umi);

  _cm = await m.fetchCandyMachine(_umi, m.publicKey(CANDY_MACHINE_ID));
  return {
    minted: Number(_cm.itemsRedeemed),
    remaining: Number(_cm.itemsLoaded) - Number(_cm.itemsRedeemed),
  };
}

// ── Pay 100k BURG fee for customizer save ─────────────
async function payBurgFee() {
  const provider = getProvider();
  if (!provider?.publicKey) throw new Error('Wallet not connected');

  const [web3, splToken] = await Promise.all([
    import('https://esm.sh/@solana/web3.js@1.95.3'),
    import('https://esm.sh/@solana/spl-token@0.4.9'),
  ]);

  const connection   = new web3.Connection(RPC_ENDPOINT, 'confirmed');
  const walletPubkey = provider.publicKey;
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

window.BHBMint = { initUmi, fetchStats, mint, payBurgFee, uploadFile };