// bots.js — Solana Bot Board
// Requires app.js to be loaded first (wallet connect lives there)

// ── Constants ─────────────────────────────────────────────────────────────────
// USDC_MINT lives here only — app.js does not declare it
const USDC_MINT      = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_DECIMALS  = 6;

// ── State ─────────────────────────────────────────────────────────────────────
let selectedStrategy = null;
let botWallet        = null;  // { address, privateKeyBase58 } — generated client-side
let fundingComplete  = false;

// ── Terminal state ─────────────────────────────────────────────────────────────
let term     = null;
let fitAddon = null;
let ws       = null;

// ── Strategy form definitions ─────────────────────────────────────────────────
const FORMS = {

  dca: {
    title: '💰 DCA Bot — Dollar Cost Average',
    sections: [
      { title: 'Wallet', fields: [
        { id: 'privateKey',    label: 'Bot wallet private key (base58)', type: 'password', placeholder: 'auto-filled from bot pool', hint: 'Pre-filled from your generated bot wallet. Never share this.' },
        { id: 'cashoutAddr',   label: 'Cashout address',                 type: 'text',     placeholder: 'Your Phantom/Solflare address', hint: 'Where USDC returns when you run the cashout command.' },
        { id: 'rpcUrl',        label: 'Solana RPC URL',                  type: 'text',     placeholder: 'https://api.mainnet-beta.solana.com', hint: 'Private RPC recommended for reliability. Free: mainnet-beta.' },
      ]},
      { title: 'DCA settings', fields: [
        { id: 'outputMint',   label: 'Token to buy (mint address)', type: 'text',   placeholder: 'So11111111111111111111111111111111111111112', hint: 'Default: Wrapped SOL. Paste any SPL token mint address.' },
        { id: 'buyAmount',    label: 'USDC per buy',                type: 'number', placeholder: '10',   hint: 'Fixed USDC amount to swap each interval.' },
        { id: 'interval',     label: 'Buy interval',               type: 'select', options: ['5m','15m','1h','4h','12h','1d'], hint: 'How often to place a buy.' },
        { id: 'budgetCap',    label: 'Total USDC budget cap',       type: 'number', placeholder: '100',  hint: 'Bot stops buying when total spent reaches this.' },
        { id: 'stopLossPct',  label: 'Stop-loss %',                 type: 'number', placeholder: '15',   hint: 'Sell all holdings and stop if down this % from avg entry.' },
        { id: 'slippageBps',  label: 'Slippage tolerance (bps)',    type: 'number', placeholder: '50',   hint: '50 = 0.5%. Keep low for stables, higher for small caps.' },
      ]},
      { title: 'Risk', fields: [
        { id: 'dryRun', label: 'Dry run mode', type: 'select', options: ['true','false'], hint: 'true = simulate only. STRONGLY recommended before going live.' },
      ]},
    ]
  },

  copy: {
    title: '👑 Copy Bot — Mirror a Wallet',
    sections: [
      { title: 'Wallet', fields: [
        { id: 'privateKey',  label: 'Bot wallet private key (base58)', type: 'password', placeholder: 'auto-filled from bot pool' },
        { id: 'cashoutAddr', label: 'Cashout address',                 type: 'text',     placeholder: 'Your Phantom/Solflare address' },
        { id: 'rpcUrl',      label: 'Solana RPC URL',                  type: 'text',     placeholder: 'https://api.mainnet-beta.solana.com', hint: 'Private RPC strongly recommended for copy trading latency.' },
      ]},
      { title: 'Copy settings', fields: [
        { id: 'targetWallet',  label: 'Wallet address to copy', type: 'text',   placeholder: 'Target Solana wallet address', hint: 'All swaps from this wallet will be mirrored.' },
        { id: 'positionSize',  label: 'USDC per copied swap',   type: 'number', placeholder: '20',    hint: 'Fixed USDC to spend when mirroring a swap.' },
        { id: 'maxDrawdown',   label: 'Max drawdown % to pause',type: 'number', placeholder: '20',    hint: 'Bot pauses if your pool drops this % from peak.' },
        { id: 'blacklist',     label: 'Blacklisted mints',      type: 'text',   placeholder: 'mint1,mint2', hint: 'Comma-separated mint addresses to never copy.' },
        { id: 'pollInterval',  label: 'Poll interval',          type: 'select', options: ['5s','10s','30s','1m'], hint: 'How often to check target wallet for new swaps.' },
        { id: 'slippageBps',   label: 'Slippage tolerance (bps)',type: 'number', placeholder: '100',   hint: '100 = 1%. Higher slippage needed for fast copy trades.' },
      ]},
      { title: 'Risk', fields: [
        { id: 'maxPositions', label: 'Max concurrent positions', type: 'number', placeholder: '5' },
        { id: 'dryRun',       label: 'Dry run mode',            type: 'select', options: ['true','false'], hint: 'true = log only, no real swaps.' },
      ]},
    ]
  },

  momentum: {
    title: '🚀 Momentum Bot — Breakout Trading',
    sections: [
      { title: 'Wallet', fields: [
        { id: 'privateKey',  label: 'Bot wallet private key (base58)', type: 'password', placeholder: 'auto-filled from bot pool' },
        { id: 'cashoutAddr', label: 'Cashout address',                 type: 'text',     placeholder: 'Your Phantom/Solflare address' },
        { id: 'rpcUrl',      label: 'Solana RPC URL',                  type: 'text',     placeholder: 'https://api.mainnet-beta.solana.com' },
      ]},
      { title: 'Momentum settings', fields: [
        { id: 'gainThreshold', label: 'Entry threshold %',        type: 'number', placeholder: '5',    hint: 'Enter when a token gains this % in one scan window.' },
        { id: 'scanInterval',  label: 'Scan interval',            type: 'select', options: ['1m','5m','15m','1h'], hint: '5m recommended.' },
        { id: 'positionSize',  label: 'USDC per position',        type: 'number', placeholder: '25',   hint: 'USDC to swap into each momentum trade.' },
        { id: 'takeProfit',    label: 'Take-profit %',             type: 'number', placeholder: '8',    hint: 'Swap back to USDC when up this %.' },
        { id: 'stopLoss',      label: 'Stop-loss %',               type: 'number', placeholder: '4',    hint: 'Swap back to USDC when down this %.' },
        { id: 'slippageBps',   label: 'Slippage tolerance (bps)', type: 'number', placeholder: '100' },
        { id: 'watchMints',    label: 'Tokens to watch (mints)',   type: 'text',   placeholder: 'So111...,JUP...',  hint: 'Comma-separated mint addresses. Leave blank to watch top tokens.' },
      ]},
      { title: 'Risk', fields: [
        { id: 'maxPositions', label: 'Max concurrent positions', type: 'number', placeholder: '3' },
        { id: 'dailyLossCap', label: 'Daily loss cap (USDC)',    type: 'number', placeholder: '50', hint: 'Pauses bot for the day if losses hit this.' },
        { id: 'dryRun',       label: 'Dry run mode',            type: 'select', options: ['true','false'] },
      ]},
    ]
  },

  scalper: {
    title: '⚡ Scalper Bot — 0.3% Micro-Moves',
    sections: [
      { title: 'Wallet', fields: [
        { id: 'privateKey',  label: 'Bot wallet private key (base58)', type: 'password', placeholder: 'auto-filled from bot pool' },
        { id: 'cashoutAddr', label: 'Cashout address',                 type: 'text',     placeholder: 'Your Phantom/Solflare address' },
        { id: 'rpcUrl',      label: 'Solana RPC URL',                  type: 'text',     placeholder: 'https://api.mainnet-beta.solana.com', hint: 'Private RPC STRONGLY recommended for scalping. Public RPCs are too slow.' },
      ]},
      { title: 'Scalper settings', fields: [
        { id: 'gainThreshold', label: 'Entry threshold %',        type: 'number', placeholder: '0.3', hint: 'Enter when price moves this % in one scan window. 0.3% default.' },
        { id: 'scanInterval',  label: 'Scan interval',            type: 'select', options: ['10s','30s','1m','2m'], hint: '30s recommended. Faster = more RPC calls.' },
        { id: 'positionSize',  label: 'USDC per scalp',           type: 'number', placeholder: '15',  hint: 'Keep small — scalper opens many positions.' },
        { id: 'takeProfit',    label: 'Take-profit %',             type: 'number', placeholder: '0.5', hint: 'Exit when up 0.5%.' },
        { id: 'stopLoss',      label: 'Stop-loss %',               type: 'number', placeholder: '0.3', hint: 'Exit when down 0.3%.' },
        { id: 'slippageBps',   label: 'Slippage tolerance (bps)', type: 'number', placeholder: '30',  hint: '30 = 0.3%. Keep tight for scalping.' },
        { id: 'watchMints',    label: 'Tokens to scalp (mints)',   type: 'text',   placeholder: 'So111...,JUP...', hint: 'Leave blank to auto-scan top liquid tokens.' },
      ]},
      { title: 'Risk', fields: [
        { id: 'maxPositions',  label: 'Max concurrent positions', type: 'number', placeholder: '5' },
        { id: 'dailyLossCap',  label: 'Daily loss cap (USDC)',    type: 'number', placeholder: '30',  hint: 'Pauses bot for the day if losses hit this.' },
        { id: 'dailyTradeCap', label: 'Max swaps per day',        type: 'number', placeholder: '200', hint: 'Prevents runaway loops.' },
        { id: 'dryRun',        label: 'Dry run mode',            type: 'select', options: ['true','false'], hint: 'true = STRONGLY recommended first. Logs without real swaps.' },
      ]},
    ]
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// WALLET CALLBACKS (called by app.js)
// ─────────────────────────────────────────────────────────────────────────────

function onWalletConnectedBots() {
  document.getElementById('step-connect-gate').style.display = 'none';
  document.getElementById('step-strategy').style.display     = 'block';
  if (selectedStrategy) {
    document.getElementById('step-fund').style.display = 'block';
  }
  // Update available balance display
  const bal = window._solBalances?.usdc || '0.00';
  const el  = document.getElementById('fund-available');
  if (el) el.textContent = `$${bal} USDC`;
}

function onWalletDisconnectedBots() {
  document.getElementById('step-connect-gate').style.display = 'flex';
  ['step-strategy','step-fund','step-config','step-download','step-terminal']
    .forEach(id => { document.getElementById(id).style.display = 'none'; });
  selectedStrategy = null; botWallet = null; fundingComplete = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY SELECTION
// ─────────────────────────────────────────────────────────────────────────────

document.getElementById('strategy-grid').addEventListener('click', e => {
  const card = e.target.closest('.strategy-card-bot');
  if (!card) return;
  document.querySelectorAll('.strategy-card-bot').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedStrategy = card.dataset.strategy;

  document.getElementById('step-fund').style.display = 'block';
  document.getElementById('step-fund').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // If already funded, show config immediately
  if (fundingComplete) renderConfigForm(selectedStrategy);
});

// Auto-select from URL param
const urlStrategy = new URLSearchParams(window.location.search).get('strategy');
if (urlStrategy && FORMS[urlStrategy]) {
  window.addEventListener('load', () => {
    const card = document.querySelector(`[data-strategy="${urlStrategy}"]`);
    if (card && walletAddress) card.click();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const TREASURY_WALLET    = '9eMPEUrH46tbj67Y1uESNg9mzna7wi3J6ZoefsFkivcx';
const TREASURY_BURG_ATA  = 'DwJMwznfQEiFLUNQq3bMKhcBEqM9t5zS8nR5QvmUS9s4'; // hardcoded — verified on Solscan
const BURG_MINT          = '6disLregVtZ8qKpTTGyW81mbfAS9uwvHwjKfy6LApump';
const BURG_DEPLOY_FEE    = 100_000;  // 100K BURG
const RPC_PROXY          = '/api/rpc';
const RPC_DIRECT         = 'https://api.mainnet-beta.solana.com';

// Token program IDs
const TOKEN_PROGRAM_ID        = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID   = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const ASSOCIATED_TOKEN_PROGRAM= 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bv';
const SYSTEM_PROGRAM_ID       = '11111111111111111111111111111111';
const SYSVAR_RENT             = 'SysvarRent111111111111111111111111111111111';

// ─────────────────────────────────────────────────────────────────────────────
// BASE58 HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const B58_ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function bs58Encode(bytes) {
  let num = BigInt('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join(''));
  let encoded = '';
  while (num > 0n) { encoded = B58_ALPHA[Number(num % 58n)] + encoded; num /= 58n; }
  for (const b of bytes) { if (b !== 0) break; encoded = '1' + encoded; }
  return encoded;
}

function bs58Decode(str) {
  let num = 0n;
  for (const c of str) {
    const idx = B58_ALPHA.indexOf(c);
    if (idx < 0) throw new Error('Invalid base58 char: ' + c);
    num = num * 58n + BigInt(idx);
  }
  const hex = num.toString(16).padStart(64, '0');
  const bytes = new Uint8Array(hex.match(/.{2}/g).map(h => parseInt(h, 16)));
  const leading = [...str].filter(c => c === '1').length;
  return new Uint8Array([...new Array(leading).fill(0), ...bytes]);
}

// ─────────────────────────────────────────────────────────────────────────────
// SOLANA RPC HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function rpcCall(method, params) {
  const r = await fetch(RPC_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const d = await r.json();
  if (d.error) throw new Error('RPC ' + method + ': ' + JSON.stringify(d.error));
  return d.result;
}

// sendTransaction goes direct (wallet already signed — proxy blocks it for security)
async function sendRawTransaction(signedTxBase64) {
  const r = await fetch(RPC_DIRECT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'sendTransaction',
      params: [signedTxBase64, {
        encoding:            'base64',
        skipPreflight:       false,
        preflightCommitment: 'confirmed',
        maxRetries:          3,
      }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error('sendTransaction: ' + JSON.stringify(d.error));
  return d.result; // txid
}

async function getRecentBlockhash() {
  const res = await rpcCall('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  return res.value.blockhash;
}

// Derive Associated Token Account address using @solana/web3.js
async function findATA(walletAddr, mintAddr, tokenProgramId = TOKEN_PROGRAM_ID) {
  const { PublicKey } = web3();
  const [ata] = PublicKey.findProgramAddressSync(
    [
      new PublicKey(walletAddr).toBytes(),
      new PublicKey(tokenProgramId).toBytes(),
      new PublicKey(mintAddr).toBytes(),
    ],
    new PublicKey(ASSOCIATED_TOKEN_PROGRAM)
  );
  return ata.toBase58();
}

// Check if an account exists on-chain via Helius
async function accountExists(address) {
  try {
    const { Connection, PublicKey } = web3();
    const connection = new Connection(
      'https://mainnet.helius-rpc.com/?api-key=a88e4b38-304e-407a-89c8-91c904b08491',
      'confirmed'
    );
    const info = await connection.getAccountInfo(new PublicKey(address));
    return info !== null;
  } catch(_) { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION BUILDER — uses @solana/web3.js loaded from CDN in bots/index.html
// solanaWeb3 = window.solanaWeb3
// ─────────────────────────────────────────────────────────────────────────────

function web3() {
  if (!window.solanaWeb3) throw new Error('@solana/web3.js not loaded. Check CDN script tag.');
  return window.solanaWeb3;
}

function pk(address) {
  return new (web3().PublicKey)(address);
}

// Create Associated Token Account instruction via @solana/spl-token compatible encoding
function makeCreateATAIx(funder, ataAddress, owner, mint, tokenProgramId) {
  const { TransactionInstruction, PublicKey } = web3();
  const keys = [
    { pubkey: pk(funder),      isSigner: true,  isWritable: true  },
    { pubkey: pk(ataAddress),  isSigner: false, isWritable: true  },
    { pubkey: pk(owner),       isSigner: false, isWritable: false },
    { pubkey: pk(mint),        isSigner: false, isWritable: false },
    { pubkey: pk(SYSTEM_PROGRAM_ID),       isSigner: false, isWritable: false },
    { pubkey: pk(tokenProgramId),          isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({
    keys,
    programId: pk(ASSOCIATED_TOKEN_PROGRAM),
    data: new Uint8Array([]),
  });
}

// u64 little-endian for SPL transfer amounts
function u64LE(n) {
  const buf = new Uint8Array(8);
  let v = BigInt(n);
  for (let i = 0; i < 8; i++) { buf[i] = Number(v & 0xffn); v >>= 8n; }
  return buf;
}

// SPL transferChecked instruction (works for both Token and Token-2022)
function makeSplTransferIx(source, dest, owner, amount, mint, tokenProgramId, decimals = 6) {
  const { TransactionInstruction } = web3();
  // instruction discriminator 12 = transferChecked
  const data = new Uint8Array([12, ...u64LE(amount), decimals]);
  const keys = [
    { pubkey: pk(source), isSigner: false, isWritable: true  },
    { pubkey: pk(mint),   isSigner: false, isWritable: false },
    { pubkey: pk(dest),   isSigner: false, isWritable: true  },
    { pubkey: pk(owner),  isSigner: true,  isWritable: false },
  ];
  return new TransactionInstruction({ keys, programId: pk(tokenProgramId), data });
}

// ─────────────────────────────────────────────────────────────────────────────
// BOT WALLET GENERATION
// ─────────────────────────────────────────────────────────────────────────────

async function generateBotWallet() {
  const btn = document.getElementById('btn-gen-wallet');
  btn.textContent = '⚡ Generating...';
  btn.disabled = true;

  // Use @solana/web3.js Keypair.generate() — guaranteed valid ed25519 keypair
  const { Keypair } = web3();
  const keypair = Keypair.generate();

  const address          = keypair.publicKey.toBase58();
  // secretKey is 64 bytes: seed (32) + pubkey (32)
  const privateKeyBase58 = bs58Encode(keypair.secretKey);

  botWallet = { address, privateKeyBase58 };

  document.getElementById('bot-wallet-display').style.display = 'block';
  document.getElementById('bot-wallet-addr').textContent       = address;
  btn.style.display = 'none';
  document.getElementById('btn-fund-transfer').style.display   = 'block';
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNDING FLOW — atomic on-chain transaction
// ─────────────────────────────────────────────────────────────────────────────

async function fundBotPool() {
  if (!botWallet)    { alert('Generate a bot wallet first.'); return; }
  if (!walletAddress){ alert('Connect your wallet first.'); return; }

  const amount = parseFloat(document.getElementById('fund-amount').value);
  if (!amount || amount < 10) { alert('Minimum 10 USDC.'); return; }

  const usdcBal = parseFloat(window._solBalances?.usdc || 0);
  if (usdcBal < amount) {
    alert(`Insufficient USDC.\nYou have: $${usdcBal}\nNeeded: $${amount}`); return;
  }

  const btn = document.getElementById('btn-fund-transfer');
  btn.textContent = '⏳ Building transaction...';
  btn.disabled = true;

  try {
    // ── Shared Connection (Helius) — used throughout this function ──────────
    const { Connection, Transaction, PublicKey } = web3();
    const connection = new Connection(
      'https://mainnet.helius-rpc.com/?api-key=a88e4b38-304e-407a-89c8-91c904b08491',
      'confirmed'
    );

    // ── Derive all ATAs needed ──────────────────────────────────────────────

    // BURG is a pump.fun token — ATA derivation is unreliable, look up on-chain
    const burgTokenProgram = TOKEN_PROGRAM_ID;

    // Look up user's actual BURG token account on-chain
    const burgAccounts = await connection.getParsedTokenAccountsByOwner(
      pk(walletAddress),
      { mint: pk(BURG_MINT) }
    );
    if (!burgAccounts.value.length) {
      throw new Error('No BURG token account found in your wallet.\nMake sure you hold BURG before deploying a bot.');
    }
    const userBurgATA = burgAccounts.value[0].pubkey.toBase58();
    console.log('User BURG ATA (on-chain lookup):', userBurgATA);

    // Treasury BURG ATA — hardcoded, verified on Solscan
    const treasuryBurgATA = TREASURY_BURG_ATA;

    // Look up user's actual USDC token account on-chain (same approach as BURG)
    const usdcAccounts = await connection.getParsedTokenAccountsByOwner(
      pk(walletAddress),
      { mint: pk(USDC_MINT) }
    );
    if (!usdcAccounts.value.length) {
      throw new Error('No USDC token account found in your wallet.\nMake sure you hold USDC before funding the bot.');
    }
    const userUsdcATA = usdcAccounts.value[0].pubkey.toBase58();
    console.log('User USDC ATA (on-chain lookup):', userUsdcATA);

    // Bot wallet USDC ATA — derived (new wallet, doesn't exist yet)
    const botUsdcATA  = await findATA(botWallet.address, USDC_MINT, TOKEN_PROGRAM_ID);
    console.log('Bot USDC ATA (derived):', botUsdcATA, '| bot wallet:', botWallet.address);

    // ── Check which ATAs need creation ─────────────────────────────────────
    const botAtaExists      = await accountExists(botUsdcATA);
    const treasuryAtaExists = true; // hardcoded — we know it exists

    // ── Diagnostics ────────────────────────────────────────────────────────
    console.group('🔍 Fund Bot Pool — addresses');
    console.log('User wallet:      ', walletAddress);
    console.log('Bot wallet:       ', botWallet.address);
    console.log('User BURG ATA:    ', userBurgATA);
    console.log('Treasury BURG ATA:', treasuryBurgATA, treasuryAtaExists ? '(exists)' : '(needs creation)');
    console.log('User USDC ATA:    ', userUsdcATA);
    console.log('Bot USDC ATA:     ', botUsdcATA, botAtaExists ? '(exists)' : '(needs creation)');
    console.log('BURG amount:      ', BURG_DEPLOY_FEE.toLocaleString(), 'BURG');
    console.log('USDC amount:      ', amount, 'USDC');
    console.groupEnd();

    // ── Verify user BURG balance ────────────────────────────────────────────
    const burgBalance = parseFloat(
      burgAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0
    );
    console.log('User BURG balance:', burgBalance, '/ needed:', BURG_DEPLOY_FEE);
    if (burgBalance < BURG_DEPLOY_FEE) {
      throw new Error(`Insufficient BURG.\nYou have: ${burgBalance.toLocaleString()} BURG\nNeeded: ${BURG_DEPLOY_FEE.toLocaleString()} BURG`);
    }

    // ── Verify user SOL balance for fees ───────────────────────────────────
    const solLamports = await connection.getBalance(pk(walletAddress));
    console.log('User SOL balance:', solLamports / 1e9, 'SOL');
    if (solLamports < 10_000_000) {
      throw new Error(`Insufficient SOL for fees.\nYou have: ${(solLamports/1e9).toFixed(4)} SOL\nNeeded: ~0.01 SOL`);
    }

    // ── Build instructions ──────────────────────────────────────────────────
    const { SystemProgram } = web3();
    const instructions = [];

    // 0. Create treasury BURG ATA if it doesn't exist
    if (!treasuryAtaExists) {
      console.log('Creating treasury BURG ATA...');
      instructions.push(makeCreateATAIx(
        walletAddress, treasuryBurgATA, TREASURY_WALLET, BURG_MINT, burgTokenProgram
      ));
    }

    // 1. BURG deploy fee: user → treasury
    const burgAmount = BigInt(BURG_DEPLOY_FEE) * 1_000_000n;
    instructions.push(makeSplTransferIx(
      userBurgATA, treasuryBurgATA, walletAddress,
      burgAmount, BURG_MINT, burgTokenProgram
    ));

    // 2. Send 0.025 SOL to bot wallet — covers tx fees + ATA rent for token accounts
    instructions.push(SystemProgram.transfer({
      fromPubkey: pk(walletAddress),
      toPubkey:   pk(botWallet.address),
      lamports:   25_000_000, // 0.025 SOL
    }));

    // 3. Create bot wallet USDC ATA (user pays ~0.002 SOL rent)
    if (!botAtaExists) {
      instructions.push(makeCreateATAIx(
        walletAddress, botUsdcATA, botWallet.address, USDC_MINT, TOKEN_PROGRAM_ID
      ));
    }

    // 4. USDC transfer: user → bot wallet ATA
    const usdcAmount = BigInt(Math.round(amount * 1_000_000));
    instructions.push(makeSplTransferIx(
      userUsdcATA, botUsdcATA, walletAddress,
      usdcAmount, USDC_MINT, TOKEN_PROGRAM_ID
    ));

    // ── Build web3.js Transaction ──────────────────────────────────────────
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: pk(walletAddress) });
    instructions.forEach(ix => tx.add(ix));

    // ── Resolve provider (matches _resolveProvider pattern from BHB) ────────
    let provider;
    if (walletType === 'solflare') {
      provider = window.solflare?.signTransaction ? window.solflare : null;
    } else {
      provider = window.phantom?.solana?.signTransaction ? window.phantom.solana
               : window.solana?.signTransaction          ? window.solana
               : null;
    }
    if (!provider) throw new Error('Wallet provider not found or does not support signTransaction');

    // ── Sign and send via wallet ────────────────────────────────────────────
    btn.textContent = '⏳ Awaiting wallet signature...';

    const signed   = await provider.signTransaction(tx);
    const rawBytes = signed.serialize();
    console.log('Signed tx bytes:', rawBytes.length, '| sending via Helius...');

    // Send with high maxRetries — rebroadcast aggressively
    const txid = await connection.sendRawTransaction(rawBytes, {
      skipPreflight:       true,
      preflightCommitment: 'confirmed',
      maxRetries:          10,
    });

    if (!txid) throw new Error('No transaction ID returned');

    // Rebroadcast every 2s until confirmed (handles slow slots)
    const rebroadcast = setInterval(async () => {
      try { await connection.sendRawTransaction(rawBytes, { skipPreflight: true, maxRetries: 0 }); }
      catch(_) {}
    }, 2000);

    const solscanUrl = 'https://solscan.io/tx/' + txid;
    btn.textContent = '⏳ Confirming...';
    console.log('Fund tx:', txid, '|', solscanUrl);

    // Confirm — don't throw on expiry, tx may still land
    try {
      await connection.confirmTransaction(
        { signature: txid, blockhash, lastValidBlockHeight },
        'confirmed'
      );
      clearInterval(rebroadcast);
      console.log('✅ Confirmed!');
    } catch(confirmErr) {
      clearInterval(rebroadcast);
      console.warn('Confirmation timeout (tx may still have landed):', confirmErr.message);
      const stillCheck = confirm(
        '⚠️ Confirmation timed out — the transaction may still have gone through.\n\n' +
        'Check Solscan:\n' + solscanUrl + '\n\n' +
        'Did the transaction succeed on Solscan?\n' +
        'Click OK if yes (proceed), Cancel to retry funding.'
      );
      if (!stillCheck) {
        btn.textContent = '💸 Send USDC to Bot';
        btn.disabled = false;
        return;
      }
    }

    completeFunding(amount, txid);

  } catch(e) {
    console.error('fundBotPool error:', e);
    // Extract on-chain logs if available (SendTransactionError)
    if (typeof e.getLogs === 'function') {
      e.getLogs().then(logs => console.error('On-chain logs:', logs)).catch(() => {});
    }
    const msg = e.message || String(e);
    btn.textContent = '💸 Send USDC to Bot';
    btn.disabled = false;
    alert('Transaction failed:\n' + msg +
      '\n\nCheck the browser console for details.\n' +
      'You can also fund manually and click "I already sent USDC manually".');
  }
}

async function waitForConfirmation(txid, maxRetries = 20) {
  for (let i = 0; i < maxRetries; i++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const res = await rpcCall('getSignatureStatuses', [[txid]]);
      const status = res?.value?.[0];
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return;
      if (status?.err) throw new Error('Transaction failed on-chain: ' + JSON.stringify(status.err));
    } catch(e) {
      if (e.message.includes('on-chain')) throw e;
    }
  }
}

function markFundedManually() {
  if (!botWallet) { alert('Please generate a bot wallet first.'); return; }
  completeFunding(document.getElementById('fund-amount').value || '?', null);
}

function completeFunding(amount, txid) {
  fundingComplete = true;

  const confirmed = document.getElementById('fund-confirmed');
  const text      = document.getElementById('fund-confirmed-text');
  confirmed.style.display = 'flex';
  text.innerHTML = txid
    ? `✅ Funded — ${amount} USDC · <a href="https://solscan.io/tx/${txid}" target="_blank" style="color:var(--sol2)">View tx ↗</a>`
    : `✅ Bot pool funded — ${amount} USDC`;

  document.getElementById('step-config').style.display = 'block';
  if (selectedStrategy) {
    renderConfigForm(selectedStrategy);
    document.getElementById('step-config').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG FORM
// ─────────────────────────────────────────────────────────────────────────────

function renderConfigForm(strategy) {
  const def = FORMS[strategy];
  if (!def) return;
  const el  = document.getElementById('config-form');

  let html = `<div class="form-section-title" style="margin-top:0;font-size:14px;color:var(--sol2)">${def.title}</div>`;

  if (botWallet) {
    html += `<div style="margin-bottom:1rem;padding:8px 12px;background:rgba(20,241,149,0.06);border:1px solid rgba(20,241,149,0.2);border-radius:6px;font-family:var(--font-mono);font-size:11px;color:var(--muted)">
      ✅ Bot wallet pre-filled: <span style="color:var(--sol2)">${botWallet.address.slice(0,16)}...</span>
    </div>`;
  }

  def.sections.forEach(section => {
    html += `<div class="form-section-title">${section.title}</div>`;
    section.fields.forEach(f => {
      html += `<div class="form-group"><label class="form-label" for="f_${f.id}">${f.label}</label>`;
      if (f.type === 'select') {
        html += `<select class="form-select" id="f_${f.id}" data-key="${f.id}">${f.options.map(o => `<option value="${o}">${o}</option>`).join('')}</select>`;
      } else {
        html += `<input class="form-input" id="f_${f.id}" type="${f.type}" placeholder="${f.placeholder||''}" data-key="${f.id}" autocomplete="off" spellcheck="false" />`;
      }
      if (f.hint) html += `<div class="form-hint">ℹ️ ${f.hint}</div>`;
      html += `</div>`;
    });
  });

  html += `<button class="btn-full" id="btn-proceed">⚡ Generate Bot Package</button>`;
  el.innerHTML = html;

  // Auto-fill from bot wallet
  if (botWallet) {
    const pkField = document.getElementById('f_privateKey');
    if (pkField) pkField.value = botWallet.privateKeyBase58;
  }
  if (walletAddress) {
    const cashoutField = document.getElementById('f_cashoutAddr');
    if (cashoutField && !cashoutField.value) cashoutField.value = walletAddress;
  }
  // Auto-fill position size from funded amount
  const fundAmt = parseFloat(document.getElementById('fund-amount')?.value || 0);
  if (fundAmt > 0) {
    const sizeField = document.getElementById('f_positionSize') ||
                      document.getElementById('f_buyAmount')    ||
                      document.getElementById('f_inputAmount');
    if (sizeField && !sizeField.value) {
      sizeField.value = Math.min(Math.floor(fundAmt * 0.1), 50); // 10% of pool, max $50
    }
    const budgetField = document.getElementById('f_budgetCap');
    if (budgetField && !budgetField.value) budgetField.value = fundAmt;
  }

  el.querySelectorAll('.form-input, .form-select').forEach(i => i.addEventListener('input', updatePreview));
  document.getElementById('btn-proceed').addEventListener('click', () => {
    document.getElementById('step-download').style.display  = 'block';
    document.getElementById('step-terminal').style.display  = 'block';
    document.getElementById('step-download').scrollIntoView({ behavior: 'smooth' });
    if (!term) initTerminal();
  });
  updatePreview();
}

function getConfig() {
  const config = {};
  document.querySelectorAll('#config-form .form-input, #config-form .form-select').forEach(i => {
    if (i.dataset.key) {
      // Use placeholder as fallback if value is empty (shows default in .env)
      config[i.dataset.key] = i.value || i.placeholder || '';
    }
  });
  return config;
}

function updatePreview() {
  const config = getConfig();
  const lines  = Object.entries(config).map(([k, v]) => {
    const isSecret = k === 'privateKey';
    return `${k.toUpperCase()}=${isSecret && v ? '***hidden***' : (v || '<not set>')}`;
  });
  document.getElementById('config-pre').textContent =
    `# ${(selectedStrategy||'').toUpperCase()} BOT — Solana Bot Board\n` +
    `# Generated ${new Date().toLocaleDateString()}\n\n` +
    `STRATEGY=${selectedStrategy||''}\n` +
    `INPUT_MINT=${USDC_MINT}\n` +
    `WS_PORT=8080\n\n` +
    lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// ZIP GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

async function generateAndDownload() {
  if (!selectedStrategy || !botWallet) {
    alert('Please complete all steps first.'); return;
  }
  const config = getConfig();
  const zip    = new JSZip();
  const folder = zip.folder(`solana-${selectedStrategy}-bot`);

  folder.file('.env',              buildEnv(config));
  folder.file('bot.py',            getBotPy(selectedStrategy, config));
  folder.file('requirements.txt',  getRequirements());
  folder.file('run.sh',            getRunScript());
  folder.file('README.md',         getReadme(selectedStrategy, config));
  folder.file('logs/.gitkeep',     '');

  const blob = await zip.generateAsync({ type: 'blob' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `solana-${selectedStrategy}-bot.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildEnv(config) {
  const lines = [
    '# Solana Bot Board — Bot Configuration',
    '# KEEP THIS FILE PRIVATE. Never share your private key.',
    '',
    `STRATEGY=${selectedStrategy}`,
    `INPUT_MINT=${USDC_MINT}`,
    `BOT_POOL_ADDRESS=${botWallet?.address || ''}`,
    `WS_PORT=8080`,
    '',
  ];
  Object.entries(config).forEach(([k, v]) => {
    lines.push(`${k.toUpperCase()}=${v}`);
  });
  return lines.join('\n');
}

function getRequirements() {
  return `requests>=2.31.0
websockets>=12.0
python-dotenv>=1.0.0
base58>=2.1.1
solders>=0.21.0
`;
}

function getRunScript() {
  return `#!/bin/bash
# Solana Bot Board — run script
# Requirements: Python 3.8+

echo "Installing dependencies..."
pip3 install -r requirements.txt --quiet

echo "Starting bot..."
python3 bot.py
`;
}

function getReadme(strategy, config) {
  const names = { dca: 'DCA', copy: 'Copy Trading', momentum: 'Momentum', scalper: 'Scalper' };
  return `# Solana ${names[strategy]} Bot
Generated by Solana Bot Board

## Requirements
- Python 3.8 or higher
- pip3

## Quick Start
\`\`\`bash
# 1. Unzip this folder
# 2. Run the bot
python3 bot.py

# Or use the run script (installs deps automatically)
bash run.sh
\`\`\`

## Terminal commands (connect via browser terminal)
| Command | Description |
|---------|-------------|
| \`status\` | Show positions, PnL, uptime |
| \`pause\` | Pause trading (keep positions open) |
| \`resume\` | Resume trading |
| \`stop\` | Stop bot |
| \`cashout\` | Swap all holdings back to USDC and send to cashout address |
| \`help\` | Show all commands |

## Connect live terminal
Go to https://solanabotboard.vercel.app/bots/ → Step 5 → enter \`localhost:8080\` → Connect

## Safety
- Start with \`DRY_RUN=true\` to simulate without real swaps
- Never share your \`.env\` file or private key
- Monitor the bot regularly — all trading carries risk

## Edit settings
Edit \`.env\` and restart: \`python3 bot.py\`
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// BOT TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────────
// PYTHON BOT TEMPLATES
// ──────────────────────────────────────────────────────────────────────────────

function getBotPy(strategy, c) {
  const header = `#!/usr/bin/env python3
# Solana Bot -- generated by Solana Bot Board
# Jupiter v6 swap API

import os, sys, time, json, asyncio, threading, logging, base64
from datetime import datetime
from dotenv import load_dotenv
import requests
import websockets
from solders.keypair import Keypair
from solders.transaction import VersionedTransaction

load_dotenv()

PRIVATE_KEY   = os.getenv('PRIVATEKEY', '')
CASHOUT_ADDR  = os.getenv('CASHOUTADDR', '')
RPC_URL       = os.getenv('RPCURL', 'https://api.mainnet-beta.solana.com')
INPUT_MINT    = os.getenv('INPUT_MINT', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
DRY_RUN       = os.getenv('DRYRUN', 'true').lower() == 'true'
WS_PORT       = int(os.getenv('WS_PORT') or '8080')

os.makedirs('logs', exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(message)s',
    datefmt='%H:%M:%S',
    handlers=[logging.StreamHandler(), logging.FileHandler('logs/bot.log')],
)

paused  = False
stopped = False
clients = set()
stats   = {'trades': 0, 'pnl': 0.0, 'start': time.time()}
loop    = None

def log(msg):
    logging.info(msg)
    broadcast('[' + datetime.now().strftime('%H:%M:%S') + '] ' + msg)

def broadcast(msg):
    payload = json.dumps({'type': 'log', 'msg': msg + '\\r\\n'})
    dead = set()
    for ws in clients:
        try:
            asyncio.run_coroutine_threadsafe(ws.send(payload), loop)
        except Exception:
            dead.add(ws)
    clients.difference_update(dead)

JUPITER_QUOTE = 'https://quote-api.jup.ag/v6/quote'
JUPITER_SWAP  = 'https://quote-api.jup.ag/v6/swap'
JUPITER_PRICE = 'https://api.jup.ag/price/v2'

def get_quote(input_mint, output_mint, amount_lamports, slippage_bps=50):
    r = requests.get(JUPITER_QUOTE, params={
        'inputMint': input_mint, 'outputMint': output_mint,
        'amount': amount_lamports, 'slippageBps': slippage_bps,
    }, timeout=10)
    r.raise_for_status()
    return r.json()

# Load keypair once from private key
def _load_keypair():
    try:
        import base58 as _b58
        secret = _b58.b58decode(PRIVATE_KEY)
        return Keypair.from_bytes(secret)
    except Exception as e:
        log('KEYPAIR ERROR: ' + str(e) + ' — check PRIVATEKEY in .env')
        return None

_keypair = None

def execute_swap(quote_response, user_public_key):
    global _keypair
    if DRY_RUN:
        log('[DRY] Would swap ' + str(quote_response.get('inputMint','?'))[:8] + '... -> ' + str(quote_response.get('outputMint','?'))[:8] + '...')
        return {'txid': 'dry-' + str(int(time.time()))}

    # 1. Get serialized transaction from Jupiter
    r = requests.post(JUPITER_SWAP, json={
        'quoteResponse':    quote_response,
        'userPublicKey':    user_public_key,
        'wrapAndUnwrapSol': True,
        'dynamicComputeUnitLimit': True,
        'prioritizationFeeLamports': 1000,
    }, timeout=15)
    r.raise_for_status()
    swap_data = r.json()
    swap_tx_b64 = swap_data.get('swapTransaction', '')
    if not swap_tx_b64:
        log('[SWAP] No swapTransaction in response')
        return swap_data

    # 2. Deserialize, sign, reserialize
    if not _keypair:
        _keypair = _load_keypair()
    if not _keypair:
        return {}

    raw_tx  = base64.b64decode(swap_tx_b64)
    tx      = VersionedTransaction.from_bytes(raw_tx)
    signed  = VersionedTransaction(tx.message, [_keypair])
    signed_b64 = base64.b64encode(bytes(signed)).decode('utf-8')

    # 3. Send via RPC sendTransaction
    rpc_resp = requests.post(RPC_URL, json={
        'jsonrpc': '2.0',
        'id': 1,
        'method': 'sendTransaction',
        'params': [signed_b64, {
            'encoding':             'base64',
            'skipPreflight':        False,
            'preflightCommitment':  'confirmed',
            'maxRetries':           3,
        }],
    }, timeout=30)
    rpc_data = rpc_resp.json()
    if 'error' in rpc_data:
        log('[SWAP ERROR] ' + str(rpc_data['error']))
        return {}
    txid = rpc_data.get('result', 'unknown')
    log('[SWAP] Sent: https://solscan.io/tx/' + txid)
    return {'txid': txid}

def get_price(mint):
    try:
        r = requests.get(JUPITER_PRICE, params={'ids': mint}, timeout=5)
        r.raise_for_status()
        return float(r.json().get('data', {}).get(mint, {}).get('price', 0) or 0)
    except Exception:
        return 0.0

async def ws_handler(websocket):
    clients.add(websocket)
    await websocket.send(json.dumps({'type': 'welcome', 'msg': '\\r\\n' + STRATEGY_NAME + ' connected\\r\\nType help\\r\\n> '}))
    try:
        async for message in websocket:
            handle_command(message.strip().lower(), websocket)
    except Exception:
        pass
    finally:
        clients.discard(websocket)

async def start_ws():
    async with websockets.serve(ws_handler, '0.0.0.0', WS_PORT):
        log('Terminal on ws://localhost:' + str(WS_PORT))
        await asyncio.Future()

def run_ws():
    global loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(start_ws())

threading.Thread(target=run_ws, daemon=True).start()
time.sleep(0.5)
`;

  const dca = `
STRATEGY_NAME = 'DCA Bot'
OUTPUT_MINT   = os.getenv('OUTPUTMINT',   'So11111111111111111111111111111111111111112')
BUY_AMOUNT    = float(os.getenv('BUYAMOUNT') or '${c.buyAmount||10}')
BUDGET_CAP    = float(os.getenv('BUDGETCAP') or '${c.budgetCap||100}')
STOP_LOSS_PCT = float(os.getenv('STOPLOSS') or '${c.stopLossPct||15}') / 100
SLIPPAGE_BPS  = int(os.getenv('SLIPPAGEBPS') or '${c.slippageBps||50}')
INTERVAL_MAP  = {'5m':300,'15m':900,'1h':3600,'4h':14400,'12h':43200,'1d':86400}
INTERVAL_S    = INTERVAL_MAP.get(os.getenv('INTERVAL', '${c.interval||"1h"}'), 3600)
total_spent = 0.0; avg_entry = 0.0; total_holdings = 0.0

def handle_command(cmd, ws):
    def s(m): asyncio.run_coroutine_threadsafe(ws.send(json.dumps({'type':'log','msg':m+'\\r\\n> '})), loop)
    global paused, stopped
    if cmd == 'help':     s('status | pause | resume | cashout | stop')
    elif cmd == 'status': s('DCA | Spent: $' + str(round(total_spent,2)) + '/$' + str(BUDGET_CAP) + ' | Trades: ' + str(stats['trades']) + ' | ' + ('PAUSED' if paused else 'RUNNING'))
    elif cmd == 'pause':  paused = True;  s('Paused.')
    elif cmd == 'resume': paused = False; s('Running.')
    elif cmd == 'stop':   stopped = True; s('Stopped.')
    elif cmd == 'cashout': s('Cashout -> ' + CASHOUT_ADDR)
    else: s('Unknown. Type help.')

def dca_buy():
    global total_spent, avg_entry, total_holdings
    if paused or stopped: return
    if total_spent >= BUDGET_CAP: log('Budget cap reached.'); return
    price = get_price(OUTPUT_MINT)
    if not price: log('Price fetch failed. Skipping.'); return
    lamports = int(BUY_AMOUNT * 1_000_000)
    log('DCA buy $' + str(BUY_AMOUNT) + ' @ $' + str(round(price,6)))
    quote = get_quote(INPUT_MINT, OUTPUT_MINT, lamports, SLIPPAGE_BPS)
    execute_swap(quote, os.getenv('BOTPOOLADDRESS',''))
    total_spent += BUY_AMOUNT; total_holdings += BUY_AMOUNT / price
    avg_entry = total_spent / total_holdings; stats['trades'] += 1
    log('Bought. Avg: $' + str(round(avg_entry,6)) + ' | Total: $' + str(round(total_spent,2)))

log('DCA Bot | Output: ' + OUTPUT_MINT[:8] + '... | $' + str(BUY_AMOUNT) + '/buy | DryRun: ' + str(DRY_RUN))
if DRY_RUN: log('DRY RUN - no real swaps')
while not stopped:
    try: dca_buy()
    except Exception as e: log('Error: ' + str(e))
    time.sleep(INTERVAL_S)
`;

  const copy = `
STRATEGY_NAME = 'Copy Bot'
TARGET_WALLET = os.getenv('TARGETWALLET', '')
POSITION_SIZE = float(os.getenv('POSITIONSIZE') or '${c.positionSize||20}')
POLL_S        = {'5s':5,'10s':10,'30s':30,'1m':60}.get(os.getenv('POLLINTERVAL','${c.pollInterval||"10s"}'), 10)
SLIPPAGE_BPS  = int(os.getenv('SLIPPAGEBPS') or '${c.slippageBps||100}')
MAX_POSITIONS = int(os.getenv('MAXPOSITIONS') or '${c.maxPositions||5}')
last_sig = None; open_positions = {}

def handle_command(cmd, ws):
    def s(m): asyncio.run_coroutine_threadsafe(ws.send(json.dumps({'type':'log','msg':m+'\\r\\n> '})), loop)
    global paused, stopped
    if cmd == 'help':     s('status | pause | resume | stop | cashout')
    elif cmd == 'status': s('Copy | Target: ' + TARGET_WALLET[:12] + '... | Open: ' + str(len(open_positions)) + '/' + str(MAX_POSITIONS) + ' | ' + ('PAUSED' if paused else 'RUNNING'))
    elif cmd == 'pause':  paused = True;  s('Paused.')
    elif cmd == 'resume': paused = False; s('Running.')
    elif cmd == 'stop':   stopped = True; s('Stopped.')
    elif cmd == 'cashout': s('Cashout -> ' + CASHOUT_ADDR)
    else: s('Unknown. Type help.')

def poll():
    global last_sig
    if paused or stopped or not TARGET_WALLET: return
    try:
        r = requests.post(RPC_URL, json={'jsonrpc':'2.0','id':1,'method':'getSignaturesForAddress','params':[TARGET_WALLET,{'limit':5}]}, timeout=10)
        sigs = r.json().get('result', [])
        if sigs:
            latest = sigs[0]['signature']
            if last_sig and latest != last_sig:
                log('New tx from target: ' + latest[:16] + '...')
            last_sig = latest
    except Exception as e: log('Poll error: ' + str(e))

if not TARGET_WALLET: log('WARNING: TARGETWALLET not set in .env')
log('Copy Bot | Target: ' + (TARGET_WALLET[:12] if TARGET_WALLET else 'NOT SET') + '... | DryRun: ' + str(DRY_RUN))
while not stopped:
    try: poll()
    except Exception as e: log('Error: ' + str(e))
    time.sleep(POLL_S)
`;

  const momentum = `
STRATEGY_NAME  = 'Momentum Bot'
THRESHOLD      = float(os.getenv('GAINTHRESHOLD') or '${c.gainThreshold||5}') / 100
SCAN_S         = {'1m':60,'5m':300,'15m':900,'1h':3600}.get(os.getenv('SCANINTERVAL','${c.scanInterval||"5m"}'), 300)
POSITION_SIZE  = float(os.getenv('POSITIONSIZE') or '${c.positionSize||25}')
TAKE_PROFIT    = float(os.getenv('TAKEPROFIT') or '${c.takeProfit||8}') / 100
STOP_LOSS      = float(os.getenv('STOPLOSS') or '${c.stopLoss||4}') / 100
SLIPPAGE_BPS   = int(os.getenv('SLIPPAGEBPS') or '${c.slippageBps||100}')
MAX_POSITIONS  = int(os.getenv('MAXPOSITIONS') or '${c.maxPositions||3}')
DAILY_LOSS_CAP = float(os.getenv('DAILYLOSSCAP') or '${c.dailyLossCap||50}')
WATCH_MINTS    = [x for x in os.getenv('WATCHMINTS','So11111111111111111111111111111111111111112,JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN').split(',') if x]
open_positions = {}; prev_prices = {}; daily_loss = 0.0

def handle_command(cmd, ws):
    def s(m): asyncio.run_coroutine_threadsafe(ws.send(json.dumps({'type':'log','msg':m+'\\r\\n> '})), loop)
    global paused, stopped
    if cmd == 'help':        s('status | positions | pause | resume | stop | cashout')
    elif cmd == 'status':    s('Momentum | Open: ' + str(len(open_positions)) + '/' + str(MAX_POSITIONS) + ' | PnL: $' + str(round(stats['pnl'],2)) + ' | ' + ('PAUSED' if paused else 'RUNNING'))
    elif cmd == 'positions': s(str(list(open_positions.keys())))
    elif cmd == 'pause':     paused = True;  s('Paused.')
    elif cmd == 'resume':    paused = False; s('Running.')
    elif cmd == 'stop':      stopped = True; s('Stopped.')
    elif cmd == 'cashout':   s('Cashout -> ' + CASHOUT_ADDR)
    else: s('Unknown. Type help.')

def scan():
    global daily_loss
    if paused or stopped or daily_loss >= DAILY_LOSS_CAP: return
    for mint in WATCH_MINTS:
        price = get_price(mint)
        if not price: continue
        prev = prev_prices.get(mint)
        if prev and mint not in open_positions and len(open_positions) < MAX_POSITIONS:
            move = (price - prev) / prev
            if move >= THRESHOLD:
                log('ENTRY: ' + mint[:8] + '... +' + str(round(move*100,2)) + '%')
                quote = get_quote(INPUT_MINT, mint, int(POSITION_SIZE*1_000_000), SLIPPAGE_BPS)
                execute_swap(quote, os.getenv('BOTPOOLADDRESS',''))
                open_positions[mint] = {'entry': price, 'size': POSITION_SIZE, 'opened': time.time()}
                stats['trades'] += 1
        if mint in open_positions:
            pos = open_positions[mint]
            pct = (price - pos['entry']) / pos['entry']
            if pct >= TAKE_PROFIT or pct <= -STOP_LOSS:
                tag = 'TP' if pct >= TAKE_PROFIT else 'SL'
                log(tag + ' EXIT: ' + mint[:8] + '... ' + ('+' if pct>=0 else '') + str(round(pct*100,2)) + '%')
                quote = get_quote(mint, INPUT_MINT, int((pos['size']/pos['entry'])*price*1_000_000), SLIPPAGE_BPS)
                execute_swap(quote, os.getenv('BOTPOOLADDRESS',''))
                pnl = pos['size'] * pct; stats['pnl'] += pnl
                if pnl < 0: daily_loss += abs(pnl)
                del open_positions[mint]
        prev_prices[mint] = price

log('Momentum | Threshold: ' + str(round(THRESHOLD*100,1)) + '% | $' + str(POSITION_SIZE) + '/pos | DryRun: ' + str(DRY_RUN))
while not stopped:
    try: scan()
    except Exception as e: log('Error: ' + str(e))
    time.sleep(SCAN_S)
`;

  const scalper = `
STRATEGY_NAME   = 'Scalper Bot'
THRESHOLD       = float(os.getenv('GAINTHRESHOLD') or '${c.gainThreshold||0.3}') / 100
SCAN_S          = {'10s':10,'30s':30,'1m':60,'2m':120}.get(os.getenv('SCANINTERVAL','${c.scanInterval||"30s"}'), 30)
POSITION_SIZE   = float(os.getenv('POSITIONSIZE') or '${c.positionSize||15}')
TAKE_PROFIT     = float(os.getenv('TAKEPROFIT') or '${c.takeProfit||0.5}') / 100
STOP_LOSS       = float(os.getenv('STOPLOSS') or '${c.stopLoss||0.3}') / 100
SLIPPAGE_BPS    = int(os.getenv('SLIPPAGEBPS') or '${c.slippageBps||30}')
MAX_POSITIONS   = int(os.getenv('MAXPOSITIONS') or '${c.maxPositions||5}')
DAILY_LOSS_CAP  = float(os.getenv('DAILYLOSSCAP') or '${c.dailyLossCap||30}')
DAILY_TRADE_CAP = int(os.getenv('DAILYTRADECAP') or '${c.dailyTradeCap||200}')
WATCH_MINTS     = [x for x in os.getenv('WATCHMINTS','So11111111111111111111111111111111111111112,JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN').split(',') if x]
open_positions = {}; prev_prices = {}; daily_loss = 0.0; daily_trades = 0

def handle_command(cmd, ws):
    def s(m): asyncio.run_coroutine_threadsafe(ws.send(json.dumps({'type':'log','msg':m+'\\r\\n> '})), loop)
    global paused, stopped
    if cmd == 'help':        s('status | positions | pause | resume | stop | cashout')
    elif cmd == 'status':    s('Scalper | Open: ' + str(len(open_positions)) + '/' + str(MAX_POSITIONS) + ' | Trades: ' + str(daily_trades) + '/' + str(DAILY_TRADE_CAP) + ' | PnL: $' + str(round(stats['pnl'],2)) + ' | ' + ('PAUSED' if paused else 'RUNNING'))
    elif cmd == 'positions': s(str(list(open_positions.keys())))
    elif cmd == 'pause':     paused = True;  s('Paused.')
    elif cmd == 'resume':    paused = False; s('Running.')
    elif cmd == 'stop':      stopped = True; s('Stopped.')
    elif cmd == 'cashout':   s('Cashout -> ' + CASHOUT_ADDR)
    else: s('Unknown. Type help.')

def scan():
    global daily_loss, daily_trades
    if paused or stopped or daily_loss >= DAILY_LOSS_CAP or daily_trades >= DAILY_TRADE_CAP: return
    for mint in WATCH_MINTS:
        price = get_price(mint)
        if not price: continue
        prev = prev_prices.get(mint)
        if prev and mint not in open_positions and len(open_positions) < MAX_POSITIONS:
            move = (price - prev) / prev
            if move >= THRESHOLD:
                log('SCALP ENTRY: ' + mint[:8] + '... +' + str(round(move*100,3)) + '%')
                quote = get_quote(INPUT_MINT, mint, int(POSITION_SIZE*1_000_000), SLIPPAGE_BPS)
                execute_swap(quote, os.getenv('BOTPOOLADDRESS',''))
                open_positions[mint] = {'entry': price, 'size': POSITION_SIZE, 'opened': time.time()}
                daily_trades += 1; stats['trades'] += 1
        if mint in open_positions:
            pos = open_positions[mint]
            pct = (price - pos['entry']) / pos['entry']
            age = time.time() - pos['opened']
            if pct >= TAKE_PROFIT or pct <= -STOP_LOSS or age > SCAN_S * 6:
                tag = 'TP' if pct >= TAKE_PROFIT else 'SL' if pct <= -STOP_LOSS else 'Timeout'
                log(tag + ' EXIT: ' + mint[:8] + '... ' + ('+' if pct>=0 else '') + str(round(pct*100,3)) + '%')
                quote = get_quote(mint, INPUT_MINT, int((pos['size']/pos['entry'])*price*1_000_000), SLIPPAGE_BPS)
                execute_swap(quote, os.getenv('BOTPOOLADDRESS',''))
                pnl = pos['size'] * pct; stats['pnl'] += pnl
                if pnl < 0: daily_loss += abs(pnl)
                del open_positions[mint]
        prev_prices[mint] = price

log('Scalper | Threshold: ' + str(round(THRESHOLD*100,2)) + '% | TP: ' + str(round(TAKE_PROFIT*100,2)) + '% | SL: ' + str(round(STOP_LOSS*100,2)) + '% | DryRun: ' + str(DRY_RUN))
if DRY_RUN: log('DRY RUN - no real swaps')
for m in WATCH_MINTS:
    p = get_price(m)
    if p: prev_prices[m] = p
log('Baseline set for ' + str(len(prev_prices)) + ' tokens.')
while not stopped:
    try: scan()
    except Exception as e: log('Error: ' + str(e))
    time.sleep(SCAN_S)
`;

  const map = { dca, copy, momentum, scalper };
  return header + (map[strategy] || '# Strategy not found');
}

// ─────────────────────────────────────────────────────────────────────────────
// XTERM TERMINAL
// ─────────────────────────────────────────────────────────────────────────────

function initTerminal() {
  term = new Terminal({
    cursorBlink: true,
    theme: {
      background: '#050508', foreground: '#E8E0FF',
      cursor: '#14F195', selection: 'rgba(20,241,149,0.25)',
      green: '#14F195', yellow: '#FFE135', red: '#FF3B3B',
      cyan: '#9945FF',
    },
    fontFamily: 'Courier New, monospace',
    fontSize: 13, lineHeight: 1.4, scrollback: 1000,
  });

  fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(document.getElementById('xterm-container'));
  fitAddon.fit();

  term.writeln('\x1b[32m◎ Solana Bot Board — Live Terminal\x1b[0m');
  term.writeln('\x1b[2mEnter your bot host:port above and click Connect\x1b[0m');
  term.writeln('');

  let buf = '';
  term.onKey(({ key, domEvent }) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (domEvent.keyCode === 13) { term.writeln(''); ws.send(buf); buf = ''; }
    else if (domEvent.keyCode === 8) { if (buf.length) { buf = buf.slice(0,-1); term.write('\b \b'); } }
    else { buf += key; term.write(key); }
  });

  window.addEventListener('resize', () => fitAddon?.fit());
}

function connectTerminal() {
  const host = document.getElementById('terminal-host').value.trim() || 'localhost:8080';
  if (ws) ws.close();
  if (!term) initTerminal();

  term.writeln('\x1b[2mConnecting to ws://' + host + '...\x1b[0m');
  ws = new WebSocket('ws://' + host);

  ws.onopen = () => {
    term.writeln('\x1b[32m✅ Connected\x1b[0m');
    document.getElementById('terminal-title').textContent = 'bot — ws://' + host;
    document.getElementById('btn-connect-term').style.display    = 'none';
    document.getElementById('btn-disconnect-term').style.display = 'inline';
  };
  ws.onmessage = e => {
    try { const d = JSON.parse(e.data); term.write(d.msg || ''); }
    catch(_) { term.write(e.data); }
  };
  ws.onerror = () => {
    term.writeln('\x1b[31m❌ Connection failed. Is the bot running?\x1b[0m');
    term.writeln('\x1b[2mRun: python3 bot.py\x1b[0m');
  };
  ws.onclose = () => {
    term.writeln('\x1b[2m— Disconnected —\x1b[0m');
    document.getElementById('terminal-title').textContent = 'bot — not connected';
    document.getElementById('btn-connect-term').style.display    = 'inline';
    document.getElementById('btn-disconnect-term').style.display = 'none';
    ws = null;
  };
}

function disconnectTerminal() {
  if (ws) { ws.close(); ws = null; }
}
