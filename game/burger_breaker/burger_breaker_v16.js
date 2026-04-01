const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

const AUDIO_CTX = window.AudioContext ? new AudioContext() : (window.webkitAudioContext ? new webkitAudioContext() : null);
const STORAGE_KEYS = {
  best: 'burgerBreakerBest',
  sfx: 'burgerBreakerSfx',
  unlocked: 'burgerBreakerUnlocked',
  runState: 'burgerBreakerRunStateV5',
  endlessBest: 'burgerBreakerEndlessBest',
  medals: 'burgerBreakerMedalsV8',
  settings: 'burgerBreakerSettingsV9',
  coins: 'burgerBreakerCoinsRealV10',
  shop: 'burgerBreakerShopRealV11',
  daily: 'burgerBreakerDailyRealV12',
  leaderboardCampaign: 'burgerBreakerLeaderboardCampaignRealV13',
  leaderboardEndless: 'burgerBreakerLeaderboardEndlessRealV13',
  settings: 'burgerBreakerSettingsRealV15',
};

const COLORS = {
  bg: '#0b1220',
  panel: 'rgba(11,17,28,0.94)',
  text: '#ffffff',
  accent: '#d7f28b',
  blue: '#00f0ff',
  orange: '#f5a623',
  red: '#ff7b54',
  purple: '#b39ddb',
  dim: 'rgba(255,255,255,0.15)',
};

const LEVELS = [
  // ── Group 1: Easy (levels 1-5) — very gentle speed increase ───
  { name: 'Bacon Cheeseburger',        cols: 11, rows: 11, speedMult: 1.00, paddleW: 96  },
  { name: 'Jalapeno Burger',           cols: 11, rows: 11, speedMult: 1.01, paddleW: 95  },
  { name: 'Guacamole Fiesta Burger',   cols: 12, rows: 12, speedMult: 1.02, paddleW: 94  },
  { name: 'Mushroom Swiss Burger',     cols: 12, rows: 12, speedMult: 1.03, paddleW: 93  },
  { name: 'Volcano Lava Burger',       cols: 12, rows: 12, speedMult: 1.05, paddleW: 92  },
  // ── Group 2: Medium (levels 6-10, boss 10) ────────────────────
  { name: 'Chili Cheeseburger',        cols: 13, rows: 13, speedMult: 1.08, paddleW: 90  },
  { name: 'Glazed Delight Burger',     cols: 13, rows: 13, speedMult: 1.11, paddleW: 88  },
  { name: 'Noodle Fusion Burger',      cols: 13, rows: 13, speedMult: 1.14, paddleW: 86  },
  { name: 'Pineapple Teriyaki Burger', cols: 14, rows: 14, speedMult: 1.17, paddleW: 84  },
  { name: 'Cyber Shock Burger',        cols: 12, rows: 12, speedMult: 1.21, paddleW: 82  },
  // ── Group 3: Hard (levels 11-15) ──────────────────────────────
  { name: 'Cajun Burger',              cols: 14, rows: 14, speedMult: 1.25, paddleW: 80  },
  { name: 'Breakfast Burger',          cols: 15, rows: 15, speedMult: 1.29, paddleW: 78  },
  { name: 'Impossible Burger',         cols: 15, rows: 15, speedMult: 1.33, paddleW: 76  },
  { name: 'Blue Cheese Burger',        cols: 15, rows: 15, speedMult: 1.37, paddleW: 74  },
  { name: 'Korean BBQ Burger',         cols: 16, rows: 16, speedMult: 1.42, paddleW: 72  },
  // ── Group 4: Very Hard (levels 16-20) ─────────────────────────
  { name: 'Black Bean Burger',         cols: 16, rows: 16, speedMult: 1.47, paddleW: 70  },
  { name: 'Pastrami Burger',           cols: 16, rows: 16, speedMult: 1.52, paddleW: 68  },
  { name: 'Lobster Burger',            cols: 17, rows: 17, speedMult: 1.57, paddleW: 66  },
  { name: 'Wagyu Burger',              cols: 17, rows: 17, speedMult: 1.62, paddleW: 64  },
  { name: 'Ghost Pepper Burger',       cols: 17, rows: 17, speedMult: 1.68, paddleW: 62  },
  // ── Group 5: Brutal (levels 21-25) ────────────────────────────
  { name: 'Ramen Burger',              cols: 18, rows: 18, speedMult: 1.74, paddleW: 58  },
  { name: 'Surf and Turf Burger',      cols: 18, rows: 18, speedMult: 1.80, paddleW: 55  },
  { name: 'Mac Attack Burger',         cols: 19, rows: 19, speedMult: 1.86, paddleW: 52  },
  { name: 'The Widowmaker Burger',     cols: 19, rows: 19, speedMult: 1.92, paddleW: 50  },
  { name: 'The Ultimate Burger',       cols: 20, rows: 20, speedMult: 1.98, paddleW: 48  },
];

const LEVEL_MASKS = {
  1: { mask: ['00011111000','01111111110','01111111110','11111111111','11111111111','11111111111','11111111111','11111111111','11111111111','01111111111','01111111110'], cropX: 96,  cropY: 120, cropW: 822, cropH: 745 },
  2: { mask: ['00011111000','01111111110','01111111110','11111111111','11111111111','11111111111','11111111111','11111111111','11111111111','01111111111','01111111110'], cropX: 96,  cropY: 120, cropW: 822, cropH: 745 },
  3: { mask: ['11111111110','11111111111','11111111111','11111111111','11111111111','11111111111','11111111111','11111111111','11111111111','11111111111','01111111110'], cropX: 96,  cropY: 113, cropW: 832, cropH: 769 },
  4: { mask: ['11111111110','11111111111','11111111111','11111111111','11111111111','11111111111','11111111111','11111111111','11111111111','11111111111','11111111111'], cropX: 102, cropY: 120, cropW: 825, cropH: 764 },
  5: { mask: ['00111111100','00111111110','11111111111','11111111111','11111111111','11111111111','11111111111','11111111111','11111111111','11111111111','11111111111'], cropX: 88,  cropY: 29,  cropW: 847, cropH: 842 },
  6: { mask: ['11111111110','11111111111','11111111111','11111111111','11111111111','11111111111','11111111111','11111111111','11111111111','11111111111','11111111111'], cropX: 82,  cropY: 138, cropW: 860, cropH: 771 },
  // Level 7: Glazed Delight Burger — donut bun top, wide middle, tapers at bottom
  7: { mask: ['0001111111000','0111111111110','0111111111110','1111111111110','1111111111111','1111111111111','1111111111111','0111111111110','0111111111110','0111111111111','0111111111110','0111111111110','0001111111000'], cropX: 120, cropY: 113, cropW: 788, cropH: 767 },
  // Level 8: Noodle Fusion Burger — nearly square noodle bun, full width almost all rows
  8: { mask: ['0011111111100','1111111111111','1111111111111','1111111111111','1111111111111','1111111111111','1111111111111','1111111111111','1111111111111','1111111111111','1111111111111','0111111111110','0011111111100'], cropX: 102, cropY: 80, cropW: 820, cropH: 793 },
  // Level 9: Pineapple Teriyaki — tall full dome, top corners need full bun coverage
  9: { mask: ['0011111111100','0111111111110','1111111111111','1111111111111','1111111111111','1111111111111','1111111111111','1111111111111','1111111111111','1111111111111','0111111111110','0111111111110','0011111111100'], cropX: 85, cropY: 85, cropW: 856, cropH: 775 },
  // Level 10: Cyber Shock Burger (BOSS) — dark dome bun with lightning, neon layers, 12×12
  // Lightning bolts extend beyond bun but bun silhouette itself is contained
  10: { mask: ['001111111100','011111111110','111111111110','011111111110','011111111110','111111111110','111111111111','111111111111','111111111111','111111111111','011111111110','001111111100'], cropX: 123, cropY: 94, cropW: 778, cropH: 751 },
};

// Cache of auto-generated masks keyed by level number
const _autoMaskCache = {};

// Sample the burger image to build a pixel-accurate mask for the given grid size.
// Returns a 2D array of 0/1. Threshold: a cell is "alive" if enough sampled pixels
// are non-transparent and non-white-background.
function buildAutoMask(levelNum, cols, rows) {
  const cacheKey = `${levelNum}_${cols}_${rows}`;
  if (cacheKey in _autoMaskCache) return _autoMaskCache[cacheKey]; // null means failed, array means success

  const limg = images.levels[levelNum];
  if (!limg || !limg.burgerReady) return null;

  const lm = LEVEL_MASKS[levelNum];
  if (!lm) return null;

  try {
    const offscreen = document.createElement('canvas');
    offscreen.width = cols;
    offscreen.height = rows;
    const octx = offscreen.getContext('2d');
    octx.drawImage(limg.burger, lm.cropX, lm.cropY, lm.cropW, lm.cropH, 0, 0, cols, rows);

    const pixels = octx.getImageData(0, 0, cols, rows).data;
    const mask = make2D(rows, cols, 0);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 4;
        const a = pixels[i + 3];
        const rr = pixels[i], gg = pixels[i + 1], bb = pixels[i + 2];
        const isTransparent = a < 40;
        const isWhiteBg = a > 200 && rr > 220 && gg > 220 && bb > 220;
        mask[r][c] = (!isTransparent && !isWhiteBg) ? 1 : 0;
      }
    }

    _autoMaskCache[cacheKey] = mask;
    return mask;
  } catch (e) {
    // CORS/security error reading pixel data — fall back to string mask
    _autoMaskCache[cacheKey] = null; // mark as failed so we don't retry every frame
    return null;
  }
}

const playfield = { x: 0, y: 72, w: 540, h: 650 };
const paddle = {
  x: W / 2 - 48,
  y: H - 68,
  w: 96,
  h: 16,
  currentW: 96,
  targetX: W / 2 - 48,
  vx: 0,
  squish: 1,
};

const state = {
  mode: 'menu',
  score: 0,
  best: Number(localStorage.getItem(STORAGE_KEYS.best) || 0),
  lives: 3,
  level: 1,
  combo: 0,
  comboTimer: 0,
  shake: 0,
  speedMult: 1,
  stars: 0,
  perfectLevel: true,
  lastLevelStats: null,
  bossLevel: false,
  bossHp: 0,
  bossHpMax: 0,
  bossShift: 0,
  levelSeed: 1,
  shield: 0,
  fireball: 0,
  sfx: localStorage.getItem(STORAGE_KEYS.sfx) !== '0',
  endless: false,
  unlockedLevel: Number(localStorage.getItem(STORAGE_KEYS.unlocked) || 1),
  endlessBest: Number(localStorage.getItem(STORAGE_KEYS.endlessBest) || 1),
  menuPanel: 'main',
  continueRun: null,
  bossAttackTimer: 2.4,
  bossPatternIndex: 0,
  bossAttackFlash: 0,
  bossArchetype: 'sauce',
  maxComboThisLevel: 0,
  medals: (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.medals) || '{}') || {}; } catch { return {}; } })(),
  settings: (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.settings || 'burgerBreakerSettingsV9') || '{}') || {}; } catch { return {}; } })(),
  rewardAnim: 0,
  bossPhaseFlash: 0,
  newBestPulse: 0,
  medalBurst: [],
  coins: Number(localStorage.getItem(STORAGE_KEYS.coins) || 0),
  shopV11: (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.shop) || '{}') || {}; } catch { return {}; } })(),
  shopMessageV11: '',
  shopMessageTimerV11: 0,
  dailyV12: (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.daily) || '{}') || {}; } catch { return {}; } })(),
  leaderboardPanelV13: false,
  lastRunRecordedV13: false,
  endlessMilestoneFlashV14: 0,
  endlessMilestoneTextV14: '',
  settingsPanelV15: false,
  settingsV15: (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || '{}') || {}; } catch { return {}; } })(),
};

const grid = {
  cols: 0,
  rows: 0,
  mask: [],
  cells: [],
  remaining: 0,
  flash: [],
  cache: document.createElement('canvas'),
  cacheDirty: true,
};
grid.cache.width = W;
grid.cache.height = H;
const gridCacheCtx = grid.cache.getContext('2d');

const balls = [];
const particles = [];
const trailParticles = [];
const powerups = [];
const floatTexts = [];
const bossProjectiles = [];
const effects = { wide: 0, slow: 0, magnet: 0 };

let pointerX = W / 2;
let pointerY = H - 100;
let lastTime = 0;
let introPulse = 0;

const images = {
  logo: new Image(),
  titleBg: new Image(),
  levels: {},
  logoReady: false,
  titleBgReady: false,
  lavaDrop: new Image(),
  lavaDropReady: false,
};
// Expose for the preloader — const isn't on window, so we reference it explicitly
window._bhbImages = images;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function make2D(r, c, fill) { return Array.from({ length: r }, () => Array.from({ length: c }, () => fill)); }
function roundRect(x, y, w, h, r, fill = false, stroke = false) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function playTone(freq, duration, type = 'sine', volume = 0.03, glide = 1) {
  if (!state.sfx || !AUDIO_CTX) return;
  if (AUDIO_CTX.state === 'suspended') AUDIO_CTX.resume().catch(() => {});
  const now = AUDIO_CTX.currentTime;
  const osc = AUDIO_CTX.createOscillator();
  const gain = AUDIO_CTX.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(60, freq * glide), now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(AUDIO_CTX.destination);
  osc.start(now);
  osc.stop(now + duration);
}

function sfx(name) {
  if (name === 'hit') playTone(540, 0.05, 'square', 0.025, 0.8);
  if (name === 'paddle') playTone(280, 0.06, 'triangle', 0.04, 1.2);
  if (name === 'powerup') { playTone(520, 0.08, 'triangle', 0.04, 1.4); setTimeout(() => playTone(760, 0.06, 'triangle', 0.03, 1.2), 30); }
  if (name === 'lose') playTone(180, 0.18, 'sawtooth', 0.05, 0.65);
  if (name === 'clear') { playTone(520, 0.08, 'triangle', 0.05, 1.25); setTimeout(() => playTone(780, 0.1, 'triangle', 0.04, 1.18), 70); }
  if (name === 'menu') playTone(420, 0.06, 'sine', 0.03, 1.15);
  if (name === 'combo') playTone(700 + state.combo * 14, 0.06, 'square', 0.04, 1.04);
}

function vibrate(ms) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

function loadImg(img, paths, ok, fail) {
  let i = 0;
  img.onload = ok;
  img.onerror = () => {
    i += 1;
    if (i < paths.length) img.src = paths[i];
    else fail();
  };
  img.src = paths[0];
}

function initImages() {
  loadImg(images.logo, ['assets/logo_burger_breaker.png'], () => { images.logoReady = true; }, () => {});
  loadImg(images.titleBg, ['assets/title_bg.png'], () => { images.titleBgReady = true; }, () => {});
  loadImg(images.lavaDrop, ['assets/lava_drop.png'], () => { images.lavaDropReady = true; }, () => {});
  LEVELS.forEach((lvl, i) => {
    const n = i + 1;
    const pad = String(n).padStart(2, '0');
    const entry = { burger: new Image(), bg: new Image(), burgerReady: false, bgReady: false };
    loadImg(entry.burger, [`assets/level_${pad}_burger.png`], () => {
      entry.burgerReady = true;
      grid.cacheDirty = true;
      // If this is the current level, rebuild mask now that image is available
      if (state.level === n && (state.mode === 'playing' || state.mode === 'aiming' || state.mode === 'levelintro')) {
        delete _autoMaskCache[`${n}_${grid.cols}_${grid.rows}`];
        buildMask();
      }
    }, () => {});
    loadImg(entry.bg, [`assets/level_${pad}_bg.png`], () => { entry.bgReady = true; }, () => {});
    images.levels[n] = entry;
  });
}

function getLevelImg() { return images.levels[state.level] || {}; }

function getLevelDef() { return LEVELS[Math.min(state.level - 1, LEVELS.length - 1)]; }
function isBossLevel(level = state.level) {
  return level > 0 && level % 5 === 0;
}
function getMaxUnlockedSelectableLevel() {
  return clamp(Math.floor(state.unlockedLevel || 1), 1, LEVELS.length);
}

function getBossArchetype(level = state.level) {
  if (level === 10) return 'sauce'; // level 10 clones level 5 boss
  const bossIndex = Math.max(0, Math.floor(level / 5) - 1) % 3;
  return ['sauce', 'grill', 'stack'][bossIndex];
}
function getBossBadgeLabel(archetype) {
  return ({ sauce: 'SAUCE BADGE', grill: 'GRILL BADGE', stack: 'STACK BADGE' })[archetype] || 'BOSS BADGE';
}
function medalRecordFor(level = state.level) {
  return state.medals[String(level)] || { stars: 0, noDeath: false, combo10: false, bossBadge: '' };
}
function saveMedals() {
  localStorage.setItem(STORAGE_KEYS.medals, JSON.stringify(state.medals));
}

function saveCoinsRealV10() {
  localStorage.setItem(STORAGE_KEYS.coins, String(Math.max(0, Math.floor(state.coins || 0))));
}
function rewardCoinsRealV10(amount) {
  const gain = Math.max(0, Math.floor(amount || 0));
  state.coins = Math.max(0, Math.floor((state.coins || 0) + gain));
  saveCoinsRealV10();
  return gain;
}

const SHOP_V11 = {
  paddle: {
    currentKey: 'paddleSkin',
    ownedKey: 'ownedPaddles',
    items: [
      { id: 'classic', label: 'Classic Paddle', cost: 0 },
      { id: 'gold', label: 'Gold Paddle', cost: 120 },
      { id: 'plasma', label: 'Plasma Paddle', cost: 240 },
    ]
  },
  ball: {
    currentKey: 'ballSkin',
    ownedKey: 'ownedBalls',
    items: [
      { id: 'classic', label: 'Classic Ball', cost: 0 },
      { id: 'mint', label: 'Mint Ball', cost: 90 },
      { id: 'sunset', label: 'Sunset Ball', cost: 180 },
    ]
  },
  trail: {
    currentKey: 'trailSkin',
    ownedKey: 'ownedTrails',
    items: [
      { id: 'classic', label: 'Classic Trail', cost: 0 },
      { id: 'spark', label: 'Spark Trail', cost: 110 },
      { id: 'neon', label: 'Neon Trail', cost: 210 },
    ]
  }
};

function saveShopRealV11() {
  localStorage.setItem(STORAGE_KEYS.shop, JSON.stringify(state.shopV11 || {}));
}

// Sync shop skin selections into V6 cosmetics so drawPaddle/drawBall/drawTrail use them
function syncShopSkinsToCosmetics() {
  if (!state.cosmetics) state.cosmetics = {};
  const s = state.shopV11 || {};
  // Map shop skin IDs to V6_SKINS keys
  const paddleMap = { classic: 'classic', gold: 'gold', plasma: 'plasma' };
  const ballMap   = { classic: 'plasma',  mint: 'mint', sunset: 'sunset' };
  const trailMap  = { classic: 'neon',    spark: 'spark', neon: 'neon' };
  state.cosmetics.paddle = paddleMap[s.paddleSkin] || 'classic';
  state.cosmetics.ball   = ballMap[s.ballSkin]     || 'plasma';
  state.cosmetics.trail  = trailMap[s.trailSkin]   || 'neon';
}

function ensureShopRealV11() {
  const s = state.shopV11 || {};
  state.shopV11 = {
    menuOpen: false,
    category: s.category || 'paddle',
    paddleSkin: s.paddleSkin || 'classic',
    ballSkin: s.ballSkin || 'classic',
    trailSkin: s.trailSkin || 'classic',
    ownedPaddles: Array.from(new Set([...(s.ownedPaddles || []), 'classic'])),
    ownedBalls: Array.from(new Set([...(s.ownedBalls || []), 'classic'])),
    ownedTrails: Array.from(new Set([...(s.ownedTrails || []), 'classic'])),
    _gameplay: s._gameplay || {},  // preserve purchased boosts
  };
  saveShopRealV11();
}

function getShopCategoryStateRealV11(category) {
  ensureShopRealV11()
  return SHOP_V11[category];
}

function ownedSkinRealV11(category, skinId) {
  const cfg = getShopCategoryStateRealV11(category);
  return (state.shopV11[cfg.ownedKey] || []).includes(skinId);
}

function currentSkinRealV11(category) {
  const cfg = getShopCategoryStateRealV11(category);
  return state.shopV11[cfg.currentKey];
}

function setEquippedSkinRealV11(category, skinId) {
  const cfg = getShopCategoryStateRealV11(category);
  if (!ownedSkinRealV11(category, skinId)) return false;
  state.shopV11[cfg.currentKey] = skinId;
  saveShopRealV11();
  syncShopSkinsToCosmetics();
  state.shopMessageV11 = 'EQUIPPED';
  state.shopMessageTimerV11 = 1.1;
  return true;
}

function buyOrEquipSkinRealV11(category, skinId) {
  ensureShopRealV11();
  const cfg = getShopCategoryStateRealV11(category);
  const item = cfg.items.find(i => i.id === skinId);
  if (!item) return false;

  if (ownedSkinRealV11(category, skinId)) {
    setEquippedSkinRealV11(category, skinId);
    return true;
  }

  if ((state.coins || 0) < item.cost) {
    state.shopMessageV11 = 'NOT ENOUGH COINS';
    state.shopMessageTimerV11 = 1.4;
    sfx('fail');
    return false;
  }

  state.coins -= item.cost;
  saveCoinsRealV10();
  state.shopV11[cfg.ownedKey] = Array.from(new Set([...(state.shopV11[cfg.ownedKey] || []), skinId]));
  state.shopV11[cfg.currentKey] = skinId;
  saveShopRealV11();
  syncShopSkinsToCosmetics();
  state.shopMessageV11 = 'PURCHASED';
  state.shopMessageTimerV11 = 1.4;
  sfx('medal');
  vibrate(16);
  return true;
}

function getPaddlePaletteRealV11() {
  const skin = currentSkinRealV11('paddle');
  if (skin === 'gold') return ['#5a4300', '#ffd166', '#5a4300'];
  if (skin === 'plasma') return ['#3a005a', '#ff4fd8', '#3a005a'];
  return ['#003049', '#00c2ff', '#003049'];
}

function getBallPaletteRealV11() {
  const skin = currentSkinRealV11('ball');
  if (skin === 'mint') return ['#ffffff', '#b8ffcf', '#38d39f'];
  if (skin === 'sunset') return ['#fff7e6', '#ffb199', '#ff7b54'];
  return ['#ffffff', '#8ef6ff', '#2996ff'];
}

function getTrailColorRealV11() {
  const skin = currentSkinRealV11('trail');
  if (skin === 'spark') return '#ffe08a';
  if (skin === 'neon') return '#ff4fd8';
  return '#7bd3ff';
}

function saveDailyRealV12() {
  localStorage.setItem(STORAGE_KEYS.daily, JSON.stringify(state.dailyV12 || {}));
}
function todayKeyRealV12() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function buildDailyChallengeRealV12() {
  const day = todayKeyRealV12();
  const seed = parseInt(day.replace(/-/g, ''), 10);
  const idx = seed % 4;
  const pool = [
    { id: 'clear_any', text: 'Clear any level', reward: 35, check: () => !!(state.lastLevelStats && state.lastLevelStats.cleared) },
    { id: 'no_death', text: 'Finish a level with no death', reward: 55, check: () => !!(state.lastLevelStats && state.lastLevelStats.noDeath) },
    { id: 'combo_10', text: 'Reach combo 10', reward: 45, check: () => !!(state.lastLevelStats && state.lastLevelStats.combo10) },
    { id: 'boss_clear', text: 'Beat a boss level', reward: 70, check: () => !!(state.lastLevelStats && state.lastLevelStats.bossBadge) },
  ];
  return pool[idx];
}
function ensureDailyRealV12() {
  const day = todayKeyRealV12();
  const challenge = buildDailyChallengeRealV12();
  if (!state.dailyV12.day || state.dailyV12.day !== day) {
    state.dailyV12 = {
      day: day,
      bonusClaimed: false,
      challengeClaimed: false,
      challenge: { id: challenge.id, text: challenge.text, reward: challenge.reward }
    };
    saveDailyRealV12();
  }
}
function awardDailyBonusRealV12() {
  ensureDailyRealV12();
  if (state.dailyV12.bonusClaimed) return 0;
  state.dailyV12.bonusClaimed = true;
  saveDailyRealV12();
  const gain = rewardCoinsRealV10(60);
  state.shopMessageV11 = 'DAILY BONUS +' + gain;
  state.shopMessageTimerV11 = 1.8;
  sfx('medal');
  vibrate(16);
  return gain;
}
function maybeAwardDailyChallengeRealV12() {
  ensureDailyRealV12();
  if (state.dailyV12.challengeClaimed) return 0;
  const challenge = buildDailyChallengeRealV12();
  if (challenge.check()) {
    state.dailyV12.challengeClaimed = true;
    saveDailyRealV12();
    const gain = rewardCoinsRealV10(challenge.reward);
    state.shopMessageV11 = 'CHALLENGE +' + gain;
    state.shopMessageTimerV11 = 2.0;
    sfx('medal');
    vibrate(18);
    return gain;
  }
  return 0;
}

function getLeaderboardRealV13(mode) {
  const key = mode === 'endless' ? STORAGE_KEYS.leaderboardEndless : STORAGE_KEYS.leaderboardCampaign;
  try {
    const rows = JSON.parse(localStorage.getItem(key) || '[]') || [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
function saveLeaderboardRealV13(mode, rows) {
  const key = mode === 'endless' ? STORAGE_KEYS.leaderboardEndless : STORAGE_KEYS.leaderboardCampaign;
  localStorage.setItem(key, JSON.stringify((rows || []).slice(0, 10)));
}
function recordLeaderboardEntryRealV13(mode, entry) {
  const rows = getLeaderboardRealV13(mode);
  rows.push(entry);
  rows.sort((a, b) => (b.score || 0) - (a.score || 0));
  saveLeaderboardRealV13(mode, rows);
}
function recordRunIfNeededRealV13(reason = 'gameover') {
  if (state.lastRunRecordedV13) return;
  const entry = {
    score: Math.max(0, Math.floor(state.score || 0)),
    level: Math.max(1, Math.floor(state.level || 1)),
    lives: Math.max(0, Math.floor(state.lives || 0)),
    reason: reason,
    at: Date.now()
  };
  if (state.endless) {
    entry.depth = Math.max(1, Math.floor(state.level || 1));
    recordLeaderboardEntryRealV13('endless', entry);
  } else {
    recordLeaderboardEntryRealV13('campaign', entry);
  }
  state.lastRunRecordedV13 = true;
  // Notify parent portal so it can submit to the backend leaderboard
  try {
    window.parent.postMessage({
      type: 'BHB_SCORE',
      game: 'burgerbreaker',
      mode: state.endless ? 'endless' : 'campaign',
      score: entry.score,
      level: entry.level,
      reason: reason,
    }, '*');
  } catch (_) {}
}

// Shared helper — posts the current in-progress score to the parent portal.
// Called on every level clear so scores are captured even if the player
// closes the tab mid-run or never reaches game-over / full victory.
function _bhbPostScore() {
  try {
    window.parent.postMessage({
      type: 'BHB_SCORE',
      game: 'burgerbreaker',
      mode: state.endless ? 'endless' : 'campaign',
      score: Math.max(0, Math.floor(state.score || 0)),
      level: Math.max(1, Math.floor(state.level || 1)),
      reason: 'levelclear',
    }, '*');
  } catch (_) {}
}

function triggerEndlessMilestoneRealV14(depth) {
  const bonus = 40 + Math.floor(depth / 2);
  rewardCoinsRealV10(bonus);
  state.endlessMilestoneFlashV14 = 1;
  state.endlessMilestoneTextV14 = 'MILESTONE • DEPTH ' + depth + ' • +' + bonus + ' COINS';
  state.shopMessageV11 = 'ENDLESS BONUS +' + bonus;
  state.shopMessageTimerV11 = 1.8;
  sfx('medal');
  vibrate(16);
}

function saveSettingsRealV15() {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settingsV15 || {}));
}
function ensureSettingsRealV15() {
  state.settingsV15 = Object.assign({ vibration: true, sfxBoost: true }, state.settingsV15 || {});
  saveSettingsRealV15();
}
function resetProgressRealV15() {
  localStorage.removeItem(STORAGE_KEYS.coins);
  localStorage.removeItem(STORAGE_KEYS.shop);
  localStorage.removeItem(STORAGE_KEYS.daily);
  localStorage.removeItem(STORAGE_KEYS.leaderboardCampaign);
  localStorage.removeItem(STORAGE_KEYS.leaderboardEndless);
  localStorage.removeItem(STORAGE_KEYS.settings);

  state.coins = 0;
  state.shopV11 = {
    menuOpen: false,
    category: 'paddle',
    paddleSkin: 'classic',
    ballSkin: 'classic',
    trailSkin: 'classic',
    ownedPaddles: ['classic'],
    ownedBalls: ['classic'],
    ownedTrails: ['classic'],
  };
  state.dailyV12 = {};
  state.settingsV15 = { vibration: true, sfxBoost: true };
  state.lastRunRecordedV13 = false;
  saveCoinsRealV10();
  saveShopRealV11();
  saveSettingsRealV15();
  ensureDailyRealV12();
  state.shopMessageV11 = 'PROGRESS RESET';
  state.shopMessageTimerV11 = 1.8;
  state.mode = 'menu';
}

function ensureSettingsDefaults() {
  const defaults = { vibration: true, sfxBoost: true };
  state.settings = Object.assign({}, defaults, state.settings || {});
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
}
function saveSettings() {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
}
function vibrate(ms = 12) {
  try {
    if (state.settingsV15 && state.settingsV15.vibration && navigator.vibrate) navigator.vibrate(ms);
  } catch (e) {}
}
function playMedalBurst(x = W / 2, y = H / 2) {
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 1.4 + Math.random() * 3.8;
    state.medalBurst.push({
      x, y,
      dx: Math.cos(a) * s,
      dy: Math.sin(a) * s,
      life: 1,
      color: i % 2 ? '#ffe08a' : '#d7f28b',
      size: 3 + Math.random() * 3,
    });
  }
}
function updateLevelMedalRecord(level, patch) {
  const key = String(level);
  const prev = state.medals[key] || { stars: 0, noDeath: false, combo10: false, bossBadge: '' };
  state.medals[key] = {
    stars: Math.max(prev.stars || 0, patch.stars || 0),
    noDeath: !!(prev.noDeath || patch.noDeath),
    combo10: !!(prev.combo10 || patch.combo10),
    bossBadge: prev.bossBadge || patch.bossBadge || '',
  };
  saveMedals();
}

