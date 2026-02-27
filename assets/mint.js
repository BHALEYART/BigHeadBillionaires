const CANDY_MACHINE_ID = 'BiqLN985cYm9nmXpZwP7kDJnoW41Fq7Vy129pUb8ndVA';
const CANDY_GUARD_ID   = 'EwuGsMoNnFQ9XDumF1VxvLHVLew2ayxNQamwTvyXQBYL';
const TOKEN_MINT       = '6disLregVtZ8qKpTTGyW81mbfAS9uwvHwjKfy6LApump';
const TOKEN_DEST_ATA   = 'DwJMwznfQEiFLUNQq3bMKhcBEqM9t5zS8nR5QvmUS9s4';
const RPC_ENDPOINT     = 'https://api.mainnet-beta.solana.com';

let _umi  = null;
let _cm   = null;
let _cg   = null;
let _mods = null;

async function loadMods() {
  if (_mods) return _mods;
  const [umiPkg, cmPkg, tmPkg, adapterPkg] = await Promise.all([
    import('https://esm.sh/@metaplex-foundation/umi-bundle-defaults@0.9.2'),
    import('https://esm.sh/@metaplex-foundation/mpl-candy-machine@6.1.0'),
    import('https://esm.sh/@metaplex-foundation/mpl-token-metadata@3.3.3'),
    import('https://esm.sh/@metaplex-foundation/umi-signer-wallet-adapters@0.9.2'),
  ]);
  _mods = { ...umiPkg, ...cmPkg, ...tmPkg, ...adapterPkg };
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
  await m.mintV2(_umi, {
    candyMachine:              _cm.publicKey,
    candyGuard:                _cg?.publicKey ?? m.none(),
    nftMint,
    collectionMint:            _cm.collectionMint,
    collectionUpdateAuthority: _cm.authority,
    mintArgs: {
      tokenPayment: m.some({
        mint:           m.publicKey(TOKEN_MINT),
        destinationAta: m.publicKey(TOKEN_DEST_ATA),
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