import fs from 'node:fs';

const parseDotEnv = (content) => {
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i < 0) continue;
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
};

const loadEnv = () => {
  const merged = { ...process.env };
  const files = ['.env', 'supabase/.env.local'];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const parsed = parseDotEnv(fs.readFileSync(file, 'utf8'));
    for (const [k, v] of Object.entries(parsed)) {
      if (!merged[k]) merged[k] = v;
    }
  }
  return merged;
};

const NETWORK_TERMS = {
  ethereum: ['WETH USDC', 'WETH USDT', 'LINK USDC', 'UNI USDC', 'AAVE USDC', 'LDO USDC', 'CRV USDC', 'DAI USDC', 'USDC USDT', 'MKR USDC', 'ENS USDC', 'SNX USDC', 'COMP USDC'],
  arbitrum: ['WETH USDC', 'WETH USDT', 'ARB USDC', 'GMX USDC', 'MAGIC USDC', 'LINK USDC', 'DAI USDC', 'USDC USDT', 'GRAIL USDC', 'DPX USDC'],
  base: ['WETH USDC', 'WETH USDT', 'LINK USDC', 'AERO USDC', 'DEGEN USDC', 'USDC USDT', 'TOSHI USDC', 'DACKIE USDC'],
  polygon: ['WMATIC USDC', 'WMATIC USDT', 'WETH USDC', 'LINK USDC', 'AAVE USDC', 'GHST USDC', 'DAI USDC', 'USDC USDT', 'SAND USDC', 'QUICK USDC'],
};

const priorityForPair = (tokenPair) => {
  if (tokenPair.endsWith('/USDC')) return 100;
  if (tokenPair.endsWith('/USDT')) return 95;
  return 80;
};

const toRows = () => {
  const rows = [];
  for (const [network, terms] of Object.entries(NETWORK_TERMS)) {
    for (const term of terms) {
      const [base, quote] = term.split(' ');
      if (!base || !quote) continue;
      const tokenPair = `${network}:${base}/${quote}`.toLowerCase();
      rows.push({
        network,
        token_pair: tokenPair,
        priority_score: priorityForPair(tokenPair),
        reason: 'initial-seed',
        next_refresh_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }
  return rows;
};

const main = async () => {
  const env = loadEnv();
  const supabaseUrl = String(env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const apiKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !apiKey) {
    console.error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY).');
    process.exit(1);
  }

  const rows = toRows();

  const url = `${supabaseUrl}/rest/v1/hot_pairs_queue?on_conflict=network,token_pair`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Seed failed:', response.status, payload);
    process.exit(1);
  }

  const inserted = Array.isArray(payload) ? payload.length : rows.length;
  console.log(`Seeded hot_pairs_queue rows: ${inserted}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
