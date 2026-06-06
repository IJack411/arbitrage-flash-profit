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

const main = async () => {
  const env = loadEnv();
  const baseUrl = String(env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const apiKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY || '';

  if (!baseUrl || !apiKey) {
    console.error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY).');
    process.exit(1);
  }

  const body = {
    mode: process.env.INDEXER_MODE || 'fast',
    networks: (process.env.INDEXER_NETWORKS || 'ethereum,arbitrum,base,polygon').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean),
    maxPairs: Number(process.env.INDEXER_MAX_PAIRS || 100),
    force: String(process.env.INDEXER_FORCE || 'false').toLowerCase() === 'true',
  };

  const response = await fetch(`${baseUrl}/functions/v1/indexer-refresh-fast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  console.log('status', response.status);
  console.log(JSON.stringify(payload, null, 2));

  if (!response.ok || !payload?.success) {
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
