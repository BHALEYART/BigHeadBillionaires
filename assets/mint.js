const CANDY_MACHINE_ID = 'BiqLN985cYm9nmXpZwP7kDJnoW41Fq7Vy129pUb8ndVA';
const CANDY_GUARD_ID   = 'EwuGsMoNnFQ9XDumF1VxvLHVLew2ayxNQamwTvyXQBYL';
const TOKEN_MINT       = '6disLregVtZ8qKpTTGyW81mbfAS9uwvHwjKfy6LApump';
const TOKEN_DEST_ATA   = 'DwJMwznfQEiFLUNQq3bMKhcBEqM9t5zS8nR5QvmUS9s4';
const TOKEN_2022_PROGRAM   = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const RPC_ENDPOINT         = 'https://mainnet.helius-rpc.com/?api-key=a88e4b38-304e-407a-89c8-91c904b08491';
const CUSTOMIZER_FEE_DEST  = '9eMPEUrH46tbj67Y1uESNg9mzna7wi3J6ZoefsFkivcx'; // BURG fee recipient
const CUSTOMIZER_FEE_AMOUNT = 100_000_000_000n; // 100,000 BURG (6 decimals)
const PINATA_JWT = (window.PINATA_JWT || "")
  .trim()
  .replace(/^Bearer\s+/i, "");
if (PINATA_JWT.split(".").length !== 3) {
  throw new Error(
    `PINATA_JWT malformed at runtime (segments=${PINATA_JWT.split(".").length}). ` +
    `Check script order + window.PINATA_JWT value.`
  );
}

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
  // Use raw web3.js transaction to build the Token Metadata UpdateV1 instruction
  // directly, bypassing UMI which may serve a stale esm.sh bundle.
  // Token Metadata UpdateV1: discriminator=50, updateV1Discriminator=0
  // Accounts: authority(0,signer), delegateRecord(1), token(2), mint(3,w),
  //           metadata(4,w), edition(5), payer(6,w,signer), systemProgram(7),
  //           sysvarInstructions(8), authRulesProgram(9), authRules(10)

  const { Connection, PublicKey, Transaction, TransactionInstruction,
          SystemProgram } = await import('https://esm.sh/@solana/web3.js@1.95.3');

  const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
  const SYSVAR_INSTRUCTIONS = new PublicKey('Sysvar1nstructions1111111111111111111111111');

  const mint       = new PublicKey(mintAddress);
  const authority  = new PublicKey(window.solana.publicKey.toBase58());

  // Derive metadata PDA: seeds = ['metadata', programId, mint]
  const [metadataPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  );

  // Derive edition PDA: seeds = ['metadata', programId, mint, 'edition']
  const [editionPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer(), Buffer.from('edition')],
    TOKEN_METADATA_PROGRAM_ID
  );

  // Fetch current metadata to get name/symbol/sellerFeeBasisPoints
  const m = await loadMods();
  const umiMint = m.publicKey(mintAddress);
  const metadata = await m.fetchMetadataFromSeeds(_umi, { mint: umiMint });

  // Serialize the UpdateV1 instruction data manually
  // Layout: u8(discriminator=50) u8(updateV1Discriminator=0)
  //         option<pubkey>(newUpdateAuthority=None=0x00)
  //         option<Data>(data=Some)
  //           u8(1) + Data struct
  //         option<bool>(primarySaleHappened=None=0x00)
  //         option<bool>(isMutable=None=0x00)
  //         CollectionToggle=None(0x00)
  //         UsesToggle=None(0x00)
  //         CollectionDetailsToggle=None(0x00)
  //         RuleSetToggle=None(0x00)
  //         option<AuthorizationData>=None(0x00)

  function writeString(buf, offset, str) {
    const bytes = new TextEncoder().encode(str);
    buf.writeUInt32LE(bytes.length, offset);
    bytes.forEach((b,i) => buf[offset+4+i] = b);
    return offset + 4 + bytes.length;
  }

  const name   = metadata.name.replace(/ /g,'');
  const symbol = metadata.symbol.replace(/ /g,'');
  const uri    = newUri.replace(/ /g,'');
  const sfbp   = metadata.sellerFeeBasisPoints;

  // Calculate buffer size
  // discriminator(1) + updateV1Discriminator(1) + newUpdateAuthority(1) +
  // data option(1) + name(4+len) + symbol(4+len) + uri(4+len) + sfbp(2) +
  // creators option(1=None) + collection toggle(1) + uses toggle(1) +
  // primarySaleHappened option(1) + isMutable option(1) +
  // collectionDetailsToggle(1) + ruleSetToggle(1) + authorizationData option(1)
  const nameBytes   = new TextEncoder().encode(name);
  const symbolBytes = new TextEncoder().encode(symbol);
  const uriBytes    = new TextEncoder().encode(uri);
  const bufSize = 2 + 1 + 1 + (4+nameBytes.length) + (4+symbolBytes.length) + (4+uriBytes.length) + 2 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1;
  const buf = Buffer.alloc(bufSize + 32);

  let off = 0;
  buf[off++] = 50;   // discriminator
  buf[off++] = 0;    // updateV1Discriminator
  buf[off++] = 0;    // newUpdateAuthority = None
  buf[off++] = 1;    // data = Some

  // Data struct: name, symbol, uri, sellerFeeBasisPoints, creators(None)
  buf.writeUInt32LE(nameBytes.length, off);   off += 4;
  nameBytes.forEach(b => buf[off++] = b);
  buf.writeUInt32LE(symbolBytes.length, off); off += 4;
  symbolBytes.forEach(b => buf[off++] = b);
  buf.writeUInt32LE(uriBytes.length, off);    off += 4;
  uriBytes.forEach(b => buf[off++] = b);
  buf.writeUInt16LE(sfbp, off); off += 2;
  buf[off++] = 0;    // creators = None

  buf[off++] = 0;    // primarySaleHappened = None
  buf[off++] = 0;    // isMutable = None
  buf[off++] = 0;    // collection = None (no toggle)
  buf[off++] = 0;    // uses = None
  buf[off++] = 0;    // collectionDetails = None
  buf[off++] = 0;    // ruleSet = None
  buf[off++] = 0;    // authorizationData = None

  const data = buf.slice(0, off);

  const keys = [
    { pubkey: authority,     isSigner: true,  isWritable: false }, // 0 authority
    { pubkey: new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'), isSigner: false, isWritable: false }, // 1 delegateRecord (program default when none)
    { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }, // 2 token (none)
    { pubkey: mint,          isSigner: false, isWritable: false }, // 3 mint
    { pubkey: metadataPDA,   isSigner: false, isWritable: true  }, // 4 metadata
    { pubkey: editionPDA,    isSigner: false, isWritable: false }, // 5 edition
    { pubkey: authority,     isSigner: true,  isWritable: true  }, // 6 payer
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // 7 system
    { pubkey: SYSVAR_INSTRUCTIONS, isSigner: false, isWritable: false }, // 8 sysvar
  ];

  const ix = new TransactionInstruction({ keys, programId: TOKEN_METADATA_PROGRAM_ID, data });

  const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=a88e4b38-304e-407a-89c8-91c904b08491', 'confirmed');
  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: authority });
  tx.add(ix);

  const signed = await window.solana.signTransaction(tx);
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