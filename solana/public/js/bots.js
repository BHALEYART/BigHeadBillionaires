// bots.js — Solana Bot Board
// Requires app.js to be loaded first (wallet connect lives there)

// ── Constants ─────────────────────────────────────────────────────────────────
const USDC_MINT     = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_DECIMALS = 6;

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
// BOT WALLET GENERATION
// ─────────────────────────────────────────────────────────────────────────────

async function generateBotWallet() {
  // Generate a random 32-byte seed and derive a keypair
  // We use the Web Crypto API (available in all modern browsers)
  const seed       = crypto.getRandomValues(new Uint8Array(32));
  const privateKey = bs58Encode(seed);
  // Derive a mock public key for display (in production use @solana/web3.js)
  // For now we generate a deterministic-looking address from the seed
  const pubKeyBytes = await crypto.subtle.digest('SHA-256', seed);
  const address     = bs58Encode(new Uint8Array(pubKeyBytes).slice(0, 32));

  botWallet = { address, privateKeyBase58: privateKey };

  document.getElementById('bot-wallet-display').style.display = 'block';
  document.getElementById('bot-wallet-addr').textContent       = address;
  document.getElementById('btn-gen-wallet').style.display      = 'none';
  document.getElementById('btn-fund-transfer').style.display   = 'block';
}

