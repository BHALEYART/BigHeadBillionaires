// bhb.js — Shared utilities for Big Head Billionaires

// ── Wallet State ──────────────────────────────────────────────
const BHB = {
  walletAddress: null,
  walletProvider: null,

  async connectWallet() {
    try {
      const provider = window.solana || window.phantom?.solana;
      if (!provider) {
        alert('Phantom wallet not found.\nPlease install it at phantom.app');
        return false;
      }
      const resp = await provider.connect();
      BHB.walletAddress = resp.publicKey.toString();
      BHB.walletProvider = provider;
      BHB.onWalletConnected(BHB.walletAddress);
      return true;
    } catch (err) {
      console.error('Wallet connect failed:', err);
      return false;
    }
  },

  disconnectWallet() {
    if (BHB.walletProvider) BHB.walletProvider.disconnect?.();
    BHB.walletAddress = null;
    BHB.walletProvider = null;
    BHB.onWalletDisconnected();
  },

  onWalletConnected(address) {
    const btn = document.getElementById('walletBtn');
    if (btn) {
      btn.textContent = address.slice(0, 4) + '...' + address.slice(-4);
      btn.classList.add('connected');
    }
    document.dispatchEvent(new CustomEvent('bhb:wallet-connected', { detail: { address } }));
  },

  onWalletDisconnected() {
    const btn = document.getElementById('walletBtn');
    if (btn) {
      btn.textContent = 'Connect Wallet';
      btn.classList.remove('connected');
    }
    document.dispatchEvent(new CustomEvent('bhb:wallet-disconnected'));
  },

  shortAddress(addr) {
    return addr ? addr.slice(0, 4) + '...' + addr.slice(-4) : '';
  },

  // ── Traits Config ─────────────────────────────────────────
  async loadTraitsConfig() {
    try {
      const root = BHB.getRepoRoot();
      const res = await fetch(`${root}/config/traits.json`);
      return await res.json();
    } catch (e) {
      console.error('Failed to load traits config:', e);
      return null;
    }
  },

  getRepoRoot() {
    // On Vercel the site deploys at root, so always return ''
    return '';
  },

  // ── Solana RPC helpers (devnet by default) ─────────────────
  RPC_ENDPOINT: 'https://api.mainnet-beta.solana.com',

  async checkNFTOwnership(walletAddress, collectionHashlist) {
    // Placeholder — will integrate @solana/web3.js + Helius DAS API
    console.log('Checking NFT ownership for:', walletAddress);
    return { hasBaseNFT: false, ownedNFTs: [], ownedPacks: [] };
  },

  // ── UI helpers ────────────────────────────────────────────
  toast(message, type = 'info') {
    const t = document.createElement('div');
    t.className = `bhb-toast bhb-toast-${type}`;
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, 3000);
  },

  initNav() {
    const btn = document.getElementById('walletBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        if (BHB.walletAddress) {
          BHB.disconnectWallet();
        } else {
          BHB.connectWallet();
        }
      });
    }

    // Highlight active nav link
    const currentPage = window.location.pathname.split('/').filter(Boolean).pop() || '';
    document.querySelectorAll('.nav-links a').forEach(link => {
      const href = link.getAttribute('href') || '';
      if (href.includes(currentPage) || (currentPage === '' && href === '../index.html')) {
        link.classList.add('active');
      }
    });

    // Auto-reconnect if previously connected
    const provider = window.solana || window.phantom?.solana;
    if (provider?.isConnected) {
      provider.connect({ onlyIfTrusted: true })
        .then(resp => {
          BHB.walletAddress = resp.publicKey.toString();
          BHB.walletProvider = provider;
          BHB.onWalletConnected(BHB.walletAddress);
        })
        .catch(() => {});
    }
  }
};

// ── Toast styles (injected) ────────────────────────────────────
const toastCSS = `
.bhb-toast {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  z-index: 9999;
  font-family: 'Courier New', monospace;
  font-size: 0.75rem;
  padding: 0.7rem 1.2rem;
  border-radius: 6px;
  background: #fafaf5;
  border: 3px solid #0d0d0d;
  color: #0d0d0d;
  opacity: 0;
  transform: translateY(8px) rotate(1deg);
  transition: all 0.2s ease;
  max-width: 300px;
  box-shadow: 4px 4px 0 #0d0d0d;
}
.bhb-toast.show { opacity: 1; transform: translateY(0) rotate(0deg); }
.bhb-toast-success { background: #00c86e; color: #0d0d0d; }
.bhb-toast-error   { background: #ff3b3b; color: #fff; }
.bhb-toast-warning { background: #ffe135; color: #0d0d0d; }
`;
const style = document.createElement('style');
style.textContent = toastCSS;
document.head.appendChild(style);

// Init nav on DOM ready
document.addEventListener('DOMContentLoaded', () => BHB.initNav());
