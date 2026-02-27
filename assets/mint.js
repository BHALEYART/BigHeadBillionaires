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
  // Browser-safe Token Metadata UpdateV1 using web3.js
  const { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram } =
    await import('https://esm.sh/@solana/web3.js@1.95.3');

  // Ensure wallet + UMI are initialized (used only to read current metadata fields)
  const provider = window.solana || window.phantom?.solana;
  if (!provider?.publicKey) throw new Error('Wallet not connected');

  // initUmi() sets _umi; we need it for fetchMetadataFromSeeds
  const ok = await initUmi();
  if (!ok || !_umi) throw new Error('UMI init failed (wallet/provider not ready)');

  const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
  const SYSVAR_INSTRUCTIONS = new PublicKey('Sysvar1nstructions1111111111111111111111111');

  const mint      = new PublicKey(mintAddress);
  const authority = new PublicKey(provider.publicKey.toBase58());
  const enc       = new TextEncoder();

  // Derive metadata PDA: seeds = ['metadata', programId, mint]
  const [metadataPDA] = PublicKey.findProgramAddressSync(
    [enc.encode('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  );

  // Derive edition PDA: seeds = ['metadata', programId, mint, 'edition']
  const [editionPDA] = PublicKey.findProgramAddressSync(
    [enc.encode('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer(), enc.encode('edition')],
    TOKEN_METADATA_PROGRAM_ID
  );

  // Fetch current metadata to preserve name/symbol/sellerFeeBasisPoints
  const m = await loadMods();
  const umiMint  = m.publicKey(mintAddress);
  const metaOnChain = await m.fetchMetadataFromSeeds(_umi, { mint: umiMint });

  const name   = String(metaOnChain.name ?? '').replace(/\0/g, '');
  const symbol = String(metaOnChain.symbol ?? '').replace(/\0/g, '');
  const uri    = String(newUri ?? '').replace(/\0/g, '');
  const sfbp   = Number(metaOnChain.sellerFeeBasisPoints ?? 0);

  // ---- Serialize UpdateV1 data (no Node Buffer) ----
  // Layout (Token Metadata UpdateV1):
  // u8(discriminator=50) u8(updateV1Discriminator=0)
  // option<pubkey>(newUpdateAuthority=None=0)
  // option<Data>(Some=1) + Data { name, symbol, uri, sellerFeeBasisPoints, creators=None }
  // option<bool>(primarySaleHappened=None=0)
  // option<bool>(isMutable=None=0)
  // CollectionToggle=None(0)
  // UsesToggle=None(0)
  // CollectionDetailsToggle=None(0)
  // RuleSetToggle=None(0)
  // option<AuthorizationData>=None(0)

  const nameBytes   = enc.encode(name);
  const symbolBytes = enc.encode(symbol);
  const uriBytes    = enc.encode(uri);

  const totalLen =
    2 + // discriminators
    1 + // newUpdateAuthority option
    1 + // data option
    (4 + nameBytes.length) +
    (4 + symbolBytes.length) +
    (4 + uriBytes.length) +
    2 + // sellerFeeBasisPoints u16
    1 + // creators option (None=0)
    1 + // primarySaleHappened option
    1 + // isMutable option
    1 + // collection toggle
    1 + // uses toggle
    1 + // collectionDetails toggle
    1 + // ruleSet toggle
    1;  // authorizationData option

  const arr = new Uint8Array(totalLen);
  const dv  = new DataView(arr.buffer);

  let o = 0;
  const u8  = (v) => { arr[o++] = v & 0xff; };
  const u16 = (v) => { dv.setUint16(o, v, true); o += 2; };
  const u32 = (v) => { dv.setUint32(o, v, true); o += 4; };
  const bytes = (b) => { arr.set(b, o); o += b.length; };
  const str = (b) => { u32(b.length); bytes(b); };

  u8(50); // discriminator
  u8(0);  // updateV1 discriminator
  u8(0);  // newUpdateAuthority: None
  u8(1);  // data: Some
  str(nameBytes);
  str(symbolBytes);
  str(uriBytes);
  u16(sfbp);
  u8(0);  // creators: None
  u8(0);  // primarySaleHappened: None
  u8(0);  // isMutable: None
  u8(0);  // collection toggle: None
  u8(0);  // uses toggle: None
  u8(0);  // collectionDetails toggle: None
  u8(0);  // ruleSet toggle: None
  u8(0);  // authorizationData: None

  if (o !== totalLen) {
    throw new Error(`UpdateV1 serialization length mismatch: wrote ${o}, expected ${totalLen}`);
  }

  // Build UpdateV1 instruction
  const ix = new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: authority,  isSigner: true,  isWritable: false }, // authority
      { pubkey: authority,  isSigner: false, isWritable: false }, // delegateRecord (unused; ok as authority)
      { pubkey: authority,  isSigner: false, isWritable: false }, // token (unused)
      { pubkey: mint,       isSigner: false, isWritable: true  }, // mint
      { pubkey: metadataPDA,isSigner: false, isWritable: true  }, // metadata
      { pubkey: editionPDA, isSigner: false, isWritable: false }, // edition
      { pubkey: authority,  isSigner: true,  isWritable: true  }, // payer
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system
      { pubkey: SYSVAR_INSTRUCTIONS,     isSigner: false, isWritable: false }, // sysvar instructions
      { pubkey: PublicKey.default,       isSigner: false, isWritable: false }, // auth rules program (none)
      { pubkey: PublicKey.default,       isSigner: false, isWritable: false }, // auth rules (none)
    ],
    data: arr,
  });

  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  const { blockhash } = await connection.getLatestBlockhash();

  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: authority });
  tx.add(ix);

  const signed = await provider.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig, 'confirmed');

  console.log('NFT metadata updated:', sig);
}

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