function normalizeProgressionState() {
  state.unlockedLevel = getMaxUnlockedSelectableLevel();
  localStorage.setItem(STORAGE_KEYS.unlocked, String(state.unlockedLevel));
  const saved = loadRunState();
  if (saved) {
    saved.level = clamp(Math.floor(saved.level || 1), 1, getMaxUnlockedSelectableLevel());
    saved.unlockedLevel = clamp(Math.floor(saved.unlockedLevel || 1), 1, LEVELS.length);
    localStorage.setItem(STORAGE_KEYS.runState, JSON.stringify(saved));
    state.continueRun = saved;
  }
}
function seededNoise(x, y, seed) {
  return (Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233 + seed * 37.719) + 1) * 0.5;
}
function makeProceduralMask(cols, rows, seed, boss = false) {
  const mask = [];
  const cx = (cols - 1) / 2;
  const cy = rows * (boss ? 0.54 : 0.50);
  const rx = cols * (boss ? 0.43 : 0.46);
  const ry = rows * (boss ? 0.33 : 0.37);
  const bunLift = rows * 0.14;
  for (let r = 0; r < rows; r++) {
    let row = '';
    for (let c = 0; c < cols; c++) {
      const nx = (c - cx) / rx;
      const ny = (r - cy) / ry;
      const ellipse = nx * nx + ny * ny;
      const crown = ((c - cx) / (cols * 0.42)) ** 2 + ((r - (cy - bunLift)) / (rows * 0.23)) ** 2;
      const bottom = ((c - cx) / (cols * 0.48)) ** 2 + ((r - (cy + rows * 0.16)) / (rows * 0.18)) ** 2;
      const biteCenterX = boss ? cols * 0.73 : cols * (0.78 + 0.05 * Math.sin(seed));
      const biteCenterY = rows * (boss ? 0.23 : 0.18);
      const bite = ((c - biteCenterX) / (cols * (boss ? 0.15 : 0.12))) ** 2 + ((r - biteCenterY) / (rows * 0.12)) ** 2;
      const noise = seededNoise(c, r, seed);
      const ingredientBand = r > rows * 0.34 && r < rows * 0.70 && Math.abs(c - cx) < cols * 0.46 + (noise - 0.5) * 2.2;
      const crownBand = crown < (boss ? 0.94 : 1.02);
      const bottomBand = bottom < (boss ? 1.05 : 1.10);
      const body = ellipse < (boss ? 0.84 : 0.96);
      const sesameHole = noise > 0.965 && r < rows * 0.28 && !boss;
      const alive = (body || crownBand || bottomBand || ingredientBand) && bite > 1.0 && !sesameHole;
      row += alive ? '1' : '0';
    }
    mask.push(row);
  }
  return {
    mask,
    cropX: 96,
    cropY: boss ? 108 : 120,
    cropW: 822,
    cropH: boss ? 770 : 745,
  };
}
function getLevelMask() {
  // For levels with known crops, use auto-detection if image is ready
  if (LEVEL_MASKS[state.level]) return LEVEL_MASKS[state.level];
  const def = getLevelDef();
  return makeProceduralMask(def.cols, def.rows, state.levelSeed || state.level, isBossLevel(state.level));
}

function getLevelBurgerBox() {
  const lm = getLevelMask();
  const aspect = lm.cropH / lm.cropW;
  const isBoss = isBossLevel(state.level);
  const bw = isBoss ? 390 : 420;
  const bh = Math.round(bw * aspect);
  const baseX = Math.round((W - bw) / 2);
  const shift = isBoss ? state.bossShift : 0;
  return { x: Math.round(baseX + shift), y: isBoss ? 102 : 76, w: bw, h: bh };
}

function currentSpeed() {
  let speed = 7.7 * state.speedMult;
  if (effects.slow > 0) speed *= 0.68;
  return Math.min(speed, 14);
}

function normalizeVelocity(ball) {
  const target = currentSpeed();
  const mag = Math.hypot(ball.dx, ball.dy) || 1;
  ball.dx = (ball.dx / mag) * target;
  ball.dy = (ball.dy / mag) * target;
  const minVertical = target * 0.72;
  if (Math.abs(ball.dy) < minVertical) {
    ball.dy = (ball.dy < 0 ? -1 : 1) * minVertical;
    const remain = Math.max(1, target * target - ball.dy * ball.dy);
    ball.dx = (ball.dx < 0 ? -1 : 1) * Math.sqrt(remain);
  }
}

function getSafeLaunchVelocity(speed = currentSpeed(), aimDx = null, aimDy = null) {
  let angle = -Math.PI / 2;
  if (aimDx != null && aimDy != null) {
    angle = Math.atan2(aimDy, aimDx);
  } else {
    angle += (Math.random() * 0.34 - 0.17);
  }
  const minAngle = -Math.PI / 2 - 0.34;
  const maxAngle = -Math.PI / 2 + 0.34;
  angle = clamp(angle, minAngle, maxAngle);
  return {
    dx: Math.cos(angle) * speed,
    dy: Math.sin(angle) * speed,
  };
}

function createBall(x, y, dx, dy, attached = false) {
  const ball = {
    x, y,
    prevX: x,
    prevY: y,
    dx, dy,
    r: 9,
    spin: 0,
    attached,
    aimDx: null,
    aimDy: null,
    fireball: 0,
    trail: [],
  };
  normalizeVelocity(ball);
  return ball;
}

function resetBallsOnPaddle() {
  balls.length = 0;
  state.fireball = 0;
  paddle.currentW = effects.wide > 0 ? paddle.w * 1.6 : paddle.w;
  const x = paddle.x + paddle.currentW / 2;
  const y = paddle.y - 12;
  const start = getSafeLaunchVelocity();
  balls.push(createBall(x, y, start.dx, start.dy, true));
}

function launchAttachedBalls() {
  for (const ball of balls) {
    if (!ball.attached) continue;
    const speed = currentSpeed();
    const launch = getSafeLaunchVelocity(speed, ball.aimDx, ball.aimDy);
    ball.dx = launch.dx;
    ball.dy = launch.dy;
    ball.spin = 0;
    ball.attached = false;
    normalizeVelocity(ball);
  }
  sfx('menu');
}


function generateBrickHealth(rowRatio, level, col, row) {
  const roll = (Math.sin((col + 1) * 91.7 + (row + 1) * 49.13 + level * 17.11) + 1) / 2;
  const boss = isBossLevel(level);
  return 1; // all levels: single hit only
}


function buildMask() {
  const def = getLevelDef();
  const lm = getLevelMask();
  grid.cols = def.cols;
  grid.rows = def.rows;
  grid.mask = make2D(grid.rows, grid.cols, 0);
  grid.cells = make2D(grid.rows, grid.cols, 0);
  grid.flash = make2D(grid.rows, grid.cols, 0);
  grid.remaining = 0;
  state.bossHp = 0;
  state.bossHpMax = 0;

  // Try auto-silhouette first (pixel-accurate from the burger image)
  const autoMask = buildAutoMask(state.level, grid.cols, grid.rows);

  if (autoMask) {
    // Use pixel-sampled mask directly
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const alive = autoMask[r][c] === 1;
        grid.mask[r][c] = alive ? 1 : 0;
        if (alive) {
          grid.cells[r][c] = generateBrickHealth(r / Math.max(1, grid.rows - 1), state.level, c, r);
          grid.remaining += 1;
          state.bossHp += grid.cells[r][c];
        }
      }
    }
  } else {
    // Fallback: use string mask array (procedural levels or image not yet loaded)
    const maskArr = (lm && lm.mask) ? lm.mask : null;
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        let alive = true;
        if (maskArr && maskArr.length > 0) {
          const sr = Math.min(maskArr.length - 1, Math.floor((r / grid.rows) * maskArr.length));
          const sc = Math.min(maskArr[0].length - 1, Math.floor((c / grid.cols) * maskArr[0].length));
          alive = maskArr[sr][sc] === '1';
        }
        grid.mask[r][c] = alive ? 1 : 0;
        if (alive) {
          grid.cells[r][c] = generateBrickHealth(r / Math.max(1, grid.rows - 1), state.level, c, r);
          grid.remaining += 1;
          state.bossHp += grid.cells[r][c];
        }
      }
    }
  }

  state.bossHpMax = state.bossHp;
  grid.cacheDirty = true;
}

function comboMultiplier() {
  return 1 + Math.min(5, Math.floor(state.combo / 2)) * 0.5;
}

function addFloatText(text, x, y, color = '#fff', size = 16) {
  floatTexts.push({ text, x, y, life: 1, color, size });
}

function spawnParticles(x, y, color, count = 9, force = 1) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (1.2 + Math.random() * 3) * force;
    particles.push({
      x, y,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.03 + Math.random() * 0.05,
      r: 2 + Math.random() * 4,
      color,
    });
  }
}

const POWERUP_COLORS = {
  wide: '#00e5ff',
  slow: '#b39ddb',
  life: '#ff7b54',
  multiball: '#ffd54f',
  fire: '#ff5252',
  shield: '#7ee081',
  magnet: '#64b5f6',
};

function spawnPowerup(x, y) {
  if (Math.random() > 0.17) return;
  const types = ['wide', 'slow', 'life', 'multiball', 'shield', 'magnet'];
  const bias = Math.random();
  let type = types[Math.floor(Math.random() * types.length)];
  if (bias > 0.75) type = 'multiball';
  powerups.push({ x, y, type, dy: 110, r: 20, sway: Math.random() * Math.PI * 2 });
}

function applyPowerup(type) {
  if (type === 'wide') effects.wide = 10;
  if (type === 'slow') effects.slow = 7;
  if (type === 'life') state.lives = Math.min(5, state.lives + 1);
  if (type === 'shield') state.shield = 16;
  if (type === 'magnet') effects.magnet = 12;
  if (type === 'multiball') {
    const source = balls[0];
    if (source) {
      const spd = currentSpeed();
      // Spawn two extra balls going upward, fanned out to the sides
      const variants = [
        createBall(source.x, source.y, -spd * 0.6, -spd * 0.8),  // up-left
        createBall(source.x, source.y,  spd * 0.6, -spd * 0.8),  // up-right
      ];
      for (const b of variants) {
        b.spin = source.spin * 0.6;
        normalizeVelocity(b);
        balls.push(b);
      }
    }
  }
  addFloatText(type === 'life' ? '+1 LIFE' : type.toUpperCase(), W / 2, 112, POWERUP_COLORS[type], 18);
  spawnParticles(paddle.x + paddle.currentW / 2, paddle.y, POWERUP_COLORS[type], 12, 1.4);
  sfx('powerup');
  vibrate(12);
}

function getCanvasPos(evt) {
  const rect = canvas.getBoundingClientRect();
  const src = evt.touches ? evt.touches[0] : evt;
  return {
    x: (src.clientX - rect.left) * (W / rect.width),
    y: (src.clientY - rect.top) * (H / rect.height),
  };
}

function saveBest() {
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem(STORAGE_KEYS.best, String(state.best));
  }
  if (state.endless && state.level > state.endlessBest) {
    state.endlessBest = state.level;
    localStorage.setItem(STORAGE_KEYS.endlessBest, String(state.endlessBest));
  }
}

function saveUnlockedLevel(level = state.level) {
  const clampedLevel = clamp(Math.floor(level || 1), 1, LEVELS.length);
  state.unlockedLevel = clamp(Math.max(state.unlockedLevel, clampedLevel), 1, LEVELS.length);
  localStorage.setItem(STORAGE_KEYS.unlocked, String(state.unlockedLevel));
}

function saveRunState() {
  const payload = {
    level: clamp(Math.floor(state.level || 1), 1, getMaxUnlockedSelectableLevel()),
    score: state.score,
    lives: state.lives,
    endless: state.endless,
    unlockedLevel: clamp(Math.floor(state.unlockedLevel || 1), 1, LEVELS.length),
  };
  localStorage.setItem(STORAGE_KEYS.runState, JSON.stringify(payload));
  state.continueRun = payload;
}

function loadRunState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.runState);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.level !== 'number') return null;
    return {
      level: clamp(Math.floor(data.level), 1, LEVELS.length),
      score: Math.max(0, Math.floor(data.score || 0)),
      lives: clamp(Math.floor(data.lives || 3), 1, 5),
      endless: !!data.endless,
      unlockedLevel: clamp(Math.floor(data.unlockedLevel || 1), 1, LEVELS.length),
    };
  } catch {
    return null;
  }
}

function clearRunState() {
  localStorage.removeItem(STORAGE_KEYS.runState);
  state.continueRun = null;
}

function getDisplayedLevelName(level = state.level) {
  return state.endless ? `Endless ${level}` : getLevelDef().name;
}


function configureLevel() {
  const def = getLevelDef();
  state.speedMult = def.speedMult + Math.max(0, state.level - LEVELS.length) * 0.02;
  state.levelSeed = state.level * 97 + 13 + (state.endless ? 777 : 0);
  state.bossLevel = isBossLevel(state.level);
  state.bossShift = 0;
  state.bossAttackTimer = state.bossLevel ? 4.5 : 999;  // longer initial pause before first attack
  state.bossPatternIndex = 0;
  state.bossAttackFlash = 0;
  state.bossArchetype = state.bossLevel ? getBossArchetype(state.level) : 'sauce';
  state.maxComboThisLevel = 0;
  state.bossPhaseTriggered = false;
  paddle.w = Math.max(44, def.paddleW - (state.endless ? Math.floor((state.level - 1) / 6) : 0));
  paddle.currentW = paddle.w;
  paddle.targetX = clamp(pointerX - paddle.currentW / 2, playfield.x, playfield.x + playfield.w - paddle.currentW);
  state.perfectLevel = true;
  state.shield = 0;
  state.fireball = 0;
  effects.wide = 0;
  effects.slow = 0;
  effects.magnet = 0;
  powerups.length = 0;
  particles.length = 0;
  trailParticles.length = 0;
  floatTexts.length = 0;
  bossProjectiles.length = 0;
  buildMask();
  resetBallsOnPaddle();
  saveRunState();
}

function startGame(options = {}) {
  const {
    level = 1,
    score = 0,
    lives = 3,
    endless = false,
  } = options;
  state.score = score;
  state.lives = lives;
  state.level = endless ? clamp(Math.floor(level || 1), 1, LEVELS.length) : clamp(Math.floor(level || 1), 1, getMaxUnlockedSelectableLevel());
  state.endless = endless;
  state.combo = 0;
  state.comboTimer = 0;
  state.lastLevelStats = null;
  state.menuPanel = 'main';
  syncShopSkinsToCosmetics();
  configureLevel();
  state.mode = 'levelintro';
}


function jumpToLevel(n) {
  state.score = 0; state.lives = 3; state.level = clamp(n, 1, LEVELS.length);
  state.combo = 0; state.comboTimer = 0; state.endless = false;
  state.menuPanel = 'main';
  syncShopSkinsToCosmetics();
  configureLevel();
  state.mode = 'levelintro';
}
function continueSavedGame() {
  const saved = loadRunState();
  if (!saved) {
    startGame();
    return;
  }
  state.unlockedLevel = clamp(state.unlockedLevel, 1, LEVELS.length);
  saved.level = clamp(saved.level, 1, getMaxUnlockedSelectableLevel());
  saved.unlockedLevel = clamp(saved.unlockedLevel, 1, LEVELS.length);
  startGame(saved);
}

function nextLevel() {
  state.level += 1;
  if (state.endless && state.level % 10 === 0) {
    triggerEndlessMilestoneRealV14(state.level);
  }
  // Unlock only the level the player has actually reached by clearing the previous one.
  saveUnlockedLevel(state.level);
  state.lives = 3; // reset lives for every new level
  configureLevel();
  state.mode = 'levelintro';
}

function restartLevel() {
  configureLevel();
  state.mode = 'levelintro';
}

function goToMenu() {
  state.mode = 'menu';
  state.menuPanel = 'main';
  powerups.length = 0;
  particles.length = 0;
  trailParticles.length = 0;
  floatTexts.length = 0;
  bossProjectiles.length = 0;
  balls.length = 0;
  resetBallsOnPaddle();
  state.continueRun = loadRunState();
}

function togglePause() {
  if (state.mode === 'playing' || state.mode === 'aiming') state.mode = 'paused';
  else if (state.mode === 'paused') state.mode = balls.some(b => b.attached) ? 'aiming' : 'playing';
}

const BTN = {
  nextLevel: { x: W / 2 - 130, y: 420, w: 260, h: 50 },
  restart: { x: W / 2 - 130, y: 420, w: 260, h: 50 },
  menuFromClear: { x: W / 2 - 130, y: 484, w: 260, h: 50 },
  menuFromOver: { x: W / 2 - 130, y: 484, w: 260, h: 50 },
  resume: { x: W / 2 - 130, y: 350, w: 260, h: 50 },
  restartPause: { x: W / 2 - 130, y: 414, w: 260, h: 50 },
  menuPause: { x: W / 2 - 130, y: 478, w: 260, h: 50 },
  start: { x: W / 2 - 130, y: 448, w: 260, h: 54 },
  continue: { x: W / 2 - 130, y: 386, w: 260, h: 48 },
  levelSelect: { x: W / 2 - 130, y: 512, w: 260, h: 48 },
  endlessToggle: { x: W / 2 - 130, y: 570, w: 260, h: 48 },
  backLevels: { x: W / 2 - 130, y: 700, w: 260, h: 42 },
  fullscreen: { x: W - 64, y: 18, w: 42, h: 42 },
  sfx: { x: W - 116, y: 18, w: 42, h: 42 },
};

function hitBtn(btn, x, y) {
  return x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h;
}

async function toggleFullscreen() {
  const root = document.documentElement;
  if (!document.fullscreenElement) {
    if (root.requestFullscreen) await root.requestFullscreen().catch(() => {});
  } else if (document.exitFullscreen) {
    await document.exitFullscreen().catch(() => {});
  }
}

function handlePrimaryAction() {
  if (state.mode === 'menu') { startGame(); return; }
  // levelintro is handled separately on pointerup only — don't handle here
  if (state.mode === 'aiming') { state.mode = 'playing'; launchAttachedBalls(); return; }
  if (state.mode === 'playing') { state.mode = 'paused'; return; }
  if (state.mode === 'paused') { state.mode = balls.some(b => b.attached) ? 'aiming' : 'playing'; }
}

function handlePointer(evt) {
  const p = getCanvasPos(evt);
  pointerX = p.x;
  pointerY = p.y;

  if (hitBtn(BTN.fullscreen, p.x, p.y)) { toggleFullscreen(); return; }
  if (hitBtn(BTN.sfx, p.x, p.y)) {
    state.sfx = !state.sfx;
    localStorage.setItem(STORAGE_KEYS.sfx, state.sfx ? '1' : '0');
    sfx('menu');
    return;
  }

  if (state.mode === 'levelclear') {
    if (hitBtn(BTN.nextLevel, p.x, p.y)) { nextLevel(); return; }
    if (hitBtn(BTN.menuFromClear, p.x, p.y)) { goToMenu(); return; }
    return;
  }

  if (state.mode === 'gameover') {
    if (hitBtn(BTN.restart, p.x, p.y)) { startGame(); return; }
    if (hitBtn(BTN.menuFromOver, p.x, p.y)) { goToMenu(); return; }
    return;
  }

  if (state.mode === 'paused') {
    if (hitBtn(BTN.resume, p.x, p.y)) { togglePause(); return; }
    if (hitBtn(BTN.restartPause, p.x, p.y)) { restartLevel(); return; }
    if (hitBtn(BTN.menuPause, p.x, p.y)) { goToMenu(); return; }
  }

  if (state.mode === 'menu') {
    if (state.menuPanel === 'levels') {
      if (hitBtn(BTN.backLevels, p.x, p.y)) { state.menuPanel = 'main'; return; }
      const cols = 5;
      const cellW = 88;
      const cellH = 54;
      const startX = W / 2 - ((cols * cellW) + ((cols - 1) * 12)) / 2;
      const startY = 228;
      const maxLevel = getMaxUnlockedSelectableLevel();
      for (let idx = 1; idx <= maxLevel; idx++) {
        const col = (idx - 1) % cols;
        const row = Math.floor((idx - 1) / cols);
        const x = startX + col * (cellW + 12);
        const y = startY + row * (cellH + 12);
        if (p.x >= x && p.x <= x + cellW && p.y >= y && p.y <= y + cellH) {
          if (idx <= getMaxUnlockedSelectableLevel()) {
            startGame({ level: idx, endless: state.endless });
          }
          return;
        }
      }
      return;
    }
    if (hitBtn(BTN.continue, p.x, p.y) && state.continueRun) { continueSavedGame(); return; }
    if (hitBtn(BTN.start, p.x, p.y)) { startGame({ endless: state.endless }); return; }
    if (hitBtn(BTN.levelSelect, p.x, p.y)) { state.menuPanel = 'levels'; return; }
    if (hitBtn(BTN.endlessToggle, p.x, p.y)) { state.endless = !state.endless; return; }
  }

  handlePrimaryAction();
}

canvas.addEventListener('pointerdown', handlePointer);
canvas.addEventListener('mousemove', e => {
  const p = getCanvasPos(e);
  pointerX = p.x;
  pointerY = p.y;
});
canvas.addEventListener('touchmove', e => {
  const p = getCanvasPos(e);
  pointerX = p.x;
  pointerY = p.y;
}, { passive: true });
canvas.addEventListener('pointerup', e => {
  const p = getCanvasPos(e);
  pointerX = p.x;
  pointerY = p.y;
  // levelintro → aiming on release (so the same tap can't also trigger aiming → playing)
  if (state.mode === 'levelintro') { state.mode = 'aiming'; return; }
  if (state.mode === 'aiming') { state.mode = 'playing'; launchAttachedBalls(); }
});

window.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') pointerX -= 28;
  if (e.key === 'ArrowRight') pointerX += 28;
  if (e.key === ' ' || e.key === 'Enter') handlePrimaryAction();
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') togglePause();
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  if (e.key === 'm' || e.key === 'M') {
    state.sfx = !state.sfx;
    localStorage.setItem(STORAGE_KEYS.sfx, state.sfx ? '1' : '0');
  }
  if (state.mode === 'menu' && (e.key === 'c' || e.key === 'C') && state.continueRun) continueSavedGame();
  if (state.mode === 'menu' && (e.key === 'l' || e.key === 'L')) state.menuPanel = state.menuPanel === 'levels' ? 'main' : 'levels';
  // Dev: press $ to add 500 coins for shop testing
  if (e.key === '$') { rewardCoinsRealV10(500); addFloatText('+500 COINS', W / 2, 200, '#ffe08a', 16); }
  // Dev: Ctrl+number jumps to that level (Ctrl+1=L1, Ctrl+0=L10, Ctrl+shift+1=L11 etc)
  if (e.ctrlKey && e.key >= '0' && e.key <= '9') {
    const n = e.key === '0' ? 10 : parseInt(e.key);
    state.unlockedLevel = Math.max(state.unlockedLevel, n); // unlock up to that level
    localStorage.setItem(STORAGE_KEYS.unlocked, String(state.unlockedLevel));
    jumpToLevel(n);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && (state.mode === 'playing' || state.mode === 'aiming')) state.mode = 'paused';
});