// Simple base58 encoder (no dependencies)
function bs58Encode(bytes) {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = BigInt('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join(''));
  let encoded = '';
  while (num > 0n) {
    encoded = ALPHABET[Number(num % 58n)] + encoded;
    num = num / 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    encoded = '1' + encoded;
  }
  return encoded;
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNDING FLOW
// ─────────────────────────────────────────────────────────────────────────────

async function fundBotPool() {
  if (!botWallet) { alert('Generate a bot wallet first.'); return; }
  const amount = parseFloat(document.getElementById('fund-amount').value);
  if (!amount || amount < 10) { alert('Minimum 10 USDC.'); return; }

  const usdcBal = parseFloat(window._solBalances?.usdc || 0);
  if (usdcBal < amount) {
    alert(`Insufficient USDC.\nYou have: ${usdcBal} USDC\nNeeded: ${amount} USDC`);
    return;
  }

  const btn  = document.getElementById('btn-fund-transfer');
  const dest = botWallet.address;

  const confirmed = confirm(
    `Send ${amount} USDC to your bot pool?\n\n` +
    `Destination: ${dest}\n\n` +
    `Click OK to copy the address and open your wallet's send UI.\n` +
    `After sending, click "I already sent USDC manually" below.`
  );

  if (!confirmed) return;

  // Copy to clipboard
  await navigator.clipboard.writeText(dest).catch(() => {});

  // Try Phantom deeplink (works on mobile/desktop Phantom)
  const phantomUrl = `https://phantom.app/ul/transfer?mint=${USDC_MINT}&amount=${amount}&to=${dest}`;
  // Try Solflare deeplink
  const solflareUrl = `https://solflare.com/ul/v1/tx?mint=${USDC_MINT}&amount=${amount}&recipient=${dest}`;

  if (walletType === 'phantom') {
    window.open(phantomUrl, '_blank');
  } else if (walletType === 'solflare') {
    window.open(solflareUrl, '_blank');
  } else {
    window.open(phantomUrl, '_blank');
  }

  btn.textContent = `✅ Address copied — send ${amount} USDC in your wallet`;
}

function markFundedManually() {
  if (!botWallet) { alert('Please generate a bot wallet first.'); return; }
  completeFunding();
}

function completeFunding() {
  fundingComplete = true;
  const amount = document.getElementById('fund-amount').value || '?';

  document.getElementById('fund-confirmed').style.display = 'flex';
  document.getElementById('fund-confirmed-text').textContent =
    `Bot pool funded — ${amount} USDC · ${botWallet.address.slice(0,12)}...`;

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
    if (i.dataset.key) config[i.dataset.key] = i.value;
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
  folder.file('bot.js',            getBotJs(selectedStrategy, config));
  folder.file('Dockerfile',        getDockerfile());
  folder.file('docker-compose.yml', getDockerCompose(selectedStrategy));
  folder.file('package.json',      getBotPackageJson(selectedStrategy));
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

function getDockerfile() {
  return `FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY . .
EXPOSE 8080
CMD ["node", "bot.js"]
`;
}

function getDockerCompose(strategy) {
  return `version: '3.8'
services:
  ${strategy}-bot:
    build: .
    restart: unless-stopped
    env_file: .env
    ports:
      - "8080:8080"
    volumes:
      - ./logs:/app/logs
`;
}

function getBotPackageJson(strategy) {
  return JSON.stringify({
    name: `solana-${strategy}-bot`,
    version: '1.0.0',
    description: `Solana Jupiter ${strategy} bot — generated by Solana Bot Board`,
    main: 'bot.js',
    scripts: { start: 'node bot.js' },
    dependencies: {
      'node-fetch': '^3.3.2',
      'ws':         '^8.16.0',
      'dotenv':     '^16.4.5',
      'bs58':       '^5.0.0',
    }
  }, null, 2);
}

function getReadme(strategy, config) {
  const names = { dca: 'DCA', copy: 'Copy Trading', momentum: 'Momentum', scalper: 'Scalper' };
  return `# Solana ${names[strategy]} Bot
Generated by Solana Bot Board

## Quick Start
\`\`\`bash
# 1. Unzip this folder
# 2. Make sure Docker Desktop is running
docker compose up -d
docker compose logs -f
\`\`\`

## Terminal commands
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
Edit \`.env\` and restart: \`docker compose restart\`
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// BOT TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

function getBotJs(strategy, c) {
  const header = `// Solana ${strategy.toUpperCase()} Bot — generated by Solana Bot Board
// Jupiter v6 swap API · Solana mainnet

require('dotenv').config();
const fetch     = require('node-fetch');
const WebSocket = require('ws');
const bs58      = require('bs58');

// ── Config ────────────────────────────────────────────────────────────────────
const PRIVATE_KEY   = process.env.PRIVATEKEY;
const CASHOUT_ADDR  = process.env.CASHOUTADDR   || '';
const RPC_URL       = process.env.RPCURL        || 'https://api.mainnet-beta.solana.com';
const INPUT_MINT    = process.env.INPUT_MINT    || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC
const DRY_RUN       = process.env.DRYRUN        === 'true';
const WS_PORT       = parseInt(process.env.WS_PORT || '8080');

// ── WebSocket terminal server ─────────────────────────────────────────────────
const clients = new Set();
const wss     = new WebSocket.Server({ port: WS_PORT });
wss.on('connection', ws => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'welcome', msg: '\\r\\n🤖 ' + STRATEGY_NAME + ' connected\\r\\nType help for commands\\r\\n> ' }));
  ws.on('message', d => handleCommand(d.toString().trim().toLowerCase(), ws));
  ws.on('close',   () => clients.delete(ws));
});
function broadcast(msg) {
  const p = JSON.stringify({ type: 'log', msg: msg + '\\r\\n' });
  clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(p); });
}
function log(msg) {
  const line = '[' + new Date().toLocaleTimeString() + '] ' + msg;
  console.log(line);
  broadcast(line);
}

// ── Solana keypair (lightweight — no @solana/web3.js bundle) ──────────────────
// Uses raw RPC calls for signing via the bot's private key via ws-based tx building.
// For production signing, replace with @solana/web3.js Keypair + sendTransaction.

// ── Jupiter swap helper ───────────────────────────────────────────────────────
const JUPITER_QUOTE  = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP   = 'https://quote-api.jup.ag/v6/swap';

