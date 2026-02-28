// assets/mint.js

const CANDY_MACHINE_ID = 'BiqLN985cYm9nmXpZwP7kDJnoW41Fq7Vy129pUb8ndVA';
const CANDY_GUARD_ID   = 'EwuGsMoNnFQ9XDumF1VxvLHVLew2ayxNQamwTvyXQBYL';

const TOKEN_MINT         = '6disLregVtZ8qKpTTGyW81mbfAS9uwvHwjKfy6LApump';
const TOKEN_DEST_ATA     = 'DwJMwznfQEiFLUNQq3bMKhcBEqM9t5zS8nR5QvmUS9s4';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

const RPC_ENDPOINT = 'https://mainnet.helius-rpc.com/?api-key=a88e4b38-304e-407a-89c8-91c904b08491';

const CUSTOMIZER_FEE_DEST   = '9eMPEUrH46tbj67Y1uESNg9mzna7wi3J6ZoefsFkivcx';
const CUSTOMIZER_FEE_AMOUNT = 100_000_000_000n;

let _umi  = null;
let _cm   = null;
let _cg   = null;
let _mods = null;

function getProvider() {
  if (window.BHB?.walletProvider) return window.BHB.walletProvider;
  return window.phantom?.solana || window.solflare || window.backpack || window.solana || null;
}

// Wrap any provider so publicKey is always a web3.js PublicKey object
// walletAdapterIdentity requires publicKey.toBytes() to work
async function normalizeProvider(provider, addressOverride) {
  const web3 = await import('https://esm.sh/@solana/web3.js@1.95.3');

  const rawKey = provider?.publicKey;
  const addrStr = addressOverride
    || (typeof rawKey === 'string' ? rawKey : rawKey?.toString?.())
    || window.BHB?.walletAddress;

  if (!addrStr) return null;

  const pubkey = new web3.PublicKey(addrStr);

  // If publicKey is already a proper PublicKey object with toBytes(), return as-is
  if (rawKey && typeof rawKey.toBytes === 'function') return provider;

  // Otherwise wrap it so walletAdapterIdentity can call publicKey.toBytes()
  return {
    publicKey: pubkey,
    signTransaction:     (tx) => provider.signTransaction(tx),
    signAllTransactions: (txs) => provider.signAllTransactions
      ? provider.signAllTransactions(txs)
      : Promise.all(txs.map(tx => provider.signTransaction(tx))),
    signMessage: (msg) => provider.signMessage?.(msg),
  };
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
  const normalized = await normalizeProvider(provider, addressOverride);

  console.log('[initUmi] pubkeyStr:', normalized?.publicKey?.toString());
  if (!normalized) { console.error('[initUmi] No pubkey'); return false; }

  const m = await loadMods();

  // Use walletAdapterIdentity — this is what lets UMI call provider.signTransaction
  // and is the correct way to integrate browser wallets (Phantom, Solflare, etc.)
  _umi = m.createUmi(RPC_ENDPOINT)
    .use(m.mplCandyMachine())
    .use(m.mplTokenMetadata())
    .use(m.walletAdapterIdentity(normalized));

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
    return {
      minted:    Number(cm.itemsRedeemed),
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

  // CU budget instruction (SetComputeUnitLimit = discriminator 2, units LE u32)
  // 400_000 = 0x000614000 → bytes [0x40, 0x0D, 0x03, 0x00] little-endian... wait:
  // 400000 decimal = 0x61A80 → LE bytes: 0x80, 0x1A, 0x06, 0x00
  const units = 400_000;
  const cuData = new Uint8Array([
    2,                              // SetComputeUnitLimit discriminator
    units & 0xff,
    (units >> 8)  & 0xff,
    (units >> 16) & 0xff,
    (units >> 24) & 0xff,
  ]);
  const cuIx = {
    programId: m.publicKey('ComputeBudget111111111111111111111111111111'),
    accounts:  [],
    data:      cuData,
  };

  console.log('[mint] _cm:', !!_cm, '| _cg:', !!_cg, '| identity pubkey:', _umi.identity.publicKey.toString());

  // UMI handles signing via walletAdapterIdentity — triggers wallet popup normally
  await m.transactionBuilder()
    .add({ instruction: cuIx, signers: [], bytesCreatedOnChain: 0 })
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
    }))
    .sendAndConfirm(_umi);

  _cm = await m.fetchCandyMachine(_umi, m.publicKey(CANDY_MACHINE_ID));
  return {
    minted:    Number(_cm.itemsRedeemed),
    remaining: Number(_cm.itemsLoaded) - Number(_cm.itemsRedeemed),
  };
}

// ── Pay BURG fee for customizer save ──────────────────────────────────────────
async function payBurgFee() {
  const provider = getProvider();
  const normalized = await normalizeProvider(provider);
  if (!normalized) throw new Error('Wallet not connected');

  const web3 = await import('https://esm.sh/@solana/web3.js@1.95.3');
  const spl  = await import('https://esm.sh/@solana/spl-token@0.4.6');

  const connection    = new web3.Connection(RPC_ENDPOINT, 'confirmed');
  const payerPubkey   = normalized.publicKey;
  const mintPubkey    = new web3.PublicKey(TOKEN_MINT);
  const destPubkey    = new web3.PublicKey(CUSTOMIZER_FEE_DEST);
  const TOKEN_PROGRAM = new web3.PublicKey(TOKEN_2022_PROGRAM);

  const srcAta  = spl.getAssociatedTokenAddressSync(mintPubkey, payerPubkey,  false, TOKEN_PROGRAM);
  const destAta = spl.getAssociatedTokenAddressSync(mintPubkey, destPubkey,   false, TOKEN_PROGRAM);

  const ixs = [];

  // Create dest ATA if needed
  try {
    await connection.getAccountInfo(destAta);
  } catch (_) {
    ixs.push(spl.createAssociatedTokenAccountInstruction(
      payerPubkey, destAta, destPubkey, mintPubkey, TOKEN_PROGRAM
    ));
  }

  const decimals = 6;
  ixs.push(spl.createTransferCheckedInstruction(
    srcAta, mintPubkey, destAta, payerPubkey,
    CUSTOMIZER_FEE_AMOUNT, decimals, [], TOKEN_PROGRAM
  ));

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new web3.Transaction({ feePayer: payerPubkey, recentBlockhash: blockhash });
  ixs.forEach(ix => tx.add(ix));

  const signedTx = await normalized.signTransaction(tx);
  const sig      = await connection.sendRawTransaction(signedTx.serialize());
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

// ── Upload file to IPFS via Pinata ────────────────────────────────────────────
async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
  if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
  const { uri } = await res.json();
  return uri;
}

// Reset UMI when wallet changes
document.addEventListener('bhb:wallet-connected',    () => { _umi = null; _cm = null; _cg = null; });
document.addEventListener('bhb:wallet-disconnected', () => { _umi = null; _cm = null; _cg = null; });

window.BHBMint = { initUmi, fetchStats, mint, payBurgFee, uploadFile };