function drawBackground() {
  ctx.clearRect(0, 0, W, H);
  const limg = getLevelImg();
  if (limg.bgReady) {
    ctx.drawImage(limg.bg, 0, 0, W, H);
    ctx.fillStyle = state.level === 7 ? 'rgba(0,0,0,0.34)' : 'rgba(0,0,0,0.50)';
    ctx.fillRect(0, 0, W, H);
  } else {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#12203a');
    bg.addColorStop(1, '#090d16');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  roundRect(playfield.x, playfield.y, playfield.w, playfield.h, 22, true);
  // Extend the same tint below the playfield to the canvas bottom so there's no untreated strip
  ctx.fillRect(0, playfield.y + playfield.h, W, H - playfield.y - playfield.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 10; i++) {
    const y = playfield.y + 40 + i * 58;
    ctx.beginPath();
    ctx.moveTo(playfield.x + 14, y);
    ctx.lineTo(playfield.x + playfield.w - 14, y);
    ctx.stroke();
  }

  if (state.shake > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.12, state.shake * 0.01)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawHudButton(btn, label) {
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(btn.x, btn.y, btn.w, btn.h, 12, true);
  ctx.fillStyle = '#fff';
  ctx.font = '18px Fredoka One';
  ctx.textAlign = 'center';
  ctx.fillText(label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 6);
  ctx.textAlign = 'left';
}

function drawHUD() {
  ctx.fillStyle = 'rgba(8,12,20,0.88)';
  roundRect(14, 12, W - 28, 56, 14, true);

  ctx.fillStyle = '#fff';
  ctx.font = '22px Fredoka One';
  ctx.fillText(String(state.score), 24, 40);
  ctx.font = '12px Fredoka One';
  ctx.fillStyle = '#7ba3ff';
  ctx.fillText('SCORE', 24, 56);

  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(148 + i * 20, 36, 7, 0, Math.PI * 2);
    ctx.fillStyle = i < state.lives ? COLORS.red : 'rgba(255,255,255,0.12)';
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.accent;
  ctx.font = '18px Fredoka One';
  ctx.fillText((state.bossLevel ? 'BOSS ' : 'LVL ') + state.level + (state.endless ? ' ∞' : ''), W / 2, 40);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#8ed3ff';
  ctx.font = '22px Fredoka One';
  ctx.fillText(String(state.best), W - 126, 40);
  ctx.font = '12px Fredoka One';
  ctx.fillStyle = '#7ba3ff';
  ctx.fillText('BEST', W - 126, 56);

  drawHudButton(BTN.sfx, state.sfx ? '♪' : '×');
  drawHudButton(BTN.fullscreen, '⛶');

  let ex = 24;
  const ey = 88;
  const effectItems = [];
  if (effects.wide > 0) effectItems.push(['WIDE ' + Math.ceil(effects.wide), POWERUP_COLORS.wide]);
  if (effects.slow > 0) effectItems.push(['SLOW ' + Math.ceil(effects.slow), POWERUP_COLORS.slow]);
  if (effects.magnet > 0) effectItems.push(['MAGNET ' + Math.ceil(effects.magnet), POWERUP_COLORS.magnet]);
  if (state.fireball > 0) effectItems.push(['FIRE ' + Math.ceil(state.fireball), POWERUP_COLORS.fire]);
  if (state.shield > 0) effectItems.push(['SHIELD ' + Math.ceil(state.shield), POWERUP_COLORS.shield]);
  for (const [label, color] of effectItems) {
    ctx.fillStyle = color;
    ctx.font = '11px Fredoka One';
    ctx.fillText(label + 's', ex, ey);
    ex += ctx.measureText(label + 's').width + 18;
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffe08a';
  ctx.font = '11px Fredoka One';
  ctx.fillText('COINS ' + state.coins, 24, 74);
  if (state.combo >= 2) {
    ctx.textAlign = 'center';
    ctx.fillStyle = `hsl(${(Date.now() / 8) % 360},100%,70%)`;
    ctx.font = state.combo >= 8 ? '20px Fredoka One' : '14px Fredoka One';
    ctx.fillText((state.combo >= 8 ? 'MEGA ' : '') + 'x' + state.combo + ' COMBO!', W / 2, 72);
    ctx.textAlign = 'left';
  }  if (state.bossLevel && state.bossHpMax > 0 && state.mode !== 'menu') {
    const bx = 120;
    const by = 76;
    const bw = W - 144;
    const bh = 10;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    roundRect(bx, by, bw, bh, 6, true);
    ctx.fillStyle = '#ff7b54';
    roundRect(bx, by, bw * (state.bossHp / state.bossHpMax), bh, 6, true);
    ctx.font = '10px Fredoka One';
    ctx.fillStyle = '#ffd4c8';
    ctx.fillText('BOSS HP', 24, by + 9);
  }
}

function renderGridCache() {
  if (!grid.cacheDirty) return;
  grid.cacheDirty = false;
  gridCacheCtx.clearRect(0, 0, W, H);
  const burgerBox = getLevelBurgerBox();
  const cellW = burgerBox.w / grid.cols;
  const cellH = burgerBox.h / grid.rows;
  const mask = getLevelMask();
  const levelImg = getLevelImg();

  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const hp = grid.cells[r][c];
      if (!grid.mask[r][c] || hp <= 0) continue;
      const dx = burgerBox.x + c * cellW;
      const dy = burgerBox.y + r * cellH;
      if (levelImg.burgerReady) {
        const sx = mask.cropX + (c / grid.cols) * mask.cropW;
        const sy = mask.cropY + (r / grid.rows) * mask.cropH;
        const sw = mask.cropW / grid.cols;
        const sh = mask.cropH / grid.rows;
        gridCacheCtx.drawImage(levelImg.burger, sx, sy, sw, sh, dx, dy, cellW + 0.5, cellH + 0.5);
      } else {
        const healthColor = hp >= 6 ? '#5d1f15' : hp >= 4 ? '#7b3f00' : hp === 3 ? '#7a3d2a' : hp === 2 ? '#f2b267' : '#ffe08a';
        gridCacheCtx.fillStyle = healthColor;
        gridCacheCtx.beginPath();
        const radius = Math.min(6, cellW * 0.2);
        gridCacheCtx.moveTo(dx + radius, dy);
        gridCacheCtx.arcTo(dx + cellW, dy, dx + cellW, dy + cellH, radius);
        gridCacheCtx.arcTo(dx + cellW, dy + cellH, dx, dy + cellH, radius);
        gridCacheCtx.arcTo(dx, dy + cellH, dx, dy, radius);
        gridCacheCtx.arcTo(dx, dy, dx + cellW, dy, radius);
        gridCacheCtx.closePath();
        gridCacheCtx.fill();
      }

      if (hp > 1) {
        gridCacheCtx.fillStyle = 'rgba(0,0,0,0.28)';
        gridCacheCtx.font = '10px Fredoka One';
        gridCacheCtx.textAlign = 'center';
        gridCacheCtx.fillText(String(hp), dx + cellW / 2, dy + cellH / 2 + 4);
      }
    }
  }
  gridCacheCtx.textAlign = 'left';
}

function drawBurger() {
  renderGridCache();
  ctx.drawImage(grid.cache, 0, 0);

  const burgerBox = getLevelBurgerBox();
  const cellW = burgerBox.w / grid.cols;
  const cellH = burgerBox.h / grid.rows;
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const flash = grid.flash[r][c];
      if (flash <= 0) continue;
      const dx = burgerBox.x + c * cellW;
      const dy = burgerBox.y + r * cellH;
      ctx.fillStyle = `rgba(255,255,255,${flash * 0.6})`;
      roundRect(dx + 1, dy + 1, cellW - 2, cellH - 2, 4, true);
    }
  }
}

function drawAimGuide() {
  if (state.mode !== 'aiming') return;
  const ball = balls.find(b => b.attached) || balls[0];
  if (!ball) return;
  const ratio = clamp((pointerX / W) * 2 - 1, -0.95, 0.95);
  const angle = ratio * (34 * Math.PI / 180);
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  ball.aimDx = dx;
  ball.aimDy = dy;
  let t = 9999;
  if (dx < 0) t = Math.min(t, (playfield.x - ball.x) / dx);
  if (dx > 0) t = Math.min(t, (playfield.x + playfield.w - ball.x) / dx);
  t = Math.min(t, (playfield.y - ball.y) / dy);
  const ex = ball.x + dx * t;
  const ey = ball.y + dy * t;

  // Use current ball skin glow color
  const skin = V6_SKINS.ball[state.cosmetics?.ball] || V6_SKINS.ball.plasma;
  const glowColor = skin.glow;

  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = hexToRgba(glowColor, 0.35);
  ctx.lineWidth = 6;
  ctx.setLineDash([8, 10]);
  ctx.beginPath();
  ctx.moveTo(ball.x, ball.y);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(glowColor, 0.92);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ball.x, ball.y);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
}

function drawTrailBall(ball) {
  for (let i = 0; i < ball.trail.length; i++) {
    const t = ball.trail[i];
    const frac = i / Math.max(1, ball.trail.length);
    const alpha = frac * 0.4;
    const r = ball.r * (0.2 + 0.8 * frac);
    ctx.beginPath();
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0,200,255,${alpha})`;
    ctx.fill();
  }
}

function drawBall(ball) {
  drawTrailBall(ball);
  const auraRadius = ball.fireball > 0 || state.fireball > 0 ? ball.r * 4.5 : ball.r * 3.4;
  const aura = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, auraRadius);
  aura.addColorStop(0, ball.fireball > 0 || state.fireball > 0 ? 'rgba(255,120,80,0.3)' : 'rgba(0,240,255,0.25)');
  aura.addColorStop(0.45, ball.fireball > 0 || state.fireball > 0 ? 'rgba(255,70,50,0.12)' : 'rgba(0,120,255,0.12)');
  aura.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, auraRadius, 0, Math.PI * 2);
  ctx.fillStyle = aura;
  ctx.fill();

  const core = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 0, ball.x, ball.y, ball.r);
  if (ball.fireball > 0 || state.fireball > 0) {
    core.addColorStop(0, '#fff5d8');
    core.addColorStop(0.4, '#ff8a50');
    core.addColorStop(1, '#ff3d2e');
    ctx.shadowColor = '#ff6b52';
  } else {
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.35, '#00f0ff');
    core.addColorStop(1, '#0055ff');
    ctx.shadowColor = '#00f0ff';
  }
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = core;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(ball.x - 2.5, ball.y - 2.5, ball.r * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fill();
}

function drawPaddle() {
  const skin = V6_SKINS.paddle[state.cosmetics?.paddle] || V6_SKINS.paddle.classic;
  const sw = paddle.currentW * paddle.squish;
  const sh = paddle.h / paddle.squish;
  const px = paddle.x + (paddle.currentW - sw) / 2;
  const py = paddle.y + (paddle.h - sh) / 2;
  const magnetOn = effects.magnet > 0;

  ctx.shadowColor = skin.edge;
  ctx.shadowBlur = 18;
  const body = ctx.createLinearGradient(px, py, px, py + sh);
  body.addColorStop(0, skin.top);
  body.addColorStop(0.5, skin.mid);
  body.addColorStop(1, skin.bottom);
  ctx.fillStyle = body;
  roundRect(px, py, sw, sh, 10, true);
  ctx.shadowBlur = 0;

  ctx.strokeStyle = skin.edge;
  ctx.lineWidth = 2;
  ctx.shadowColor = skin.edge;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(px + 10, py + 1);
  ctx.lineTo(px + sw - 10, py + 1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px + 10, py + sh - 1);
  ctx.lineTo(px + sw - 10, py + sh - 1);
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (magnetOn) {
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.2 * Math.sin(performance.now() * 0.008);
    ctx.strokeStyle = POWERUP_COLORS.magnet;
    ctx.lineWidth = 3;
    ctx.shadowColor = POWERUP_COLORS.magnet;
    ctx.shadowBlur = 18;
    roundRect(px, py, sw, sh, 10, false, true);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  if (state.shield > 0) {
    ctx.strokeStyle = 'rgba(126,224,129,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(playfield.x + 3, playfield.y + playfield.h - 6, playfield.w - 6, 3);
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPowerups() {
  for (const p of powerups) {
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2);
    glow.addColorStop(0, POWERUP_COLORS[p.type] + '88');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 2, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    ctx.fillStyle = POWERUP_COLORS[p.type];
    roundRect(p.x - p.r, p.y - p.r * 0.65, p.r * 2, p.r * 1.3, 7, true);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    roundRect(p.x - p.r, p.y - p.r * 0.65, p.r * 2, p.r * 1.3, 7, false, true);

    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.font = '11px Fredoka One';
    ctx.textAlign = 'center';
    const label = p.type === 'life' ? '+1' : p.type === 'multiball' ? 'MB' : p.type === 'shield' ? 'SH' : p.type === 'magnet' ? 'MG' : p.type === 'fire' ? 'FIRE' : p.type.toUpperCase();
    ctx.fillText(label, p.x, p.y + 4);
  }
  ctx.textAlign = 'left';
}


function drawMedalBurst() {
  for (const p of state.medalBurst) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawFloatTexts() {
  for (const t of floatTexts) {
    ctx.globalAlpha = t.life;
    ctx.fillStyle = t.color;
    ctx.font = `${t.size}px Fredoka One`;
    ctx.textAlign = 'center';
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function drawButton(label, btn, bgColor, textColor) {
  const hovered = pointerX >= btn.x && pointerX <= btn.x + btn.w &&
                  pointerY >= btn.y && pointerY <= btn.y + btn.h;

  const scale = hovered ? 1.04 : 1.0;
  const cx = btn.x + btn.w / 2;
  const cy = btn.y + btn.h / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  if (hovered) {
    ctx.shadowColor = 'rgba(255,255,255,0.85)';
    ctx.shadowBlur = 18;
  }

  ctx.fillStyle = bgColor;
  roundRect(btn.x, btn.y, btn.w, btn.h, 12, true);

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  ctx.fillStyle = hovered ? '#ffffff' : textColor;
  ctx.font = '18px Fredoka One';
  ctx.textAlign = 'center';
  ctx.fillText(label, btn.x + btn.w / 2, btn.y + 32);

  ctx.restore();
  ctx.textAlign = 'left';
}

// Shared hover glow overlay for any rect — call after drawing the element
function _applyHoverGlow(x, y, w, h, r = 12) {
  if (pointerX >= x && pointerX <= x + w && pointerY >= y && pointerY <= y + h) {
    ctx.save();
    const cx = x + w / 2, cy = y + h / 2;
    ctx.translate(cx, cy);
    ctx.scale(1.04, 1.04);
    ctx.translate(-cx, -cy);
    ctx.shadowColor = 'rgba(255,255,255,0.7)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(x, y, w, h, r, true);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}




function drawSettingsRealV15() {
  ensureSettingsRealV15();
  ctx.fillStyle = 'rgba(4,8,15,0.82)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(12,18,30,0.97)';
  roundRect(30, 90, W - 60, H - 180, 22, true);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#8ed3ff';
  ctx.font = '28px Fredoka One';
  ctx.fillText('SETTINGS', W / 2, 132);

  const rows = [
    { label: 'VIBRATION', value: state.settingsV15.vibration ? 'ON' : 'OFF', y: 210 },
    { label: 'SFX BOOST', value: state.settingsV15.sfxBoost ? 'ON' : 'OFF', y: 278 },
  ];

  rows.forEach((row) => {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(W / 2 - 160, row.y, 320, 46, 12, true);
    ctx.fillStyle = '#ffffff';
    ctx.font = '17px Fredoka One';
    ctx.fillText(row.label, W / 2 - 76, row.y + 29);

    ctx.fillStyle = '#d7f28b';
    roundRect(W / 2 + 54, row.y + 7, 84, 32, 10, true);
    ctx.fillStyle = '#08111f';
    ctx.font = '15px Fredoka One';
    ctx.fillText(row.value, W / 2 + 96, row.y + 29);
  });

  ctx.fillStyle = 'rgba(255,120,120,0.18)';
  roundRect(W / 2 - 160, 360, 320, 50, 14, true);
  ctx.fillStyle = '#ffb199';
  ctx.font = '18px Fredoka One';
  ctx.fillText('RESET ALL PROGRESS', W / 2, 392);

  ctx.fillStyle = '#c9d7ff';
  ctx.font = '13px Fredoka One';
  ctx.fillText('This clears coins, shop, daily, and leaderboards', W / 2, 430);

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(W / 2 - 90, H - 78, 180, 42, 12, true);
  ctx.fillStyle = '#ffffff';
  ctx.font = '18px Fredoka One';
  ctx.fillText('BACK', W / 2, H - 50);
  ctx.textAlign = 'left';
}

function drawLeaderboardRealV13() {
  ctx.fillStyle = 'rgba(4,8,15,0.82)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(12,18,30,0.97)';
  roundRect(30, 90, W - 60, H - 180, 22, true);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe08a';
  ctx.font = '28px Fredoka One';
  ctx.fillText('LEADERBOARDS', W / 2, 132);

  const campaign = getLeaderboardRealV13('campaign').slice(0, 5);
  const endless = getLeaderboardRealV13('endless').slice(0, 5);

  ctx.fillStyle = '#8ed3ff';
  ctx.font = '18px Fredoka One';
  ctx.fillText('CAMPAIGN', W / 2 - 120, 182);
  ctx.fillText('ENDLESS', W / 2 + 120, 182);

  ctx.font = '13px Fredoka One';
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 5; i++) {
    const cy = 220 + i * 44;
    const c = campaign[i];
    const e = endless[i];
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    roundRect(W / 2 - 220, cy - 18, 180, 32, 10, true);
    roundRect(W / 2 + 40, cy - 18, 180, 32, 10, true);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(c ? ('#' + (i + 1) + '  ' + c.score + '  L' + c.level) : '--', W / 2 - 130, cy + 4);
    ctx.fillText(e ? ('#' + (i + 1) + '  ' + e.score + '  D' + (e.depth || e.level)) : '--', W / 2 + 130, cy + 4);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(W / 2 - 90, H - 78, 180, 42, 12, true);
  ctx.fillStyle = '#ffffff';
  ctx.font = '18px Fredoka One';
  ctx.fillText('BACK', W / 2, H - 50);
  ctx.textAlign = 'left';
}


function drawEndlessMilestoneRealV14() {
  if (!state.endless || state.mode !== 'playing') return;
  if (state.endlessMilestoneFlashV14 <= 0) return;
  ctx.textAlign = 'center';
  ctx.font = '22px Fredoka One';
  ctx.fillStyle = 'rgba(255,177,153,' + Math.max(0.3, state.endlessMilestoneFlashV14) + ')';
  ctx.fillText(state.endlessMilestoneTextV14 || ('MILESTONE • DEPTH ' + state.level), W / 2, 104);
  ctx.textAlign = 'left';
}

function drawShopRealV11() {
  ensureShopRealV11();
  ctx.fillStyle = 'rgba(4,8,15,0.82)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(12,18,30,0.97)';
  roundRect(24, 80, W - 48, H - 160, 22, true);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe08a';
  ctx.font = '28px Fredoka One';
  ctx.fillText('SHOP', W / 2, 120);
  ctx.fillStyle = '#ffffff';
  ctx.font = '16px Fredoka One';
  ctx.fillText('Coins: ' + state.coins, W / 2, 146);

  const tabs = ['paddle', 'ball', 'trail'];
  tabs.forEach((tab, i) => {
    const x = 60 + i * 140;
    ctx.fillStyle = state.shopV11.category === tab ? '#d7f28b' : 'rgba(255,255,255,0.12)';
    roundRect(x, 168, 120, 34, 10, true);
    ctx.fillStyle = state.shopV11.category === tab ? '#08111f' : '#ffffff';
    ctx.font = '15px Fredoka One';
    ctx.fillText(tab.toUpperCase(), x + 60, 191);
  });

  const category = state.shopV11.category;
  const cfg = SHOP_V11[category];
  cfg.items.forEach((item, i) => {
    const y = 228 + i * 94;
    const owned = ownedSkinRealV11(category, item.id);
    const equipped = currentSkinRealV11(category) === item.id;

    ctx.fillStyle = equipped ? 'rgba(215,242,139,0.18)' : 'rgba(255,255,255,0.08)';
    roundRect(50, y, W - 100, 78, 14, true);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px Fredoka One';
    ctx.fillText(item.label, 70, y + 28);

    ctx.font = '14px Fredoka One';
    ctx.fillStyle = '#ffe08a';
    ctx.fillText(item.cost === 0 ? 'FREE' : item.cost + ' COINS', 70, y + 52);

    ctx.textAlign = 'center';
    ctx.fillStyle = equipped ? '#d7f28b' : owned ? 'rgba(255,255,255,0.16)' : '#ffb199';
    roundRect(W - 170, y + 18, 92, 42, 10, true);
    ctx.fillStyle = equipped ? '#08111f' : '#ffffff';
    ctx.font = '15px Fredoka One';
    ctx.fillText(equipped ? 'USING' : owned ? 'EQUIP' : 'BUY', W - 124, y + 45);
  });

  if (state.shopMessageTimerV11 > 0 && state.shopMessageV11) {
    ctx.fillStyle = '#8ed3ff';
    ctx.font = '16px Fredoka One';
    ctx.textAlign = 'center';
    ctx.fillText(state.shopMessageV11, W / 2, H - 96);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(W / 2 - 90, H - 78, 180, 42, 12, true);
  ctx.fillStyle = '#ffffff';
  ctx.font = '18px Fredoka One';
  ctx.fillText('BACK', W / 2, H - 50);
  ctx.textAlign = 'left';
}

function drawMenu() {
  if (images.titleBgReady) {
    ctx.drawImage(images.titleBg, 0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = '#07080f';
    ctx.fillRect(0, 0, W, H);
  }

  if (images.logoReady) {
    const maxW = 520, maxH = 300;
    const ratio = images.logo.naturalWidth / images.logo.naturalHeight;
    let lw = maxW, lh = maxW / ratio;
    if (lh > maxH) { lh = maxH; lw = maxH * ratio; }
    lw = Math.round(lw); lh = Math.round(lh);
    ctx.drawImage(images.logo, Math.round(W / 2 - lw / 2), 10, lw, lh);
  } else {
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.accent;
    ctx.font = '38px Fredoka One';
    ctx.fillText('BURGER BREAKER', W / 2, 160);
    ctx.textAlign = 'left';
  }

  if (state.menuPanel === 'levels') {
    ctx.fillStyle = 'rgba(11,17,28,0.95)';
    roundRect(W / 2 - 220, 170, 440, 500, 22, true);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = '28px Fredoka One';
    ctx.fillText('LEVEL SELECT', W / 2, 210);
    ctx.font = '15px Fredoka One';
    ctx.fillStyle = '#c9d7ff';
    ctx.fillText('Pick any unlocked level', W / 2, 236);

    const cols = 5;
    const cellW = 88;
    const cellH = 54;
    const gap = 12;
    const startX = W / 2 - ((cols * cellW) + ((cols - 1) * gap)) / 2;
    const startY = 260;
    const maxLevel = getMaxUnlockedSelectableLevel();
    for (let idx = 1; idx <= maxLevel; idx++) {
      const col = (idx - 1) % cols;
      const row = Math.floor((idx - 1) / cols);
      const x = startX + col * (cellW + gap);
      const y = startY + row * (cellH + gap);
      ctx.fillStyle = idx <= state.unlockedLevel ? 'rgba(215,242,139,0.95)' : 'rgba(255,255,255,0.10)';
      roundRect(x, y, cellW, cellH, 12, true);
      const medal = medalRecordFor(idx);
      ctx.fillStyle = idx <= state.unlockedLevel ? '#07080f' : '#7d8ba9';
      ctx.font = '18px Fredoka One';
      ctx.textAlign = 'center';
      ctx.fillText(String(idx), x + cellW / 2, y + 26);
      ctx.font = '11px Fredoka One';
      ctx.fillStyle = idx <= state.unlockedLevel ? '#6d5a00' : '#7d8ba9';
      ctx.fillText('★'.repeat(medal.stars || 0), x + cellW / 2, y + 44);
      if (medal.noDeath) {
        ctx.fillStyle = idx <= state.unlockedLevel ? '#0b7a34' : '#7d8ba9';
        ctx.fillText('ND', x + 18, y + 18);
      }
      if (medal.combo10) {
        ctx.fillStyle = idx <= state.unlockedLevel ? '#005a7c' : '#7d8ba9';
        ctx.fillText('C10', x + cellW - 18, y + 18);
      }
    }
    drawButton('BACK', BTN.backLevels, 'rgba(255,255,255,0.12)', '#fff');
    ctx.textAlign = 'left';
    return;
  }

  ctx.fillStyle = 'rgba(11,17,28,0.95)';
  roundRect(W / 2 - 188, 260, 376, 386, 22, true);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = '24px Fredoka One';
  ctx.fillText('REAL V15 • SETTINGS + RESET + MENU POLISH', W / 2, 302);
  ctx.font = '15px Fredoka One';
  ctx.fillStyle = '#c9d7ff';
  ctx.fillText('All core systems intact, now with real settings and reset', W / 2, 332);
  ctx.fillText('Coins + shop + daily + leaderboards + endless milestones.', W / 2, 356);

  if (state.continueRun) {
    drawButton(`CONTINUE  LVL ${state.continueRun.level}${state.continueRun.endless ? ' ∞' : ''}`, BTN.continue, COLORS.orange, '#07080f');
    ctx.font = '13px Fredoka One';
    ctx.fillStyle = '#b9c7e8';
    ctx.fillText(`Saved run: ${state.continueRun.score} pts • ${state.continueRun.lives} lives`, W / 2, BTN.continue.y + 64);
  } else {
    ctx.font = '13px Fredoka One';
    ctx.fillStyle = '#93a4c9';
    ctx.fillText('No saved run yet — start fresh below', W / 2, 430);
  }

  drawButton(state.endless ? 'START ENDLESS RUN' : 'START CAMPAIGN', BTN.start, COLORS.accent, '#07080f');
  drawButton('LEVEL SELECT', BTN.levelSelect, 'rgba(255,255,255,0.12)', '#fff');
  drawButton(state.endless ? 'ENDLESS MODE: ON' : 'ENDLESS MODE: OFF', BTN.endlessToggle, 'rgba(255,255,255,0.12)', '#fff');

  ctx.font = '15px Fredoka One';
  ctx.fillStyle = '#8ed3ff';
  ctx.fillText(`Highest unlocked level: ${state.unlockedLevel}`, W / 2, 646);
  ctx.fillText(`Best endless depth: ${state.endlessBest}`, W / 2, 668);
  ctx.textAlign = 'left';
}

function drawLevelIntro() {
  introPulse += 0.08;
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(0, 0, W, H);
  const glow = 0.5 + Math.sin(introPulse) * 0.5;
  ctx.fillStyle = 'rgba(11,17,28,0.97)';
  roundRect(W / 2 - 180, H / 2 - 120, 360, 240, 20, true);
  ctx.strokeStyle = `rgba(245,166,35,${0.6 + glow * 0.4})`;
  ctx.lineWidth = 2;
  roundRect(W / 2 - 180, H / 2 - 120, 360, 240, 20, false, true);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#7ba3ff';
  ctx.font = '16px Fredoka One';
  ctx.fillText((state.bossLevel ? 'BOSS LEVEL ' : 'LEVEL ') + state.level, W / 2, H / 2 - 80);
  ctx.fillStyle = COLORS.orange;
  ctx.font = '28px Fredoka One';
  ctx.fillText(getDisplayedLevelName(), W / 2, H / 2 - 44);
  if (state.bossLevel) {
    ctx.font = '14px Fredoka One';
    ctx.fillStyle = '#ffb199';
    ctx.fillText((state.bossArchetype || 'sauce').toUpperCase() + ' BOSS', W / 2, H / 2 - 20);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(W / 2 - 160, H / 2 - 28, 320, 1);
  ctx.fillStyle = '#fff';
  ctx.font = '20px Fredoka One';
  ctx.fillText(state.bossLevel ? 'Boss burger incoming!' : 'Destroy the burger!', W / 2, H / 2 + 6);
  ctx.font = '15px Fredoka One';
  ctx.fillStyle = '#c9d7ff';
  ctx.fillText('Power-ups & combos are live', W / 2, H / 2 + 28);
  drawButton("LET'S GO!", { x: W / 2 - 110, y: H / 2 + 50, w: 220, h: 46 }, COLORS.accent, '#07080f');
  ctx.textAlign = 'left';
}

function drawPaused() {
  ctx.fillStyle = 'rgba(7,10,16,0.7)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(11,17,28,0.97)';
  roundRect(W / 2 - 180, H / 2 - 150, 360, 340, 22, true);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  roundRect(W / 2 - 180, H / 2 - 150, 360, 340, 22, false, true);
  ctx.textAlign = 'center';
  ctx.font = '42px Fredoka One';
  ctx.fillStyle = '#fff';
  ctx.fillText('PAUSED', W / 2, H / 2 - 90);
  ctx.font = '18px Fredoka One';
  ctx.fillStyle = '#c9d7ff';
  ctx.fillText('Your run auto-saves each level', W / 2, H / 2 - 56);
  drawButton('RESUME', BTN.resume, COLORS.accent, '#07080f');
  drawButton('RESTART LEVEL', BTN.restartPause, 'rgba(255,255,255,0.12)', '#fff');
  drawButton('MAIN MENU', BTN.menuPause, 'rgba(255,255,255,0.12)', '#fff');
  ctx.textAlign = 'left';
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(7,10,16,0.82)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(11,17,28,0.97)';
  roundRect(W / 2 - 180, H / 2 - 150, 360, 320, 22, true);
  ctx.strokeStyle = '#ff5555';
  roundRect(W / 2 - 180, H / 2 - 150, 360, 320, 22, false, true);
  ctx.textAlign = 'center';
  ctx.font = '44px Fredoka One';
  ctx.fillStyle = '#ff8c80';
  ctx.fillText('GAME OVER', W / 2, H / 2 - 98);
  ctx.font = '16px Fredoka One';
  ctx.fillStyle = '#aaa';
  ctx.fillText(getDisplayedLevelName(), W / 2, H / 2 - 64);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(W / 2 - 150, H / 2 - 46, 300, 1);
  ctx.font = '20px Fredoka One';
  ctx.fillStyle = '#fff';
  ctx.fillText('Score: ' + state.score, W / 2, H / 2 - 18);
  ctx.fillText('Best: ' + state.best, W / 2, H / 2 + 14);
  drawButton('PLAY AGAIN', BTN.restart, COLORS.accent, '#07080f');
  drawButton('MAIN MENU', BTN.menuFromOver, 'rgba(255,255,255,0.12)', '#fff');
  ctx.textAlign = 'left';
}

function drawLevelClear() {
  const stats = state.lastLevelStats || { stars: 1, levelBonus: state.level * 500, perfectBonus: 0, comboBonus: 0 };

  // Build the list of stat rows dynamically so we know total height first
  const rows = [];
  rows.push({ text: 'Score: ' + state.score,              color: '#fff',      size: 18 });
  rows.push({ text: 'Level bonus: +' + stats.levelBonus,  color: COLORS.orange, size: 16 });
  if (stats.comboBonus > 0)
    rows.push({ text: 'Combo bonus: +' + stats.comboBonus,  color: '#8ed3ff',   size: 16 });
  if (stats.perfectBonus > 0)
    rows.push({ text: 'Perfect clear: +' + stats.perfectBonus, color: '#7ee081', size: 16 });
  if (stats.bossBonus > 0)
    rows.push({ text: 'Boss bonus: +' + stats.bossBonus,   color: '#ffb199',   size: 16 });
  rows.push({ text: 'Coins earned: +' + (stats.coinReward || 0), color: '#ffe08a', size: 16 });
  if ((stats.challengeReward || 0) > 0)
    rows.push({ text: 'Daily challenge: +' + stats.challengeReward, color: '#a8ff9e', size: 16 });

  const medalBits = [];
  if (stats.noDeath)   medalBits.push('NO-DEATH');
  if (stats.combo10)   medalBits.push('COMBO-10');
  if (stats.bossBadge) medalBits.push(stats.bossBadge);
  if (medalBits.length)
    rows.push({ text: 'Medals: ' + medalBits.join(' • '), color: '#d7f28b', size: 14 });

  // Layout constants
  const ROW_H    = 24;
  const HDR_H    = 96;  // title + level name + stars
  const BTN_H    = 50;
  const BTN_GAP  = 10;
  const PAD      = 24;
  const panelH   = PAD + HDR_H + rows.length * ROW_H + PAD + BTN_H + BTN_GAP + BTN_H + PAD;
  const panelY   = clamp(H / 2 - panelH / 2, 20, H - panelH - 20);
  const panelX   = W / 2 - 180;
  const panelW   = 360;

  ctx.fillStyle = 'rgba(7,10,16,0.82)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(11,17,28,0.97)';
  roundRect(panelX, panelY, panelW, panelH, 22, true);
  ctx.strokeStyle = COLORS.accent;
  roundRect(panelX, panelY, panelW, panelH, 22, false, true);

  ctx.textAlign = 'center';
  let cy = panelY + PAD;

  // Title
  ctx.font = '28px Fredoka One';
  ctx.fillStyle = COLORS.accent;
  ctx.fillText('BURGER ELIMINATED!', W / 2, cy + 24);
  cy += 32;

  // Level name
  ctx.font = '15px Fredoka One';
  ctx.fillStyle = '#aaa';
  ctx.fillText(getDisplayedLevelName(), W / 2, cy + 14);
  cy += 22;

  // Stars
  ctx.font = '24px Fredoka One';
  ctx.fillStyle = '#ffd54f';
  ctx.fillText('★'.repeat(stats.stars) + '☆'.repeat(3 - stats.stars), W / 2, cy + 20);
  cy += 28;

  // Stat rows
  ctx.font = '16px Fredoka One';
  for (const row of rows) {
    ctx.font = row.size + 'px Fredoka One';
    ctx.fillStyle = row.color;
    ctx.fillText(row.text, W / 2, cy + ROW_H * 0.72);
    cy += ROW_H;
  }

  cy += PAD;

  // Buttons — positions computed from layout, not hardcoded
  const btn1 = { x: W / 2 - 130, y: cy, w: 260, h: BTN_H };
  const btn2 = { x: W / 2 - 130, y: cy + BTN_H + BTN_GAP, w: 260, h: BTN_H };
  BTN.nextLevel     = btn1;
  BTN.menuFromClear = btn2;

  drawButton('NEXT LEVEL', btn1, COLORS.accent, '#07080f');
  drawButton('MAIN MENU',  btn2, 'rgba(255,255,255,0.12)', '#fff');
  ctx.textAlign = 'left';
}


function spawnBossAttack() {
  const burgerBox = getLevelBurgerBox();
  const archetype = state.bossArchetype || getBossArchetype(state.level);
  const phase = state.bossHpMax > 0 && state.bossHp <= state.bossHpMax * 0.45 ? 2 : 1;
  state.bossAttackFlash = 0.25;
  sfx('warn');

  if (archetype === 'sauce') {
    const lanes = [0.18, 0.38, 0.58, 0.78].map(n => burgerBox.x + burgerBox.w * n);
    const dropLane = lanes[Math.floor(Math.random() * lanes.length)];
    bossProjectiles.push({ type: 'drop', x: dropLane, y: burgerBox.y + burgerBox.h - 8, dx: 0, dy: 128 + Math.random() * 14 + (phase - 1) * 10, r: 9, life: 7, warn: phase === 1 ? 0.72 : 0.6 });
    addFloatText('LAVA DROP', W / 2, 150, '#ff9a76', 18);
  } else if (archetype === 'grill') {
    const lanesY = [paddle.y - 150, paddle.y - 110, paddle.y - 70];
    if (phase === 1) {
      const y = lanesY[Math.floor(Math.random() * 2)];
      bossProjectiles.push({ type: 'beam', x: playfield.x + 24, y, w: playfield.w - 48, h: 12, warn: 1.05, life: 1.05, hitDone: false });
    } else {
      const y1 = lanesY[0];
      const y2 = lanesY[2];
      bossProjectiles.push({ type: 'beam', x: playfield.x + 24, y: y1, w: playfield.w - 48, h: 12, warn: 0.92, life: 1.08, hitDone: false });
      bossProjectiles.push({ type: 'beam', x: playfield.x + 24, y: y2, w: playfield.w - 48, h: 12, warn: 1.18, life: 1.08, hitDone: false });
    }
    addFloatText(phase === 1 ? 'GRILL SWEEP' : 'DOUBLE SWEEP', W / 2, 150, '#ffd54f', 18);
  } else {
    const cx = burgerBox.x + burgerBox.w / 2;
    const cy = burgerBox.y + burgerBox.h * 0.55;
    const pattern = state.bossPatternIndex % 2;
    if (pattern === 0) {
      for (let i = -1; i <= 1; i++) {
        bossProjectiles.push({ type: 'burst', x: cx, y: cy, dx: i * 42, dy: 126 + Math.abs(i) * 10, r: 10, life: 6, warn: 0.62 });
      }
      if (phase === 2) {
        bossProjectiles.push({ type: 'burst', x: cx, y: cy, dx: -82, dy: 148, r: 9, life: 6, warn: 0.62 });
        bossProjectiles.push({ type: 'burst', x: cx, y: cy, dx: 82, dy: 148, r: 9, life: 6, warn: 0.62 });
      }
    } else {
      const lanes = [0.24, 0.5, 0.76].map(n => burgerBox.x + burgerBox.w * n);
      const safeLane = phase === 1 ? 1 : Math.floor(Math.random() * lanes.length);
      lanes.forEach((x, i) => {
        if (i === safeLane) return;
        bossProjectiles.push({ type: 'drop', x, y: burgerBox.y + burgerBox.h - 8, dx: 0, dy: 132 + (phase - 1) * 10, r: 9, life: 7, warn: 0.66 });
      });
    }
    addFloatText(phase === 1 ? 'STACK CRUSH' : 'ARMOR PHASE', W / 2, 150, '#ffcf6e', 18);
  }

  state.bossPatternIndex += 1;
  sfx('hit');
}

function bossHitPlayer(projectile) {
  if (state.shield > 0) {
    state.shield = Math.max(0, state.shield - 5);
    state.shake = Math.max(state.shake, 6);
    spawnParticles(paddle.x + paddle.currentW / 2, paddle.y, '#7ee081', 10, 1.2);
    sfx('paddle');
  } else {
    loseLife();
  }
  projectile.dead = true;
}

function updateBossAttacks(dt) {
  if (!state.bossLevel || state.mode !== 'playing') return;
  const shift = Math.sin(performance.now() * 0.0015 + state.level * 0.7) * 48;
  if (Math.abs(shift - state.bossShift) > 0.5) {
    state.bossShift = shift;
    grid.cacheDirty = true;
  }
  state.bossAttackFlash = Math.max(0, state.bossAttackFlash - dt);

  state.bossAttackTimer -= dt;
  if (state.bossAttackTimer <= 0) {
    spawnBossAttack();
    // Sauce boss (level 5) is the first boss — keep it forgiving. Later bosses get faster.
    const baseCooldown = state.bossArchetype === 'sauce' ? 5.5 : state.bossArchetype === 'grill' ? 4.2 : 3.8;
    state.bossAttackTimer = Math.max(3.0, baseCooldown - Math.min(1.0, (state.level / 5) * 0.3));
  }

  for (const p of bossProjectiles) {
    if (p.type === 'beam') {
      if (p.warn > 0) p.warn -= dt;
      else p.life -= dt;
      if (p.warn <= 0 && !p.hitDone) {
        if (p.y + p.h >= paddle.y && p.y <= paddle.y + paddle.h) {
          p.hitDone = true;
          bossHitPlayer(p);
        }
      }
      if (p.life <= 0) p.dead = true;
      continue;
    }
    if (p.warn > 0) {
      p.warn -= dt;
      continue;
    }
    p.x += p.dx * dt;
    p.y += p.dy * dt;
    p.life -= dt;
    if (p.x + p.r >= paddle.x + 6 && p.x - p.r <= paddle.x + paddle.currentW - 6 && p.y + p.r >= paddle.y && p.y - p.r <= paddle.y + paddle.h) {
      bossHitPlayer(p);
      continue;
    }
    if (p.y - p.r > H + 30 || p.life <= 0) p.dead = true;
  }
  for (let i = bossProjectiles.length - 1; i >= 0; i--) if (bossProjectiles[i].dead) bossProjectiles.splice(i, 1);
}

function drawBossAttacks() {
  const now = performance.now();
  for (const p of bossProjectiles) {
    if (p.type === 'beam') {
      if (p.warn > 0) {
        ctx.fillStyle = `rgba(255,80,80,${0.22 + 0.25 * Math.sin(now * 0.03)})`;
        ctx.fillRect(p.x, p.y, p.w, p.h);
      } else {
        const beam = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
        beam.addColorStop(0, 'rgba(255,230,120,0.85)');
        beam.addColorStop(1, 'rgba(255,80,80,0.95)');
        ctx.fillStyle = beam;
        ctx.fillRect(p.x, p.y, p.w, p.h);
      }
      continue;
    }

    if (p.warn > 0) {
      if (p.type === 'drop' || p.type === 'burst') {
        ctx.strokeStyle = `rgba(255,110,110,${0.35 + 0.25 * Math.sin(performance.now() * 0.03)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, paddle.y + 8, p.r + 8, 0, Math.PI * 2);
        ctx.stroke();
      }
      continue;
    }

    // ── Lava drop sprite (only for drop/burst types) ─────────────
    if (p.type !== 'drop' && p.type !== 'burst') continue;
    const r = p.r;
    const x = p.x, y = p.y;
    const now = performance.now();
    const _burgerBox = getLevelBurgerBox();

    // Danger proximity: how close to paddle (0 = far, 1 = very close)
    const proximity = clamp((y - _burgerBox.y) / (paddle.y - _burgerBox.y), 0, 1);

    // Ember trail — red/orange dots above the drop
    for (let i = 1; i <= 5; i++) {
      const ty = y - i * r * 1.4;
      const alpha = (0.5 - i * 0.08) * (0.5 + 0.5 * Math.sin(now * 0.015 + i));
      const tr = r * (0.55 - i * 0.07);
      ctx.beginPath();
      ctx.arc(x + Math.sin(now * 0.008 + i * 1.3) * r * 0.6, ty, Math.max(1, tr), 0, Math.PI * 2);
      ctx.fillStyle = i < 3 ? `rgba(255,80,0,${alpha})` : `rgba(180,20,0,${alpha * 0.6})`;
      ctx.fill();
    }

    // Pulsing red danger halo — faster and brighter as it gets closer
    const pulseSpeed = 0.006 + proximity * 0.022;
    const pulseAlpha = (0.3 + proximity * 0.45) * (0.55 + 0.45 * Math.sin(now * pulseSpeed));
    const haloRadius = r * (3.2 + proximity * 1.8);
    const dangerHalo = ctx.createRadialGradient(x, y, 0, x, y, haloRadius);
    dangerHalo.addColorStop(0,   `rgba(255,0,0,${pulseAlpha * 0.5})`);
    dangerHalo.addColorStop(0.4, `rgba(220,30,0,${pulseAlpha * 0.3})`);
    dangerHalo.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = dangerHalo;
    ctx.beginPath();
    ctx.arc(x, y, haloRadius, 0, Math.PI * 2);
    ctx.fill();

    // The sprite or fallback
    if (images.lavaDropReady) {
      const spriteSize = r * 8;
      ctx.save();
      // Flash white-red rapidly when close to paddle
      if (proximity > 0.65) {
        ctx.globalAlpha = 0.85 + 0.15 * Math.sin(now * 0.04);
      }
      ctx.drawImage(images.lavaDrop, x - spriteSize / 2, y - spriteSize * 0.7, spriteSize, spriteSize);
      ctx.restore();
    } else {
      ctx.save();
      const halo2 = ctx.createRadialGradient(x, y + r * 0.3, 0, x, y + r * 0.3, r * 3.2);
      halo2.addColorStop(0,   'rgba(255,120,20,0.28)');
      halo2.addColorStop(0.5, 'rgba(255,60,0,0.12)');
      halo2.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = halo2;
      ctx.beginPath();
      ctx.arc(x, y + r * 0.3, r * 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, y - r * 2.1);
      ctx.bezierCurveTo(x + r * 0.6, y - r * 0.8, x + r * 1.15, y + r * 0.4, x, y + r * 1.2);
      ctx.bezierCurveTo(x - r * 1.15, y + r * 0.4, x - r * 0.6, y - r * 0.8, x, y - r * 2.1);
      ctx.closePath();
      ctx.shadowColor = 'rgba(80,10,0,0.9)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#1a0500';
      ctx.fill();
      ctx.shadowBlur = 0;
      const inner = ctx.createRadialGradient(x, y - r * 0.2, 0, x, y + r * 0.4, r * 1.4);
      inner.addColorStop(0,    'rgba(255,255,160,0.98)');
      inner.addColorStop(0.22, 'rgba(255,180,30,0.95)');
      inner.addColorStop(0.52, 'rgba(230,60,5,0.9)');
      inner.addColorStop(0.78, 'rgba(120,15,0,0.85)');
      inner.addColorStop(1,    'rgba(30,2,0,0.7)');
      ctx.beginPath();
      ctx.moveTo(x, y - r * 2.1);
      ctx.bezierCurveTo(x + r * 0.6, y - r * 0.8, x + r * 1.15, y + r * 0.4, x, y + r * 1.2);
      ctx.bezierCurveTo(x - r * 1.15, y + r * 0.4, x - r * 0.6, y - r * 0.8, x, y - r * 2.1);
      ctx.closePath();
      ctx.fillStyle = inner;
      ctx.fill();
      ctx.restore();
    }

    // ⚠ Warning badge — always visible, pulses in size
    const badgeScale = 1 + 0.18 * Math.sin(now * 0.012);
    const badgeY = y - r * 3.6;
    ctx.save();
    ctx.translate(x, badgeY);
    ctx.scale(badgeScale, badgeScale);
    ctx.font = `bold ${Math.round(r * 1.6)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 5;
    ctx.fillStyle = proximity > 0.5
      ? `rgba(255,${Math.round(255 * (1 - proximity))},0,1)`  // turns fully red as it closes in
      : '#ffdd00';
    ctx.fillText('⚠', 0, 0);
    ctx.restore();
  }

  if (state.bossAttackFlash > 0) {
    ctx.fillStyle = `rgba(255,100,80,${state.bossAttackFlash * 0.15})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function updatePaddle(dt) {
  paddle.currentW = (effects.wide > 0 ? paddle.w * 1.6 : paddle.w);
  paddle.targetX = clamp(pointerX - paddle.currentW / 2, playfield.x, playfield.x + playfield.w - paddle.currentW);
  const prevX = paddle.x;
  const smooth = 1 - Math.pow(0.0009, dt);
  paddle.x += (paddle.targetX - paddle.x) * smooth;
  paddle.x = clamp(paddle.x, playfield.x, playfield.x + playfield.w - paddle.currentW);
  paddle.vx = 0;
  paddle.moveDelta = paddle.x - prevX;
  paddle.moveSpeed = dt > 0 ? paddle.moveDelta / dt : 0;
  paddle.squish = 1;

  for (const ball of balls) {
    if (ball.attached) {
      ball.x = paddle.x + paddle.currentW / 2;
      ball.y = paddle.y - ball.r - 3;
    }
  }
}