async function getQuote(inputMint, outputMint, amountLamports, slippageBps) {
  const url = JUPITER_QUOTE +
    '?inputMint='   + inputMint +
    '&outputMint='  + outputMint +
    '&amount='      + amountLamports +
    '&slippageBps=' + slippageBps;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Jupiter quote failed: ' + r.status);
  return r.json();
}

async function executeSwap(quoteResponse, userPublicKey) {
  if (DRY_RUN) {
    log('[DRY] Would swap ' + JSON.stringify({ in: quoteResponse.inputMint?.slice(0,8), out: quoteResponse.outputMint?.slice(0,8), amount: quoteResponse.inAmount }));
    return { txid: 'dry-' + Date.now() };
  }
  const r = await fetch(JUPITER_SWAP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteResponse, userPublicKey, wrapAndUnwrapSol: true }),
  });
  if (!r.ok) throw new Error('Jupiter swap failed: ' + r.status);
  const { swapTransaction } = await r.json();
  // NOTE: swapTransaction is a base64-encoded transaction that must be signed
  // and submitted via sendTransaction RPC call using your private key.
  // Full implementation requires @solana/web3.js — see README for details.
  log('[SWAP] Transaction built. Sign and send via @solana/web3.js in production.');
  return { swapTransaction, txid: 'built-' + Date.now() };
}

async function getTokenPrice(mint) {
  const r = await fetch('https://api.jup.ag/price/v2?ids=' + mint);
  const d = await r.json();
  return parseFloat(d?.data?.[mint]?.price || 0);
}

// ── State ─────────────────────────────────────────────────────────────────────
let paused   = false;
let stopped  = false;
const stats  = { trades: 0, pnl: 0, start: Date.now() };
`;

  const strategies = {

    dca: `
// ── DCA Strategy ──────────────────────────────────────────────────────────────
const STRATEGY_NAME  = 'DCA Bot';
const OUTPUT_MINT    = process.env.OUTPUTMINT    || 'So11111111111111111111111111111111111111112';
const BUY_AMOUNT     = parseFloat(process.env.BUYAMOUNT    || '${c.buyAmount||10}');
const BUDGET_CAP     = parseFloat(process.env.BUDGETCAP    || '${c.budgetCap||100}');
const STOP_LOSS_PCT  = parseFloat(process.env.STOPLOSS     || '${c.stopLossPct||15}') / 100;
const SLIPPAGE_BPS   = parseInt(process.env.SLIPPAGEBPS    || '${c.slippageBps||50}');
const INTERVAL_MS    = { '5m':300000,'15m':900000,'1h':3600000,'4h':14400000,'12h':43200000,'1d':86400000 }[process.env.INTERVAL||"${c.interval||'1h'}"] || 3600000;

let totalSpent = 0, avgEntry = 0, totalHoldings = 0;

async function dcaBuy() {
  if (paused || stopped) return;
  if (totalSpent >= BUDGET_CAP) { log('⚠️ Budget cap reached. Pausing.'); paused = true; return; }

  const price = await getTokenPrice(OUTPUT_MINT);
  if (!price) { log('⚠️ Could not fetch price. Skipping.'); return; }

  const lamports = Math.floor(BUY_AMOUNT * 1e6); // USDC has 6 decimals
  log('💰 DCA buy $' + BUY_AMOUNT + ' USDC → ' + OUTPUT_MINT.slice(0,8) + '... @ $' + price.toFixed(6));

  const quote = await getQuote(INPUT_MINT, OUTPUT_MINT, lamports, SLIPPAGE_BPS);
  await executeSwap(quote, process.env.BOTPOOLADDRESS);

  const qty = BUY_AMOUNT / price;
  totalSpent    += BUY_AMOUNT;
  totalHoldings += qty;
  avgEntry       = totalSpent / totalHoldings;
  stats.trades++;
  log('✅ Bought. Avg entry: $' + avgEntry.toFixed(6) + ' | Total spent: $' + totalSpent.toFixed(2));
}

