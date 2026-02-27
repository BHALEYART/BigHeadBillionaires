const CANDY_MACHINE_ID = 'BiqLN985cYm9nmXpZwP7kDJnoW41Fq7Vy129pUb8ndVA';
const CANDY_GUARD_ID   = 'EwuGsMoNnFQ9XDumF1VxvLHVLew2ayxNQamwTvyXQBYL';
const TOKEN_MINT       = '6disLregVtZ8qKpTTGyW81mbfAS9uwvHwjKfy6LApump';
const TOKEN_DEST_ATA   = 'DwJMwznfQEiFLUNQq3bMKhcBEqM9t5zS8nR5QvmUS9s4';
const TOKEN_2022_PROGRAM   = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const RPC_ENDPOINT         = 'https://mainnet.helius-rpc.com/?api-key=a88e4b38-304e-407a-89c8-91c904b08491';
const CUSTOMIZER_FEE_DEST  = '9eMPEUrH46tbj67Y1uESNg9mzna7wi3J6ZoefsFkivcx'; // BURG fee recipient
const CUSTOMIZER_FEE_AMOUNT = 100_000_000_000n; // 100,000 BURG (6 decimals)

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
  // Expose createGenericFile for customizer uploader
  if (!_mods.createGenericFile) {
    _mods.createGenericFile = (data, fileName, { contentType } = {}) => ({
      buffer: data instanceof Uint8Array ? data : new Uint8Array(data),
      fileName, displayName: fileName, uniqueName: Date.now().toString(),
      contentType: contentType ?? 'application/octet-stream',
      extension: fileName.split('.').pop() ?? '',
      tags: [{ name: 'Content-Type', value: contentType ?? 'application/octet-stream' }]
    });
  }
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


// ── Pay 100k BURG fee for customizer save ─────────────
// Uses @solana/web3.js + spl-token for Token-2022 transferChecked
async function payBurgFee() {
  const provider = window.solana || window.phantom?.solana;
  if (!provider?.publicKey) throw new Error('Wallet not connected');

  const [web3, splToken] = await Promise.all([
    import('https://esm.sh/@solana/web3.js@1.95.3'),
    import('https://esm.sh/@solana/spl-token@0.4.9'),
  ]);

  const connection   = new web3.Connection(RPC_ENDPOINT, 'confirmed');
  const walletPubkey = provider.publicKey;
  const mintPubkey   = new web3.PublicKey(TOKEN_MINT);
  const destPubkey   = new web3.PublicKey(CUSTOMIZER_FEE_DEST);

  // Derive ATAs for sender and recipient (Token-2022)
  const TOKEN_2022_PUBKEY = new web3.PublicKey(TOKEN_2022_PROGRAM);
  const senderAta    = splToken.getAssociatedTokenAddressSync(mintPubkey, walletPubkey,   false, TOKEN_2022_PUBKEY);
  const recipientAta = splToken.getAssociatedTokenAddressSync(mintPubkey, destPubkey,     false, TOKEN_2022_PUBKEY);

  // Check recipient ATA exists, create it if not
  const recipientAcct = await connection.getAccountInfo(recipientAta);
  const tx = new web3.Transaction();

  if (!recipientAcct) {
    tx.add(splToken.createAssociatedTokenAccountInstruction(
      walletPubkey, recipientAta, destPubkey, mintPubkey,
      TOKEN_2022_PUBKEY, splToken.ASSOCIATED_TOKEN_PROGRAM_ID
    ));
  }

  // transferChecked instruction — 100,000 BURG, 6 decimals
  tx.add(splToken.createTransferCheckedInstruction(
    senderAta, mintPubkey, recipientAta, walletPubkey,
    CUSTOMIZER_FEE_AMOUNT, 6,
    [], TOKEN_2022_PUBKEY
  ));

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer        = walletPubkey;

  const signed = await provider.signTransaction(tx);
  const sig    = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

  console.log('BURG fee paid:', sig);
  return sig;
}


async function updateNftMetadata(mintAddress, newUri) {
  const m = await loadMods();
  if (!_umi) {
    const ok = await initUmi();
    if (!ok) throw new Error('Could not initialize UMI');
  }
  // Derive metadata PDA
  const mint     = m.publicKey(mintAddress);
  const [metaPDA] = m.findMetadataPda ? m.findMetadataPda(_umi, { mint }) :
                    await (async () => {
                      const { findMetadataPda } = await import('https://esm.sh/@metaplex-foundation/mpl-token-metadata@3.4.0');
                      return findMetadataPda(_umi, { mint });
                    })();

  await m.updateV1(_umi, {
    mint,
    authority: _umi.identity,
    data: {
      name:                 undefined,  // keep existing
      symbol:               undefined,
      uri:                  newUri,
      sellerFeeBasisPoints: undefined,
      creators:             m.none(),
    }
  }).sendAndConfirm(_umi);
}

// ── Upload file to Arweave via UMI irysUploader ───────
async function uploadFile(blob, contentType) {
  const m = await loadMods();
  const { irysUploader } = await import('https://esm.sh/@metaplex-foundation/umi-uploader-irys@1.0.0');
  const provider = window.solana || window.phantom?.solana;
  const uploadUmi = m.createUmi(RPC_ENDPOINT)
    .use(m.mplTokenMetadata())
    .use(m.walletAdapterIdentity(provider))
    .use(irysUploader({ address: 'https://node1.irys.xyz' }));

  const buffer = await blob.arrayBuffer();
  const ext    = contentType === 'image/png' ? 'png' : 'json';
  const file   = {
    buffer:      new Uint8Array(buffer),
    fileName:    `upload.${ext}`,
    displayName: `upload.${ext}`,
    uniqueName:  Date.now().toString(),
    contentType,
    extension:   ext,
    tags:        [{ name: 'Content-Type', value: contentType }]
  };

  const [uri] = await uploadUmi.uploader.upload([file]);
  return uri;
}


window.BHBMint = { initUmi, fetchStats, mint, updateNftMetadata, payBurgFee, uploadFile };