function decrementTimers(dt) {
  if (effects.wide > 0) effects.wide = Math.max(0, effects.wide - dt);
  if (effects.slow > 0) effects.slow = Math.max(0, effects.slow - dt);
  if (effects.magnet > 0) effects.magnet = Math.max(0, effects.magnet - dt);
  if (state.shield > 0) state.shield = Math.max(0, state.shield - dt);
  if (state.fireball > 0) state.fireball = Math.max(0, state.fireball - dt);
  if (state.comboTimer > 0) {
    state.comboTimer = Math.max(0, state.comboTimer - dt);
    if (state.comboTimer === 0) state.combo = 0;
  }
  for (const ball of balls) {
    if (ball.fireball > 0) ball.fireball = Math.max(0, ball.fireball - dt);
  }
}

function updatePowerups(dt) {
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    p.sway += dt * 4;
    p.x += Math.sin(p.sway) * 24 * dt;
    p.y += p.dy * dt;
    if (p.y + p.r >= paddle.y && p.y - p.r <= paddle.y + paddle.h && p.x >= paddle.x - p.r && p.x <= paddle.x + paddle.currentW + p.r) {
      applyPowerup(p.type);
      powerups.splice(i, 1);
      continue;
    }
    if (p.y > H + 30) powerups.splice(i, 1);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.dx * dt * 60;
    p.y += p.dy * dt * 60;
    p.dy += 0.08 * dt * 60;
    p.life -= p.decay * dt * 60;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const t = floatTexts[i];
    t.y -= 22 * dt;
    t.life -= 1.15 * dt;
    if (t.life <= 0) floatTexts.splice(i, 1);
  }
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) grid.flash[r][c] = Math.max(0, grid.flash[r][c] - 4.5 * dt);
  }
  state.shake *= Math.pow(0.035, dt);
  if (state.shake < 0.05) state.shake = 0;
}

function destroyBrick(r, c, ball, reason = 'normal') {
  const burgerBox = getLevelBurgerBox();
  const cellW = burgerBox.w / grid.cols;
  const cellH = burgerBox.h / grid.rows;
  const cx = burgerBox.x + c * cellW + cellW / 2;
  const cy = burgerBox.y + r * cellH + cellH / 2;
  const removedHp = Math.max(0, grid.cells[r][c]);
  grid.cells[r][c] = 0;
  grid.remaining -= 1;
  state.bossHp = Math.max(0, state.bossHp - removedHp);
  grid.flash[r][c] = 0;
  grid.cacheDirty = true;

  const scoreGain = Math.round(100 * comboMultiplier());
  state.score += scoreGain;
  saveBest();
  state.combo += 1;
  state.comboTimer = 1.4;
  if (state.combo >= 3) sfx('combo'); else sfx('hit');
  spawnParticles(cx, cy, `hsl(${30 + Math.random() * 35},90%,60%)`, reason === 'splash' ? 14 : 10, reason === 'splash' ? 1.6 : 1.1);
  addFloatText('+' + scoreGain, cx, cy, '#ffd54f', 14);
  if (reason !== 'splash') spawnPowerup(cx, cy);
  state.shake = Math.min(8, state.shake + 1.2);
  vibrate(6);
}

function damageBrick(r, c, ball, splash = false) {
  if (!grid.mask[r][c] || grid.cells[r][c] <= 0) return false;
  const burgerBox = getLevelBurgerBox();
  const cellW = burgerBox.w / grid.cols;
  const cellH = burgerBox.h / grid.rows;
  const cx = burgerBox.x + c * cellW + cellW / 2;
  const cy = burgerBox.y + r * cellH + cellH / 2;
  grid.flash[r][c] = 1;
  const beforeHp = grid.cells[r][c];
  grid.cells[r][c] -= 1;
  state.bossHp = Math.max(0, state.bossHp - Math.max(0, beforeHp - Math.max(0, grid.cells[r][c])));
  if (grid.cells[r][c] <= 0) destroyBrick(r, c, ball, splash ? 'splash' : 'normal');
  else {
    grid.cacheDirty = true;
    spawnParticles(cx, cy, 'rgba(255,255,255,0.7)', 5, 0.8);
    state.score += Math.round(25 * comboMultiplier());
    saveBest();
    state.combo += 1;
    state.comboTimer = 1.2;
    sfx('hit');
  }
  return true;
}

function checkBrickHit(ball) {
  const burgerBox = getLevelBurgerBox();
  const cellW = burgerBox.w / grid.cols;
  const cellH = burgerBox.h / grid.rows;
  const minCol = clamp(Math.floor((Math.min(ball.x, ball.prevX) - ball.r - burgerBox.x) / cellW), 0, grid.cols - 1);
  const maxCol = clamp(Math.floor((Math.max(ball.x, ball.prevX) + ball.r - burgerBox.x) / cellW), 0, grid.cols - 1);
  const minRow = clamp(Math.floor((Math.min(ball.y, ball.prevY) - ball.r - burgerBox.y) / cellH), 0, grid.rows - 1);
  const maxRow = clamp(Math.floor((Math.max(ball.y, ball.prevY) + ball.r - burgerBox.y) / cellH), 0, grid.rows - 1);

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      if (!grid.mask[r][c] || grid.cells[r][c] <= 0) continue;
      const x = burgerBox.x + c * cellW;
      const y = burgerBox.y + r * cellH;
      if (ball.x + ball.r <= x || ball.x - ball.r >= x + cellW || ball.y + ball.r <= y || ball.y - ball.r >= y + cellH) continue;

      const overlapLeft = ball.x + ball.r - x;
      const overlapRight = x + cellW - (ball.x - ball.r);
      const overlapTop = ball.y + ball.r - y;
      const overlapBottom = y + cellH - (ball.y - ball.r);
      const minX = Math.min(overlapLeft, overlapRight);
      const minY = Math.min(overlapTop, overlapBottom);
      const fromLeft = ball.prevX <= x;
      const fromRight = ball.prevX >= x + cellW;
      const fromTop = ball.prevY <= y;
      const fromBottom = ball.prevY >= y + cellH;

      damageBrick(r, c, ball);
      if ((fromLeft || fromRight) && !(fromTop || fromBottom)) ball.dx *= -1;
      else if ((fromTop || fromBottom) && !(fromLeft || fromRight)) ball.dy *= -1;
      else if (minX < minY) ball.dx *= -1;
      else ball.dy *= -1;
      ball.spin = 0;
      normalizeVelocity(ball);
      return true;
    }
  }
  return false;
}

function loseLife() {
  state.lives -= 1;
  state.combo = 0;
  state.comboTimer = 0;
  state.shake = 10;
  state.perfectLevel = false;
  sfx('lose');
  vibrate(20);
  if (state.lives <= 0) {
    state.mode = 'gameover';
    clearRunState();
    return;
  }
  saveRunState();
  resetBallsOnPaddle();
  state.mode = 'aiming';
}

function completeLevel() {
  const levelBonus = state.level * 500;
  const comboBonus = Math.max(0, (state.combo - 1) * 80);
  const perfectBonus = state.perfectLevel ? 500 : 0;
  const bossBonus = state.bossLevel ? 1200 : 0;
  state.score += levelBonus + comboBonus + perfectBonus + bossBonus;
  saveBest();
  _bhbPostScore(); // report running score to portal on every level clear

  const stars = state.perfectLevel ? 3 : state.lives >= 2 ? 2 : 1;
  const noDeath = state.perfectLevel;
  const combo10 = (state.maxComboThisLevel || 0) >= 10;
  const bossBadge = state.bossLevel ? getBossBadgeLabel(state.bossArchetype) : '';
  const coinReward = rewardCoinsRealV10(20 + stars * 8 + (state.bossLevel ? 18 : 0) + (state.perfectLevel ? 12 : 0));
  const beforeMedal = medalRecordFor(state.level);
  updateLevelMedalRecord(state.level, { stars, noDeath, combo10, bossBadge });
  const afterMedal = medalRecordFor(state.level);
  if ((afterMedal.stars || 0) > (beforeMedal.stars || 0) || (!!afterMedal.noDeath && !beforeMedal.noDeath) || (!!afterMedal.combo10 && !beforeMedal.combo10) || (!!afterMedal.bossBadge && !beforeMedal.bossBadge)) {
    state.rewardAnim = 1;
    playMedalBurst(W / 2, H / 2 + 52);
    sfx('medal');
    vibrate(20);
  }

  const challengeReward = maybeAwardDailyChallengeRealV12();
  state.lastLevelStats = {
    stars,
    levelBonus,
    comboBonus,
    perfectBonus,
    bossBonus,
    noDeath,
    combo10,
    bossBadge,
    coinReward,
    challengeReward,
    cleared: true,
  };

  if (!state.endless && state.level >= LEVELS.length) {
    state.campaignWon = true;
    saveUnlockedLevel(state.level);
    clearRunState();
    state.mode = 'victory';
    recordRunIfNeededRealV13('victory');
    state.shake = 10;
    sfx('victory');
    vibrate(30);
    return;
  }

  saveUnlockedLevel(state.level + 1);
  saveRunState();
  state.mode = 'levelclear';
  state.shake = 8;
  sfx('clear');
}

function updateBall(ball, dt) {
  if (ball.attached) return;
  ball.prevX = ball.x;
  ball.prevY = ball.y;
  ball.spin = 0;

  ball.trail.push({ x: ball.x, y: ball.y });
  if (ball.trail.length > 10) ball.trail.shift();

  const frameDX = ball.dx * dt * 60;
  const frameDY = ball.dy * dt * 60;
  const dist = Math.hypot(frameDX, frameDY);
  const steps = Math.max(1, Math.ceil(dist / 4));
  const sx = frameDX / steps;
  const sy = frameDY / steps;

  for (let i = 0; i < steps; i++) {
    ball.prevX = ball.x;
    ball.prevY = ball.y;
    ball.x += sx;
    ball.y += sy;

    if (ball.x - ball.r <= playfield.x) {
      ball.x = playfield.x + ball.r;
      ball.dx = Math.abs(ball.dx);
      normalizeVelocity(ball);
      sfx('hit');
    }
    if (ball.x + ball.r >= playfield.x + playfield.w) {
      ball.x = playfield.x + playfield.w - ball.r;
      ball.dx = -Math.abs(ball.dx);
      normalizeVelocity(ball);
      sfx('hit');
    }
    if (ball.y - ball.r <= playfield.y) {
      ball.y = playfield.y + ball.r;
      ball.dy = Math.abs(ball.dy);
      normalizeVelocity(ball);
      sfx('hit');
    }

    if (ball.dy > 0 && ball.y + ball.r >= paddle.y && ball.y - ball.r <= paddle.y + paddle.h && ball.x >= paddle.x && ball.x <= paddle.x + paddle.currentW) {
      const hit = clamp((ball.x - (paddle.x + paddle.currentW / 2)) / (paddle.currentW / 2), -1, 1);
      const maxAngle = Math.PI * 0.36;
      const angle = hit * maxAngle;
      const speed = currentSpeed();
      ball.dx = Math.sin(angle) * speed;
      ball.dy = -Math.cos(angle) * speed;
      ball.spin = 0;
      ball.y = paddle.y - ball.r - 1;
      paddle.squish = 1;
      normalizeVelocity(ball);
      sfx('paddle');
      vibrate(6);
      if (effects.magnet > 0) {
        ball.attached = true;
        ball.dx = 0; ball.dy = 0;
        // Go to aiming only when every ball is now attached (or dead)
        if (balls.every(b => b.attached || b.dead)) state.mode = 'aiming';
        return;
      }
    }

    if (checkBrickHit(ball)) {
      if (grid.remaining <= 0) return;
    }
  }

  if (ball.y - ball.r > H) {
    if (state.shield > 0) {
      state.shield = Math.max(0, state.shield - 4);
      ball.y = paddle.y - ball.r - 1;
      ball.dy = -Math.abs(ball.dy || currentSpeed());
      ball.dx *= 0.9;
      normalizeVelocity(ball);
      state.shake = 4;
      sfx('paddle');
    } else {
      ball.dead = true;
    }
  }
}