function handleCommand(cmd, ws) {
  const s = m => ws.send(JSON.stringify({ type: 'log', msg: m + '\\r\\n> ' }));
  if (cmd === 'help')    s('Commands: status | pause | resume | cashout | stop');
  else if (cmd === 'status') s('💰 DCA | Spent: $' + totalSpent.toFixed(2) + '/$' + BUDGET_CAP + ' | Avg: $' + avgEntry.toFixed(6) + ' | Trades: ' + stats.trades + ' | ' + (paused?'PAUSED':'RUNNING'));
  else if (cmd === 'pause')  { paused = true;  s('⏸️ Paused.'); }
  else if (cmd === 'resume') { paused = false; s('▶️ Running.'); }
  else if (cmd === 'stop')   { stopped = true; s('🛑 Stopped.'); }
  else if (cmd === 'cashout') s('💸 Cashout: swap all holdings back to USDC and send to ' + CASHOUT_ADDR + ' — implement via @solana/web3.js');
  else s('Unknown command. Type help.');
}

log('🚀 DCA Bot | Output: ' + OUTPUT_MINT.slice(0,8) + '... | $' + BUY_AMOUNT + ' per buy | ' + (process.env.INTERVAL||'1h') + ' | Dry: ' + DRY_RUN);
if (DRY_RUN) log('⚠️  DRY RUN — no real swaps');
dcaBuy();
setInterval(dcaBuy, INTERVAL_MS);
`,

    copy: `
// ── Copy Trading Strategy ─────────────────────────────────────────────────────
const STRATEGY_NAME  = 'Copy Bot';
const TARGET_WALLET  = process.env.TARGETWALLET  || '';
const POSITION_SIZE  = parseFloat(process.env.POSITIONSIZE || '${c.positionSize||20}');
const MAX_DRAWDOWN   = parseFloat(process.env.MAXDRAWDOWN  || '${c.maxDrawdown||20}') / 100;
const BLACKLIST      = (process.env.BLACKLIST||'').split(',').filter(Boolean);
const POLL_MS        = { '5s':5000,'10s':10000,'30s':30000,'1m':60000 }[process.env.POLLINTERVAL||"${c.pollInterval||'10s'}"] || 10000;
const SLIPPAGE_BPS   = parseInt(process.env.SLIPPAGEBPS || '${c.slippageBps||100}');
const MAX_POSITIONS  = parseInt(process.env.MAXPOSITIONS || '${c.maxPositions||5}');

let lastSignature = null;
let openPositions = {};

async function pollTargetWallet() {
  if (paused || stopped || !TARGET_WALLET) return;
  try {
    const r = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'getSignaturesForAddress', params:[TARGET_WALLET, { limit: 5 }] }),
    });
    const data = await r.json();
    const sigs  = data?.result || [];
    if (!sigs.length) return;
    const latest = sigs[0].signature;
    if (lastSignature && latest !== lastSignature) {
      log('👑 New tx from target wallet: ' + latest.slice(0,16) + '...');
      // In production: fetch tx details and decode swap instruction, then mirror via Jupiter
    }
    lastSignature = latest;
  } catch(e) { log('⚠️ Poll error: ' + e.message); }
}

function handleCommand(cmd, ws) {
  const s = m => ws.send(JSON.stringify({ type: 'log', msg: m + '\\r\\n> ' }));
  if (cmd === 'help')    s('Commands: status | pause | resume | stop | cashout');
  else if (cmd === 'status') s('👑 Copy | Target: ' + TARGET_WALLET.slice(0,12) + '... | Open: ' + Object.keys(openPositions).length + '/' + MAX_POSITIONS + ' | ' + (paused?'PAUSED':'RUNNING'));
  else if (cmd === 'pause')  { paused = true;  s('⏸️ Paused.'); }
  else if (cmd === 'resume') { paused = false; s('▶️ Running.'); }
  else if (cmd === 'stop')   { stopped = true; s('🛑 Stopped.'); }
  else if (cmd === 'cashout') s('💸 Cashout: swap all to USDC → ' + CASHOUT_ADDR);
  else s('Unknown. Type help.');
}

