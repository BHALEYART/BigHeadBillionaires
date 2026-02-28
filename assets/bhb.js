// bhb.js — Shared utilities for Big Head Billionaires

// ── Wallet State ──────────────────────────────────────────────
const BHB = {
  walletAddress:  null,
  walletProvider: null,

  // ── Wallet Detection ──────────────────────────────────────
  getDetectedWallets() {
    const wallets = [];

    // Wallet Standard — auto-detects any compliant wallet
    if (window.navigator?.wallets) {
      try {
        const standard = window.navigator.wallets.get();
        standard.forEach(w => {
          if (w.accounts || w.features?.['solana:signTransaction']) {
            wallets.push({ name: w.name, icon: w.icon, standard: w });
          }
        });
      } catch (_) {}
    }

    // Explicit provider fallbacks (covers older extension versions)
    const explicit = [
      {
        name:    'Phantom',
        icon:    'https://www.phantom.app/favicon.ico',
        check:   () => window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null),
        install: 'https://phantom.app',
      },
      {
        name:    'Solflare',
        icon:    'https://solflare.com/favicon.ico',
        check:   () => window.solflare?.isSolflare ? window.solflare : null,
        install: 'https://solflare.com',
      },
      {
        name:    'Backpack',
        icon:    'https://backpack.app/favicon.ico',
        check:   () => window.backpack?.isBackpack ? window.backpack : null,
        install: 'https://backpack.app',
      },
      {
        name:    'Brave Wallet',
        icon:    'https://brave.com/favicon.ico',
        check:   () => window.braveSolana || (window.solana?.isBrave ? window.solana : null),
        install: null,
      },
      {
        name:    'Coinbase Wallet',
        icon:    'https://www.coinbase.com/favicon.ico',
        check:   () => window.coinbaseSolana || (window.solana?.isCoinbaseWallet ? window.solana : null),
        install: 'https://www.coinbase.com/wallet',
      },
    ];

    explicit.forEach(w => {
      const provider = w.check?.();
      const alreadyAdded = wallets.some(x => x.name === w.name);
      if (!alreadyAdded) {
        wallets.push({ ...w, provider, installed: !!provider });
      }
    });

    return wallets;
  },

  // ── Wallet Modal ──────────────────────────────────────────
  showWalletModal() {
    // Remove existing modal
    document.getElementById('bhb-wallet-modal')?.remove();

    const wallets  = BHB.getDetectedWallets();
    const detected = wallets.filter(w => w.provider || w.standard);
    const others   = wallets.filter(w => !w.provider && !w.standard && w.install);

    const modal = document.createElement('div');
    modal.id    = 'bhb-wallet-modal';
    modal.innerHTML = `
      <div class="bhb-modal-backdrop"></div>
      <div class="bhb-modal-box">
        <div class="bhb-modal-header">
          <span>Connect Wallet</span>
          <button class="bhb-modal-close" aria-label="Close">✕</button>
        </div>
        <div class="bhb-modal-body">
          ${detected.length ? `
            <p class="bhb-modal-label">Detected</p>
            <ul class="bhb-wallet-list">
              ${detected.map(w => `
                <li class="bhb-wallet-item" data-wallet="${w.name}">
                  <img src="${w.icon}" alt="${w.name}" onerror="this.style.display='none'">
                  <span>${w.name}</span>
                  <span class="bhb-wallet-badge">Detected</span>
                </li>
              `).join('')}
            </ul>
          ` : `<p class="bhb-modal-empty">No wallets detected in this browser.</p>`}
          ${others.length ? `
            <p class="bhb-modal-label" style="margin-top:1rem">Get a Wallet</p>
            <ul class="bhb-wallet-list">
              ${others.map(w => `
                <li class="bhb-wallet-item bhb-wallet-install" data-url="${w.install}">
                  <img src="${w.icon}" alt="${w.name}" onerror="this.style.display='none'">
                  <span>${w.name}</span>
                  <span class="bhb-wallet-badge bhb-wallet-badge-install">Install ↗</span>
                </li>
              `).join('')}
            </ul>
          ` : ''}
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close on backdrop or X
    modal.querySelector('.bhb-modal-backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('.bhb-modal-close').addEventListener('click',    () => modal.remove());

    // Install links
    modal.querySelectorAll('.bhb-wallet-install').forEach(el => {
      el.addEventListener('click', () => window.open(el.dataset.url, '_blank'));
    });

    // Connect on detected wallet click
    modal.querySelectorAll('.bhb-wallet-item:not(.bhb-wallet-install)').forEach(el => {
      el.addEventListener('click', async () => {
        const name   = el.dataset.wallet;
        const wallet = detected.find(w => w.name === name);
        modal.remove();
        await BHB._connectWallet(wallet);
      });
    });

    // Animate in
    requestAnimationFrame(() => modal.classList.add('visible'));
  },

  async _connectWallet(wallet) {
    try {
      let address, provider;

      if (wallet.standard) {
        // Wallet Standard flow
        const connectFeat = wallet.standard.features?.['solana:connect'] || wallet.standard.features?.['standard:connect'];
        if (!connectFeat) throw new Error('Wallet does not support connect');
        const result = await connectFeat.connect();
        address = result.accounts?.[0]?.address || result?.publicKey?.toString();

        // Wrap Wallet Standard object into a legacy provider shape so mint.js can call
        // signTransaction / signMessage uniformly regardless of wallet type
        const signFeat    = wallet.standard.features?.['solana:signTransaction'];
        const signMsgFeat = wallet.standard.features?.['solana:signMessage'];
        const account     = result.accounts?.[0];
        provider = {
          publicKey: address,
          isWalletStandard: true,
          signTransaction: async (tx) => {
            if (!signFeat) throw new Error('Wallet does not support signTransaction');
            const results = await signFeat.signTransaction({ account, transaction: tx });
            return results.signedTransaction ?? results[0]?.signedTransaction ?? tx;
          },
          signAllTransactions: async (txs) => {
            if (!signFeat) throw new Error('Wallet does not support signTransaction');
            const results = await Promise.all(txs.map(tx =>
              signFeat.signTransaction({ account, transaction: tx })
            ));
            return results.map(r => r.signedTransaction ?? r[0]?.signedTransaction);
          },
          signMessage: async (msg) => {
            if (!signMsgFeat) throw new Error('Wallet does not support signMessage');
            const result = await signMsgFeat.signMessage({ account, message: msg });
            return result.signature ?? result;
          },
          disconnect: () => wallet.standard.features?.['standard:disconnect']?.disconnect?.(),
        };
      } else {
        // Legacy provider flow
        provider = wallet.provider;
        const resp = await provider.connect();
        address  = resp.publicKey?.toString() || provider.publicKey?.toString();
      }

      if (!address) throw new Error('No public key returned');

      BHB.walletAddress  = address;
      BHB.walletProvider = provider;

      // Debug: log what the provider looks like for non-Phantom wallets
      console.log('[BHB] wallet connected:', wallet.name, '| address:', address);
      console.log('[BHB] provider.publicKey:', provider?.publicKey?.toString?.() ?? 'undefined');

      // Store last used wallet name for auto-reconnect
      try { localStorage.setItem('bhb_last_wallet', wallet.name); } catch (_) {}

      BHB.onWalletConnected(address);
      return true;
    } catch (err) {
      console.error('Wallet connect failed:', err);
      BHB.toast('Connection failed: ' + (err.message || 'Unknown error'), 'error');
      return false;
    }
  },

  async connectWallet() {
    BHB.showWalletModal();
  },

  disconnectWallet() {
    try { BHB.walletProvider?.disconnect?.(); } catch (_) {}
    BHB.walletAddress  = null;
    BHB.walletProvider = null;
    try { localStorage.removeItem('bhb_last_wallet'); } catch (_) {}
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
      const res = await fetch('/config/traits.json');
      return await res.json();
    } catch (e) {
      console.error('Failed to load traits config:', e);
      return null;
    }
  },

  getRepoRoot() { return ''; },

  // ── Solana RPC ─────────────────────────────────────────────
  RPC_ENDPOINT: 'https://api.mainnet-beta.solana.com',

  async checkNFTOwnership(walletAddress, collectionHashlist) {
    console.log('Checking NFT ownership for:', walletAddress);
    return { hasBaseNFT: false, ownedNFTs: [], ownedPacks: [] };
  },

  // ── UI Helpers ─────────────────────────────────────────────
  toast(message, type = 'info') {
    const t = document.createElement('div');
    t.className  = `bhb-toast bhb-toast-${type}`;
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
  },

  initNav() {
    const btn = document.getElementById('walletBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        if (BHB.walletAddress) BHB.disconnectWallet();
        else BHB.connectWallet();
      });
    }

    // Highlight active nav link
    const currentPage = window.location.pathname.split('/').filter(Boolean).pop() || '';
    document.querySelectorAll('.nav-links a').forEach(link => {
      const href = link.getAttribute('href') || '';
      if (href.includes(currentPage) || (currentPage === '' && href === '../index.html'))
        link.classList.add('active');
    });

    // Auto-reconnect last used wallet
    BHB._autoReconnect();
  },

  async _autoReconnect() {
    try {
      const lastName = localStorage.getItem('bhb_last_wallet');
      if (!lastName) return;

      // Small delay to let wallet extensions inject
      await new Promise(r => setTimeout(r, 300));

      const wallets  = BHB.getDetectedWallets();
      const wallet   = wallets.find(w => w.name === lastName && (w.provider || w.standard));
      if (!wallet) return;

      const provider = wallet.provider;
      if (provider?.isConnected || provider?.publicKey) {
        const resp = await provider.connect({ onlyIfTrusted: true }).catch(() => null);
        if (resp?.publicKey) {
          BHB.walletAddress  = resp.publicKey.toString();
          BHB.walletProvider = provider;
          BHB.onWalletConnected(BHB.walletAddress);
        }
      }
    } catch (_) {}
  },
};

// ── Modal + Toast Styles ───────────────────────────────────────
const bhbStyles = `
.bhb-toast {
  position: fixed; bottom: 2rem; right: 2rem; z-index: 9999;
  font-family: 'Courier New', monospace; font-size: 0.75rem;
  padding: 0.7rem 1.2rem; border-radius: 6px;
  background: #fafaf5; border: 3px solid #0d0d0d; color: #0d0d0d;
  opacity: 0; transform: translateY(8px) rotate(1deg);
  transition: all 0.2s ease; max-width: 300px; box-shadow: 4px 4px 0 #0d0d0d;
}
.bhb-toast.show { opacity: 1; transform: translateY(0) rotate(0deg); }
.bhb-toast-success { background: #00c86e; color: #0d0d0d; }
.bhb-toast-error   { background: #ff3b3b; color: #fff; }
.bhb-toast-warning { background: #ffe135; color: #0d0d0d; }

#bhb-wallet-modal {
  position: fixed; inset: 0; z-index: 10000;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.15s ease;
}
#bhb-wallet-modal.visible { opacity: 1; }

.bhb-modal-backdrop {
  position: absolute; inset: 0;
  background: rgba(13,13,13,0.7); backdrop-filter: blur(2px);
}

.bhb-modal-box {
  position: relative; z-index: 1;
  background: #fef9ee; border: 4px solid #0d0d0d;
  box-shadow: 8px 8px 0 #0d0d0d;
  border-radius: 4px; width: 360px; max-width: 92vw;
  font-family: 'Arial', sans-serif;
}

.bhb-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem 1.2rem; background: #0d0d0d; color: #ffe135;
  font-family: 'Impact', 'Arial Black', sans-serif;
  font-size: 1.1rem; letter-spacing: 0.05em; text-transform: uppercase;
}

.bhb-modal-close {
  background: none; border: none; color: #ffe135;
  font-size: 1.1rem; cursor: pointer; line-height: 1;
  padding: 0 0.2rem;
}
.bhb-modal-close:hover { color: #ff3b3b; }

.bhb-modal-body { padding: 1rem 1.2rem 1.2rem; }

.bhb-modal-label {
  font-size: 0.7rem; font-weight: bold; letter-spacing: 0.1em;
  text-transform: uppercase; color: #666; margin-bottom: 0.5rem;
}

.bhb-modal-empty {
  font-size: 0.85rem; color: #666; padding: 0.5rem 0;
}

.bhb-wallet-list { list-style: none; display: flex; flex-direction: column; gap: 0.4rem; }

.bhb-wallet-item {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.65rem 0.8rem; border: 2px solid #0d0d0d;
  border-radius: 4px; cursor: pointer; background: #fff;
  transition: background 0.1s, box-shadow 0.1s;
  box-shadow: 3px 3px 0 #0d0d0d;
}
.bhb-wallet-item:hover { background: #ffe135; box-shadow: 4px 4px 0 #0d0d0d; }
.bhb-wallet-item:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 #0d0d0d; }

.bhb-wallet-item img {
  width: 28px; height: 28px; border-radius: 6px; object-fit: contain;
  border: 1px solid #eee;
}

.bhb-wallet-item span:nth-child(2) { flex: 1; font-size: 0.9rem; font-weight: 600; }

.bhb-wallet-badge {
  font-size: 0.65rem; font-family: 'Courier New', monospace;
  background: #00c86e; color: #fff; padding: 2px 6px;
  border-radius: 3px; letter-spacing: 0.05em; font-weight: bold;
}
.bhb-wallet-badge-install { background: #1e6fff; }

.bhb-wallet-install .bhb-wallet-item:hover { background: #f0f0ff; }
`;

const style = document.createElement('style');
style.textContent = bhbStyles;
document.head.appendChild(style);

document.addEventListener('DOMContentLoaded', () => BHB.initNav());