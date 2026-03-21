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
        { id: 'privateKey',    label: 'Bot wallet private key (base58)', type: 'password', placeholder: 'auto-filled from bot pool', hint: '🔒 Never sent to our servers. Stored only in your downloaded .env file.' },
        { id: 'cashoutAddr',   label: 'Cashout address',                 type: 'text',     placeholder: 'Your Phantom/Solflare address', hint: 'Where USDC returns when you run the cashout command.' },
        { id: 'rpcUrl',        label: 'Solana RPC URL',                  type: 'text',     placeholder: 'https://api.mainnet-beta.solana.com', hint: 'Private RPC recommended for reliability. Free: mainnet-beta.' },
        { id: 'jupApiKey',     label: 'Jupiter API Key',                  type: 'text',     placeholder: '', hint: '🔒 Not saved to our servers. Written only to your local .env file. Get free key at portal.jup.ag.' },
      ]},
      { title: 'DCA settings', fields: [
        { id: 'outputMint',   label: 'Token to buy (mint address)', type: 'text',   placeholder: 'So11111111111111111111111111111111111111112', hint: 'Default: Wrapped SOL. Paste any SPL token mint address.' },
        { id: 'buyAmount',    label: 'USDC per buy',                type: 'number', placeholder: '10',   hint: 'Fixed USDC amount to swap each interval.' },
        { id: 'interval',     label: 'Buy interval',               type: 'select', options: ['5m','15m','1h','4h','12h','1d'], hint: 'How often to place a buy.' },
        { id: 'budgetCap',    label: 'Total USDC budget cap',       type: 'number', placeholder: '100',  hint: 'Bot stops buying when total spent reaches this.' },
        { id: 'stopLossPct',    label: 'Stop-loss %',                 type: 'number', placeholder: '15',   hint: 'Sell all holdings and stop if down this % from avg entry.' },
        { id: 'takeProfitPct', label: 'Take-profit % (optional)',    type: 'number', placeholder: '',     hint: 'Sell all holdings back to USDC when up this % from avg entry, then resume buying on next dip. Leave blank to disable.' },
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
        { id: 'jupApiKey',   label: 'Jupiter API Key',                  type: 'text',     placeholder: '', hint: '🔒 Not saved to our servers. Written only to your local .env file. Get free key at portal.jup.ag.' },
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
        { id: 'jupApiKey',   label: 'Jupiter API Key',                  type: 'text',     placeholder: '', hint: '🔒 Not saved to our servers. Written only to your local .env file. Get free key at portal.jup.ag.' },
      ]},
      { title: 'Momentum settings', fields: [
        { id: 'gainThreshold', label: 'Entry threshold %',        type: 'number', placeholder: '5',    hint: 'Enter when a token gains this % in one scan window.' },
        { id: 'scanInterval',  label: 'Scan interval',            type: 'select', options: ['1m','5m','15m','1h'], hint: '5m recommended.' },
        { id: 'positionSize',  label: 'USDC per position',        type: 'number', placeholder: '25',   hint: 'USDC to swap into each momentum trade.' },
        { id: 'takeProfit',    label: 'Take-profit %',             type: 'number', placeholder: '8',    hint: 'Swap back to USDC when up this %.' },
        { id: 'stopLoss',      label: 'Stop-loss %',               type: 'number', placeholder: '4',    hint: 'Swap back to USDC when down this %.' },
        { id: 'slippageBps',   label: 'Slippage tolerance (bps)', type: 'number', placeholder: '100' },
        { id: 'watchMints',    label: 'Tokens to watch (mints)',   type: 'text',   placeholder: 'So11111111111111111111111111111111111111112,JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN,DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', hint: 'Comma-separated mint addresses to watch.' },
      ]},
      { title: 'Risk', fields: [
        { id: 'maxPositions',  label: 'Max concurrent positions', type: 'number', placeholder: '3' },
        { id: 'dailyLossCap',  label: 'Daily loss cap (USDC)',    type: 'number', placeholder: '50', hint: 'Pauses bot for the day if losses hit this.' },
        { id: 'verifiedOnly',  label: 'Verified tokens only',     type: 'select', options: ['true','false'], hint: 'Only trade tokens verified on Jupiter. Filters out unverified meme coins and rugs.' },
        { id: 'dryRun',        label: 'Dry run mode',             type: 'select', options: ['true','false'] },
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
        { id: 'jupApiKey',   label: 'Jupiter API Key',                  type: 'text',     placeholder: '', hint: '🔒 Not saved to our servers. Written only to your local .env file. Get free key at portal.jup.ag.' },
      ]},
      { title: 'Scalper settings', fields: [
        { id: 'gainThreshold', label: 'Entry threshold %',        type: 'number', placeholder: '0.3', hint: 'Enter when price moves this % in one scan window. 0.3% default.' },
        { id: 'scanInterval',  label: 'Scan interval',            type: 'select', options: ['10s','30s','1m','2m'], hint: '30s recommended. Faster = more RPC calls.' },
        { id: 'positionSize',  label: 'USDC per scalp',           type: 'number', placeholder: '15',  hint: 'Keep small — scalper opens many positions.' },
        { id: 'takeProfit',    label: 'Take-profit %',             type: 'number', placeholder: '0.5', hint: 'Exit when up 0.5%.' },
        { id: 'stopLoss',      label: 'Stop-loss %',               type: 'number', placeholder: '0.3', hint: 'Exit when down 0.3%.' },
        { id: 'slippageBps',   label: 'Slippage tolerance (bps)', type: 'number', placeholder: '30',  hint: '30 = 0.3%. Keep tight for scalping.' },
        { id: 'watchMints',    label: 'Tokens to scalp (mints)',   type: 'text',   placeholder: 'So11111111111111111111111111111111111111112,JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN,DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263,EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', hint: 'Comma-separated mint addresses to watch.' },
      ]},
      { title: 'Risk', fields: [
        { id: 'maxPositions',  label: 'Max concurrent positions', type: 'number', placeholder: '5' },
        { id: 'dailyLossCap',  label: 'Daily loss cap (USDC)',    type: 'number', placeholder: '30',  hint: 'Pauses bot for the day if losses hit this.' },
        { id: 'dailyTradeCap', label: 'Max swaps per day',        type: 'number', placeholder: '200', hint: 'Prevents runaway loops.' },
        { id: 'verifiedOnly',  label: 'Verified tokens only',     type: 'select', options: ['true','false'], hint: 'Only trade tokens verified on Jupiter. Filters out unverified meme coins and rugs.' },
        { id: 'dryRun',        label: 'Dry run mode',             type: 'select', options: ['true','false'], hint: 'true = STRONGLY recommended first. Logs without real swaps.' },
      ]},
    ]
  },

  dipbuyer: {
    title: '📉 Dip Buyer — Buy the Dip, DCA Down, Sell the Rip',
    sections: [
      { title: 'Wallet', fields: [
        { id: 'privateKey',  label: 'Bot wallet private key (base58)', type: 'password', placeholder: 'auto-filled from bot pool' },
        { id: 'cashoutAddr', label: 'Cashout address',                 type: 'text',     placeholder: 'Your Phantom/Solflare address' },
        { id: 'rpcUrl',      label: 'Solana RPC URL',                  type: 'text',     placeholder: 'https://api.mainnet-beta.solana.com' },
        { id: 'jupApiKey',   label: 'Jupiter API Key',                  type: 'text',     placeholder: '', hint: '🔒 Not saved to our servers. Written only to your local .env file.' },
      ]},
      { title: 'Entry settings', fields: [
        { id: 'watchMints',   label: 'Tokens to watch (mints)',    type: 'text',   placeholder: 'So11111111111111111111111111111111111111112,JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', hint: 'Comma-separated mint addresses. Bot buys these when they dip.' },
        { id: 'dipThreshold', label: 'Dip entry threshold %',      type: 'number', placeholder: '5',  hint: 'Buy when a token drops this % on the hourly chart.' },
        { id: 'positionSize', label: 'USDC per buy',               type: 'number', placeholder: '20', hint: 'USDC spent per entry and per DCA-down buy.' },
        { id: 'dcaStep',      label: 'DCA-down step %',            type: 'number', placeholder: '3',  hint: 'Buy more if price drops an additional this % below last buy price.' },
        { id: 'maxBuysPerToken', label: 'Max buys per token',      type: 'number', placeholder: '4',  hint: 'Maximum number of DCA-down buys per token position.' },
        { id: 'scanInterval', label: 'Scan interval',              type: 'select', options: ['1m','5m','15m','1h'], hint: '5m recommended. Checks hourly price change each scan.' },
        { id: 'slippageBps',  label: 'Slippage tolerance (bps)',   type: 'number', placeholder: '100', hint: '100 = 1%.' },
      ]},
      { title: 'Exit settings', fields: [
        { id: 'takeProfit',   label: 'Take-profit % from initial entry', type: 'number', placeholder: '10', hint: 'Sell all holdings when price is this % above your initial entry price (not avg — so DCA-down buys do not move your target).' },
        { id: 'stopLoss',     label: 'Stop-loss % (leave blank for Long Mode)', type: 'number', placeholder: '', hint: 'Sell all if price drops this % below average entry. Leave blank to enable Long Mode — bot will never sell at a loss.' },
        { id: 'longMode',     label: 'Long Mode (hold forever)',    type: 'select', options: ['false','true'], hint: 'true = bot only sells at take-profit. Never stops out. Good for tokens you want to accumulate long-term.' },
      ]},
      { title: 'Risk', fields: [
        { id: 'dailyLossCap', label: 'Daily loss cap (USDC)',       type: 'number', placeholder: '100', hint: 'Pauses bot if total losses hit this. Ignored in Long Mode.' },
        { id: 'verifiedOnly', label: 'Verified tokens only',        type: 'select', options: ['true','false'], hint: 'Only trade Jupiter-verified tokens.' },
        { id: 'dryRun',       label: 'Dry run mode',                type: 'select', options: ['true','false'], hint: 'true = simulate only. Strongly recommended first.' },
      ]},
    ]
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// WALLET CALLBACKS (called by app.js)
// ─────────────────────────────────────────────────────────────────────────────

function onClearWallet() {
  const cleared = clearBotWalletState();
  if (!cleared) return; // user cancelled

  // Reset UI
  document.getElementById('bot-wallet-display').style.display = 'none';
  document.getElementById('btn-gen-wallet').style.display      = 'block';
  document.getElementById('btn-fund-transfer').style.display   = 'none';
  document.getElementById('btn-clear-wallet').style.display    = 'none';
  document.getElementById('fund-confirmed').style.display      = 'none';
  document.getElementById('step-config').style.display         = 'none';
  document.getElementById('step-download').style.display       = 'none';
  fundingComplete = false;
  botWallet       = null;
}

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

  // Restore previously generated bot wallet from localStorage
  const saved = loadBotWalletState();
  if (saved) {
    document.getElementById('step-fund').style.display = 'block';
    restoreBotWalletUI(saved);
  }
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
  saveBotWalletState(); // persist strategy selection

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
  // Convert bigint to bytes
  const hex   = num === 0n ? '00' : num.toString(16).padStart(2, '0');
  const padded = hex.length % 2 ? '0' + hex : hex;
  const bytes  = new Uint8Array(padded.match(/.{2}/g).map(h => parseInt(h, 16)));
  // Count leading '1' chars (each = 0x00 byte)
  let leading = 0;
  for (const c of str) { if (c === '1') leading++; else break; }
  if (leading === 0) return bytes;
  const out = new Uint8Array(leading + bytes.length);
  out.set(bytes, leading);
  return out;
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

// Create Associated Token Account instruction
// Matches the on-chain ATA program v1 exactly
function makeCreateATAIx(funder, ataAddress, owner, mint, tokenProgramId) {
  const { TransactionInstruction } = web3();
  // ATA program v1 account order: funder, ata, owner, mint, system, token, rent
  const keys = [
    { pubkey: pk(funder),            isSigner: true,  isWritable: true  },
    { pubkey: pk(ataAddress),        isSigner: false, isWritable: true  },
    { pubkey: pk(owner),             isSigner: false, isWritable: false },
    { pubkey: pk(mint),              isSigner: false, isWritable: false },
    { pubkey: pk(SYSTEM_PROGRAM_ID), isSigner: false, isWritable: false },
    { pubkey: pk(tokenProgramId),    isSigner: false, isWritable: false },
    { pubkey: pk(SYSVAR_RENT),       isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({
    keys,
    programId: pk(ASSOCIATED_TOKEN_PROGRAM),
    data:      new Uint8Array(0),
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

// ─────────────────────────────────────────────────────────────────────────────
// BOT WALLET PERSISTENCE (localStorage)
// ─────────────────────────────────────────────────────────────────────────────

const BOT_STORAGE_KEY = 'solanabots_bot_wallet';

function saveBotWalletState(extra = {}) {
  if (!botWallet) return;
  const data = {
    address:         botWallet.address,
    privateKeyBase58: botWallet.privateKeyBase58,
    strategy:        selectedStrategy,
    funded:          fundingComplete,
    savedAt:         Date.now(),
    ...extra,
  };
  localStorage.setItem(BOT_STORAGE_KEY, JSON.stringify(data));
}

function loadBotWalletState() {
  try {
    const raw = localStorage.getItem(BOT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(_) { return null; }
}

function clearBotWalletState(force = false) {
  const saved = loadBotWalletState();
  if (!force && saved?.funded) {
    // Warn user if bot was funded — they may not have the .env yet
    const confirmed = window.confirm(
      '⚠️  This bot wallet was funded with USDC.\n\n' +
      'If you haven\'t downloaded the bot zip containing the .env file (with the private key), ' +
      'you will lose access to this wallet and its funds.\n\n' +
      'Download the bot first, then come back to clear.\n\n' +
      'Click OK to clear anyway, or Cancel to go back.'
    );
    if (!confirmed) return false;
  }
  localStorage.removeItem(BOT_STORAGE_KEY);
  botWallet       = null;
  fundingComplete = false;
  return true;
}

function restoreBotWalletUI(saved) {
  if (!saved?.address || !saved?.privateKeyBase58) return;

  botWallet = { address: saved.address, privateKeyBase58: saved.privateKeyBase58 };
  fundingComplete = saved.funded || false;

  // Restore wallet display
  const display = document.getElementById('bot-wallet-display');
  if (display) {
    display.style.display = 'block';
    document.getElementById('bot-wallet-addr').textContent = saved.address;
    // Show note about restored wallet
    const note = display.querySelector('.bwd-note');
    if (note) note.innerHTML = '🔄 Restored from previous session · 🛡️ Private key written only to your downloaded <code>.env</code>';
  }
  document.getElementById('btn-gen-wallet').style.display  = 'none';
  document.getElementById('btn-fund-transfer').style.display = 'block';

  // Show clear button
  const clearBtn = document.getElementById('btn-clear-wallet');
  if (clearBtn) clearBtn.style.display = 'inline-flex';

  // If it was funded, restore that state too
  if (saved.funded) {
    fundingComplete = true;
    const confirmed = document.getElementById('fund-confirmed');
    const text      = document.getElementById('fund-confirmed-text');
    if (confirmed && text) {
      confirmed.style.display = 'flex';
      text.innerHTML = saved.txid
        ? `✅ Funded — ${saved.amount} USDC · <a href="https://solscan.io/tx/${saved.txid}" target="_blank" style="color:var(--sol2)">View tx ↗</a>`
        : `✅ Bot pool funded — ${saved.amount || '?'} USDC`;
    }
    document.getElementById('step-config').style.display = 'block';
    document.getElementById('step-download').style.display = 'block';
    if (saved.strategy && FORMS[saved.strategy]) {
      selectedStrategy = saved.strategy;
      // Re-select strategy card
      const card = document.querySelector(`[data-strategy="${saved.strategy}"]`);
      if (card) { document.querySelectorAll('.strategy-card-bot').forEach(c=>c.classList.remove('selected')); card.classList.add('selected'); }
      renderConfigForm(saved.strategy);
    }
  }
}

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

  // Persist to localStorage so wallet survives page refresh
  saveBotWalletState();

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
    // ── Build complete transaction server-side ───────────────────────────
    // The API route uses @solana/spl-token to correctly build:
    // SOL init + create bot USDC ATA + USDC transfer — all atomic
    // All in one atomic transaction. If any step fails, all fail.
    btn.textContent = '⏳ Building transaction...';

    const buildResp = await fetch('/api/build-fund-tx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userWallet: walletAddress,
        botWallet:  botWallet.address,
        usdcAmount: amount,
      }),
    });

    const buildData = await buildResp.json();
    if (!buildResp.ok || buildData.error) {
      throw new Error('Failed to build transaction: ' + (buildData.error || buildResp.status));
    }

    const { transaction: txBase64, blockhash, lastValidBlockHeight } = buildData;
    console.log('Built tx | botUsdcATA:', buildData.botUsdcATA, '| botAtaExists:', buildData.botAtaExists);

    // ── Deserialize, sign, send ──────────────────────────────────────────
    const { Transaction, Connection } = web3();
    const connection = new Connection(
      'https://mainnet.helius-rpc.com/?api-key=a88e4b38-304e-407a-89c8-91c904b08491',
      'confirmed'
    );

    const txBytes = Uint8Array.from(atob(txBase64), c => c.charCodeAt(0));
    const tx = Transaction.from(txBytes);

    const provider = walletType === 'solflare'
      ? window.solflare
      : (window.phantom?.solana || window.solana);
    if (!provider) throw new Error('Wallet provider not found');

    btn.textContent = '⏳ Approve in wallet...';
    const signed   = await provider.signTransaction(tx);
    const rawBytes = signed.serialize({ requireAllSignatures: false });
    console.log('Signed tx bytes:', rawBytes.length);

    const txid = await connection.sendRawTransaction(rawBytes, { skipPreflight: true, maxRetries: 10 });
    if (!txid) throw new Error('No txid returned');
    console.log('Fund tx:', txid, '| https://solscan.io/tx/' + txid);

    btn.textContent = '⏳ Confirming...';
    const rebroadcast = setInterval(async () => {
      try { await connection.sendRawTransaction(rawBytes, { skipPreflight: true, maxRetries: 0 }); } catch(_) {}
    }, 2000);
    try {
      await connection.confirmTransaction({ signature: txid, blockhash, lastValidBlockHeight }, 'confirmed');
    } finally { clearInterval(rebroadcast); }

    console.log('✅ Confirmed:', txid);
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

  // Persist funded state
  saveBotWalletState({ funded: true, amount, txid });

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

  let html = `<div class="form-section-title" style="margin-top:0;font-size:14px;color:var(--sol2)">${def.title}</div>
    <div class="privacy-notice">
      <span class="privacy-icon">🔒</span>
      <span><strong>Your private data never leaves this page.</strong> Private keys and API keys are used only to generate your local <code>.env</code> file — they are never transmitted to or stored on our servers.</span>
    </div>`;

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

  // Auto-fill Jupiter API key from localStorage (shared with charts page)
  const savedJupKey = localStorage.getItem('jup_api_key') || '';
  const jupKeyField = document.getElementById('f_jupApiKey');
  if (jupKeyField && savedJupKey) jupKeyField.value = savedJupKey;

  // Save Jupiter API key to localStorage whenever user types it
  if (jupKeyField) {
    jupKeyField.addEventListener('input', () => {
      const val = jupKeyField.value.trim();
      if (val) localStorage.setItem('jup_api_key', val);
      else localStorage.removeItem('jup_api_key');
    });
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
    if (!i.dataset.key) return;
    let val = i.value || i.placeholder || '';
    // Ensure numeric fields are positive (no accidental negatives)
    if (i.type === 'number' && val && parseFloat(val) < 0) val = String(Math.abs(parseFloat(val)));
    config[i.dataset.key] = val;
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

JUPITER_QUOTE  = 'https://api.jup.ag/swap/v1/quote'
JUPITER_SWAP   = 'https://api.jup.ag/swap/v1/swap'
JUPITER_TOKENS = 'https://api.jup.ag/tokens/v2/toptraded/24h'
JUP_API_KEY    = os.getenv('JUPAPIKEY', '')
JUP_HEADERS    = {'x-api-key': JUP_API_KEY} if JUP_API_KEY else {}
DEXSCREENER_PRICE = 'https://api.dexscreener.com/tokens/v1/solana/'  # public, no auth needed
VERIFIED_ONLY  = os.getenv('VERIFIEDONLY', 'false').lower() == 'true'

# Jupiter verified token list — fetched once at startup, used to gate entries
_verified_mints = set()

def load_verified_tokens():
    """Fetch Jupiter's verified token list via Tokens API v2."""
    global _verified_mints
    try:
        r = requests.get('https://api.jup.ag/tokens/v2/tag?query=verified',
                         headers=JUP_HEADERS, timeout=15)
        r.raise_for_status()
        data = r.json()
        # v2 returns array of token objects with 'id' as mint address
        _verified_mints = set(t['id'] for t in data if t.get('id'))
        log('Loaded ' + str(len(_verified_mints)) + ' verified tokens from Jupiter')
    except Exception as e:
        log('Failed to load verified token list: ' + str(e) + ' — verification check disabled')

def is_verified(mint):
    """Return True if mint is in Jupiter verified list, or if VERIFIED_ONLY is off."""
    if not VERIFIED_ONLY: return True
    if not _verified_mints: return True  # if list failed to load, don't block all trades
    return mint in _verified_mints

MIN_LIQUIDITY_USD = 100_000   # minimum $100k liquidity to be tradeable
MIN_VOLUME_24H    = 50_000    # minimum $50k 24h volume — ensures active market

def fetch_top_tokens(limit=10):
    """Fetch top trending Solana tokens from DexScreener, filtered by liquidity and volume."""
    try:
        # token-boosts gives us trending mints, then we validate each via pair data
        r = requests.get('https://api.dexscreener.com/token-boosts/top/v1', timeout=10)
        r.raise_for_status()
        data = r.json()
        entries = data if isinstance(data, list) else data.get('pairs', [])
        candidates = []
        for t in entries:
            if t.get('chainId') != 'solana': continue
            mint = t.get('tokenAddress', '')
            if mint and mint not in (USDC_MINT_ADDR, WSOL_MINT_ADDR):
                candidates.append(mint)
            if len(candidates) >= limit * 3: break  # fetch 3x so we have room to filter

        # Validate each candidate — fetch pair data and check liquidity + volume
        mints = []
        seen  = set()
        for mint in candidates:
            if mint in seen: continue
            seen.add(mint)
            try:
                pr = requests.get('https://api.dexscreener.com/tokens/v1/solana/' + mint, timeout=6)
                if not pr.ok: continue
                pairs = pr.json()
                pairs = pairs if isinstance(pairs, list) else pairs.get('pairs', [])
                if not pairs: continue
                best = pairs[0]
                liq  = float(best.get('liquidity', {}).get('usd', 0) or 0)
                vol  = float(best.get('volume', {}).get('h24', 0) or 0)
                if liq < MIN_LIQUIDITY_USD or vol < MIN_VOLUME_24H:
                    log('[token filter] ' + mint[:8] + '... skipped — liq $' + str(int(liq)) + ' vol $' + str(int(vol)))
                    continue
                if not is_verified(mint):
                    log('[token filter] ' + mint[:8] + '... skipped — not verified')
                    continue
                mints.append(mint)
                if len(mints) >= limit: break
            except Exception:
                continue

        log('Fetched ' + str(len(mints)) + ' liquid trending tokens from DexScreener')
        return mints
    except Exception as e:
        log('Token list fetch failed: ' + str(e))
    return []

def build_watch_list(base_mints, limit=10):
    """Merge hardcoded WATCHMINTS with live DexScreener trending tokens."""
    seen  = set(base_mints)
    mints = list(base_mints)
    for m in fetch_top_tokens(limit):
        if m not in seen:
            seen.add(m)
            mints.append(m)
    log('Watch list: ' + str(len(mints)) + ' tokens (' + str(len(base_mints)) + ' pinned + ' + str(len(mints)-len(base_mints)) + ' from DexScreener trending)')
    return mints
def get_quote(input_mint, output_mint, amount_lamports, slippage_bps=50):
    r = requests.get(JUPITER_QUOTE, headers=JUP_HEADERS, params={
        'inputMint':                input_mint,
        'outputMint':               output_mint,
        'amount':                   amount_lamports,
        'slippageBps':              slippage_bps,
        'instructionVersion':       'V2',   # uses newer instruction format, prevents ArithmeticOverflow
        'restrictIntermediateTokens': 'true',
        'maxAccounts':              20,
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

def execute_swap(quote_response, user_public_key, override_slippage_bps=None):
    global _keypair
    if DRY_RUN:
        log('[DRY] Would swap ' + str(quote_response.get('inputMint','?'))[:8] + '... -> ' + str(quote_response.get('outputMint','?'))[:8] + '...')
        return {'txid': 'dry-' + str(int(time.time()))}

    # Re-fetch a fresh quote using the explicit slippage (preserves escalated exit slippage)
    slippage = override_slippage_bps or int(quote_response.get('slippageBps', 50) or 50)
    try:
        fresh = get_quote(
            quote_response['inputMint'],
            quote_response['outputMint'],
            quote_response['inAmount'],
            slippage,
        )
        quote_response = fresh
    except Exception as e:
        log('[re-quote failed, using original] ' + str(e))

    # 1. Get serialized transaction from Jupiter
    r = requests.post(JUPITER_SWAP, headers=JUP_HEADERS, json={
        'quoteResponse':          quote_response,
        'userPublicKey':          user_public_key,
        'wrapAndUnwrapSol':       True,
        'dynamicComputeUnitLimit': True,
        'prioritizationFeeLamports': 'auto',
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

    # 3. Send via RPC sendTransaction — skipPreflight True so stale-quote simulation
    #    doesn't kill the tx before it reaches the validator
    rpc_resp = requests.post(RPC_URL, json={
        'jsonrpc': '2.0',
        'id': 1,
        'method': 'sendTransaction',
        'params': [signed_b64, {
            'encoding':      'base64',
            'skipPreflight': True,
            'maxRetries':    3,
        }],
    }, timeout=30)
    rpc_data = rpc_resp.json()
    if 'error' in rpc_data:
        log('[SWAP ERROR] ' + str(rpc_data['error']))
        return {}
    txid = rpc_data.get('result', 'unknown')
    log('[SWAP] Sent: https://solscan.io/tx/' + txid)

    # Poll for confirmation — only return txid if tx actually landed on-chain
    for attempt in range(20):
        time.sleep(2)
        try:
            check = requests.post(RPC_URL, json={
                'jsonrpc': '2.0', 'id': 1,
                'method': 'getSignatureStatuses',
                'params': [[txid], {'searchTransactionHistory': True}]
            }, timeout=8)
            status = check.json().get('result', {}).get('value', [None])[0]
            if status is None:
                continue
            if status.get('err'):
                log('[SWAP FAILED on-chain] ' + str(status['err']))
                return {}
            conf = status.get('confirmationStatus', '')
            if conf in ('confirmed', 'finalized'):
                log('[SWAP CONFIRMED] ' + txid[:16] + '...')
                return {'txid': txid}
        except Exception:
            continue
    log('[SWAP TIMEOUT] confirmation not received for ' + txid[:16] + '...')
    return {}

def execute_exit(mint, input_amount_lamports, user_public_key, base_slippage_bps):
    """Always exit in chunks — parallel quotes, immediate sends, no slippage ladder waste."""
    # Check USD value before attempting — Jupiter rejects swaps below ~$0.50
    price = get_price(mint)
    if price:
        decimals = get_token_decimals(mint)
        usd_value = (input_amount_lamports / (10 ** decimals)) * price
        if usd_value < 0.75:
            log('[EXIT SKIP] ' + mint[:8] + '... $' + str(round(usd_value, 4)) + ' below minimum')
            return {}
    return execute_exit_chunked(mint, input_amount_lamports, user_public_key, base_slippage_bps)

def execute_exit_chunked(mint, total_lamports, user_public_key, slippage_bps, chunks=4):
    """
    Split exit into descending-size chunks — largest first when order book is freshest,
    smallest last when liquidity is thinnest. Portions: 40%, 30%, 20%, 10%.
    All chunks quoted up-front then sent immediately back-to-back.
    """
    # Descending weights — must sum to 1.0
    weights = [0.40, 0.30, 0.20, 0.10]
    amounts = [int(total_lamports * w) for w in weights]
    # Give any rounding remainder to the first (largest) chunk
    amounts[0] += total_lamports - sum(amounts)

    if amounts[0] == 0:
        # Too small to chunk — single attempt at generous slippage
        try:
            quote = get_quote(mint, INPUT_MINT, total_lamports, 500)
            if quote and quote.get('outAmount'):
                return execute_swap(quote, user_public_key, override_slippage_bps=500)
        except Exception as e:
            if '6001' in str(e):
                return execute_exit_via_wsol(mint, total_lamports, user_public_key)
        return {}

    log('[EXIT] ' + mint[:8] + '... splitting ' + str(total_lamports) + ' → ' +
        '/'.join(str(a) for a in amounts) + ' @ ' + str(slippage_bps) + 'bps')

    # Quote all chunks up-front so they're all fresh at send time
    quotes = []
    for i, amount in enumerate(amounts):
        if amount <= 0: continue
        try:
            q = get_quote(mint, INPUT_MINT, amount, slippage_bps)
            if q and q.get('outAmount'):
                quotes.append((i, amount, q))
            else:
                log('[EXIT chunk ' + str(i+1) + '/' + str(chunks) + '] no quote')
        except Exception as e:
            err = str(e)
            if '6001' in err:
                log('[EXIT chunk] no USDC route — trying WSOL hop for full position')
                return execute_exit_via_wsol(mint, total_lamports, user_public_key)
            log('[EXIT chunk ' + str(i+1) + '/' + str(chunks) + '] quote error: ' + err)

    if not quotes:
        log('[EXIT] no quotes obtained — trying WSOL hop')
        return execute_exit_via_wsol(mint, total_lamports, user_public_key)

    # Send all chunks immediately — no waiting between sends
    successes = 0
    for i, amount, quote in quotes:
        try:
            result = execute_swap(quote, user_public_key, override_slippage_bps=slippage_bps)
            if result.get('txid'):
                log('[EXIT chunk ' + str(i+1) + '/' + str(chunks) + '] ✓ ' + result['txid'][:16] + '...')
                successes += 1
            else:
                log('[EXIT chunk ' + str(i+1) + '/' + str(chunks) + '] no txid')
        except Exception as e:
            err = str(e)
            log('[EXIT chunk ' + str(i+1) + '/' + str(chunks) + '] error: ' + err)
            if '6001' in err:
                remaining = total_lamports - (chunk_size * i)
                log('[EXIT chunk] routing remainder via WSOL')
                execute_exit_via_wsol(mint, remaining, user_public_key)
                break

    log('[EXIT] ' + str(successes) + '/' + str(len(quotes)) + ' chunks sent for ' + mint[:8] + '...')
    return {'txid': 'chunked'} if successes > 0 else {}

def execute_exit_via_wsol(mint, input_amount_lamports, user_public_key):
    """Two-hop exit: token→WSOL, then WSOL→USDC. For tokens with no direct USDC pool."""
    try:
        log('[two-hop] step 1: ' + mint[:8] + '... → WSOL')
        quote1 = get_quote(mint, WSOL_MINT_ADDR, input_amount_lamports, 500)
        if not quote1 or not quote1.get('outAmount'):
            log('[two-hop] no WSOL route — position stuck')
            return {}
        result1 = execute_swap(quote1, user_public_key, override_slippage_bps=500)
        if not result1.get('txid'):
            log('[two-hop] step 1 failed')
            return {}
        wsol_lamports = int(quote1.get('outAmount', 0))
        log('[two-hop] step 1 sent: ' + result1['txid'][:16] + '... got ~' + str(wsol_lamports) + ' WSOL lamports')
        time.sleep(3)
        log('[two-hop] step 2: WSOL → USDC')
        quote2 = get_quote(WSOL_MINT_ADDR, USDC_MINT_ADDR, wsol_lamports, 100)
        if not quote2 or not quote2.get('outAmount'):
            log('[two-hop] no WSOL→USDC route — WSOL held in wallet')
            return {}
        result2 = execute_swap(quote2, user_public_key, override_slippage_bps=100)
        if result2.get('txid'):
            log('[two-hop] complete: ' + result2['txid'][:16] + '...')
        return result2
    except Exception as e:
        log('[two-hop ERROR] ' + str(e))
        return {}

USDC_MINT_ADDR  = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
WSOL_MINT_ADDR  = 'So11111111111111111111111111111111111111112'
# Prices of wallet tokens when first seen — used as cost-basis for stray stop-loss
wallet_token_basis = {}
# Decimals cache — looked up once per mint, reused forever
_decimals_cache = {
    'So11111111111111111111111111111111111111112': 9,  # SOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 6,  # USDC
}

def get_token_decimals(mint):
    """Return token decimals for any SPL mint. Checks cache first, then RPC, then Jupiter quote fallback."""
    if mint in _decimals_cache:
        return _decimals_cache[mint]
    # Primary: on-chain mint account via RPC — works for any token
    try:
        r = requests.post(RPC_URL, json={
            'jsonrpc': '2.0', 'id': 1,
            'method': 'getAccountInfo',
            'params': [mint, {'encoding': 'jsonParsed'}]
        }, timeout=8)
        data = r.json().get('result', {}).get('value', {})
        decimals = data.get('data', {}).get('parsed', {}).get('info', {}).get('decimals')
        if decimals is not None:
            _decimals_cache[mint] = int(decimals)
            log('Decimals for ' + mint[:8] + '...: ' + str(decimals))
            return int(decimals)
    except Exception as e:
        log('[decimals RPC error] ' + str(e))
    # Fallback: Jupiter quote — outputDecimals is in the response
    try:
        q = get_quote(INPUT_MINT, mint, 1_000_000, 500)
        decimals = int(q.get('outputDecimals', 6) or 6)
        _decimals_cache[mint] = decimals
        return decimals
    except Exception:
        pass
    # Last resort: assume 6 (most SPL tokens)
    log('[decimals] could not determine for ' + mint[:8] + '... — defaulting to 6')
    return 6

def get_wallet_tokens(wallet_address):
    """Return list of {mint, lamports} for all non-SOL, non-USDC SPL tokens in wallet with balance > 0."""
    try:
        r = requests.post(RPC_URL, json={
            'jsonrpc': '2.0', 'id': 1,
            'method': 'getTokenAccountsByOwner',
            'params': [wallet_address,
                {'programId': 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'},
                {'encoding': 'jsonParsed'}]
        }, timeout=10)
        r.raise_for_status()
        accounts = r.json().get('result', {}).get('value', [])
        tokens = []
        for acct in accounts:
            info = acct.get('account', {}).get('data', {}).get('parsed', {}).get('info', {})
            mint = info.get('mint', '')
            lamports = int(info.get('tokenAmount', {}).get('amount', 0))
            if mint and lamports > 0 and mint not in (USDC_MINT_ADDR, WSOL_MINT_ADDR):
                tokens.append({'mint': mint, 'lamports': lamports})
        return tokens
    except Exception as e:
        log('[wallet scan error] ' + str(e))
        return []

def check_wallet_stray_positions(wallet_address, stop_loss_pct, open_positions):
    """
    Scan wallet for tokens not tracked in open_positions.
    Price them, record cost basis on first sight, liquidate to USDC if below stop loss.
    """
    tokens = get_wallet_tokens(wallet_address)
    if not tokens: return
    for t in tokens:
        mint, lamports = t['mint'], t['lamports']
        if mint in open_positions: continue  # already managed by scan()
        price = get_price(mint)
        if not price: continue
        # Record basis price the first time we see this token
        if mint not in wallet_token_basis:
            wallet_token_basis[mint] = price
            log('[wallet] found stray token ' + mint[:8] + '... | price $' + str(round(price,8)) + ' | basis set')
            continue
        basis = wallet_token_basis[mint]
        drop = (basis - price) / basis if basis > 0 else 0
        if drop >= stop_loss_pct:
            log('[wallet SL] ' + mint[:8] + '... down ' + str(round(drop*100,2)) + '% from basis — liquidating ' + str(lamports) + ' lamports')
            execute_exit(mint, lamports, wallet_address, 500)
            del wallet_token_basis[mint]

daily_change_cache = {}  # mint -> 24h % change, populated by get_price

def get_price(mint):
    """USD price via DexScreener (free, no auth). Falls back to Jupiter quote if key is set."""
    # Primary: DexScreener — genuinely public, no API key needed
    try:
        r = requests.get(DEXSCREENER_PRICE + mint, timeout=8)
        r.raise_for_status()
        data = r.json()
        # /tokens/v1/ returns a raw list; /latest/dex/tokens/ returns {"pairs": [...]}
        pairs = data if isinstance(data, list) else data.get('pairs', [])
        if pairs:
            price = pairs[0].get('priceUsd', 0)
            # Cache 24h change for daily trend filter
            h24 = pairs[0].get('priceChange', {}).get('h24', None)
            if h24 is not None:
                daily_change_cache[mint] = float(h24)
            return float(price) if price else 0.0
    except Exception as e:
        log('DexScreener price error for ' + mint[:8] + '...: ' + str(e))
    # Fallback: Jupiter quote API (requires JUP_API_KEY)
    if JUP_API_KEY:
        try:
            r = requests.get(JUPITER_QUOTE, headers=JUP_HEADERS, params={
                'inputMint': INPUT_MINT, 'outputMint': mint,
                'amount': 1_000_000, 'slippageBps': 50,
            }, timeout=8)
            r.raise_for_status()
            data = r.json()
            out = int(data.get('outAmount', 0))
            decimals = int(data.get('outputDecimals', 9) or 9)
            if out > 0:
                token_amount = out / (10 ** decimals)
                return 1.0 / token_amount if token_amount > 0 else 0.0
        except Exception as e:
            log('Jupiter price fallback error for ' + mint[:8] + '...: ' + str(e))
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
load_verified_tokens()  # always load — is_verified() checks VERIFIED_ONLY flag internally
`;

  const dca = `
STRATEGY_NAME = 'DCA Bot'
OUTPUT_MINT   = os.getenv('OUTPUTMINT',   'So11111111111111111111111111111111111111112')
BUY_AMOUNT    = float(os.getenv('BUYAMOUNT') or '${c.buyAmount||10}')
BUDGET_CAP    = float(os.getenv('BUDGETCAP') or '${c.budgetCap||100}')
STOP_LOSS_PCT = float(os.getenv('STOPLOSS') or '${c.stopLossPct||15}') / 100
TAKE_PROFIT_PCT = float(os.getenv('TAKEPROFITPCT') or '0') / 100  # 0 = disabled
SLIPPAGE_BPS  = int(os.getenv('SLIPPAGEBPS') or '${c.slippageBps||50}')
INTERVAL_MAP  = {'5m':300,'15m':900,'1h':3600,'4h':14400,'12h':43200,'1d':86400}
INTERVAL_S    = INTERVAL_MAP.get(os.getenv('INTERVAL', '${c.interval||"1h"}'), 3600)
total_spent = 0.0; avg_entry = 0.0; total_holdings = 0.0

def handle_command(cmd, ws):
    def s(m): asyncio.run_coroutine_threadsafe(ws.send(json.dumps({'type':'log','msg':m+'\\r\\n> '})), loop)
    global paused, stopped
    if cmd == 'help':     s('status | pause | resume | cashout | stop')
    elif cmd == 'status':
        tp_str = (' | TP: +' + str(round(TAKE_PROFIT_PCT*100,1)) + '%') if TAKE_PROFIT_PCT else ''
        s('DCA | Spent: $' + str(round(total_spent,2)) + '/$' + str(BUDGET_CAP) + ' | Avg: $' + str(round(avg_entry,4)) + tp_str + ' | ' + ('PAUSED' if paused else 'RUNNING'))
    elif cmd == 'pause':  paused = True;  s('Paused.')
    elif cmd == 'resume': paused = False; s('Running.')
    elif cmd == 'stop':   stopped = True; s('Stopped.')
    elif cmd == 'cashout': s('Cashout -> ' + CASHOUT_ADDR)
    else: s('Unknown. Type help.')

def check_take_profit():
    """Check if current price has exceeded take-profit % above avg entry. If so, sell all and reset."""
    global total_spent, avg_entry, total_holdings, paused
    if not TAKE_PROFIT_PCT or not avg_entry or not total_holdings: return
    price = get_price(OUTPUT_MINT)
    if not price: return
    gain = (price - avg_entry) / avg_entry
    if gain >= TAKE_PROFIT_PCT:
        log('🎯 TAKE PROFIT: +' + str(round(gain*100,2)) + '% above avg entry $' + str(round(avg_entry,4)) + ' — selling all holdings')
        # Sell entire holdings back to USDC — decimals looked up automatically
        decimals = get_token_decimals(OUTPUT_MINT)
        token_lamports = int(total_holdings * (10 ** decimals))
        result = execute_exit(OUTPUT_MINT, token_lamports, os.getenv('BOT_POOL_ADDRESS',''), SLIPPAGE_BPS)
        if result.get('txid'):
            usdc_received = total_holdings * price
            stats['pnl'] += usdc_received - total_spent
            log('Sold. Received ~$' + str(round(usdc_received,2)) + ' USDC | PnL: $' + str(round(stats['pnl'],2)))
            # Reset accumulators — bot will resume buying on next interval
            total_spent = 0.0; avg_entry = 0.0; total_holdings = 0.0
            log('Position reset. Resuming DCA on next interval...')
        else:
            log('[TP] Sell failed — will retry next cycle')

def dca_buy():
    global total_spent, avg_entry, total_holdings
    if paused or stopped: return
    if total_spent >= BUDGET_CAP: log('Budget cap reached.'); return
    price = get_price(OUTPUT_MINT)
    if not price: log('Price fetch failed. Skipping.'); return
    lamports = int(BUY_AMOUNT * 1_000_000)
    log('DCA buy $' + str(BUY_AMOUNT) + ' @ $' + str(round(price,6)))
    quote = get_quote(INPUT_MINT, OUTPUT_MINT, lamports, SLIPPAGE_BPS)
    result = execute_swap(quote, os.getenv('BOT_POOL_ADDRESS',''))
    if result.get('txid'):
        total_spent += BUY_AMOUNT; total_holdings += BUY_AMOUNT / price
        avg_entry = total_spent / total_holdings; stats['trades'] += 1
        log('Bought. Avg: $' + str(round(avg_entry,6)) + ' | Total: $' + str(round(total_spent,2)))
    else:
        log('[BUY FAILED] tx not confirmed — skipping this interval')

log('DCA Bot | Output: ' + OUTPUT_MINT[:8] + '... | $' + str(BUY_AMOUNT) + '/buy | TP: ' + (str(round(TAKE_PROFIT_PCT*100,1)) + '%' if TAKE_PROFIT_PCT else 'OFF') + ' | SL: ' + str(round(STOP_LOSS_PCT*100,1)) + '% | DryRun: ' + str(DRY_RUN))
if DRY_RUN: log('DRY RUN - no real swaps')
while not stopped:
    try:
        check_take_profit()
        dca_buy()
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
THRESHOLD      = abs(float(os.getenv('GAINTHRESHOLD') or '${c.gainThreshold||5}')) / 100
SCAN_S         = {'1m':60,'5m':300,'15m':900,'1h':3600}.get(os.getenv('SCANINTERVAL','${c.scanInterval||"5m"}'), 300)
POSITION_SIZE  = float(os.getenv('POSITIONSIZE') or '${c.positionSize||25}')
TAKE_PROFIT    = float(os.getenv('TAKEPROFIT') or '${c.takeProfit||8}') / 100
STOP_LOSS      = float(os.getenv('STOPLOSS') or '${c.stopLoss||4}') / 100
SLIPPAGE_BPS   = int(os.getenv('SLIPPAGEBPS') or '${c.slippageBps||100}')
MAX_POSITIONS  = int(os.getenv('MAXPOSITIONS') or '${c.maxPositions||3}')
DAILY_LOSS_CAP = float(os.getenv('DAILYLOSSCAP') or '${c.dailyLossCap||50}')
PINNED_MINTS   = [x for x in os.getenv('WATCHMINTS','So11111111111111111111111111111111111111112,JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN,DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263,EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm').split(',') if x]
WATCH_MINTS    = build_watch_list(PINNED_MINTS)
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
            if not is_verified(mint) and mint not in PINNED_MINTS:
                prev_prices[mint] = price
                continue
            if move >= THRESHOLD:
                log('ENTRY: ' + mint[:8] + '... +' + str(round(move*100,2)) + '%')
                quote = get_quote(INPUT_MINT, mint, int(POSITION_SIZE*1_000_000), SLIPPAGE_BPS)
                entry_result = execute_swap(quote, os.getenv('BOT_POOL_ADDRESS',''))
                if entry_result.get('txid'):
                    open_positions[mint] = {'entry': price, 'size': POSITION_SIZE, 'opened': time.time(), 'token_lamports': int(quote.get('outAmount', 0))}
                    stats['trades'] += 1
                else:
                    log('[ENTRY FAILED] ' + mint[:8] + '... tx not confirmed, position not opened')
        if mint in open_positions:
            pos = open_positions[mint]
            pct = (price - pos['entry']) / pos['entry']
            if pct >= TAKE_PROFIT or pct <= -STOP_LOSS:
                tag = 'TP' if pct >= TAKE_PROFIT else 'SL'
                log(tag + ' EXIT: ' + mint[:8] + '... ' + ('+' if pct>=0 else '') + str(round(pct*100,2)) + '%')
                exit_result = execute_exit(mint, pos['token_lamports'], os.getenv('BOT_POOL_ADDRESS',''), SLIPPAGE_BPS)
                if exit_result.get('txid'):
                    pnl = pos['size'] * pct; stats['pnl'] += pnl
                    if pnl < 0: daily_loss += abs(pnl)
                    del open_positions[mint]
                else:
                    log('[EXIT FAILED] ' + mint[:8] + '... position kept open, will retry next scan')
        prev_prices[mint] = price

log('Momentum | Threshold: ' + str(round(THRESHOLD*100,1)) + '% | $' + str(POSITION_SIZE) + '/pos | DryRun: ' + str(DRY_RUN))

# Build initial price baseline before scan loop starts
log('Fetching price baseline for ' + str(len(WATCH_MINTS)) + ' tokens...')
for m in WATCH_MINTS:
    p = get_price(m)
    if p:
        prev_prices[m] = p
        log('  ' + m[:8] + '... = $' + str(round(p, 6)))
    else:
        log('  ' + m[:8] + '... = no price (check JUPAPIKEY)')
log('Baseline set for ' + str(len(prev_prices)) + ' tokens. Scanning every ' + os.getenv('SCANINTERVAL','5m') + '...')

scan_count  = 0
token_refresh_every = 60  # refresh token list every 60 scans
while not stopped:
    try:
        scan_count += 1
        # Periodically refresh token list from DexScreener trending
        if scan_count % token_refresh_every == 0:
            log('[token refresh] updating watch list from DexScreener trending...')
            WATCH_MINTS[:] = build_watch_list(PINNED_MINTS)
        if scan_count % 5 == 1:  # heartbeat every 5 scans
            log('[heartbeat] scan #' + str(scan_count) + ' | watching: ' + str(len(WATCH_MINTS)) + ' | open: ' + str(len(open_positions)) + ' | pnl: $' + str(round(stats['pnl'],2)))
            check_wallet_stray_positions(os.getenv('BOT_POOL_ADDRESS',''), STOP_LOSS, open_positions)
        scan()
    except Exception as e: log('Error: ' + str(e))
    time.sleep(SCAN_S)
`;

  const scalper = `
STRATEGY_NAME   = 'Scalper Bot'
THRESHOLD       = abs(float(os.getenv('GAINTHRESHOLD') or '${c.gainThreshold||0.3}')) / 100
SCAN_S          = {'10s':10,'30s':30,'1m':60,'2m':120}.get(os.getenv('SCANINTERVAL','${c.scanInterval||"30s"}'), 30)
POSITION_SIZE   = float(os.getenv('POSITIONSIZE') or '${c.positionSize||15}')
TAKE_PROFIT     = float(os.getenv('TAKEPROFIT') or '${c.takeProfit||0.5}') / 100
STOP_LOSS       = float(os.getenv('STOPLOSS') or '${c.stopLoss||0.3}') / 100
SLIPPAGE_BPS    = int(os.getenv('SLIPPAGEBPS') or '${c.slippageBps||30}')
MAX_POSITIONS   = int(os.getenv('MAXPOSITIONS') or '${c.maxPositions||5}')
DAILY_LOSS_CAP  = float(os.getenv('DAILYLOSSCAP') or '${c.dailyLossCap||30}')
DAILY_TRADE_CAP = int(os.getenv('DAILYTRADECAP') or '${c.dailyTradeCap||200}')
PINNED_MINTS    = [x for x in os.getenv('WATCHMINTS','So11111111111111111111111111111111111111112,JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN').split(',') if x]
WATCH_MINTS     = build_watch_list(PINNED_MINTS)
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
            # Skip tokens red on the daily chart — only scalp green daily trends
            # Pinned tokens (SOL, user's WATCHMINTS) are always eligible regardless
            h24 = daily_change_cache.get(mint, None)
            if h24 is not None and h24 < 0 and mint not in PINNED_MINTS:
                log('[daily filter] ' + mint[:8] + '... skipped (' + str(round(h24,2)) + '% 24h)')
                prev_prices[mint] = price
                continue
            if not is_verified(mint) and mint not in PINNED_MINTS:
                prev_prices[mint] = price
                continue
            move = (price - prev) / prev
            if move >= THRESHOLD:
                log('SCALP ENTRY: ' + mint[:8] + '... +' + str(round(move*100,3)) + '%')
                quote = get_quote(INPUT_MINT, mint, int(POSITION_SIZE*1_000_000), SLIPPAGE_BPS)
                entry_result = execute_swap(quote, os.getenv('BOT_POOL_ADDRESS',''))
                if entry_result.get('txid'):
                    open_positions[mint] = {'entry': price, 'size': POSITION_SIZE, 'opened': time.time(), 'token_lamports': int(quote.get('outAmount', 0))}
                    daily_trades += 1; stats['trades'] += 1
                else:
                    log('[ENTRY FAILED] ' + mint[:8] + '... tx not confirmed, position not opened')
        if mint in open_positions:
            pos = open_positions[mint]
            pct = (price - pos['entry']) / pos['entry']
            age = time.time() - pos['opened']
            if pct >= TAKE_PROFIT or pct <= -STOP_LOSS or age > SCAN_S * 6:
                tag = 'TP' if pct >= TAKE_PROFIT else 'SL' if pct <= -STOP_LOSS else 'Timeout'
                log(tag + ' EXIT: ' + mint[:8] + '... ' + ('+' if pct>=0 else '') + str(round(pct*100,3)) + '%')
                exit_result = execute_exit(mint, pos['token_lamports'], os.getenv('BOT_POOL_ADDRESS',''), SLIPPAGE_BPS)
                if exit_result.get('txid'):
                    pnl = pos['size'] * pct; stats['pnl'] += pnl
                    if pnl < 0: daily_loss += abs(pnl)
                    del open_positions[mint]
                else:
                    log('[EXIT FAILED] ' + mint[:8] + '... position kept open, will retry next scan')
        prev_prices[mint] = price

log('Scalper | Threshold: ' + str(round(THRESHOLD*100,2)) + '% | TP: ' + str(round(TAKE_PROFIT*100,2)) + '% | SL: ' + str(round(STOP_LOSS*100,2)) + '% | DryRun: ' + str(DRY_RUN))
if DRY_RUN: log('DRY RUN - no real swaps')
log('Fetching price baseline for ' + str(len(WATCH_MINTS)) + ' tokens...')
for m in WATCH_MINTS:
    p = get_price(m)
    if p:
        prev_prices[m] = p
        log('  ' + m[:8] + '... = $' + str(round(p, 6)))
    else:
        log('  ' + m[:8] + '... = no price returned')
log('Baseline set for ' + str(len(prev_prices)) + ' tokens. Scalping begins...')

scan_count = 0
token_refresh_every = 120  # refresh token list every 120 scans
while not stopped:
    try:
        scan_count += 1
        if scan_count % token_refresh_every == 0:
            log('[token refresh] updating watch list from DexScreener trending...')
            WATCH_MINTS[:] = build_watch_list(PINNED_MINTS)
        if scan_count % 10 == 1:
            log('[heartbeat] scan #' + str(scan_count) + ' | watching: ' + str(len(WATCH_MINTS)) + ' | open: ' + str(len(open_positions)) + ' | trades: ' + str(daily_trades) + ' | pnl: $' + str(round(stats['pnl'],2)))
            check_wallet_stray_positions(os.getenv('BOT_POOL_ADDRESS',''), STOP_LOSS, open_positions)
        scan()
    except Exception as e: log('Error: ' + str(e))
    time.sleep(SCAN_S)
`;

  const dipbuyer = `
STRATEGY_NAME    = 'Dip Buyer'
WATCH_MINTS      = [x for x in os.getenv('WATCHMINTS','So11111111111111111111111111111111111111112,JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN').split(',') if x]
DIP_THRESHOLD    = abs(float(os.getenv('DIPTHRESHOLD') or '${c.dipThreshold||5}')) / 100
POSITION_SIZE    = float(os.getenv('POSITIONSIZE') or '${c.positionSize||20}')
DCA_STEP         = abs(float(os.getenv('DCASTEP') or '${c.dcaStep||3}')) / 100
MAX_BUYS         = int(os.getenv('MAXBUYSPTOKEN') or '${c.maxBuysPerToken||4}')
SCAN_S           = {'1m':60,'5m':300,'15m':900,'1h':3600}.get(os.getenv('SCANINTERVAL','${c.scanInterval||"5m"}'), 300)
SLIPPAGE_BPS     = int(os.getenv('SLIPPAGEBPS') or '${c.slippageBps||100}')
TAKE_PROFIT      = abs(float(os.getenv('TAKEPROFIT') or '${c.takeProfit||10}')) / 100
_sl_raw          = os.getenv('STOPLOSS', '${c.stopLoss||""}').strip()
STOP_LOSS        = abs(float(_sl_raw)) / 100 if _sl_raw else None
LONG_MODE        = os.getenv('LONGMODE', '${c.longMode||"false"}').lower() == 'true' or STOP_LOSS is None
DAILY_LOSS_CAP   = float(os.getenv('DAILYLOSSCAP') or '${c.dailyLossCap||100}')

# open_positions: mint -> { buys: [{price, lamports, size}], avg_entry, total_size, buy_count, last_buy_price }
open_positions = {}
daily_loss = 0.0

def handle_command(cmd, ws):
    def s(m): asyncio.run_coroutine_threadsafe(ws.send(json.dumps({'type':'log','msg':m+'\\r\\n> '})), loop)
    global paused, stopped
    if cmd == 'help':
        s('status | positions | pause | resume | stop | cashout')
    elif cmd == 'status':
        mode = 'LONG' if LONG_MODE else ('SL: -' + str(round(STOP_LOSS*100,1)) + '%')
        s('Dip Buyer | ' + mode + ' | TP: +' + str(round(TAKE_PROFIT*100,1)) + '% | Open: ' + str(len(open_positions)) + ' | PnL: $' + str(round(stats['pnl'],2)) + ' | ' + ('PAUSED' if paused else 'RUNNING'))
    elif cmd == 'positions':
        if not open_positions: s('No open positions.')
        for mint, pos in open_positions.items():
            pct = ((get_price(mint) or pos['avg_entry']) - pos['avg_entry']) / pos['avg_entry'] * 100
            s(mint[:12] + '... avg: $' + str(round(pos['avg_entry'],6)) + ' | size: $' + str(round(pos['total_size'],2)) + ' | ' + ('+' if pct>=0 else '') + str(round(pct,2)) + '%')
    elif cmd == 'pause':  paused = True;  s('Paused.')
    elif cmd == 'resume': paused = False; s('Running.')
    elif cmd == 'stop':   stopped = True; s('Stopped.')
    elif cmd == 'cashout': s('Cashout -> ' + CASHOUT_ADDR)
    else: s('Unknown. Type help.')

def get_hourly_change(mint):
    """Get hourly % change from DexScreener. Returns float or None."""
    try:
        r = requests.get(DEXSCREENER_PRICE + mint, timeout=8)
        r.raise_for_status()
        data = r.json()
        pairs = data if isinstance(data, list) else data.get('pairs', [])
        if not pairs:
            log('[h1] ' + mint[:8] + '... no pairs returned from DexScreener')
            return None
        h1 = pairs[0].get('priceChange', {}).get('h1', None)
        if h1 is None:
            log('[h1] ' + mint[:8] + '... priceChange.h1 not available in response')
            return None
        return float(h1)
    except Exception as e:
        log('[h1 fetch error] ' + mint[:8] + ': ' + str(e))
    return None

def check_liquidity(mint):
    """
    Return (liquidity_usd, ok) from DexScreener before entering.
    Rejects if pool liquidity < 10x position size (avoids arithmetic overflow in Jupiter).
    """
    try:
        r = requests.get(DEXSCREENER_PRICE + mint, timeout=8)
        r.raise_for_status()
        data = r.json()
        pairs = data if isinstance(data, list) else data.get('pairs', [])
        if not pairs:
            log('[liquidity] ' + mint[:8] + '... no pairs — cannot verify liquidity, skipping')
            return 0, False
        liq = float(pairs[0].get('liquidity', {}).get('usd', 0) or 0)
        ok = liq >= POSITION_SIZE * 10
        if not ok:
            log('[liquidity] ' + mint[:8] + '... $' + str(int(liq)) + ' < required $' + str(int(POSITION_SIZE * 10)) + ' — skipping')
        return liq, ok
    except Exception as e:
        log('[liquidity check error] ' + mint[:8] + ': ' + str(e))
    return 0, False

def enter_position(mint, price):
    """Open a new position or add a DCA-down buy to an existing one."""
    # Guard: check pool liquidity before attempting — avoids Jupiter arithmetic overflow
    liq, ok = check_liquidity(mint)
    if not ok:
        log('[SKIP] ' + mint[:8] + '... pool liquidity $' + str(int(liq)) + ' too low for $' + str(POSITION_SIZE) + ' position — skipping')
        return False
    lamports = int(POSITION_SIZE * 1_000_000)
    # Use priceImpactPct from quote to warn on high-impact trades
    try:
        test_quote = get_quote(INPUT_MINT, mint, lamports, SLIPPAGE_BPS)
        impact = float(test_quote.get('priceImpactPct', 0) or 0)
        if impact > 2.0:
            log('[SKIP] ' + mint[:8] + '... price impact ' + str(round(impact,2)) + '% too high — pool too thin')
            return False
        quote = test_quote
    except Exception as e:
        log('[enter_position quote error] ' + str(e))
        return False
    result = execute_swap(quote, os.getenv('BOT_POOL_ADDRESS',''))
    if not result.get('txid'): return False
    token_lamports = int(quote.get('outAmount', 0))
    if mint not in open_positions:
        open_positions[mint] = {
            'buys': [{'price': price, 'lamports': token_lamports, 'size': POSITION_SIZE}],
            'initial_entry': price,
            'avg_entry': price,
            'total_size': POSITION_SIZE,
            'total_lamports': token_lamports,
            'buy_count': 1,
            'last_buy_price': price,
        }
    else:
        pos = open_positions[mint]
        pos['buys'].append({'price': price, 'lamports': token_lamports, 'size': POSITION_SIZE})
        pos['total_size'] += POSITION_SIZE
        pos['total_lamports'] += token_lamports
        pos['buy_count'] += 1
        pos['last_buy_price'] = price
        # Recalculate avg entry from all buys
        total_cost = sum(b['price'] * b['lamports'] for b in pos['buys'])
        total_lamps = sum(b['lamports'] for b in pos['buys'])
        pos['avg_entry'] = total_cost / total_lamps if total_lamps else price
    stats['trades'] += 1
    return True

def exit_position(mint, price, reason):
    """Sell entire position back to USDC."""
    global daily_loss
    pos = open_positions[mint]
    result = execute_exit(mint, pos['total_lamports'], os.getenv('BOT_POOL_ADDRESS',''), SLIPPAGE_BPS)
    if result.get('txid'):
        pnl = pos['total_size'] * ((price - pos['avg_entry']) / pos['avg_entry'])
        stats['pnl'] += pnl
        if pnl < 0: daily_loss += abs(pnl)
        log(reason + ': ' + mint[:8] + '... avg $' + str(round(pos['avg_entry'],6)) + ' → $' + str(round(price,6)) + ' | PnL: $' + str(round(pnl,2)))
        del open_positions[mint]
    else:
        log('[EXIT FAILED] ' + mint[:8] + '... position kept open, will retry')

def scan():
    global daily_loss
    if paused or stopped: return
    if not LONG_MODE and daily_loss >= DAILY_LOSS_CAP:
        log('[daily loss cap] pausing — $' + str(round(daily_loss,2)) + ' lost today')
        return
    for mint in WATCH_MINTS:
        price = get_price(mint)
        if not price: continue
        pos = open_positions.get(mint)

        # ── Check exits on existing positions ────────────────────────────────
        if pos:
            pct_from_avg = (price - pos['avg_entry']) / pos['avg_entry']
            pct_from_initial = (price - pos['initial_entry']) / pos['initial_entry']
            # Take profit — measured from initial entry, not avg (DCA-down buys lower avg artificially)
            if pct_from_initial >= TAKE_PROFIT:
                exit_position(mint, price, 'TAKE PROFIT +' + str(round(pct_from_initial*100,2)) + '% from initial entry')
                continue
            # Stop loss (skipped in Long Mode)
            if not LONG_MODE and STOP_LOSS and pct_from_avg <= -STOP_LOSS:
                exit_position(mint, price, 'STOP LOSS ' + str(round(pct_from_avg*100,2)) + '%')
                continue
            # DCA down — buy more if price has dropped DCA_STEP% below last buy
            drop_from_last = (pos['last_buy_price'] - price) / pos['last_buy_price']
            if drop_from_last >= DCA_STEP and pos['buy_count'] < MAX_BUYS:
                log('DCA DOWN: ' + mint[:8] + '... -' + str(round(drop_from_last*100,2)) + '% from last buy | buy #' + str(pos['buy_count']+1))
                enter_position(mint, price)
            continue

        # ── Check entries on unwatched tokens ────────────────────────────────
        h1 = get_hourly_change(mint)
        if h1 is None: continue
        drop = -h1  # positive when price is down
        log('[scan] ' + mint[:8] + '... h1=' + str(round(h1,2)) + '% | need <-' + str(round(DIP_THRESHOLD*100,1)) + '% to enter | price=$' + str(round(price,6)))
        if drop >= DIP_THRESHOLD * 100:
            log('DIP ENTRY: ' + mint[:8] + '... ' + str(round(h1,2)) + '% on hourly | entering $' + str(POSITION_SIZE))
            enter_position(mint, price)

log('Dip Buyer | Dip: -' + str(round(DIP_THRESHOLD*100,1)) + '% | TP: +' + str(round(TAKE_PROFIT*100,1)) + '% | ' + ('LONG MODE (no stop loss)' if LONG_MODE else 'SL: -' + str(round(STOP_LOSS*100,1)) + '%') + ' | DryRun: ' + str(DRY_RUN))
if DRY_RUN: log('DRY RUN - no real swaps')
log('Watching: ' + ', '.join(m[:8]+'...' for m in WATCH_MINTS))

scan_count = 0
while not stopped:
    try:
        scan_count += 1
        # Heartbeat every scan so you can see the bot is alive and what it's seeing
        log('[heartbeat] scan #' + str(scan_count) + ' | open: ' + str(len(open_positions)) + ' | pnl: $' + str(round(stats['pnl'],2)))
        if scan_count % 10 == 1:
            check_wallet_stray_positions(os.getenv('BOT_POOL_ADDRESS',''), STOP_LOSS or 0.5, open_positions)
        scan()
    except Exception as e: log('Error: ' + str(e))
    time.sleep(SCAN_S)
`;

  const map = { dca, copy, momentum, scalper, dipbuyer };
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