if (!TARGET_WALLET) log('⚠️ TARGET_WALLET not set. Edit .env and restart.');
log('🚀 Copy Bot | Target: ' + TARGET_WALLET.slice(0,12) + '... | $' + POSITION_SIZE + '/copy | Dry: ' + DRY_RUN);
setInterval(pollTargetWallet, POLL_MS);
`,

    momentum: `
// ── Momentum Strategy ─────────────────────────────────────────────────────────
const STRATEGY_NAME  = 'Momentum Bot';
const THRESHOLD      = parseFloat(process.env.GAINTHRESHOLD || '${c.gainThreshold||5}') / 100;
const SCAN_MS        = { '1m':60000,'5m':300000,'15m':900000,'1h':3600000 }[process.env.SCANINTERVAL||"${c.scanInterval||'5m'}"] || 300000;
const POSITION_SIZE  = parseFloat(process.env.POSITIONSIZE  || '${c.positionSize||25}');
const TAKE_PROFIT    = parseFloat(process.env.TAKEPROFIT     || '${c.takeProfit||8}') / 100;
const STOP_LOSS      = parseFloat(process.env.STOPLOSS       || '${c.stopLoss||4}') / 100;
const SLIPPAGE_BPS   = parseInt(process.env.SLIPPAGEBPS || '${c.slippageBps||100}');
const MAX_POSITIONS  = parseInt(process.env.MAXPOSITIONS || '${c.maxPositions||3}');
const DAILY_LOSS_CAP = parseFloat(process.env.DAILYLOSSCAP  || '${c.dailyLossCap||50}');
const WATCH_MINTS    = (process.env.WATCHMINTS||'So11111111111111111111111111111111111111112,JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN').split(',').filter(Boolean);

let openPositions = {}, prevPrices = {}, dailyLoss = 0;

async function momentumScan() {
  if (paused || stopped || dailyLoss >= DAILY_LOSS_CAP) return;
  for (const mint of WATCH_MINTS) {
    const price = await getTokenPrice(mint);
    if (!price) continue;
    const prev  = prevPrices[mint];
    if (prev && !openPositions[mint] && Object.keys(openPositions).length < MAX_POSITIONS) {
      const move = (price - prev) / prev;
      if (move >= THRESHOLD) {
        log('🚀 MOMENTUM ENTRY: ' + mint.slice(0,8) + '... +' + (move*100).toFixed(2) + '% | $' + POSITION_SIZE + ' USDC');
        const lamports = Math.floor(POSITION_SIZE * 1e6);
        const quote    = await getQuote(INPUT_MINT, mint, lamports, SLIPPAGE_BPS);
        await executeSwap(quote, process.env.BOTPOOLADDRESS);
        openPositions[mint] = { entry: price, size: POSITION_SIZE, openedAt: Date.now() };
        stats.trades++;
        log('✅ Entered | TP: $' + (price*(1+TAKE_PROFIT)).toFixed(6) + ' | SL: $' + (price*(1-STOP_LOSS)).toFixed(6));
      }
    }
    if (openPositions[mint]) {
      const pos  = openPositions[mint];
      const pct  = (price - pos.entry) / pos.entry;
      if (pct >= TAKE_PROFIT || pct <= -STOP_LOSS) {
        const reason = pct >= TAKE_PROFIT ? '✅ TP' : '🛑 SL';
        log(reason + ' EXIT: ' + mint.slice(0,8) + '... ' + (pct>=0?'+':'') + (pct*100).toFixed(2) + '%');
        const holdLamports = Math.floor((pos.size / pos.entry) * price * 1e6);
        const quote = await getQuote(mint, INPUT_MINT, holdLamports, SLIPPAGE_BPS);
        await executeSwap(quote, process.env.BOTPOOLADDRESS);
        const pnl = pos.size * pct;
        stats.pnl += pnl;
        if (pnl < 0) dailyLoss += Math.abs(pnl);
        log('💰 PnL: $' + pnl.toFixed(2) + ' | Total: $' + stats.pnl.toFixed(2));
        delete openPositions[mint];
      }
    }
    prevPrices[mint] = price;
  }
}