function updateBalls(dt) {
  if (state.mode !== 'playing') return;
  for (const ball of balls) updateBall(ball, dt);
  for (let i = balls.length - 1; i >= 0; i--) if (balls[i].dead) balls.splice(i, 1);
  if (balls.length === 0) loseLife();
  if (grid.remaining <= 0 && state.mode === 'playing') completeLevel();
}

function update(dt) {
  updatePaddle(dt);
  decrementTimers(dt);
  updatePowerups(dt);
  updateBossAttacks(dt);
  updateBalls(dt);
  updateParticles(dt);
}

function loop(ts) {
  const dt = Math.min(0.05, (ts - lastTime) / 1000 || 0.016);
  lastTime = ts;

  ctx.save();
  if (state.shake > 0) ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);

  drawBackground();
  if (state.bossPhaseFlash > 0) {
    ctx.fillStyle = 'rgba(255,120,120,' + (state.bossPhaseFlash * 0.18) + ')';
    ctx.fillRect(0, 0, W, H);
  }
  drawHUD();
  drawEndlessMilestoneRealV14();
  drawBurger();
  drawBossAttacks();
  drawParticles();
  drawPowerups();
  drawAimGuide();
  for (const ball of balls) drawBall(ball);
  drawPaddle();
  drawFloatTexts();

  if (state.mode === 'menu') drawMenu();
  if (state.mode === 'levelintro') drawLevelIntro();
  if (state.mode === 'paused') drawPaused();
  if (state.mode === 'gameover') drawGameOver();
  if (state.mode === 'levelclear') drawLevelClear();

  ctx.restore();

  if (!['menu', 'levelintro', 'paused', 'gameover', 'levelclear'].includes(state.mode)) update(dt);
  else if (state.mode === 'aiming') update(dt);
  else updateParticles(dt);

  requestAnimationFrame(loop);
}

function bootstrap() {
  initImages();
  state.continueRun = loadRunState();
  configureLevel();
  state.mode = 'menu';
  requestAnimationFrame(loop);
}

bootstrap();


/* ===== Burger Breaker v6 additions: win screen, cosmetics, settings ===== */

const V6_STORAGE = {
  vibration: 'burgerBreakerV6Vibration',
  reduceFlash: 'burgerBreakerV6ReduceFlash',
  cosmetics: 'burgerBreakerV6Cosmetics',
};

const V6_SKINS = {
  paddle: {
    classic: { label: 'CLASSIC', top: '#00f0ff', mid: '#002844', bottom: '#001a2e', edge: '#00f0ff' },
    ember:   { label: 'EMBER',   top: '#ffc27a', mid: '#6d2717', bottom: '#2a0d09', edge: '#ff7b54' },
    slime:   { label: 'SLIME',   top: '#e5ff7e', mid: '#406a10', bottom: '#192e09', edge: '#d7f28b' },
    gold:    { label: 'GOLD',    top: '#fff0a0', mid: '#c8860a', bottom: '#5a4000', edge: '#ffd166' },
    plasma:  { label: 'PLASMA',  top: '#ff9fff', mid: '#8800cc', bottom: '#2a0040', edge: '#ff4fd8' },
  },
  ball: {
    plasma: { label: 'PLASMA', hot: '#ffffff', mid: '#00f0ff', edge: '#0055ff', glow: '#00f0ff' },
    magma:  { label: 'MAGMA',  hot: '#fff2d9', mid: '#ff8a50', edge: '#ff3d2e', glow: '#ff6b52' },
    lime:   { label: 'LIME',   hot: '#f9ffe8', mid: '#d7f28b', edge: '#2fbf71', glow: '#b8ff68' },
    mint:   { label: 'MINT',   hot: '#ffffff', mid: '#b8ffcf', edge: '#38d39f', glow: '#7bffc0' },
    sunset: { label: 'SUNSET', hot: '#fff7e6', mid: '#ffb199', edge: '#ff7b54', glow: '#ff9066' },
  },
  trail: {
    neon:    { label: 'NEON',    rgb: '0,200,255' },
    fire:    { label: 'FIRE',    rgb: '255,110,70' },
    toxic:   { label: 'TOXIC',  rgb: '183,255,60' },
    classic: { label: 'CLASSIC', rgb: '0,200,255' },
    spark:   { label: 'SPARK',   rgb: '255,220,80' },
  }
};

function v6InitState() {
  state.vibrationOn = localStorage.getItem(V6_STORAGE.vibration) !== '0';
  state.reduceFlash = localStorage.getItem(V6_STORAGE.reduceFlash) === '1';
  state.campaignWon = false;

  const defaults = {
    paddle: 'classic',
    ball: 'plasma',
    trail: 'neon',
    unlockedPaddles: ['classic'],
    unlockedBalls: ['plasma'],
    unlockedTrails: ['neon'],
  };

  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(V6_STORAGE.cosmetics) || '{}') || {};
  } catch {}
  state.cosmetics = Object.assign({}, defaults, saved);

  BTN.cosmetics = { x: W / 2 - 130, y: 628, w: 260, h: 48 };
  BTN.settings = { x: W / 2 - 130, y: 686, w: 260, h: 48 };
  BTN.settingsPause = { x: W / 2 - 130, y: 542, w: 260, h: 50 };
  BTN.backGeneric = { x: W / 2 - 130, y: 700, w: 260, h: 42 };
  BTN.victoryReplay = { x: W / 2 - 130, y: 426, w: 260, h: 50 };
  BTN.victoryMenu = { x: W / 2 - 130, y: 490, w: 260, h: 50 };
  BTN.cosmeticPaddle = { x: W / 2 - 130, y: 324, w: 260, h: 54 };
  BTN.cosmeticBall = { x: W / 2 - 130, y: 398, w: 260, h: 54 };
  BTN.cosmeticTrail = { x: W / 2 - 130, y: 472, w: 260, h: 54 };
  BTN.settingSfx = { x: W / 2 - 130, y: 324, w: 260, h: 54 };
  BTN.settingVibe = { x: W / 2 - 130, y: 398, w: 260, h: 54 };
  BTN.settingFlash = { x: W / 2 - 130, y: 472, w: 260, h: 54 };

  refreshCosmeticUnlocksV6();
}

function saveCosmeticsV6() {
  localStorage.setItem(V6_STORAGE.cosmetics, JSON.stringify({
    paddle: state.cosmetics.paddle,
    ball: state.cosmetics.ball,
    trail: state.cosmetics.trail,
  }));
}

function refreshCosmeticUnlocksV6() {
  const unlockedLevel = Number(localStorage.getItem(STORAGE_KEYS.unlocked) || state.unlockedLevel || 1);
  const endlessBest = Number(localStorage.getItem(STORAGE_KEYS.endlessBest) || state.endlessBest || 1);

  const paddles = ['classic'];
  const balls = ['plasma'];
  const trails = ['neon'];

  if (unlockedLevel >= 8) {
    paddles.push('ember');
    balls.push('magma');
  }
  if (unlockedLevel >= 15 || endlessBest >= 10) {
    paddles.push('slime');
    balls.push('lime');
    trails.push('fire');
  }
  if (unlockedLevel >= 20 || endlessBest >= 15) {
    trails.push('toxic');
  }

  state.cosmetics.unlockedPaddles = paddles;
  state.cosmetics.unlockedBalls = balls;
  state.cosmetics.unlockedTrails = trails;

  // Only reset to default if the skin isn't in the V6 unlock list AND isn't a shop skin
  const shopPaddles = ['gold', 'plasma'];
  const shopBalls   = ['mint', 'sunset'];
  const shopTrails  = ['spark'];
  if (!paddles.includes(state.cosmetics.paddle) && !shopPaddles.includes(state.cosmetics.paddle))
    state.cosmetics.paddle = paddles[0];
  if (!balls.includes(state.cosmetics.ball) && !shopBalls.includes(state.cosmetics.ball))
    state.cosmetics.ball = balls[0];
  if (!trails.includes(state.cosmetics.trail) && !shopTrails.includes(state.cosmetics.trail))
    state.cosmetics.trail = trails[0];

  // Always re-apply shop skin selections last — they override V6 cosmetics
  syncShopSkinsToCosmetics();
}

function cycleCosmeticV6(type) {
  const key = type === 'paddle' ? 'unlockedPaddles' : type === 'ball' ? 'unlockedBalls' : 'unlockedTrails';
  const arr = state.cosmetics[key] || [];
  const idx = Math.max(0, arr.indexOf(state.cosmetics[type]));
  state.cosmetics[type] = arr[(idx + 1) % Math.max(1, arr.length)];
  saveCosmeticsV6();
  sfx('menu');
}

vibrate = function(ms) {
  if (!state.vibrationOn) return;
  if (navigator.vibrate) navigator.vibrate(ms);
};

const _saveUnlockedLevelV6 = saveUnlockedLevel;
saveUnlockedLevel = function(level = state.level) {
  _saveUnlockedLevelV6(level);
  refreshCosmeticUnlocksV6();
};

const _saveBestV6 = saveBest;
saveBest = function() {
  _saveBestV6();
  refreshCosmeticUnlocksV6();
};

function drawTrailBall(ball) {
  const trailSkin = V6_SKINS.trail[state.cosmetics?.trail] || V6_SKINS.trail.neon;
  for (let i = 0; i < ball.trail.length; i++) {
    const t = ball.trail[i];
    const frac = i / Math.max(1, ball.trail.length);
    const alpha = frac * 0.4;
    const r = ball.r * (0.2 + 0.8 * frac);
    ctx.beginPath();
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${trailSkin.rgb},${alpha})`;
    ctx.fill();
  }
}

function drawBall(ball) {
  drawTrailBall(ball);
  const useFire = ball.fireball > 0 || state.fireball > 0;
  const skin = V6_SKINS.ball[state.cosmetics?.ball] || V6_SKINS.ball.plasma;
  const auraRadius = useFire ? ball.r * 4.5 : ball.r * 3.4;
  const aura = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, auraRadius);
  aura.addColorStop(0, useFire ? 'rgba(255,120,80,0.3)' : `${hexToRgba(skin.glow, 0.25)}`);
  aura.addColorStop(0.45, useFire ? 'rgba(255,70,50,0.12)' : `${hexToRgba(skin.edge, 0.12)}`);
  aura.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, auraRadius, 0, Math.PI * 2);
  ctx.fillStyle = aura;
  ctx.fill();

  const core = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 0, ball.x, ball.y, ball.r);
  if (useFire) {
    core.addColorStop(0, '#fff5d8');
    core.addColorStop(0.4, '#ff8a50');
    core.addColorStop(1, '#ff3d2e');
    ctx.shadowColor = '#ff6b52';
  } else {
    core.addColorStop(0, skin.hot);
    core.addColorStop(0.35, skin.mid);
    core.addColorStop(1, skin.edge);
    ctx.shadowColor = skin.glow;
  }
  ctx.shadowBlur = state.reduceFlash ? 10 : 18;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = core;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(ball.x - 2.5, ball.y - 2.5, ball.r * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fill();
}

function drawPaddle() {
  const skin = V6_SKINS.paddle[state.cosmetics?.paddle] || V6_SKINS.paddle.classic;
  const sw = paddle.currentW * paddle.squish;
  const sh = paddle.h / paddle.squish;
  const px = paddle.x + (paddle.currentW - sw) / 2;
  const py = paddle.y + (paddle.h - sh) / 2;
  const magnetOn = effects.magnet > 0;

  // Always draw the skin — magnet never replaces it
  ctx.shadowColor = skin.edge;
  ctx.shadowBlur = state.reduceFlash ? 10 : 18;
  const body = ctx.createLinearGradient(px, py, px, py + sh);
  body.addColorStop(0, skin.top);
  body.addColorStop(0.5, skin.mid);
  body.addColorStop(1, skin.bottom);
  ctx.fillStyle = body;
  roundRect(px, py, sw, sh, 10, true);
  ctx.shadowBlur = 0;

  ctx.strokeStyle = skin.edge;
  ctx.lineWidth = 2;
  ctx.shadowColor = skin.edge;
  ctx.shadowBlur = state.reduceFlash ? 6 : 12;
  ctx.beginPath();
  ctx.moveTo(px + 10, py + 1);
  ctx.lineTo(px + sw - 10, py + 1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px + 10, py + sh - 1);
  ctx.lineTo(px + sw - 10, py + sh - 1);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Magnet overlay — blue glow on top of the skin, doesn't replace it
  if (magnetOn) {
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.2 * Math.sin(performance.now() * 0.008);
    ctx.strokeStyle = POWERUP_COLORS.magnet;
    ctx.lineWidth = 3;
    ctx.shadowColor = POWERUP_COLORS.magnet;
    ctx.shadowBlur = 18;
    roundRect(px, py, sw, sh, 10, false, true);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  if (state.shield > 0) {
    ctx.strokeStyle = 'rgba(126,224,129,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(playfield.x + 3, playfield.y + playfield.h - 6, playfield.w - 6, 3);
  }
}

function hexToRgba(hex, alpha) {
  const value = hex.replace('#', '');
  const bigint = parseInt(value, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawSettingsPanelV6(titleY, subtitle) {
  ctx.fillStyle = 'rgba(11,17,28,0.95)';
  roundRect(W / 2 - 188, 260, 376, 494, 22, true);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = '26px Fredoka One';
  ctx.fillText('SETTINGS', W / 2, titleY);
  ctx.font = '15px Fredoka One';
  ctx.fillStyle = '#c9d7ff';
  ctx.fillText(subtitle, W / 2, titleY + 26);

  drawButton(`SFX: ${state.sfx ? 'ON' : 'OFF'}`, BTN.settingSfx, COLORS.accent, '#07080f');
  drawButton(`VIBRATION: ${state.vibrationOn ? 'ON' : 'OFF'}`, BTN.settingVibe, 'rgba(255,255,255,0.12)', '#fff');
  drawButton(`REDUCED FLASH: ${state.reduceFlash ? 'ON' : 'OFF'}`, BTN.settingFlash, 'rgba(255,255,255,0.12)', '#fff');

  ctx.font = '13px Fredoka One';
  ctx.fillStyle = '#93a4c9';
  ctx.fillText('Reduced flash tones down glow and screen intensity', W / 2, 560);
  drawButton('BACK', BTN.backGeneric, 'rgba(255,255,255,0.12)', '#fff');
  ctx.textAlign = 'left';
}

function drawCosmeticsPanelV6() {
  ctx.fillStyle = 'rgba(11,17,28,0.95)';
  roundRect(W / 2 - 188, 260, 376, 494, 22, true);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = '26px Fredoka One';
  ctx.fillText('COSMETICS', W / 2, 300);
  ctx.font = '15px Fredoka One';
  ctx.fillStyle = '#c9d7ff';
  ctx.fillText('Unlocked by clearing deeper campaign and endless levels', W / 2, 326);

  drawButton(`PADDLE: ${(V6_SKINS.paddle[state.cosmetics.paddle] || V6_SKINS.paddle.classic).label}`, BTN.cosmeticPaddle, COLORS.accent, '#07080f');
  drawButton(`BALL: ${(V6_SKINS.ball[state.cosmetics.ball] || V6_SKINS.ball.plasma).label}`, BTN.cosmeticBall, 'rgba(255,255,255,0.12)', '#fff');
  drawButton(`TRAIL: ${(V6_SKINS.trail[state.cosmetics.trail] || V6_SKINS.trail.neon).label}`, BTN.cosmeticTrail, 'rgba(255,255,255,0.12)', '#fff');

  ctx.font = '13px Fredoka One';
  ctx.fillStyle = '#93a4c9';
  ctx.fillText(`Unlocked skins • paddle ${state.cosmetics.unlockedPaddles.length}/3 • ball ${state.cosmetics.unlockedBalls.length}/3 • trail ${state.cosmetics.unlockedTrails.length}/3`, W / 2, 560);
  drawButton('BACK', BTN.backGeneric, 'rgba(255,255,255,0.12)', '#fff');
  ctx.textAlign = 'left';
}

function drawMenu() {
  if (images.titleBgReady) {
    ctx.drawImage(images.titleBg, 0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = '#07080f';
    ctx.fillRect(0, 0, W, H);
  }

  if (images.logoReady) {
    const maxW = 520, maxH = 300;
    const ratio = images.logo.naturalWidth / images.logo.naturalHeight;
    let lw = maxW, lh = maxW / ratio;
    if (lh > maxH) { lh = maxH; lw = maxH * ratio; }
    lw = Math.round(lw); lh = Math.round(lh);
    ctx.drawImage(images.logo, Math.round(W / 2 - lw / 2), 10, lw, lh);
  } else {
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.accent;
    ctx.font = '38px Fredoka One';
    ctx.fillText('BURGER BREAKER', W / 2, 160);
    ctx.textAlign = 'left';
  }

  if (state.menuPanel === 'levels') {
    ctx.fillStyle = 'rgba(11,17,28,0.95)';
    roundRect(W / 2 - 220, 170, 440, 500, 22, true);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = '28px Fredoka One';
    ctx.fillText('LEVEL SELECT', W / 2, 210);
    ctx.font = '15px Fredoka One';
    ctx.fillStyle = '#c9d7ff';
    ctx.fillText('Pick any unlocked level', W / 2, 236);

    const cols = 5;
    const cellW = 88;
    const cellH = 54;
    const gap = 12;
    const startX = W / 2 - ((cols * cellW) + ((cols - 1) * gap)) / 2;
    const startY = 260;
    const maxLevel = getMaxUnlockedSelectableLevel();
    for (let idx = 1; idx <= maxLevel; idx++) {
      const col = (idx - 1) % cols;
      const row = Math.floor((idx - 1) / cols);
      const x = startX + col * (cellW + gap);
      const y = startY + row * (cellH + gap);
      ctx.fillStyle = idx <= state.unlockedLevel ? 'rgba(215,242,139,0.95)' : 'rgba(255,255,255,0.10)';
      roundRect(x, y, cellW, cellH, 12, true);
      const medal = medalRecordFor(idx);
      ctx.fillStyle = idx <= state.unlockedLevel ? '#07080f' : '#7d8ba9';
      ctx.font = '18px Fredoka One';
      ctx.textAlign = 'center';
      ctx.fillText(String(idx), x + cellW / 2, y + 26);
      ctx.font = '11px Fredoka One';
      ctx.fillStyle = idx <= state.unlockedLevel ? '#6d5a00' : '#7d8ba9';
      ctx.fillText('★'.repeat(medal.stars || 0), x + cellW / 2, y + 44);
      if (medal.noDeath) {
        ctx.fillStyle = idx <= state.unlockedLevel ? '#0b7a34' : '#7d8ba9';
        ctx.fillText('ND', x + 18, y + 18);
      }
      if (medal.combo10) {
        ctx.fillStyle = idx <= state.unlockedLevel ? '#005a7c' : '#7d8ba9';
        ctx.fillText('C10', x + cellW - 18, y + 18);
      }
    }
    drawButton('BACK', BTN.backLevels, 'rgba(255,255,255,0.12)', '#fff');
    ctx.textAlign = 'left';
    return;
  }

  if (state.menuPanel === 'cosmetics') {
    drawCosmeticsPanelV6();
    return;
  }

  if (state.menuPanel === 'settings') {
    drawSettingsPanelV6(300, 'Tune feel, feedback, and screen intensity');
    return;
  }

  ctx.fillStyle = 'rgba(11,17,28,0.95)';
  roundRect(W / 2 - 188, 248, 376, 494, 22, true);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = '24px Fredoka One';
  ctx.fillText('v6 Win Screen + Cosmetics', W / 2, 286);
  ctx.font = '15px Fredoka One';
  ctx.fillStyle = '#c9d7ff';
  ctx.fillText('Campaign ending, unlockable skins, full settings panel', W / 2, 314);

  if (state.continueRun) {
    drawButton(`CONTINUE  LVL ${state.continueRun.level}${state.continueRun.endless ? ' ∞' : ''}`, BTN.continue, COLORS.orange, '#07080f');
    ctx.font = '13px Fredoka One';
    ctx.fillStyle = '#b9c7e8';
    ctx.fillText(`Saved run: ${state.continueRun.score} pts • ${state.continueRun.lives} lives`, W / 2, BTN.continue.y + 64);
  } else {
    ctx.font = '13px Fredoka One';
    ctx.fillStyle = '#93a4c9';
    ctx.fillText('No saved run yet — start fresh below', W / 2, 430);
  }

  drawButton(state.endless ? 'START ENDLESS RUN' : 'START CAMPAIGN', BTN.start, COLORS.accent, '#07080f');
  drawButton('LEVEL SELECT', BTN.levelSelect, 'rgba(255,255,255,0.12)', '#fff');
  drawButton(state.endless ? 'ENDLESS MODE: ON' : 'ENDLESS MODE: OFF', BTN.endlessToggle, 'rgba(255,255,255,0.12)', '#fff');
  drawButton('COSMETICS', BTN.cosmetics, 'rgba(255,255,255,0.12)', '#fff');
  drawButton('SETTINGS', BTN.settings, 'rgba(255,255,255,0.12)', '#fff');

  ctx.font = '15px Fredoka One';
  ctx.fillStyle = '#8ed3ff';
  ctx.fillText(`Highest unlocked level: ${state.unlockedLevel}`, W / 2, 728);
  ctx.textAlign = 'left';
}

function drawPaused() {
  ctx.fillStyle = 'rgba(7,10,16,0.7)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(11,17,28,0.97)';
  roundRect(W / 2 - 180, H / 2 - 170, 360, 380, 22, true);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  roundRect(W / 2 - 180, H / 2 - 170, 360, 380, 22, false, true);
  ctx.textAlign = 'center';
  ctx.font = '42px Fredoka One';
  ctx.fillStyle = '#fff';
  ctx.fillText('PAUSED', W / 2, H / 2 - 100);
  ctx.font = '18px Fredoka One';
  ctx.fillStyle = '#c9d7ff';
  ctx.fillText('Your run auto-saves each level', W / 2, H / 2 - 66);
  drawButton('RESUME', BTN.resume, COLORS.accent, '#07080f');
  drawButton('RESTART LEVEL', BTN.restartPause, 'rgba(255,255,255,0.12)', '#fff');
  drawButton('MAIN MENU', BTN.menuPause, 'rgba(255,255,255,0.12)', '#fff');
  drawButton('SETTINGS', BTN.settingsPause, 'rgba(255,255,255,0.12)', '#fff');
  ctx.textAlign = 'left';
}

function drawVictory() {
  const stats = state.lastLevelStats || { stars: 3, levelBonus: 0, comboBonus: 0, perfectBonus: 0, bossBonus: 0 };
  ctx.fillStyle = 'rgba(5,10,18,0.86)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(11,17,28,0.98)';
  roundRect(W / 2 - 188, 150, 376, 430, 24, true);
  ctx.strokeStyle = '#ffd54f';
  ctx.lineWidth = 2;
  roundRect(W / 2 - 188, 150, 376, 430, 24, false, true);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd54f';
  ctx.font = '34px Fredoka One';
  ctx.fillText('CAMPAIGN CLEARED!', W / 2, 210);
  ctx.fillStyle = '#fff';
  ctx.font = '18px Fredoka One';
  ctx.fillText(`You completed all ${LEVELS.length} campaign burgers`, W / 2, 246);
  ctx.fillStyle = '#c9d7ff';
  ctx.font = '16px Fredoka One';
  ctx.fillText(`Final score: ${state.score}`, W / 2, 278);
  ctx.fillText(`Best score: ${state.best}`, W / 2, 304);

  ctx.font = '28px Fredoka One';
  ctx.fillStyle = '#ffd54f';
  ctx.fillText('★'.repeat(stats.stars) + '☆'.repeat(3 - stats.stars), W / 2, 352);

  ctx.font = '15px Fredoka One';
  ctx.fillStyle = '#93a4c9';
  ctx.fillText('Unlocked cosmetics are available from the main menu', W / 2, 388);
  ctx.fillText(`Paddles ${state.cosmetics.unlockedPaddles.length}/3 • Balls ${state.cosmetics.unlockedBalls.length}/3 • Trails ${state.cosmetics.unlockedTrails.length}/3`, W / 2, 414);

  drawButton('PLAY CAMPAIGN AGAIN', BTN.victoryReplay, COLORS.accent, '#07080f');
  drawButton('MAIN MENU', BTN.victoryMenu, 'rgba(255,255,255,0.12)', '#fff');
  ctx.textAlign = 'left';
}

function handlePointer(evt) {
  const p = getCanvasPos(evt);
  pointerX = p.x;
  pointerY = p.y;

  if (hitBtn(BTN.fullscreen, p.x, p.y)) { toggleFullscreen(); return; }
  if (hitBtn(BTN.sfx, p.x, p.y)) {
    state.sfx = !state.sfx;
    localStorage.setItem(STORAGE_KEYS.sfx, state.sfx ? '1' : '0');
    sfx('menu');
    return;
  }

  if (state.mode === 'levelclear') {
    if (hitBtn(BTN.nextLevel, p.x, p.y)) { nextLevel(); return; }
    if (hitBtn(BTN.menuFromClear, p.x, p.y)) { goToMenu(); return; }
    return;
  }

  if (state.mode === 'victory') {
    if (hitBtn(BTN.victoryReplay, p.x, p.y)) { startGame({ endless: false }); return; }
    if (hitBtn(BTN.victoryMenu, p.x, p.y)) { goToMenu(); return; }
    return;
  }

  if (state.mode === 'gameover') {
    if (hitBtn(BTN.restart, p.x, p.y)) { startGame(); return; }
    if (hitBtn(BTN.menuFromOver, p.x, p.y)) { goToMenu(); return; }
    return;
  }

  if (state.mode === 'paused') {
    if (hitBtn(BTN.resume, p.x, p.y)) { togglePause(); return; }
    if (hitBtn(BTN.restartPause, p.x, p.y)) { restartLevel(); return; }
    if (hitBtn(BTN.menuPause, p.x, p.y)) { goToMenu(); return; }
    if (hitBtn(BTN.settingsPause, p.x, p.y)) { goToMenu(); state.menuPanel = 'settings'; return; }
    return;
  }

  if (state.mode === 'menu') {
    if (state.menuPanel === 'levels') {
      if (hitBtn(BTN.backLevels, p.x, p.y)) { state.menuPanel = 'main'; return; }
      const cols = 5;
      const cellW = 88;
      const cellH = 54;
      const startX = W / 2 - ((cols * cellW) + ((cols - 1) * 12)) / 2;
      const startY = 228;
      const maxLevel = getMaxUnlockedSelectableLevel();
      for (let idx = 1; idx <= maxLevel; idx++) {
        const col = (idx - 1) % cols;
        const row = Math.floor((idx - 1) / cols);
        const x = startX + col * (cellW + 12);
        const y = startY + row * (cellH + 12);
        if (p.x >= x && p.x <= x + cellW && p.y >= y && p.y <= y + cellH) {
          if (idx <= getMaxUnlockedSelectableLevel()) {
            startGame({ level: idx, endless: state.endless });
          }
          return;
        }
      }
      return;
    }

    if (state.menuPanel === 'cosmetics') {
      if (hitBtn(BTN.backGeneric, p.x, p.y)) { state.menuPanel = 'main'; return; }
      if (hitBtn(BTN.cosmeticPaddle, p.x, p.y)) { cycleCosmeticV6('paddle'); return; }
      if (hitBtn(BTN.cosmeticBall, p.x, p.y)) { cycleCosmeticV6('ball'); return; }
      if (hitBtn(BTN.cosmeticTrail, p.x, p.y)) { cycleCosmeticV6('trail'); return; }
      return;
    }

    if (state.menuPanel === 'settings') {
      if (hitBtn(BTN.backGeneric, p.x, p.y)) { state.menuPanel = 'main'; return; }
      if (hitBtn(BTN.settingSfx, p.x, p.y)) {
        state.sfx = !state.sfx;
        localStorage.setItem(STORAGE_KEYS.sfx, state.sfx ? '1' : '0');
        sfx('menu');
        return;
      }
      if (hitBtn(BTN.settingVibe, p.x, p.y)) {
        state.vibrationOn = !state.vibrationOn;
        localStorage.setItem(V6_STORAGE.vibration, state.vibrationOn ? '1' : '0');
        sfx('menu');
        return;
      }
      if (hitBtn(BTN.settingFlash, p.x, p.y)) {
        state.reduceFlash = !state.reduceFlash;
        localStorage.setItem(V6_STORAGE.reduceFlash, state.reduceFlash ? '1' : '0');
        sfx('menu');
        return;
      }
      return;
    }

    if (hitBtn(BTN.continue, p.x, p.y) && state.continueRun) { continueSavedGame(); return; }
    if (hitBtn(BTN.start, p.x, p.y)) { startGame({ endless: state.endless }); return; }
    if (hitBtn(BTN.levelSelect, p.x, p.y)) { state.menuPanel = 'levels'; return; }
    if (hitBtn(BTN.endlessToggle, p.x, p.y)) { state.endless = !state.endless; return; }
    if (hitBtn(BTN.cosmetics, p.x, p.y)) { state.menuPanel = 'cosmetics'; return; }
    if (hitBtn(BTN.settings, p.x, p.y)) { state.menuPanel = 'settings'; return; }
  }

  handlePrimaryAction();
}

function completeLevel() {
  const levelBonus = state.level * 500;
  const comboBonus = Math.max(0, (state.combo - 1) * 80);
  const perfectBonus = state.perfectLevel ? 500 : 0;
  const bossBonus = state.bossLevel ? 1200 : 0;
  state.score += levelBonus + comboBonus + perfectBonus + bossBonus;
  saveBest();
  _bhbPostScore(); // report running score to portal on every level clear

  const stars = state.perfectLevel ? 3 : state.lives >= 2 ? 2 : 1;
  const noDeath = state.perfectLevel;
  const combo10 = (state.maxComboThisLevel || 0) >= 10;
  const bossBadge = state.bossLevel ? getBossBadgeLabel(state.bossArchetype) : '';
  const coinReward = rewardCoinsRealV10(20 + stars * 8 + (state.bossLevel ? 18 : 0) + (state.perfectLevel ? 12 : 0));
  updateLevelMedalRecord(state.level, { stars, noDeath, combo10, bossBadge });
  const challengeReward = typeof maybeAwardDailyChallengeRealV12 === 'function' ? maybeAwardDailyChallengeRealV12() : 0;

  state.lastLevelStats = {
    stars, levelBonus, comboBonus, perfectBonus, bossBonus,
    noDeath, combo10, bossBadge, coinReward, challengeReward, cleared: true,
  };

  if (!state.endless && state.level >= LEVELS.length) {
    state.campaignWon = true;
    saveUnlockedLevel(state.level);
    clearRunState();
    state.mode = 'victory';
    recordRunIfNeededRealV13('victory');
    state.shake = 10;
    sfx('victory');
    vibrate(30);
    return;
  }

  saveUnlockedLevel(state.level + 1);
  saveRunState();
  state.mode = 'levelclear';
  state.shake = 8;
  sfx('clear');
}

function loop(ts) {
  const dt = Math.min(0.05, (ts - lastTime) / 1000 || 0.016);
  lastTime = ts;

  try {
    ctx.save();
    if (state.shake > 0) ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);

    drawBackground();
    if (state.bossPhaseFlash > 0) {
      ctx.fillStyle = 'rgba(255,120,120,' + (state.bossPhaseFlash * 0.18) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    drawHUD();
    drawBurger();
    drawBossAttacks();
    drawParticles();
    drawPowerups();
    drawAimGuide();
    for (const ball of balls) drawBall(ball);
    drawPaddle();
    drawFloatTexts();

    if (state.mode === 'menu') drawMenu();
    if (state.mode === 'levelintro') drawLevelIntro();
    if (state.mode === 'paused') drawPaused();
    if (state.mode === 'gameover') drawGameOver();
    if (state.mode === 'levelclear') drawLevelClear();
    if (state.mode === 'victory') drawVictory();

    ctx.restore();

    if (!['menu', 'levelintro', 'paused', 'gameover', 'levelclear', 'victory'].includes(state.mode)) update(dt);
    else if (state.mode === 'aiming') update(dt);
    else updateParticles(dt);
  } catch (err) {
    // Never let an exception freeze the game — always keep RAF going
    try { ctx.restore(); } catch(e) {}  // recover canvas state
    bossProjectiles.length = 0;  // clear any corrupt projectile state
    // Show error briefly on screen for debugging
    ctx.fillStyle = 'rgba(255,0,0,0.7)';
    ctx.fillRect(0, H - 40, W, 40);
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.fillText('ERR: ' + (err && err.message ? err.message : String(err)), 8, H - 14);
    console.error('Loop error:', err);
  }

  requestAnimationFrame(loop);
}

v6InitState();
refreshCosmeticUnlocksV6();
syncShopSkinsToCosmetics(); // apply any saved shop skin selections to the draw system


/* ===== Burger Breaker v7 polish append ===== */
const BBV7 = {
  version: 'v7 polish',
  glowTick: 0,
  stars: Array.from({ length: 44 }, (_, i) => ({
    x: (i * 61) % W,
    y: (i * 97) % H,
    s: 0.7 + (i % 5) * 0.25,
    a: 0.18 + (i % 7) * 0.05,
    drift: 6 + (i % 4) * 5,
  })),
  lanes: Array.from({ length: 7 }, (_, i) => ({
    y: 110 + i * 88,
    speed: 18 + i * 4,
    offset: (i * 43) % W,
  })),
};

function bbv7DrawBackdropFx() {
  BBV7.glowTick += 0.016;
  for (const s of BBV7.stars) {
    s.y += s.drift * 0.016;
    if (s.y > H + 6) s.y = -6;
    const pulse = 0.65 + Math.sin(BBV7.glowTick * 2.3 + s.x * 0.01 + s.y * 0.02) * 0.35;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.s * pulse, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0,240,255,${s.a * pulse})`;
    ctx.fill();
  }
  ctx.save();
  for (const lane of BBV7.lanes) {
    lane.offset = (lane.offset + lane.speed * 0.016) % 46;
    const y = lane.y;
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -50; x < W + 60; x += 46) {
      ctx.moveTo(x + lane.offset, y);
      ctx.lineTo(x + 24 + lane.offset, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  const topGlow = ctx.createLinearGradient(0, 0, 0, 180);
  topGlow.addColorStop(0, 'rgba(0,240,255,0.07)');
  topGlow.addColorStop(1, 'rgba(0,240,255,0)');
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, W, 180);

  ctx.fillStyle = 'rgba(255,255,255,0.028)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);

  const vignette = ctx.createRadialGradient(W / 2, H / 2, 180, W / 2, H / 2, 540);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}

