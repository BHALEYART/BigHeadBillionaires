const CANDY_MACHINE_ID = 'BiqLN985cYm9nmXpZwP7kDJnoW41Fq7Vy129pUb8ndVA';
const CANDY_GUARD_ID   = 'EwuGsMoNnFQ9XDumF1VxvLHVLew2ayxNQamwTvyXQBYL';
const TOKEN_MINT       = '6disLregVtZ8qKpTTGyW81mbfAS9uwvHwjKfy6LApump';
const TOKEN_DEST_ATA   = 'DwJMwznfQEiFLUNQq3bMKhcBEqM9t5zS8nR5QvmUS9s4';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const RPC_ENDPOINT     = 'https://mainnet.helius-rpc.com/?api-key=a88e4b38-304e-407a-89c8-91c904b08491';

let _umi  = null;
let _cm   = null;
let _cg   = null;
let _mods = null;

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
  const provider = window.solana || window.phantom?.solana;
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
  } catch(e) {
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
      minted:    Number(cm.itemsRedeemed),
      remaining: Number(cm.itemsLoaded) - Number(cm.itemsRedeemed)
    };
  } catch(e) {
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

  // Derive the user's ATA for the SPL token (Token-2022)
  // We pass it explicitly so the guard program gets the right account
  const userTokenAccount = await _umi.rpc.getAccount(
    m.publicKey(_umi.identity.publicKey.toString())
  );

  await m.mintV2(_umi, {
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
      })
    }
  }).sendAndConfirm(_umi);

  _cm = await m.fetchCandyMachine(_umi, m.publicKey(CANDY_MACHINE_ID));
  return {
    minted:    Number(_cm.itemsRedeemed),
    remaining: Number(_cm.itemsLoaded) - Number(_cm.itemsRedeemed)
  };
}

window.BHBMint = { initUmi, fetchStats, mint };