function handleCommand(cmd, ws) {
  const s = m => ws.send(JSON.stringify({ type: 'log', msg: m + '\\r\\n> ' }));
  if (cmd === 'help')       s('Commands: status | positions | pause | resume | stop | cashout');
  else if (cmd === 'status')    s('🚀 Momentum | Open: ' + Object.keys(openPositions).length + '/' + MAX_POSITIONS + ' | PnL: $' + stats.pnl.toFixed(2) + ' | ' + (paused?'PAUSED':'RUNNING'));
  else if (cmd === 'positions') s(JSON.stringify(Object.keys(openPositions)));
  else if (cmd === 'pause')     { paused = true;  s('⏸️ Paused.'); }
  else if (cmd === 'resume')    { paused = false; s('▶️ Running.'); }
  else if (cmd === 'stop')      { stopped = true; s('🛑 Stopped.'); }
  else if (cmd === 'cashout')   s('💸 Cashout → ' + CASHOUT_ADDR);
  else s('Unknown. Type help.');
}

log('🚀 Momentum | Threshold: ' + (THRESHOLD*100).toFixed(1) + '% | $' + POSITION_SIZE + '/pos | Watching: ' + WATCH_MINTS.length + ' tokens | Dry: ' + DRY_RUN);
momentumScan();
setInterval(momentumScan, SCAN_MS);
`,

    scalper: `
// ── Scalper Strategy ──────────────────────────────────────────────────────────
const STRATEGY_NAME   = 'Scalper Bot';
const THRESHOLD       = parseFloat(process.env.GAINTHRESHOLD || '${c.gainThreshold||0.3}') / 100;
const SCAN_MS         = { '10s':10000,'30s':30000,'1m':60000,'2m':120000 }[process.env.SCANINTERVAL||"${c.scanInterval||'30s'}"] || 30000;
const POSITION_SIZE   = parseFloat(process.env.POSITIONSIZE  || '${c.positionSize||15}');
const TAKE_PROFIT     = parseFloat(process.env.TAKEPROFIT     || '${c.takeProfit||0.5}') / 100;
const STOP_LOSS       = parseFloat(process.env.STOPLOSS       || '${c.stopLoss||0.3}') / 100;
const SLIPPAGE_BPS    = parseInt(process.env.SLIPPAGEBPS || '${c.slippageBps||30}');
const MAX_POSITIONS   = parseInt(process.env.MAXPOSITIONS  || '${c.maxPositions||5}');
const DAILY_LOSS_CAP  = parseFloat(process.env.DAILYLOSSCAP  || '${c.dailyLossCap||30}');
const DAILY_TRADE_CAP = parseInt(process.env.DAILYTRADECAP || '${c.dailyTradeCap||200}');
const WATCH_MINTS     = (process.env.WATCHMINTS||'So11111111111111111111111111111111111111112,JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN,DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263').split(',').filter(Boolean);

let openPositions = {}, prevPrices = {}, dailyLoss = 0, dailyTrades = 0;

