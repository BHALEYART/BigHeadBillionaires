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

  const mint         = m.publicKey(mintAddress);
  const metadata     = await m.fetchMetadataFromSeeds(_umi, { mint });
  const COLLECTION   = m.publicKey('ECRmV6D1boYEs1mnsG96LE4W81pgTmkTAUR4uf4WyGqN');
  const [collMeta]   = m.findMetadataPda(_umi, { mint: COLLECTION });

  // Normalize optional fields to avoid serialization errors
  const creators = metadata.creators.__option === 'Some' || (metadata.creators && metadata.creators.value)
    ? metadata.creators
    : m.none();
  const collection = metadata.collection.__option === 'Some' || (metadata.collection && metadata.collection.value)
    ? metadata.collection
    : m.none();
  const uses = metadata.uses.__option === 'Some' || (metadata.uses && metadata.uses.value)
    ? metadata.uses
    : m.none();

  await m.updateV1(_umi, {
    mint,
    authority: _umi.identity,
    data: {
      name:                 metadata.name,
      symbol:               metadata.symbol,
      uri:                  newUri,
      sellerFeeBasisPoints: metadata.sellerFeeBasisPoints,
      creators,
      collection,
      uses,
    },
  })
  .addRemainingAccounts([{
    pubkey:     collMeta,
    isSigner:   false,
    isWritable: false,
  }])
  .sendAndConfirm(_umi);
}

// ── Upload file to IPFS via Pinata REST API ───────────
// No wallet signing needed — just a Pinata JWT (set below)
const PINATA_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiJlZjliM2VmYS1hMDdjLTQzYjQtYmY2Mi1mNGJjMTBiNjJjNDEiLCJlbWFpbCI6ImIuaGFsZXlhcnRAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBpbl9wb2xpY3kiOnsicmVnaW9ucyI6W3siZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiRlJBMSJ9LHsiZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiTllDMSJ9XSwidmVyc2lvbiI6MX0sIm1mYV9lbmFibGVkIjpmYWxzZSwic3RhdHVzIjoiQUNUSVZFIn0sImF1dGhlbnRpY2F0aW9uVHlwZSI6InNjb3BlZEtleSIsInNjb3BlZEtleUtleSI6IjM3MmFiMmQ3OWZhZTdlYWY4YTdiIiwic2NvcGVkS2V5U2VjcmV0IjoiY2E4Y2JjZTVkY2MxMmNlNjg0Nzk4MDE4MjZmMWE5YzBlMmVkMWNkYjZkYjQwZDE3M2Y4YTc3ODQzNTI2MjU2NyIsImV4cCI6MTgwMzc1MzczOX0.Mx8IHUDCzOnUWIJHpHg06dz25qZVQJPqFLdNoXllVwU';

async function uploadFile(blob, contentType) {
  const ext      = contentType === 'image/png' ? 'png' : 'json';
  const filename = `bhb-${Date.now()}.${ext}`;
  const form     = new FormData();
  form.append('file', new File([blob], filename, { type: contentType }));
  form.append('pinataMetadata', JSON.stringify({ name: filename }));
  form.append('pinataOptions',  JSON.stringify({ cidVersion: 1 }));

  const resp = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method:  'POST',
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body:    form
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Pinata upload failed (${resp.status}): ${err}`);
  }

  const { IpfsHash } = await resp.json();
  // Return IPFS gateway URL — use Pinata's gateway for reliability
  return `https://gateway.pinata.cloud/ipfs/${IpfsHash}`;
}


window.BHBMint = { initUmi, fetchStats, mint, updateNftMetadata, payBurgFee, uploadFile };