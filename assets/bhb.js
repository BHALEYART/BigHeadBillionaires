// bhb.js — Shared UI helper for Big Head Billionaires pages.
// Pages call BHB.toast(); this file must exist or those calls throw
// ("BHB is not defined") and abort whatever they're in (e.g. audio uploads).
// Wallet features were removed; only the toast helper remains.

const BHB = {
  toast(message, type = 'info') {
    const t = document.createElement('div');
    t.className   = `bhb-toast bhb-toast-${type}`;
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
  },
};
window.BHB = BHB;

(() => {
  const style = document.createElement('style');
  style.textContent = `
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
`;
  document.head.appendChild(style);
})();