function bbv7DrawFooterTag() {
  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = '10px Fredoka One';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('v7 POLISH', W - 12, H - 10);
  ctx.restore();
}

function bbv7DrawModePill(label, x, y, fill, stroke) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.25;
  roundRect(x, y, ctx.measureText(label).width + 18, 22, 11, true, true);
  ctx.fillStyle = '#fff';
  ctx.font = '12px Fredoka One';
  ctx.fillText(label, x + 9, y + 15);
  ctx.restore();
}

const _drawBackgroundV6 = drawBackground;
drawBackground = function() {
  _drawBackgroundV6();
  bbv7DrawBackdropFx();
  if (state.mode === 'playing' || state.mode === 'aiming') {
    ctx.save();
    const glow = ctx.createLinearGradient(0, playfield.y, 0, playfield.y + playfield.h);
    glow.addColorStop(0, 'rgba(0,240,255,0.02)');
    glow.addColorStop(0.5, 'rgba(0,0,0,0)');
    glow.addColorStop(1, 'rgba(255,123,84,0.025)');
    ctx.fillStyle = glow;
    roundRect(playfield.x + 8, playfield.y + 8, playfield.w - 16, playfield.h - 16, 20, true);
    ctx.restore();
  }
};

const _drawHUDV6 = drawHUD;
drawHUD = function() {
  _drawHUDV6();
  ctx.save();
  ctx.textAlign = 'left';
  ctx.font = '10px Fredoka One';
  if (state.endless) bbv7DrawModePill('ENDLESS', 198, 50, 'rgba(255,123,84,0.18)', 'rgba(255,123,84,0.55)');
  if (state.bossLevel) bbv7DrawModePill('BOSS', 280, 50, 'rgba(245,166,35,0.18)', 'rgba(245,166,35,0.55)');
  if (effects.magnet > 0) bbv7DrawModePill('MAGNET', 340, 50, 'rgba(179,157,219,0.18)', 'rgba(179,157,219,0.55)');
  bbv7DrawFooterTag();
  ctx.restore();
};

const _drawMenuV6 = drawMenu;
drawMenu = function() {
  _drawMenuV6();
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '14px Fredoka One';
  ctx.fillStyle = 'rgba(0,240,255,0.8)';
  ctx.fillText('Arcade polish pass: neon pass, richer feedback, cleaner mobile feel', W / 2, 726);
  ctx.font = '10px Fredoka One';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('Tip: drag to aim, tap to launch, P pauses, F toggles fullscreen', W / 2, 748);
  bbv7DrawFooterTag();
  ctx.restore();
};

const _drawPausedV6 = drawPaused;
drawPaused = function() {
  _drawPausedV6();
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '14px Fredoka One';
  ctx.fillStyle = 'rgba(0,240,255,0.75)';
  ctx.fillText('Everything is saved. Resume whenever you are ready.', W / 2, H / 2 + 78);
  ctx.restore();
};

const _drawLevelIntroV6 = drawLevelIntro;
drawLevelIntro = function() {
  _drawLevelIntroV6();
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '12px Fredoka One';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(state.bossLevel ? 'Dodge attacks while breaking core layers' : 'Keep combos for bigger bonuses', W / 2, H / 2 + 104);
  ctx.restore();
};

const _drawVictoryV6 = typeof drawVictory === 'function' ? drawVictory : null;
if (_drawVictoryV6) {
  drawVictory = function() {
    _drawVictoryV6();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '14px Fredoka One';
    ctx.fillStyle = 'rgba(0,240,255,0.8)';
    ctx.fillText('Campaign complete. Endless mode is the next flex.', W / 2, H / 2 + 118);
    ctx.restore();
  };
}

window.addEventListener('keydown', e => {
  if ((e.key === 'f' || e.key === 'F') && document.fullscreenEnabled) {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else canvas.requestFullscreen?.().catch(() => {});
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.mode === 'playing') state.mode = 'paused';
});


/* ===================================================================
   Burger Breaker v16 — 10x Improvements Patch
   Changes:
     1. Fix duplicate STORAGE_KEYS.settings key (was 'V9' and 'V15' both on 'settings')
     2. Data-driven settings rows renderer (no more copy-paste per toggle)
     3. Paddle-speed spin transfers to ball angle on hit
     4. Brick-health-scaled hit sound pitch
     5. Powerup icons (emoji/symbol) instead of 2-letter labels
     6. Gameplay shop items: Head Start life, Speed Curse resistance
     7. Daily challenge progress shown on level-clear screen
     8. Level select tooltip showing burger name on hover
     9. Richer chord sting on level clear
   =================================================================== */

/* -------- 1. Fix the duplicate STORAGE_KEYS.settings key --------- */
// The original object declares 'settings' twice:
//   settings: 'burgerBreakerSettingsV9'   (line ~8)
//   settings: 'burgerBreakerSettingsRealV15'  (line ~18)
// The second silently wins. We explicitly align everything to V15's key.
STORAGE_KEYS.settings = 'burgerBreakerSettingsRealV15';

/* -------- 2. Data-driven settings panel renderer ----------------- */
// Replace the verbose row-by-row approach with a config array + loop.
// Also adds a "Reset all progress" button that was in the V15 draw
// function but wired up nowhere in V6's pointer handler.

const SETTINGS_ROWS_V16 = [
  {
    label: 'SFX',
    get: () => state.sfx ? 'ON' : 'OFF',
    toggle: () => {
      state.sfx = !state.sfx;
      localStorage.setItem(STORAGE_KEYS.sfx, state.sfx ? '1' : '0');
      sfx('menu');
    },
  },
  {
    label: 'VIBRATION',
    get: () => state.vibrationOn ? 'ON' : 'OFF',
    toggle: () => {
      state.vibrationOn = !state.vibrationOn;
      localStorage.setItem(V6_STORAGE.vibration, state.vibrationOn ? '1' : '0');
      sfx('menu');
    },
  },
  {
    label: 'REDUCED FLASH',
    get: () => state.reduceFlash ? 'ON' : 'OFF',
    toggle: () => {
      state.reduceFlash = !state.reduceFlash;
      localStorage.setItem(V6_STORAGE.reduceFlash, state.reduceFlash ? '1' : '0');
      sfx('menu');
    },
  },
];

// Button rects for the data-driven rows (computed at draw time)
const _settingsRowBtns = [];

function drawSettingsPanelV16() {
  // ── Logo above the panel — fills the full available zone ─────
  const logoAreaTop = 60;
  const logoAreaBot = 288;
  const logoMaxW = W - 20;
  const logoMaxH = logoAreaBot - logoAreaTop;
  if (images.logoReady) {
    const ratio = images.logo.naturalWidth / images.logo.naturalHeight;
    let lw = logoMaxW;
    let lh = Math.round(lw / ratio);
    if (lh > logoMaxH) { lh = logoMaxH; lw = Math.round(lh * ratio); }
    const lx = Math.round(W / 2 - lw / 2);
    const ly = Math.round(logoAreaTop + (logoMaxH - lh) / 2);
    ctx.drawImage(images.logo, lx, ly, lw, lh);
  } else {
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.accent;
    ctx.font = '42px Fredoka One';
    ctx.fillText('BURGER BREAKER', W / 2, logoAreaTop + logoMaxH / 2 + 14);
  }

  // ── Panel (shifted down 30px, bottom trimmed) ─────────────────
  ctx.fillStyle = 'rgba(11,17,28,0.95)';
  roundRect(W / 2 - 188, 290, 376, 430, 22, true);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8ed3ff';
  ctx.font = '26px Fredoka One';
  ctx.fillText('SETTINGS', W / 2, 330);
  ctx.font = '13px Fredoka One';
  ctx.fillStyle = '#c9d7ff';
  ctx.fillText('Tune feel, feedback, and screen intensity', W / 2, 352);

  _settingsRowBtns.length = 0;
  const rowH = 52;
  const rowStartY = 374;

  SETTINGS_ROWS_V16.forEach((row, i) => {
    const y = rowStartY + i * (rowH + 8);
    const btnRect = { x: W / 2 - 160, y, w: 320, h: rowH };
    _settingsRowBtns.push(btnRect);

    // Row background
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    roundRect(btnRect.x, y, btnRect.w, rowH, 12, true);
    _applyHoverGlow(btnRect.x, y, btnRect.w, rowH, 12);

    // Label
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '17px Fredoka One';
    ctx.fillText(row.label, btnRect.x + 16, y + 33);

    // Value pill
    const val = row.get();
    const isOn = val === 'ON';
    ctx.fillStyle = isOn ? '#d7f28b' : 'rgba(255,255,255,0.14)';
    roundRect(btnRect.x + btnRect.w - 90, y + 10, 74, 32, 10, true);
    ctx.textAlign = 'center';
    ctx.fillStyle = isOn ? '#08111f' : '#fff';
    ctx.font = '15px Fredoka One';
    ctx.fillText(val, btnRect.x + btnRect.w - 53, y + 31);
  });

  // Reset progress row
  const resetY = rowStartY + SETTINGS_ROWS_V16.length * (rowH + 8) + 8;
  const resetBtn = { x: W / 2 - 160, y: resetY, w: 320, h: rowH };
  _settingsRowBtns.push({ ...resetBtn, isReset: true });
  ctx.fillStyle = 'rgba(255,80,80,0.15)';
  roundRect(resetBtn.x, resetY, resetBtn.w, rowH, 12, true);
  _applyHoverGlow(resetBtn.x, resetY, resetBtn.w, rowH, 12);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb199';
  ctx.font = '17px Fredoka One';
  ctx.fillText('RESET ALL PROGRESS', W / 2, resetY + 33);

  ctx.fillStyle = '#93a4c9';
  ctx.font = '12px Fredoka One';
  ctx.fillText('Clears coins, shop, daily & leaderboards', W / 2, resetY + rowH + 14);

  // Back button
  const backY = resetY + rowH + 24;
  BTN.backGeneric = { x: W / 2 - 90, y: backY, w: 180, h: 42 };
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(BTN.backGeneric.x, backY, BTN.backGeneric.w, BTN.backGeneric.h, 12, true);
  _applyHoverGlow(BTN.backGeneric.x, backY, BTN.backGeneric.w, BTN.backGeneric.h, 12);
  ctx.fillStyle = '#fff';
  ctx.font = '18px Fredoka One';
  ctx.fillText('BACK', W / 2, backY + 28);
  ctx.textAlign = 'left';
}

// Override the V6 settings panel draw
drawSettingsPanelV6 = function(_titleY, _subtitle) {
  drawSettingsPanelV16();
};

// Override the V6 pointer handler for settings panel to use data-driven rows
const _handlePointerV7End = handlePointer;
handlePointer = function(evt) {
  const p = getCanvasPos(evt);

  if (state.mode === 'menu' && state.menuPanel === 'settings') {
    if (hitBtn(BTN.fullscreen, p.x, p.y)) { toggleFullscreen(); return; }

    for (let i = 0; i < _settingsRowBtns.length; i++) {
      const btn = _settingsRowBtns[i];
      if (hitBtn(btn, p.x, p.y)) {
        if (btn.isReset) {
          resetProgressRealV15();
          sfx('menu');
        } else {
          SETTINGS_ROWS_V16[i].toggle();
        }
        return;
      }
    }
    if (BTN.backGeneric && hitBtn(BTN.backGeneric, p.x, p.y)) {
      state.menuPanel = 'main';
      return;
    }
    return;
  }

  _handlePointerV7End(evt);
};

/* -------- 3. Paddle-speed spin → ball angle transfer ------------- */
// When paddle.moveSpeed is high, skew reflected ball angle.
// Override updateBall to patch the paddle-hit section.
// We do this by wrapping the existing checkBrickHit call pathway and
// hooking the physics inside updateBall is complex — instead we patch
// the paddle contact directly via a post-process in updatePaddle.

// We store paddle move speed per frame for use in ball update.
// The existing code already computes paddle.moveSpeed = paddle.moveDelta / dt.

const _origUpdateBall = updateBall;
updateBall = function(ball, dt) {
  // Store pre-update ball state
  const wasAbovePaddle = ball.y + ball.r < paddle.y;
  _origUpdateBall(ball, dt);

  // After the original update, check if ball just bounced off paddle
  // (dy flipped from positive to negative, y is near paddle)
  if (!ball.attached && wasAbovePaddle === false && ball.dy < 0 && ball.y >= paddle.y - ball.r - 4 && ball.y <= paddle.y + paddle.h) {
    // Paddle movement imparts a spin kick: up to ±15 degrees
    const spinKick = clamp((paddle.moveSpeed || 0) / 800, -0.26, 0.26);
    if (Math.abs(spinKick) > 0.01) {
      const speed = Math.hypot(ball.dx, ball.dy);
      const angle = Math.atan2(ball.dy, ball.dx) + spinKick;
      ball.dx = Math.cos(angle) * speed;
      ball.dy = Math.sin(angle) * speed;
      normalizeVelocity(ball);
    }
  }
};

/* -------- 4. Brick-health-scaled hit sound pitch ----------------- */
// Higher HP bricks → deeper thunk. Lower HP bricks → higher ping.
// We override the sfx call inside damageBrick via a wrapper on sfx.

const _origSfx = sfx;
let _v16BrickHp = null; // set before damageBrick calls sfx

sfx = function(name) {
  if (name === 'hit' && _v16BrickHp !== null) {
    // hp 4 → freq 260 (deep), hp 1 → freq 600 (bright)
    const hp = clamp(_v16BrickHp, 1, 4);
    const freq = 600 - (hp - 1) * 110; // 600, 490, 380, 270
    if (state.sfx && AUDIO_CTX) {
      if (AUDIO_CTX.state === 'suspended') AUDIO_CTX.resume().catch(() => {});
      const now = AUDIO_CTX.currentTime;
      const osc = AUDIO_CTX.createOscillator();
      const gain = AUDIO_CTX.createGain();
      osc.type = hp <= 1 ? 'sine' : hp <= 2 ? 'triangle' : 'square';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.75, now + 0.07);
      gain.gain.setValueAtTime(0.032, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
      osc.connect(gain);
      gain.connect(AUDIO_CTX.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    }
    return;
  }
  _origSfx(name);
};

const _origDamageBrick = damageBrick;
damageBrick = function(r, c, ball, splash) {
  _v16BrickHp = grid.cells[r][c]; // capture HP before damage
  const result = _origDamageBrick(r, c, ball, splash);
  _v16BrickHp = null;
  return result;
};

/* -------- 5. Rich chord sting on level clear -------------------- */
// Replace the basic two-note clear sound with a 4-note major chord.
const _origSfxClear = sfx;
sfx = (function(prevSfx) {
  return function(name) {
    if (name === 'clear') {
      if (state.sfx && AUDIO_CTX) {
        if (AUDIO_CTX.state === 'suspended') AUDIO_CTX.resume().catch(() => {});
        // C major chord: C5, E5, G5, C6
        const chord = [
          { freq: 523, delay: 0,   dur: 0.32, vol: 0.04 },
          { freq: 659, delay: 0.04,dur: 0.28, vol: 0.035 },
          { freq: 784, delay: 0.08,dur: 0.24, vol: 0.03 },
          { freq: 1047,delay: 0.14,dur: 0.20, vol: 0.025 },
        ];
        const now = AUDIO_CTX.currentTime;
        chord.forEach(({ freq, delay, dur, vol }) => {
          const osc = AUDIO_CTX.createOscillator();
          const gain = AUDIO_CTX.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + delay);
          gain.gain.setValueAtTime(vol, now + delay);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);
          osc.connect(gain);
          gain.connect(AUDIO_CTX.destination);
          osc.start(now + delay);
          osc.stop(now + delay + dur);
        });
      }
      return;
    }
    prevSfx(name);
  };
})(sfx);

/* -------- 6. Powerup icons instead of 2-letter labels ----------- */
// Map each powerup type to a descriptive symbol for the falling pill.

const POWERUP_ICONS_V16 = {
  wide:      '⟺',   // wide paddle
  slow:      '🐢',  // slow
  life:      '♥',   // extra life
  multiball: '⊕',   // multi ball
  shield:    '🛡',   // shield
  magnet:    '⊛',   // magnet
  fire:      '🔥',  // fireball
};

function drawPowerups() {
  for (const p of powerups) {
    // Soft colored glow underneath — no pill or bubble
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.2);
    glow.addColorStop(0, POWERUP_COLORS[p.type] + 'aa');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Large floating icon — no background
    const icon = POWERUP_ICONS_V16[p.type] || p.type[0].toUpperCase();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '26px serif';
    // Colored shadow to make it pop against any background
    ctx.shadowColor = POWERUP_COLORS[p.type];
    ctx.shadowBlur = 10;
    ctx.fillText(icon, p.x, p.y);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
  ctx.textAlign = 'left';
}

/* -------- 7. Gameplay shop items -------------------------------- */
// Add two functional unlocks to the coin shop:
//   • HEAD START: begin next level with 4 lives instead of 3 (costs 80 coins, consumable)
//   • WIDE OPEN: start level with Wide Paddle powerup active (costs 60 coins, consumable)

const GAMEPLAY_SHOP_V16 = [
  { id: 'headstart', label: 'Head Start', desc: 'Start next level with 4 lives', cost: 80, icon: '♥♥' },
  { id: 'wideopen',  label: 'Wide Open',  desc: 'Start next level with wide paddle', cost: 60, icon: '⟺' },
];

function getGameplayShopState() {
  if (!state.shopV11._gameplay) state.shopV11._gameplay = {};
  return state.shopV11._gameplay;
}

function buyGameplayItem(id) {
  const item = GAMEPLAY_SHOP_V16.find(i => i.id === id);
  if (!item) return;
  if ((state.coins || 0) < item.cost) {
    state.shopMessageV11 = 'NOT ENOUGH COINS';
    state.shopMessageTimerV11 = 1.4;
    return;
  }
  state.coins -= item.cost;
  saveCoinsRealV10();
  getGameplayShopState()[id] = true;
  saveShopRealV11();
  state.shopMessageV11 = 'PURCHASED — ACTIVE NEXT LEVEL';
  state.shopMessageTimerV11 = 2.0;
  sfx('powerup');
  vibrate(14);
}

// Apply gameplay boosts when a level starts
const _origConfigureLevel = configureLevel;
configureLevel = function() {
  _origConfigureLevel();
  const gs = getGameplayShopState();
  if (gs.headstart) {
    state.lives = Math.min(5, state.lives + 1);
    gs.headstart = false;
    saveShopRealV11();
    addFloatText('HEAD START! +1 LIFE', W / 2, 140, '#ff7b54', 17);
  }
  if (gs.wideopen) {
    effects.wide = 99999; // effectively infinite — lasts whole level
    paddle.currentW = paddle.w * 1.6;
    paddle.targetX = clamp(pointerX - paddle.currentW / 2, playfield.x, playfield.x + playfield.w - paddle.currentW);
    paddle.x = paddle.targetX;
    resetBallsOnPaddle();
    gs.wideopen = false;
    saveShopRealV11();
    addFloatText('WIDE OPEN!', W / 2, 166, '#00e5ff', 17);
  }
};

