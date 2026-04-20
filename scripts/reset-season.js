#!/usr/bin/env node
/**
 * BHB Rewards — Season Reset Script
 *
 * Wipes all `rewards:*` keys from Redis and (optionally) sets a specific
 * Season 1 start time. Safe to run repeatedly. Arcade/games data is untouched.
 *
 * USAGE
 *   node scripts/reset-season.js                     # wipe only — next request re-inits Season 1 to "now"
 *   node scripts/reset-season.js 2026-05-01          # wipe + set Season 1 to local midnight on May 1
 *   node scripts/reset-season.js 2026-05-01T08:00Z   # wipe + set to a specific UTC moment
 *   node scripts/reset-season.js 1777651200000       # wipe + set to raw epoch ms
 *
 *   Add --yes / -y to skip the confirmation prompt.
 *
 * SETUP
 *   1) From the project root:   npm i @upstash/redis
 *   2) Pull Vercel env vars:    vercel env pull .env.local
 *      (this writes KV_REST_API_URL and KV_REST_API_TOKEN to .env.local)
 *   3) Load them when running:  node --env-file=.env.local scripts/reset-season.js …
 *      (Node 20.6+; otherwise prefix: `KV_REST_API_URL=… KV_REST_API_TOKEN=… node …`)
 */

const { Redis }    = require('@upstash/redis');
const readline     = require('readline');

const REQUIRED_ENVS = ['KV_REST_API_URL', 'KV_REST_API_TOKEN'];
for (const key of REQUIRED_ENVS) {
  if (!process.env[key]) {
    console.error(`Missing env var: ${key}`);
    console.error('Run `vercel env pull .env.local` from your project root, then');
    console.error('`node --env-file=.env.local scripts/reset-season.js …` (Node 20.6+).');
    process.exit(1);
  }
}

const kv = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// ── Arg parsing ──────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const skipAsk   = args.includes('--yes') || args.includes('-y');
const dateArg   = args.find(a => a !== '--yes' && a !== '-y');

function parseDate(str) {
  if (!str) return null;
  // Raw epoch ms
  if (/^\d{10,}$/.test(str)) return Number(str);
  // Has explicit time or timezone
  if (/[T][\d]/.test(str) || /[Zz]$|[+-]\d\d:?\d\d$/.test(str)) {
    const d = new Date(str);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  // YYYY-MM-DD → local midnight
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).getTime();
  return null;
}

let newStartMs = null;
if (dateArg) {
  newStartMs = parseDate(dateArg);
  if (newStartMs === null) {
    console.error(`Could not parse date "${dateArg}".`);
    console.error('Try:  2026-05-01   |   2026-05-01T08:00:00Z   |   1777651200000');
    process.exit(1);
  }
}

// ── SCAN helper ──────────────────────────────────────────────────────────────
async function scanAll(pattern) {
  let cursor = 0;
  const keys = [];
  do {
    const [next, batch] = await kv.scan(cursor, { match: pattern, count: 500 });
    keys.push(...batch);
    cursor = typeof next === 'string' ? Number(next) : next;
  } while (cursor !== 0);
  return keys;
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer); }));
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('BHB Rewards — Season Reset');
  console.log('──────────────────────────');

  const keys = await scanAll('rewards:*');
  console.log(`Found ${keys.length} key(s) under rewards:*`);
  if (keys.length) console.log('Sample:', keys.slice(0, 6).join(', ') + (keys.length > 6 ? ', …' : ''));

  if (newStartMs !== null) {
    const d = new Date(newStartMs);
    console.log(`New Season 1 start: ${d.toString()}`);
    console.log(`                    ${d.toISOString()}  (epoch ${newStartMs})`);
  } else {
    console.log('No start date given — the next API request will re-init Season 1 to "now".');
  }

  if (!skipAsk) {
    const answer = await ask(`\nProceed? This will DELETE ${keys.length} key(s). Type "yes" to continue: `);
    if (answer.trim().toLowerCase() !== 'yes') {
      console.log('Cancelled.');
      process.exit(0);
    }
  }

  // Delete in batches (DEL supports variadic args; keep batches small for safety)
  let deleted = 0;
  while (keys.length > 0) {
    const batch = keys.splice(0, 50);
    await kv.del(...batch);
    deleted += batch.length;
    process.stdout.write(`\rDeleted ${deleted}…`);
  }
  if (deleted) process.stdout.write('\n');

  if (newStartMs !== null) {
    await kv.set('rewards:config', { season1StartMs: newStartMs });
    console.log('✓ rewards:config set');
  }

  console.log('\n✓ Done.');
  if (newStartMs !== null) {
    console.log('\nReminder: if you also have SEASON_1_START_MS set in Vercel env vars,');
    console.log('it overrides Redis. Either update it to match or remove it.');
  }
})().catch(err => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