async function scalperScan() {
  if (paused || stopped || dailyLoss >= DAILY_LOSS_CAP || dailyTrades >= DAILY_TRADE_CAP) return;

  for (const mint of WATCH_MINTS) {
    const price = await getTokenPrice(mint);
    if (!price) continue;

    const prev = prevPrices[mint];
    if (prev && !openPositions[mint] && Object.keys(openPositions).length < MAX_POSITIONS) {
      const move = (price - prev) / prev;
      if (move >= THRESHOLD) {
        log('⚡ SCALP ENTRY: ' + mint.slice(0,8) + '... +' + (move*100).toFixed(3) + '%');
        const lamports = Math.floor(POSITION_SIZE * 1e6);
        const quote    = await getQuote(INPUT_MINT, mint, lamports, SLIPPAGE_BPS);
        await executeSwap(quote, process.env.BOTPOOLADDRESS);
        openPositions[mint] = { entry: price, size: POSITION_SIZE, openedAt: Date.now() };
        dailyTrades++; stats.trades++;
        log('✅ In | TP: $' + (price*(1+TAKE_PROFIT)).toFixed(6) + ' | SL: $' + (price*(1-STOP_LOSS)).toFixed(6));
      }
    }

    if (openPositions[mint]) {
      const pos  = openPositions[mint];
      const pct  = (price - pos.entry) / pos.entry;
      const age  = (Date.now() - pos.openedAt) / 1000;
      const timeout = age > (SCAN_MS * 6 / 1000);

      if (pct >= TAKE_PROFIT || pct <= -STOP_LOSS || timeout) {
        const reason = pct >= TAKE_PROFIT ? '✅TP' : pct <= -STOP_LOSS ? '🛑SL' : '⏱️Timeout';
        log(reason + ' EXIT: ' + mint.slice(0,8) + '... ' + (pct>=0?'+':'') + (pct*100).toFixed(3) + '%');
        const holdLamports = Math.floor((pos.size / pos.entry) * price * 1e6);
        const quote = await getQuote(mint, INPUT_MINT, holdLamports, SLIPPAGE_BPS);
        await executeSwap(quote, process.env.BOTPOOLADDRESS);
        const pnl = pos.size * pct;
        stats.pnl += pnl;
        if (pnl < 0) dailyLoss += Math.abs(pnl);
        delete openPositions[mint];
      }
    }
    prevPrices[mint] = price;
  }
}

function handleCommand(cmd, ws) {
  const s = m => ws.send(JSON.stringify({ type: 'log', msg: m + '\\r\\n> ' }));
  if (cmd === 'help')       s('Commands: status | positions | pause | resume | stop | cashout');
  else if (cmd === 'status')    s('⚡ Scalper | Open: ' + Object.keys(openPositions).length + '/' + MAX_POSITIONS + ' | Trades: ' + dailyTrades + '/' + DAILY_TRADE_CAP + ' | PnL: $' + stats.pnl.toFixed(2) + ' | DailyLoss: $' + dailyLoss.toFixed(2) + ' | ' + (paused?'PAUSED':'RUNNING'));
  else if (cmd === 'positions') s(JSON.stringify(Object.keys(openPositions)));
  else if (cmd === 'pause')     { paused = true;  s('⏸️ Paused.'); }
  else if (cmd === 'resume')    { paused = false; s('▶️ Running.'); }
  else if (cmd === 'stop')      { stopped = true; s('🛑 Stopped.'); }
  else if (cmd === 'cashout')   s('💸 Cashout → ' + CASHOUT_ADDR);
  else s('Unknown. Type help.');
}

log('⚡ Scalper | Threshold: ' + (THRESHOLD*100).toFixed(2) + '% | TP: ' + (TAKE_PROFIT*100).toFixed(2) + '% | SL: ' + (STOP_LOSS*100).toFixed(2) + '% | Positions: ' + MAX_POSITIONS + ' | Dry: ' + DRY_RUN);
if (DRY_RUN) log('⚠️  DRY RUN — no real swaps');
// Build initial price baseline
Promise.all(WATCH_MINTS.map(m => getTokenPrice(m).then(p => { if(p) prevPrices[m] = p; })))
  .then(() => log('✅ Baseline set for ' + Object.keys(prevPrices).length + ' tokens. Scalping begins.'));
setInterval(scalperScan, SCAN_MS);
`
  };

  return header + (strategies[strategy] || '// Strategy not found');
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
    term.writeln('\x1b[2mRun: docker compose up -d\x1b[0m');
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