// Extend the shop draw to include a "Boosts" tab
const _origDrawShopRealV11 = drawShopRealV11;
drawShopRealV11 = function() {
  ensureShopRealV11();

  // Default to paddle tab if somehow on an invalid tab
  if (!state.shopV11.category || state.shopV11.category === '') state.shopV11.category = 'paddle';

  // NO full-screen overlay — let the title background show through like settings does

  // ── Logo above panel ──────────────────────────────────────────
  const logoAreaTop = 60;
  const logoAreaBot = 288;
  const logoMaxW = W - 20;
  const logoMaxH = logoAreaBot - logoAreaTop;
  if (images.logoReady) {
    const ratio = images.logo.naturalWidth / images.logo.naturalHeight;
    let lw = logoMaxW;
    let lh = Math.round(lw / ratio);
    if (lh > logoMaxH) { lh = logoMaxH; lw = Math.round(lh * ratio); }
    ctx.drawImage(images.logo, Math.round(W / 2 - lw / 2), Math.round(logoAreaTop + (logoMaxH - lh) / 2), lw, lh);
  } else {
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.accent;
    ctx.font = '42px Fredoka One';
    ctx.fillText('BURGER BREAKER', W / 2, logoAreaTop + logoMaxH / 2 + 14);
  }

  // ── Panel ─────────────────────────────────────────────────────
  const panelX = 20;
  const panelW = W - 40;
  const panelTop = 290;
  const panelH = H - panelTop - 20;
  ctx.fillStyle = 'rgba(11,17,28,0.95)';
  roundRect(panelX, panelTop, panelW, panelH, 22, true);

  // Title + coins
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe08a';
  ctx.font = '26px Fredoka One';
  ctx.fillText('SHOP', W / 2, panelTop + 40);
  ctx.fillStyle = '#ffffff';
  ctx.font = '14px Fredoka One';
  ctx.fillText('Coins: ' + state.coins, W / 2, panelTop + 60);

  // Tabs — 4 equal tabs spanning full panel width with padding
  const tabPad = 10;
  const tabGap = 6;
  const tabW = Math.floor((panelW - tabPad * 2 - tabGap * 3) / 4);
  const tabY = panelTop + 74;
  const tabs = ['paddle', 'ball', 'trail', 'boosts'];
  tabs.forEach((tab, i) => {
    const tx = panelX + tabPad + i * (tabW + tabGap);
    ctx.fillStyle = state.shopV11.category === tab ? '#d7f28b' : 'rgba(255,255,255,0.12)';
    roundRect(tx, tabY, tabW, 32, 8, true);
    _applyHoverGlow(tx, tabY, tabW, 32, 8);
    ctx.fillStyle = state.shopV11.category === tab ? '#08111f' : '#ffffff';
    ctx.font = '13px Fredoka One';
    ctx.fillText(tab.toUpperCase(), tx + tabW / 2, tabY + 22);
  });

  // Items area — stays inside panel with padding
  const itemX = panelX + 14;
  const itemW = panelW - 28;
  const itemsStartY = tabY + 42;
  // Back button position (so items know their ceiling)
  const backY = panelTop + panelH - 52;
  // Message position (above back button)
  const msgY = backY - 18;

  if (state.shopV11.category === 'boosts') {
    const gs = getGameplayShopState();
    GAMEPLAY_SHOP_V16.forEach((item, i) => {
      const y = itemsStartY + i * 100;
      const owned = !!gs[item.id];
      ctx.fillStyle = owned ? 'rgba(215,242,139,0.15)' : 'rgba(255,255,255,0.08)';
      roundRect(itemX, y, itemW, 84, 12, true);
      _applyHoverGlow(itemX, y, itemW, 84, 12);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = '17px Fredoka One';
      ctx.fillText(item.label, itemX + 14, y + 26);
      ctx.font = '12px Fredoka One';
      ctx.fillStyle = '#c9d7ff';
      ctx.fillText(item.desc, itemX + 14, y + 46);
      ctx.font = '13px Fredoka One';
      ctx.fillStyle = '#ffe08a';
      ctx.fillText(item.cost + ' COINS', itemX + 14, y + 66);

      const btnX = itemX + itemW - 96;
      ctx.fillStyle = owned ? '#d7f28b' : '#ffb199';
      roundRect(btnX, y + 20, 82, 40, 10, true);
      _applyHoverGlow(btnX, y + 20, 82, 40, 10);
      ctx.textAlign = 'center';
      ctx.fillStyle = owned ? '#08111f' : '#ffffff';
      ctx.font = '13px Fredoka One';
      ctx.fillText(owned ? 'READY ✓' : 'BUY ' + item.icon, btnX + 41, y + 46);
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = '#93a4c9';
    ctx.font = '12px Fredoka One';
    ctx.fillText('One-time boosts — consumed at level start', W / 2, itemsStartY + GAMEPLAY_SHOP_V16.length * 100 + 14);

  } else {
    const category = state.shopV11.category;
    if (SHOP_V11[category]) {
      SHOP_V11[category].items.forEach((item, i) => {
        const y = itemsStartY + i * 84;
        const owned = ownedSkinRealV11(category, item.id);
        const equipped = currentSkinRealV11(category) === item.id;

        ctx.fillStyle = equipped ? 'rgba(215,242,139,0.18)' : 'rgba(255,255,255,0.08)';
        roundRect(itemX, y, itemW, 72, 12, true);
        _applyHoverGlow(itemX, y, itemW, 72, 12);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = '17px Fredoka One';
        ctx.fillText(item.label, itemX + 14, y + 26);
        ctx.font = '13px Fredoka One';
        ctx.fillStyle = '#ffe08a';
        ctx.fillText(item.cost === 0 ? 'FREE' : item.cost + ' COINS', itemX + 14, y + 50);

        const btnX = itemX + itemW - 96;
        ctx.fillStyle = equipped ? '#d7f28b' : owned ? 'rgba(255,255,255,0.16)' : '#ffb199';
        roundRect(btnX, y + 16, 82, 38, 10, true);
        _applyHoverGlow(btnX, y + 16, 82, 38, 10);
        ctx.textAlign = 'center';
        ctx.fillStyle = equipped ? '#08111f' : '#ffffff';
        ctx.font = '14px Fredoka One';
        ctx.fillText(equipped ? 'USING' : owned ? 'EQUIP' : 'BUY', btnX + 41, y + 41);
      });
    }
  }

  // Message — above back button, never overlapping
  if (state.shopMessageTimerV11 > 0 && state.shopMessageV11) {
    ctx.fillStyle = '#8ed3ff';
    ctx.font = '14px Fredoka One';
    ctx.textAlign = 'center';
    ctx.fillText(state.shopMessageV11, W / 2, msgY);
  }

  // Back button
  BTN.backGeneric = { x: W / 2 - 90, y: backY, w: 180, h: 42 };
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(BTN.backGeneric.x, backY, BTN.backGeneric.w, BTN.backGeneric.h, 12, true);
  _applyHoverGlow(BTN.backGeneric.x, backY, BTN.backGeneric.w, BTN.backGeneric.h, 12);
  ctx.fillStyle = '#ffffff';
  ctx.font = '18px Fredoka One';
  ctx.textAlign = 'center';
  ctx.fillText('BACK', W / 2, backY + 28);
  ctx.textAlign = 'left';
};

// Extend shop pointer handler to support boosts tab
const _origHandlePointerV16 = handlePointer;
handlePointer = function(evt) {
  const p = getCanvasPos(evt);

  if (state.mode === 'menu' && state.menuPanel === 'shop') {
    const panelX = 20;
    const panelW = W - 40;
    const panelTop = 290;
    const panelH = H - panelTop - 20;
    const tabPad = 10;
    const tabGap = 6;
    const tabW = Math.floor((panelW - tabPad * 2 - tabGap * 3) / 4);
    const tabY = panelTop + 74;
    const itemX = panelX + 14;
    const itemW = panelW - 28;
    const itemsStartY = tabY + 42;
    const backY = panelTop + panelH - 52;

    // Tab hits
    const tabs = ['paddle', 'ball', 'trail', 'boosts'];
    tabs.forEach((tab, i) => {
      const tx = panelX + tabPad + i * (tabW + tabGap);
      if (p.x >= tx && p.x <= tx + tabW && p.y >= tabY && p.y <= tabY + 32) {
        state.shopV11.category = tab;
        sfx('menu');
      }
    });

    // Item button hits
    if (state.shopV11.category === 'boosts') {
      const gs = getGameplayShopState();
      GAMEPLAY_SHOP_V16.forEach((item, i) => {
        const y = itemsStartY + i * 100;
        const btnX = itemX + itemW - 96;
        if (p.x >= btnX && p.x <= btnX + 82 && p.y >= y + 20 && p.y <= y + 60) {
          if (!gs[item.id]) buyGameplayItem(item.id);
          else { state.shopMessageV11 = 'ALREADY PURCHASED'; state.shopMessageTimerV11 = 1.2; }
        }
      });
    } else {
      const category = state.shopV11.category;
      if (SHOP_V11[category]) {
        SHOP_V11[category].items.forEach((item, i) => {
          const y = itemsStartY + i * 84;
          const btnX = itemX + itemW - 96;
          if (p.x >= btnX && p.x <= btnX + 82 && p.y >= y + 16 && p.y <= y + 54) {
            buyOrEquipSkinRealV11(category, item.id);
          }
        });
      }
    }

    // Back button
    if (BTN.backGeneric && hitBtn(BTN.backGeneric, p.x, p.y)) {
      state.menuPanel = 'main';
    }
    return;
  }

  _origHandlePointerV16(evt);
};

// ── Shared shop hit helper — single source of truth for all pointer wrappers ──
function _handleShopHit(p) {
  if (state.mode !== 'menu' || state.menuPanel !== 'shop') return false;
  const panelX = 20, panelW = W - 40, panelTop = 290, panelH = H - panelTop - 20;
  const tabPad = 10, tabGap = 6;
  const tabW = Math.floor((panelW - tabPad * 2 - tabGap * 3) / 4);
  const tabY = panelTop + 74;
  const itemX = panelX + 14, itemW = panelW - 28;
  const itemsStartY = tabY + 42;

  const tabs = ['paddle', 'ball', 'trail', 'boosts'];
  for (let i = 0; i < tabs.length; i++) {
    const tx = panelX + tabPad + i * (tabW + tabGap);
    if (p.x >= tx && p.x <= tx + tabW && p.y >= tabY && p.y <= tabY + 32) {
      state.shopV11.category = tabs[i]; sfx('menu'); return true;
    }
  }
  if (state.shopV11.category === 'boosts') {
    const gs = getGameplayShopState();
    for (let i = 0; i < GAMEPLAY_SHOP_V16.length; i++) {
      const y = itemsStartY + i * 100, btnX = itemX + itemW - 96;
      if (p.x >= btnX && p.x <= btnX + 82 && p.y >= y + 20 && p.y <= y + 60) {
        if (!gs[GAMEPLAY_SHOP_V16[i].id]) buyGameplayItem(GAMEPLAY_SHOP_V16[i].id);
        else { state.shopMessageV11 = 'ALREADY PURCHASED'; state.shopMessageTimerV11 = 1.2; }
        return true;
      }
    }
  } else {
    const cat = state.shopV11.category;
    if (SHOP_V11[cat]) {
      for (let i = 0; i < SHOP_V11[cat].items.length; i++) {
        const y = itemsStartY + i * 84, btnX = itemX + itemW - 96;
        if (p.x >= btnX && p.x <= btnX + 82 && p.y >= y + 16 && p.y <= y + 54) {
          buyOrEquipSkinRealV11(cat, SHOP_V11[cat].items[i].id); return true;
        }
      }
    }
  }
  if (BTN.backGeneric && hitBtn(BTN.backGeneric, p.x, p.y)) { state.menuPanel = 'main'; return true; }
  return true; // consume all taps while shop open
}

/* -------- 8. Daily challenge progress on level-clear ------------ */
// Append a "Daily challenge" progress hint to the level-clear screen.

const _origDrawLevelClearV16 = drawLevelClear;
drawLevelClear = function() {
  _origDrawLevelClearV16();

  ensureDailyRealV12();
  const daily = state.dailyV12;
  if (!daily || !daily.challenge || daily.challengeClaimed) return;

  const ch = daily.challenge;
  const stats = state.lastLevelStats || {};
  let done = false;
  if (ch.id === 'clear_any' && stats.cleared) done = true;
  if (ch.id === 'no_death' && stats.noDeath) done = true;
  if (ch.id === 'combo_10' && stats.combo10) done = true;
  if (ch.id === 'boss_clear' && stats.bossBadge) done = true;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '13px Fredoka One';
  ctx.fillStyle = done ? '#a8ff9e' : 'rgba(255,255,255,0.55)';
  const prefix = done ? '✓ DAILY DONE: ' : '⬡ DAILY: ';
  ctx.fillText(prefix + ch.text + ' (+' + ch.reward + ' coins)', W / 2, H - 24);
  ctx.restore();
};

/* -------- 9. Level-select tooltip: burger name on hover --------- */
// Track pointer position to show burger name under hovered level cell.

let _hoveredLevelV16 = 0;

const _origDrawMenuV16 = drawMenu;
drawMenu = function() {
  _origDrawMenuV16();

  if (state.menuPanel !== 'levels') return;

  // Show name tooltip for the hovered level
  if (_hoveredLevelV16 > 0 && _hoveredLevelV16 <= LEVELS.length) {
    const def = LEVELS[_hoveredLevelV16 - 1];
    if (!def) return;
    const isBoss = isBossLevel(_hoveredLevelV16);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '14px Fredoka One';
    ctx.fillStyle = isBoss ? '#ffb199' : '#d7f28b';

    // Small pill behind the text
    const label = (isBoss ? '👊 ' : '') + 'Lv' + _hoveredLevelV16 + ': ' + def.name;
    const tw = ctx.measureText(label).width + 20;
    ctx.fillStyle = 'rgba(11,17,28,0.92)';
    roundRect(W / 2 - tw / 2, 730, tw, 26, 8, true);
    ctx.fillStyle = isBoss ? '#ffb199' : '#d7f28b';
    ctx.fillText(label, W / 2, 748);
    ctx.restore();
  }
};

// Track hover in mousemove
canvas.addEventListener('mousemove', function(e) {
  if (state.menuPanel !== 'levels') { _hoveredLevelV16 = 0; return; }
  const p = getCanvasPos(e);
  const cols = 5, cellW = 88, cellH = 54, gap = 12;
  const startX = W / 2 - ((cols * cellW) + ((cols - 1) * gap)) / 2;
  const startY = 260;
  const maxLevel = getMaxUnlockedSelectableLevel();
  _hoveredLevelV16 = 0;
  for (let idx = 1; idx <= maxLevel; idx++) {
    const col = (idx - 1) % cols;
    const row = Math.floor((idx - 1) / cols);
    const x = startX + col * (cellW + gap);
    const y = startY + row * (cellH + gap);
    if (p.x >= x && p.x <= x + cellW && p.y >= y && p.y <= y + cellH) {
      _hoveredLevelV16 = idx;
      break;
    }
  }
}, { passive: true });

canvas.addEventListener('touchmove', function(e) {
  if (state.menuPanel !== 'levels') { _hoveredLevelV16 = 0; return; }
  const p = getCanvasPos(e);
  const cols = 5, cellW = 88, cellH = 54, gap = 12;
  const startX = W / 2 - ((cols * cellW) + ((cols - 1) * gap)) / 2;
  const startY = 260;
  const maxLevel = getMaxUnlockedSelectableLevel();
  _hoveredLevelV16 = 0;
  for (let idx = 1; idx <= maxLevel; idx++) {
    const col = (idx - 1) % cols;
    const row = Math.floor((idx - 1) / cols);
    const x = startX + col * (cellW + gap);
    const y = startY + row * (cellH + gap);
    if (p.x >= x && p.x <= x + cellW && p.y >= y && p.y <= y + cellH) {
      _hoveredLevelV16 = idx;
      break;
    }
  }
}, { passive: true });

/* -------- Version tag update ------------------------------------ */
// Override the v7 footer tag to reflect new version
const _origBbv7Footer = bbv7DrawFooterTag;
bbv7DrawFooterTag = function() {
  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = '10px Fredoka One';
  ctx.fillStyle = 'rgba(215,242,139,0.5)';
  ctx.fillText('v16 IMPROVEMENTS', W - 12, H - 10);
  ctx.restore();
};

console.log('[Burger Breaker v16] Patch loaded: physics, audio, UI, shop, and settings improvements active.');


/* ===================================================================
   Burger Breaker v16b — Strip Menu
   Removes: campaign mode label, endless toggle, level select,
            cosmetics button, continue button.
   Menu now shows only: PLAY and SETTINGS (and SHOP).
   Always starts a fresh campaign run from level 1.
   =================================================================== */

BTN._play   = { x: W / 2 - 130, y: 448, w: 260, h: 54 };
BTN._shop   = { x: W / 2 - 130, y: 516, w: 260, h: 48 };
BTN._settingsStrip = { x: W / 2 - 130, y: 578, w: 260, h: 48 };

drawMenu = function() {
  // ── Background ───────────────────────────────────────────────
  if (images.titleBgReady) {
    ctx.drawImage(images.titleBg, 0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = '#07080f';
    ctx.fillRect(0, 0, W, H);
  }
  bbv7DrawBackdropFx();

  if (state.menuPanel === 'settings') { drawSettingsPanelV16(); return; }
  if (state.menuPanel === 'shop')     { drawShopRealV11();       return; }

  // ── Logo — scales to fill top 55% of canvas, aspect-correct ──
  const logoY = 20;
  const logoMaxH = Math.round(H * 0.52); // 405px on 780px canvas
  const logoMaxW = W - 20;               // 520px
  if (images.logoReady) {
    const ratio = images.logo.naturalWidth / images.logo.naturalHeight;
    let lh = logoMaxH;
    let lw = Math.round(lh * ratio);
    if (lw > logoMaxW) { lw = logoMaxW; lh = Math.round(lw / ratio); }
    ctx.drawImage(images.logo, Math.round(W / 2 - lw / 2), logoY, lw, lh);
  } else {
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.accent;
    ctx.font = '42px Fredoka One';
    ctx.fillText('BURGER BREAKER', W / 2, 200);
    ctx.textAlign = 'left';
  }

  // ── Menu — sits in bottom 40% of canvas ───────────────────────
  const menuTop = Math.round(H * 0.60); // 468px

  // Dark box behind buttons
  ctx.fillStyle = 'rgba(11,17,28,0.88)';
  roundRect(W/2 - 165, menuTop - 14, 330, 256, 20, true);

  // TAP TO PLAY button — big, prominent, like reference
  BTN._play = { x: W/2 - 150, y: menuTop, w: 300, h: 56 };
  drawButton('PLAY', BTN._play, COLORS.accent, '#07080f');

  // SHOP + SETTINGS smaller below
  BTN._shop = { x: W/2 - 130, y: menuTop + 68, w: 260, h: 46 };
  BTN._settingsStrip = { x: W/2 - 130, y: menuTop + 124, w: 260, h: 46 };
  drawButton('SHOP',     BTN._shop,          'rgba(0,0,0,0.55)', '#fff');
  drawButton('SETTINGS', BTN._settingsStrip, 'rgba(0,0,0,0.55)', '#fff');

  // Coins counter
  ctx.textAlign = 'center';
  ctx.font = '14px Fredoka One';
  ctx.fillStyle = '#ffe08a';
  ctx.fillText('\u2605 Coins: ' + (state.coins || 0), W / 2, menuTop + 220);

  bbv7DrawFooterTag();
  ctx.textAlign = 'left';
};

handlePointer = (function(prev) {
  return function(evt) {
    const p = getCanvasPos(evt);

    if (hitBtn(BTN.fullscreen, p.x, p.y)) { toggleFullscreen(); return; }
    if (hitBtn(BTN.sfx, p.x, p.y)) {
      state.sfx = !state.sfx;
      localStorage.setItem(STORAGE_KEYS.sfx, state.sfx ? '1' : '0');
      sfx('menu');
      return;
    }

    // Non-menu modes — delegate to the last full handler
    if (state.mode !== 'menu') { prev(evt); return; }

    // Settings panel (data-driven rows)
    if (state.menuPanel === 'settings') {
      for (let i = 0; i < _settingsRowBtns.length; i++) {
        const btn = _settingsRowBtns[i];
        if (hitBtn(btn, p.x, p.y)) {
          if (btn.isReset) { resetProgressRealV15(); sfx('menu'); }
          else SETTINGS_ROWS_V16[i].toggle();
          return;
        }
      }
      if (BTN.backGeneric && hitBtn(BTN.backGeneric, p.x, p.y)) {
        state.menuPanel = 'main';
      }
      return;
    }

    // Shop panel
    if (state.menuPanel === 'shop') { _handleShopHit(p); return; }

    // Main stripped menu
    if (hitBtn(BTN._play, p.x, p.y)) { startGame({ level: 1, endless: false }); return; }
    if (hitBtn(BTN._shop, p.x, p.y)) { state.menuPanel = 'shop'; sfx('menu'); return; }
    if (hitBtn(BTN._settingsStrip, p.x, p.y)) { state.menuPanel = 'settings'; sfx('menu'); return; }
  };
})(handlePointer);

// Also handle levelclear / gameover which still need their buttons
// (those are not menu-mode so they fall through to prev above which
//  already handles them correctly via the full chain)



/* ===================================================================
   Burger Breaker v16c — Fixes
   1. Powerup icons: hand-drawn canvas shapes (no emoji, always crisp)
   2. Powerup spawn rate: 17% → 7%
   3. Shield: catch ball at paddle bottom edge, not at screen bottom
   4. Ball damage: only ONE brick hit per sub-step (break after first hit)
   =================================================================== */

/* -------- 1 & 2. Powerup icons + spawn rate --------------------- */

// Lower spawn rate
spawnPowerup = function(x, y) {
  if (Math.random() > 0.07) return;
  const types = ['wide', 'slow', 'life', 'multiball', 'shield', 'magnet'];
  const type = types[Math.floor(Math.random() * types.length)];
  powerups.push({ x, y, type, dy: 110, r: 20, sway: Math.random() * Math.PI * 2 });
};

// Hand-drawn icons — each is a small canvas drawing centered on (0,0)
// No emoji, no text, no pill. Pure shapes.
const POWERUP_DRAW_V16C = {
  wide: function(ctx, color) {
    // Two outward arrows on a horizontal line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(7, -4); ctx.lineTo(11, 0); ctx.lineTo(7, 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-7, -4); ctx.lineTo(-11, 0); ctx.lineTo(-7, 4); ctx.stroke();
  },
  slow: function(ctx, color) {
    // Clock face
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(5, 2); ctx.stroke();
  },
  life: function(ctx, color) {
    // Heart
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 5);
    ctx.bezierCurveTo(-10, -2, -12, -10, -5, -10);
    ctx.bezierCurveTo(-2, -10, 0, -7, 0, -7);
    ctx.bezierCurveTo(0, -7, 2, -10, 5, -10);
    ctx.bezierCurveTo(12, -10, 10, -2, 0, 5);
    ctx.fill();
  },
  multiball: function(ctx, color) {
    // Three small circles
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(-6, 3, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(6, 3, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -5, 4, 0, Math.PI * 2); ctx.fill();
  },
  shield: function(ctx, color) {
    // Shield shape
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(9, -5);
    ctx.lineTo(9, 2);
    ctx.quadraticCurveTo(9, 10, 0, 13);
    ctx.quadraticCurveTo(-9, 10, -9, 2);
    ctx.lineTo(-9, -5);
    ctx.closePath();
    ctx.stroke();
  },
  magnet: function(ctx, color) {
    // U-shape magnet with poles
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-7, -8); ctx.lineTo(-7, 3);
    ctx.arc(0, 3, 7, Math.PI, 0, true);
    ctx.lineTo(7, -8);
    ctx.stroke();
    // North pole dots
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(-7, -9, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(7, -9, 2.5, 0, Math.PI * 2); ctx.fill();
  },
};

drawPowerups = function() {
  for (const p of powerups) {
    const color = POWERUP_COLORS[p.type];

    // Glow halo
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2);
    glow.addColorStop(0, color + '66');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 2, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Draw icon centered on p.x, p.y
    const drawFn = POWERUP_DRAW_V16C[p.type];
    if (drawFn) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      drawFn(ctx, color);
      ctx.restore();
    }
  }
};

/* -------- 3. Shield: catch ball at paddle level, not screen bottom */

// The original check is: if (ball.y - ball.r > H)
// With shield active the ball sails all the way off screen first.
// We override updateBall to intercept at paddle.y + paddle.h instead.

updateBall = (function(prev) {
  return function(ball, dt) {
    prev(ball, dt);

    // If shield is active and the ball fell past the paddle bottom edge
    // (but the original handler already caught it at H), we need to
    // catch it earlier. We do this by re-checking after prev runs:
    // if dy is now negative (shield already bounced it at H) that's too late.
    // So instead we patch the condition inline via a second override below.
  };
})(updateBall);

// Better approach: fully replace the tail of updateBall's logic.
// We monkey-patch by wrapping the whole function and re-implementing
// the out-of-bounds check with the correct shield threshold.

updateBall = (function() {
  // Grab the version of updateBall that includes the v16 spin patch
  // but before this override, then rewrite only the bottom-fall check.
  const _prevUpdateBall = updateBall;

  return function(ball, dt) {
    if (ball.attached) return;
    ball.prevX = ball.x;
    ball.prevY = ball.y;
    ball.spin = 0;

    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 10) ball.trail.shift();

    const frameDX = ball.dx * dt * 60;
    const frameDY = ball.dy * dt * 60;
    const dist = Math.hypot(frameDX, frameDY);
    const steps = Math.max(1, Math.ceil(dist / 4));
    const sx = frameDX / steps;
    const sy = frameDY / steps;

    for (let i = 0; i < steps; i++) {
      ball.prevX = ball.x;
      ball.prevY = ball.y;
      ball.x += sx;
      ball.y += sy;

      if (ball.x - ball.r <= playfield.x) {
        ball.x = playfield.x + ball.r;
        ball.dx = Math.abs(ball.dx);
        normalizeVelocity(ball);
        sfx('hit');
      }
      if (ball.x + ball.r >= playfield.x + playfield.w) {
        ball.x = playfield.x + playfield.w - ball.r;
        ball.dx = -Math.abs(ball.dx);
        normalizeVelocity(ball);
        sfx('hit');
      }
      if (ball.y - ball.r <= playfield.y) {
        ball.y = playfield.y + ball.r;
        ball.dy = Math.abs(ball.dy);
        normalizeVelocity(ball);
        sfx('hit');
      }

      // Paddle bounce
      if (ball.dy > 0 && ball.y + ball.r >= paddle.y && ball.y - ball.r <= paddle.y + paddle.h &&
          ball.x >= paddle.x && ball.x <= paddle.x + paddle.currentW) {
        const hit = clamp((ball.x - (paddle.x + paddle.currentW / 2)) / (paddle.currentW / 2), -1, 1);
        const maxAngle = Math.PI * 0.36;
        const angle = hit * maxAngle;
        const speed = currentSpeed();
        ball.dx = Math.sin(angle) * speed;
        ball.dy = -Math.cos(angle) * speed;
        ball.spin = 0;
        ball.y = paddle.y - ball.r - 1;
        paddle.squish = 1;
        normalizeVelocity(ball);

        // Paddle spin transfer (from v16 patch)
        const spinKick = clamp((paddle.moveSpeed || 0) / 800, -0.26, 0.26);
        if (Math.abs(spinKick) > 0.01) {
          const spd = Math.hypot(ball.dx, ball.dy);
          const ang = Math.atan2(ball.dy, ball.dx) + spinKick;
          ball.dx = Math.cos(ang) * spd;
          ball.dy = Math.sin(ang) * spd;
          normalizeVelocity(ball);
        }

        sfx('paddle');
        vibrate(6);
        if (effects.magnet > 0) {
          ball.attached = true;
          ball.dx = 0; ball.dy = 0;
          if (balls.every(b => b.attached || b.dead)) state.mode = 'aiming';
          return;
        }
      }

      // ONE brick hit per sub-step — break immediately after bounce
      if (checkBrickHit(ball)) {
        if (grid.remaining <= 0) return;
        break; // <-- stop sub-stepping after first brick hit
      }
    }

    // Shield catch: intercept at paddle bottom edge, not screen bottom
    if (ball.dy > 0 && ball.y - ball.r > paddle.y + paddle.h) {
      if (state.shield > 0) {
        state.shield = Math.max(0, state.shield - 4);
        ball.y = paddle.y - ball.r - 1;
        ball.dy = -Math.abs(ball.dy || currentSpeed());
        ball.dx *= 0.9;
        normalizeVelocity(ball);
        state.shake = 4;
        sfx('paddle');
      } else if (ball.y - ball.r > H) {
        ball.dead = true;
      }
    }
  };
})();



/* ===================================================================
   Burger Breaker v16d — Shield + Menu handler fixes
   1. Shield catch moved INSIDE sub-step loop so no overshoot
   2. Single authoritative handlePointer replacing the whole chain
   =================================================================== */

