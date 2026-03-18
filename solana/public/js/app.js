// app.js — landing page wallet connect (Phantom + Solflare)

let walletAddress = null;
let walletType    = null;
window._solBalances = null;

// ── Modal ─────────────────────────────────────────────────────────────────────
function openWalletModal() {
  if (walletAddress) { disconnectWallet(); return; }
  document.getElementById('wallet-modal').style.display = 'flex';
}
function closeWalletModal() {
  document.getElementById('wallet-modal').style.display = 'none';
}
// Close on overlay click
document.getElementById('wallet-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('wallet-modal')) closeWalletModal();
});

// ── Connect ───────────────────────────────────────────────────────────────────
async function connectWallet(type) {
  closeWalletModal();
  try {
    if (type === 'phantom') {
      if (!window.solana?.isPhantom) throw new Error('Phantom not detected. Install from phantom.app');
      const resp = await window.solana.connect();
      walletAddress = resp.publicKey.toString();
    } else if (type === 'solflare') {
      if (!window.solflare?.isSolflare) throw new Error('Solflare not detected. Install from solflare.com');
      await window.solflare.connect();
      walletAddress = window.solflare.publicKey.toString();
    }
    walletType = type;
    await onConnected();
  } catch(e) {
    alert(e.message || 'Connection failed');
  }
}

async function onConnected() {
  const btn = document.getElementById('wallet-btn');
  btn.textContent = walletAddress.slice(0,6) + '...' + walletAddress.slice(-4);
  btn.classList.add('connected');

  // Fetch balances
  try {
    const r = await fetch(`/api/solana-balance?address=${walletAddress}`);
    const data = await r.json();
    window._solBalances = data;
  } catch(_) {}

  // Show status bar if present on this page
  const bar = document.getElementById('wallet-status-bar');
  if (bar) {
    bar.style.display = 'flex';
    document.getElementById('ws-addr').textContent = walletAddress.slice(0,8) + '...' + walletAddress.slice(-6);
    const bal = window._solBalances;
    if (bal) {
      document.getElementById('ws-usdc').textContent = `$${bal.usdc}`;
      document.getElementById('ws-extra').textContent = `SOL: ${bal.sol}  USDT: $${bal.usdt}`;
    }
  }

  // If on bots page, trigger bots-specific logic
  if (typeof onWalletConnectedBots === 'function') onWalletConnectedBots();
}

function disconnectWallet() {
  walletAddress = null; walletType = null; window._solBalances = null;
  const btn = document.getElementById('wallet-btn');
  btn.textContent = 'Connect Wallet';
  btn.classList.remove('connected');
  const bar = document.getElementById('wallet-status-bar');
  if (bar) bar.style.display = 'none';
  if (typeof onWalletDisconnectedBots === 'function') onWalletDisconnectedBots();
}

// Auto-reconnect if already connected (Phantom/Solflare remember)
window.addEventListener('load', async () => {
  try {
    if (window.solana?.isPhantom && window.solana.isConnected) {
      const resp = await window.solana.connect({ onlyIfTrusted: true });
      walletAddress = resp.publicKey.toString();
      walletType    = 'phantom';
      await onConnected();
    } else if (window.solflare?.isSolflare && window.solflare.isConnected) {
      walletAddress = window.solflare.publicKey.toString();
      walletType    = 'solflare';
      await onConnected();
    }
  } catch(_) {}
});