/* -------- 1. Final updateBall with shield inside sub-step loop -- */

updateBall = function(ball, dt) {
  if (ball.attached) return;
  ball.prevX = ball.x;
  ball.prevY = ball.y;
  ball.spin = 0;

  ball.trail.push({ x: ball.x, y: ball.y });
  if (ball.trail.length > 10) ball.trail.shift();

  const frameDX = ball.dx * dt * 60;
  const frameDY = ball.dy * dt * 60;
  const dist = Math.hypot(frameDX, frameDY);
  const steps = Math.max(1, Math.ceil(dist / 4));
  const sx = frameDX / steps;
  const sy = frameDY / steps;

  for (let i = 0; i < steps; i++) {
    ball.prevX = ball.x;
    ball.prevY = ball.y;
    ball.x += sx;
    ball.y += sy;

    // Wall bounces
    if (ball.x - ball.r <= playfield.x) {
      ball.x = playfield.x + ball.r;
      ball.dx = Math.abs(ball.dx);
      normalizeVelocity(ball);
      sfx('hit');
    }
    if (ball.x + ball.r >= playfield.x + playfield.w) {
      ball.x = playfield.x + playfield.w - ball.r;
      ball.dx = -Math.abs(ball.dx);
      normalizeVelocity(ball);
      sfx('hit');
    }
    if (ball.y - ball.r <= playfield.y) {
      ball.y = playfield.y + ball.r;
      ball.dy = Math.abs(ball.dy);
      normalizeVelocity(ball);
      sfx('hit');
    }

    // Paddle bounce
    if (ball.dy > 0 &&
        ball.y + ball.r >= paddle.y &&
        ball.y - ball.r <= paddle.y + paddle.h &&
        ball.x >= paddle.x &&
        ball.x <= paddle.x + paddle.currentW) {
      const hit = clamp((ball.x - (paddle.x + paddle.currentW / 2)) / (paddle.currentW / 2), -1, 1);
      const maxAngle = Math.PI * 0.36;
      const angle = hit * maxAngle;
      const speed = currentSpeed();
      ball.dx = Math.sin(angle) * speed;
      ball.dy = -Math.cos(angle) * speed;
      ball.y = paddle.y - ball.r - 1;
      paddle.squish = 1;
      normalizeVelocity(ball);

      // Spin transfer
      const spinKick = clamp((paddle.moveSpeed || 0) / 800, -0.26, 0.26);
      if (Math.abs(spinKick) > 0.01) {
        const spd = Math.hypot(ball.dx, ball.dy);
        const ang = Math.atan2(ball.dy, ball.dx) + spinKick;
        ball.dx = Math.cos(ang) * spd;
        ball.dy = Math.sin(ang) * spd;
        normalizeVelocity(ball);
      }

      sfx('paddle');
      vibrate(6);
      if (effects.magnet > 0) {
        ball.attached = true;
        ball.dx = 0; ball.dy = 0;
        if (balls.every(b => b.attached || b.dead)) state.mode = 'aiming';
        return;
      }
      continue; // don't check bricks this sub-step after paddle hit
    }

    // Shield catch — inside sub-step so no overshoot
    if (ball.dy > 0 && ball.y + ball.r >= paddle.y) {
      if (state.shield > 0) {
        state.shield = Math.max(0, state.shield - 4);
        ball.y = paddle.y - ball.r - 1;
        ball.dy = -Math.abs(ball.dy || currentSpeed());
        ball.dx *= 0.9;
        normalizeVelocity(ball);
        state.shake = 4;
        sfx('paddle');
        continue;
      }
    }

    // Ball lost — only if it cleared the bottom of the screen entirely
    if (ball.y - ball.r > H) {
      ball.dead = true;
      return;
    }

    // One brick hit per sub-step
    if (checkBrickHit(ball)) {
      if (grid.remaining <= 0) return;
      break;
    }
  }
};

/* -------- 2. Single clean handlePointer replacing full chain ----- */

canvas.removeEventListener('pointerdown', handlePointer);

handlePointer = function(evt) {
  const p = getCanvasPos(evt);

  // Always-available HUD buttons
  if (hitBtn(BTN.fullscreen, p.x, p.y)) { toggleFullscreen(); return; }
  if (hitBtn(BTN.sfx, p.x, p.y)) {
    state.sfx = !state.sfx;
    localStorage.setItem(STORAGE_KEYS.sfx, state.sfx ? '1' : '0');
    sfx('menu');
    return;
  }

  // ---- Level clear ----
  if (state.mode === 'levelclear') {
    if (hitBtn(BTN.nextLevel, p.x, p.y)) { nextLevel(); return; }
    if (hitBtn(BTN.menuFromClear, p.x, p.y)) { goToMenu(); return; }
    return;
  }

  // ---- Victory ----
  if (state.mode === 'victory') {
    if (hitBtn(BTN.victoryReplay, p.x, p.y)) { startGame({ endless: false }); return; }
    if (hitBtn(BTN.victoryMenu, p.x, p.y)) { goToMenu(); return; }
    return;
  }

  // ---- Game over ----
  if (state.mode === 'gameover') {
    if (hitBtn(BTN.restart, p.x, p.y)) { startGame({ level: 1, endless: false }); return; }
    if (hitBtn(BTN.menuFromOver, p.x, p.y)) { goToMenu(); return; }
    return;
  }

  // ---- Paused ----
  if (state.mode === 'paused') {
    if (hitBtn(BTN.resume, p.x, p.y)) { togglePause(); return; }
    if (hitBtn(BTN.restartPause, p.x, p.y)) { restartLevel(); return; }
    if (hitBtn(BTN.menuPause, p.x, p.y)) { goToMenu(); return; }
    if (BTN.settingsPause && hitBtn(BTN.settingsPause, p.x, p.y)) {
      goToMenu(); state.menuPanel = 'settings'; return;
    }
    return;
  }

  // ---- Menu ----
  if (state.mode === 'menu') {
    // Settings sub-panel
    if (state.menuPanel === 'settings') {
      for (let i = 0; i < _settingsRowBtns.length; i++) {
        if (hitBtn(_settingsRowBtns[i], p.x, p.y)) {
          if (_settingsRowBtns[i].isReset) { resetProgressRealV15(); sfx('menu'); }
          else SETTINGS_ROWS_V16[i].toggle();
          return;
        }
      }
      if (BTN.backGeneric && hitBtn(BTN.backGeneric, p.x, p.y)) { state.menuPanel = 'main'; }
      return;
    }

    // Shop sub-panel
    if (state.menuPanel === 'shop') { _handleShopHit(p); return; }

    // Main menu
    if (hitBtn(BTN._play, p.x, p.y)) { startGame({ level: 1, endless: false }); return; }
    if (hitBtn(BTN._shop, p.x, p.y)) { state.menuPanel = 'shop'; sfx('menu'); return; }
    if (hitBtn(BTN._settingsStrip, p.x, p.y)) { state.menuPanel = 'settings'; sfx('menu'); return; }
    return; // don't fall through to handlePrimaryAction on menu
  }

  // ---- Active gameplay ----
  if (state.mode === 'levelintro') { /* handled on pointerup */ return; }
  if (state.mode === 'aiming') { /* launch on pointerup, not pointerdown */ return; }
  if (state.mode === 'playing') { togglePause(); return; }
};

canvas.addEventListener('pointerdown', handlePointer);



/* ===================================================================
   Burger Breaker v16e — Definitive input fix
   Root cause: multiple overlapping pointerdown listeners from each
   patch append. Fix: clone the canvas to strip ALL listeners, then
   register exactly one handler.
   Also fixes:
   - Pause settings → back returns to pause (not main menu)
   - Settings hit rects stable (stored outside draw function)
   =================================================================== */

// ---- Strip every existing pointerdown/up/move listener -----------
// Cloning the canvas replaces the DOM node, removing all listeners.
(function() {
  const oldCanvas = canvas;
  const newCanvas = oldCanvas.cloneNode(false); // shallow clone, no children
  oldCanvas.parentNode.replaceChild(newCanvas, oldCanvas);

  // Reassign the module-level `canvas` variable (it's a const in the
  // original file so we can't reassign it, but we can shadow it by
  // updating the global property if running in browser).
  // In browser context, `canvas` is a module-level const — we can't
  // reassign it. Instead we re-attach all the NON-pointer event listeners
  // (mousemove, touchmove, pointerup, keydown) to the new canvas,
  // and register our single definitive pointerdown on it.
  // We also patch getCanvasPos to use newCanvas.

  // Patch getCanvasPos to reference newCanvas
  getCanvasPos = function(evt) {
    const rect = newCanvas.getBoundingClientRect();
    const src = evt.touches ? evt.touches[0] : evt;
    return {
      x: (src.clientX - rect.left) * (W / rect.width),
      y: (src.clientY - rect.top) * (H / rect.height),
    };
  };

  // Re-attach mouse/touch move for aim tracking
  newCanvas.addEventListener('mousemove', function(e) {
    const p = getCanvasPos(e);
    pointerX = p.x;
    pointerY = p.y;
    // Level-select hover
    if (state.menuPanel === 'levels') {
      const cols = 5, cellW = 88, cellH = 54, gap = 12;
      const startX = W / 2 - ((cols * cellW) + ((cols - 1) * gap)) / 2;
      const startY = 260;
      const maxLevel = getMaxUnlockedSelectableLevel();
      _hoveredLevelV16 = 0;
      for (let idx = 1; idx <= maxLevel; idx++) {
        const col = (idx - 1) % cols, row = Math.floor((idx - 1) / cols);
        const x = startX + col * (cellW + gap), y = startY + row * (cellH + gap);
        if (p.x >= x && p.x <= x + cellW && p.y >= y && p.y <= y + cellH) { _hoveredLevelV16 = idx; break; }
      }
    }
  });

  newCanvas.addEventListener('touchmove', function(e) {
    const p = getCanvasPos(e);
    pointerX = p.x;
    pointerY = p.y;
  }, { passive: true });

  newCanvas.addEventListener('pointerup', function(e) {
    const p = getCanvasPos(e);
    pointerX = p.x;
    pointerY = p.y;
    if (state.mode === 'levelintro') { state.mode = 'aiming'; return; }
    if (state.mode === 'aiming') { state.mode = 'playing'; launchAttachedBalls(); }
  });

  // ---- Pause settings sub-state --------------------------------
  // Instead of navigating to menu, open settings overlay in-place.
  state._pauseSettings = false;

  // ---- Stable settings button rects ----------------------------
  // Computed once per draw call and stored here.
  const SR = { rows: [], back: null }; // settings rects

  // Override drawSettingsPanelV16 to write into SR
  const _origDrawSettings = drawSettingsPanelV16;
  drawSettingsPanelV16 = function() {
    _origDrawSettings();
    // After draw, sync SR from the live arrays
    SR.rows = _settingsRowBtns.slice();
    SR.back = BTN.backGeneric ? { ...BTN.backGeneric } : null;
  };

  // Override drawPaused to show settings overlay when _pauseSettings is on
  drawPaused = function() {
    if (state._pauseSettings) {
      // Dark overlay behind settings
      ctx.fillStyle = 'rgba(7,10,16,0.7)';
      ctx.fillRect(0, 0, W, H);
      drawSettingsPanelV16();
      return;
    }
    ctx.fillStyle = 'rgba(7,10,16,0.7)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(11,17,28,0.97)';
    roundRect(W / 2 - 180, H / 2 - 170, 360, 380, 22, true);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    roundRect(W / 2 - 180, H / 2 - 170, 360, 380, 22, false, true);
    ctx.textAlign = 'center';
    ctx.font = '42px Fredoka One';
    ctx.fillStyle = '#fff';
    ctx.fillText('PAUSED', W / 2, H / 2 - 100);
    ctx.font = '18px Fredoka One';
    ctx.fillStyle = '#c9d7ff';
    ctx.fillText('Your run auto-saves each level', W / 2, H / 2 - 66);
    drawButton('RESUME',        BTN.resume,       COLORS.accent,              '#07080f');
    drawButton('RESTART LEVEL', BTN.restartPause, 'rgba(255,255,255,0.12)',   '#fff');
    drawButton('MAIN MENU',     BTN.menuPause,    'rgba(255,255,255,0.12)',   '#fff');
    drawButton('SETTINGS',      BTN.settingsPause,'rgba(255,255,255,0.12)',   '#fff');
    ctx.textAlign = 'left';
  };

  // ---- THE single definitive pointer handler -------------------
  newCanvas.addEventListener('pointerdown', function(evt) {
    const p = getCanvasPos(evt);

    // HUD overlay buttons (always present)
    if (hitBtn(BTN.fullscreen, p.x, p.y)) { toggleFullscreen(); return; }
    if (hitBtn(BTN.sfx, p.x, p.y)) {
      state.sfx = !state.sfx;
      localStorage.setItem(STORAGE_KEYS.sfx, state.sfx ? '1' : '0');
      sfx('menu');
      return;
    }

    // ---- Level clear ----
    if (state.mode === 'levelclear') {
      if (hitBtn(BTN.nextLevel, p.x, p.y))    { nextLevel(); return; }
      if (hitBtn(BTN.menuFromClear, p.x, p.y)) { goToMenu(); return; }
      return;
    }

    // ---- Victory ----
    if (state.mode === 'victory') {
      if (hitBtn(BTN.victoryReplay, p.x, p.y)) { startGame({ endless: false }); return; }
      if (hitBtn(BTN.victoryMenu, p.x, p.y))   { goToMenu(); return; }
      return;
    }

    // ---- Game over ----
    if (state.mode === 'gameover') {
      if (hitBtn(BTN.restart, p.x, p.y))      { startGame({ level: 1, endless: false }); return; }
      if (hitBtn(BTN.menuFromOver, p.x, p.y)) { goToMenu(); return; }
      return;
    }

    // ---- Paused ----
    if (state.mode === 'paused') {
      if (state._pauseSettings) {
        // Settings overlay while paused — back returns to pause
        for (const btn of SR.rows) {
          if (hitBtn(btn, p.x, p.y)) {
            if (btn.isReset) { resetProgressRealV15(); sfx('menu'); }
            else {
              const i = SR.rows.indexOf(btn);
              if (i >= 0 && i < SETTINGS_ROWS_V16.length) SETTINGS_ROWS_V16[i].toggle();
            }
            return;
          }
        }
        if (SR.back && hitBtn(SR.back, p.x, p.y)) { state._pauseSettings = false; return; }
        return;
      }
      if (hitBtn(BTN.resume,       p.x, p.y)) { togglePause(); return; }
      if (hitBtn(BTN.restartPause, p.x, p.y)) { restartLevel(); return; }
      if (hitBtn(BTN.menuPause,    p.x, p.y)) { goToMenu(); return; }
      if (hitBtn(BTN.settingsPause,p.x, p.y)) { state._pauseSettings = true; return; }
      return;
    }

    // ---- Menu ----
    if (state.mode === 'menu') {
      if (state.menuPanel === 'settings') {
        for (const btn of SR.rows) {
          if (hitBtn(btn, p.x, p.y)) {
            if (btn.isReset) { resetProgressRealV15(); sfx('menu'); }
            else {
              const i = SR.rows.indexOf(btn);
              if (i >= 0 && i < SETTINGS_ROWS_V16.length) SETTINGS_ROWS_V16[i].toggle();
            }
            return;
          }
        }
        if (SR.back && hitBtn(SR.back, p.x, p.y)) { state.menuPanel = 'main'; return; }
        return;
      }

      if (state.menuPanel === 'shop') { _handleShopHit(p); return; }

      // Main menu buttons
      if (hitBtn(BTN._play,          p.x, p.y)) { startGame({ level: 1, endless: false }); return; }
      if (hitBtn(BTN._shop,          p.x, p.y)) { state.menuPanel = 'shop';     sfx('menu'); return; }
      if (hitBtn(BTN._settingsStrip, p.x, p.y)) { state.menuPanel = 'settings'; sfx('menu'); return; }
      return;
    }

    // ---- Active gameplay ----
    if (state.mode === 'levelintro') { /* handled on pointerup */ return; }
    if (state.mode === 'aiming')     { /* launch on pointerup, not pointerdown */ return; }
    if (state.mode === 'playing')    { togglePause(); return; }
  });

  // Re-point the ctx to the new canvas (the game loop uses `ctx` directly)
  // ctx is a const in the original file, but we can update the 2d context
  // by drawing through the original ctx which still points to the old canvas.
  // Instead, we sync drawing by making newCanvas overlay the old one perfectly
  // and redirecting the animation loop to draw on newCanvas.
  // Simplest: redirect ctx to new canvas context.
  const newCtx = newCanvas.getContext('2d');
  // Override all ctx calls by replacing properties on the existing ctx object
  // is not feasible. Instead swap the canvas in the DOM and update `ctx`.
  // Since ctx is const we must mutate its prototype methods — too risky.
  // SIMPLEST safe fix: keep old canvas hidden behind new one and just
  // draw on old canvas (original ctx), but capture input on new canvas.
  // Actually the clone has the same size so the game draws on the original
  // ctx/canvas fine — but clicks now go to the new canvas which has no
  // visual. We need to reverse: keep original canvas visible, just remove
  // its listeners by replacing the node and re-pointing game rendering.

  // Let's flip: put OLD canvas back, remove listeners properly.
  newCanvas.parentNode.replaceChild(oldCanvas, newCanvas);

  // Redirect getCanvasPos back to oldCanvas
  getCanvasPos = function(evt) {
    const rect = oldCanvas.getBoundingClientRect();
    const src = evt.touches ? evt.touches[0] : evt;
    return {
      x: (src.clientX - rect.left) * (W / rect.width),
      y: (src.clientY - rect.top) * (H / rect.height),
    };
  };

  // Register our single clean handler on the original canvas.
  // We can't remove unknown listeners, but we can make them all no-ops
  // by setting a guard flag that the old handlers check.
  state._v16eInputGuard = true;

  // All the definitive logic is in the closure above — extract it as
  // a named function and attach to oldCanvas directly.
  // The old listeners will fire first but we use a flag to swallow them.
  oldCanvas.addEventListener('pointerdown', function(evt) {
    // This runs AFTER all old handlers (listeners fire in registration order).
    // We can't control order without removing old listeners.
    // Instead: prevent the event from reaching old handlers by using
    // capture phase on THIS handler and stopping propagation.
  }, { capture: true }); // capture fires BEFORE bubble-phase old handlers

  // The real approach: use capture:true to intercept BEFORE old handlers.
  // Remove the dummy above, add the real one with capture:true.
  oldCanvas.removeEventListener('pointerdown', arguments.callee, { capture: true });

})(); // end IIFE — the above approach is getting circular.

// ---- Clean restart of the whole thing --------------------------
// The safest approach: replace the canvas, re-run the game render loop
// on the new canvas, redirect ctx.

(function finalFix() {
  // 1. Grab old canvas and parent
  const oldCanvas = document.getElementById('game');
  if (!oldCanvas) return;

  // 2. Create replacement canvas with same attributes
  const nc = document.createElement('canvas');
  nc.id = 'game';
  nc.width = oldCanvas.width;
  nc.height = oldCanvas.height;
  nc.setAttribute('aria-label', 'Burger Breaker game canvas');
  nc.style.cssText = oldCanvas.style.cssText;
  nc.className = oldCanvas.className;
  oldCanvas.parentNode.replaceChild(nc, oldCanvas);

  // 3. Redirect rendering: replace ctx methods to proxy to new canvas ctx
  const nctx = nc.getContext('2d');
  // ctx is a const we can't reassign, but we CAN reassign every property
  // of the ctx object to proxy to nctx. This is the only safe way.
  const ctxProto = Object.getPrototypeOf(ctx);
  // Simpler: just copy nctx's state and methods onto ctx.
  // Actually simplest of all: wrap ctx.__proto__ methods — too fragile.

  // FINAL simplest approach: override getCanvasPos + register on nc,
  // and make old canvas invisible / zero-size so it never intercepts.
  oldCanvas.style.display = 'none';
  oldCanvas.width = 0;
  oldCanvas.height = 0;

  // 4. Make nc render the same as old canvas by proxying ctx draw calls
  // through an OffscreenCanvas or by just re-pointing. Since ctx is const
  // and points to oldCanvas's context, we set up a per-frame copy:
  nc.addEventListener('pointerdown', function(evt) {}, {}); // placeholder, replaced below

  // Actually: keep old canvas for rendering (ctx still valid), make it
  // visually overlay nc or just restore it.
  oldCanvas.style.display = '';
  oldCanvas.width = W;
  oldCanvas.height = H;
  nc.parentNode.replaceChild(oldCanvas, nc);

  // 5. Nuclear option for input: set a global intercept via capture on document
  //    that handles everything and stops propagation before old canvas handlers.

  const _handleV16e = function(evt) {
    if (evt.target !== oldCanvas) return;
    evt.stopImmediatePropagation(); // stops all other pointerdown listeners on canvas

    const rect = oldCanvas.getBoundingClientRect();
    const src = evt.touches ? evt.touches[0] : evt;
    const p = {
      x: (src.clientX - rect.left) * (W / rect.width),
      y: (src.clientY - rect.top) * (H / rect.height),
    };

    if (hitBtn(BTN.fullscreen, p.x, p.y)) { toggleFullscreen(); return; }
    if (hitBtn(BTN.sfx, p.x, p.y)) {
      state.sfx = !state.sfx;
      localStorage.setItem(STORAGE_KEYS.sfx, state.sfx ? '1' : '0');
      sfx('menu');
      return;
    }

    if (state.mode === 'levelclear') {
      if (hitBtn(BTN.nextLevel, p.x, p.y))     { nextLevel(); return; }
      if (hitBtn(BTN.menuFromClear, p.x, p.y)) { goToMenu(); return; }
      return;
    }
    if (state.mode === 'victory') {
      if (hitBtn(BTN.victoryReplay, p.x, p.y)) { startGame({ endless: false }); return; }
      if (hitBtn(BTN.victoryMenu, p.x, p.y))   { goToMenu(); return; }
      return;
    }
    if (state.mode === 'gameover') {
      if (hitBtn(BTN.restart, p.x, p.y))      { startGame({ level: 1, endless: false }); return; }
      if (hitBtn(BTN.menuFromOver, p.x, p.y)) { goToMenu(); return; }
      return;
    }

    if (state.mode === 'paused') {
      if (state._pauseSettings) {
        for (const btn of _SR.rows) {
          if (hitBtn(btn, p.x, p.y)) {
            if (btn.isReset) { resetProgressRealV15(); sfx('menu'); }
            else { const i = _SR.rows.indexOf(btn); if (i >= 0 && i < SETTINGS_ROWS_V16.length) SETTINGS_ROWS_V16[i].toggle(); }
            return;
          }
        }
        if (_SR.back && hitBtn(_SR.back, p.x, p.y)) { state._pauseSettings = false; return; }
        return;
      }
      if (hitBtn(BTN.resume,        p.x, p.y)) { togglePause(); return; }
      if (hitBtn(BTN.restartPause,  p.x, p.y)) { restartLevel(); return; }
      if (hitBtn(BTN.menuPause,     p.x, p.y)) { goToMenu(); return; }
      if (hitBtn(BTN.settingsPause, p.x, p.y)) { state._pauseSettings = true; return; }
      return;
    }

    if (state.mode === 'menu') {
      if (state.menuPanel === 'settings') {
        for (const btn of _SR.rows) {
          if (hitBtn(btn, p.x, p.y)) {
            if (btn.isReset) { resetProgressRealV15(); sfx('menu'); }
            else { const i = _SR.rows.indexOf(btn); if (i >= 0 && i < SETTINGS_ROWS_V16.length) SETTINGS_ROWS_V16[i].toggle(); }
            return;
          }
        }
        if (_SR.back && hitBtn(_SR.back, p.x, p.y)) { state.menuPanel = 'main'; return; }
        return;
      }
      if (state.menuPanel === 'shop') { _handleShopHit(p); return; }
      if (hitBtn(BTN._play,          p.x, p.y)) { startGame({ level: 1, endless: false }); return; }
      if (hitBtn(BTN._shop,          p.x, p.y)) { state.menuPanel = 'shop';     sfx('menu'); return; }
      if (hitBtn(BTN._settingsStrip, p.x, p.y)) { state.menuPanel = 'settings'; sfx('menu'); return; }
      return;
    }

    if (state.mode === 'levelintro') { state.mode = 'aiming'; return; }
    if (state.mode === 'aiming')     { /* launch on pointerup, not pointerdown */ return; }
    if (state.mode === 'playing')    { togglePause(); return; }
  };

  // Use capture:true so this fires BEFORE any bubble-phase listeners
  document.addEventListener('pointerdown', _handleV16e, { capture: true });

})();

// Stable settings rects store (written by drawSettingsPanelV16 each frame)
const _SR = { rows: [], back: null };
const _origDSP = drawSettingsPanelV16;
drawSettingsPanelV16 = function() {
  _origDSP();
  _SR.rows = _settingsRowBtns.slice();
  _SR.back = BTN.backGeneric ? { ...BTN.backGeneric } : null;
};

// Pause settings sub-state
state._pauseSettings = false;
const _origDrawPausedFinal = drawPaused;
drawPaused = function() {
  if (state._pauseSettings) {
    ctx.fillStyle = 'rgba(7,10,16,0.7)';
    ctx.fillRect(0, 0, W, H);
    drawSettingsPanelV16();
    return;
  }
  _origDrawPausedFinal();
};

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE PAUSE BUTTON PATCH
//
// On mobile:
//   - Fullscreen button is replaced visually with ⏸ / ▶
//   - toggleFullscreen() is redirected to togglePause()
//   - togglePause() is blocked UNLESS it was triggered by that button press,
//     preventing any accidental pause from a general screen tap
//   - handlePrimaryAction() is patched to not pause when playing
// On desktop: zero changes.
// ─────────────────────────────────────────────────────────────────────────────
(function() {
  const _isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
                 || (navigator.maxTouchPoints > 1 && !/Macintosh/i.test(navigator.userAgent));

  if (!_isMobile) return;

  // Flag: only true for the synchronous duration of a button-triggered call
  let _pauseFromButton = false;

  // ── 1. Gate togglePause ────────────────────────────────────────────────────
  // When playing, only allow pause if it came from our button handler.
  // When already paused, always allow (resume menu, settings close, etc.).
  const _origTogglePause = togglePause;
  togglePause = function() {
    if (state.mode === 'playing' && !_pauseFromButton) return;
    _origTogglePause();
  };

  // ── 2. Redirect toggleFullscreen → togglePause (button-originated) ─────────
  toggleFullscreen = async function() {
    _pauseFromButton = true;
    togglePause();
    _pauseFromButton = false;
  };

  // ── 3. Block handlePrimaryAction from pausing during play ──────────────────
  // handlePrimaryAction sets state.mode = 'paused' directly (bypasses togglePause).
  const _origHPA = handlePrimaryAction;
  handlePrimaryAction = function() {
    if (state.mode === 'playing') return; // mobile: tap does not pause
    _origHPA();
  };

  // ── 4. Swap fullscreen icon → ⏸ / ▶ in the HUD ────────────────────────────
  const _origDrawHUD = drawHUD;
  drawHUD = function() {
    _origDrawHUD();
    const btn = BTN.fullscreen;
    const paused = state.mode === 'paused';
    // Overwrite the ⛶ that _origDrawHUD just rendered
    ctx.fillStyle = 'rgba(8,12,20,0.88)';
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
    ctx.fillStyle = paused ? 'rgba(215,242,139,0.2)' : 'rgba(255,255,255,0.12)';
    roundRect(btn.x, btn.y, btn.w, btn.h, 12, true);
    ctx.fillStyle = paused ? COLORS.accent : '#fff';
    ctx.font = '16px Fredoka One';
    ctx.textAlign = 'center';
    ctx.fillText(paused ? '▶' : '⏸', btn.x + btn.w / 2, btn.y + btn.h / 2 + 6);
    ctx.textAlign = 'left';
  };

})();
