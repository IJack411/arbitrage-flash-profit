import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();

const parseDotEnv = (fileText) => {
  const out = {};
  for (const line of fileText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
};

const loadEnv = () => {
  const merged = { ...process.env };
  const files = [
    path.join(ROOT, '.env'),
    path.join(ROOT, 'supabase', '.env.local'),
  ];

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) continue;
    const parsed = parseDotEnv(fs.readFileSync(filePath, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (merged[key] === undefined || merged[key] === '') {
        merged[key] = value;
      }
    }
  }

  return merged;
};

const env = loadEnv();
const supabaseUrl = String(env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
const chatId = env.READINESS_ALERT_CHAT_ID || env.INDEX_ROLLOUT_ALERT_CHAT_ID || env.VITE_TELEGRAM_CHAT_ID || '';
const alertOnSuccess = String(env.READINESS_ALERT_ON_SUCCESS || 'false').toLowerCase() === 'true';
const runTimeoutMs = Math.max(120_000, Number(env.READINESS_HEALTHCHECK_TIMEOUT_MS || 900_000));

const nowIso = () => new Date().toISOString();

const takeTail = (text, maxLines = 30) => {
  const lines = String(text || '').split(/\r?\n/).filter(Boolean);
  return lines.slice(Math.max(0, lines.length - maxLines)).join('\n');
};

const sendTelegramAlert = async (message) => {
  if (!supabaseUrl || !anonKey || !chatId) {
    return { sent: false, reason: 'missing supabase url/key or chat id' };
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-telegram-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ chatId, data: { message } }),
    });

    const payload = await response.json().catch(() => ({}));
    return {
      sent: response.ok && Boolean(payload?.success),
      status: response.status,
      payload,
    };
  } catch (error) {
    return {
      sent: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
};

const main = async () => {
  console.log(`[${nowIso()}] scanner readiness healthcheck starting`);

  const commandEnv = {
    ...process.env,
    READINESS_SKIP_MATH_TESTS: process.env.READINESS_SKIP_MATH_TESTS || 'true',
    INDEX_ROLLOUT_MAX_P90_AGE_MS: process.env.INDEX_ROLLOUT_MAX_P90_AGE_MS || '300000',
  };

  const run = spawnSync('npm', ['run', 'scanner:readiness:full'], {
    shell: process.platform === 'win32',
    encoding: 'utf8',
    cwd: ROOT,
    env: commandEnv,
    timeout: runTimeoutMs,
  });

  const output = `${run.stdout || ''}${run.stderr || ''}`;
  if (output.trim()) {
    console.log(output.trim());
  }

  const timedOut = Boolean(run.error && String(run.error.message || '').toLowerCase().includes('timed out'));
  const code = typeof run.status === 'number' ? run.status : (timedOut ? 124 : 1);
  const ok = code === 0;

  if (timedOut) {
    console.error(`[${nowIso()}] readiness command timed out after ${runTimeoutMs}ms`);
  }

  if (!ok || alertOnSuccess) {
    const title = ok ? 'Scanner readiness healthcheck PASS' : 'Scanner readiness healthcheck FAIL';
    const message = [
      `*${title}*`,
      `project=arbitrage-flash-profit-2`,
      `timestamp=${nowIso()}`,
      `exit_code=${code}`,
      `timeout_ms=${runTimeoutMs}`,
      '',
      '```',
      takeTail(output),
      '```',
    ].join('\n');

    const alert = await sendTelegramAlert(message);
    if (alert.sent) {
      console.log('Alert sent via send-telegram-notification.');
    } else {
      console.log(`Alert not sent (${alert.reason || `status=${alert.status}`}).`);
    }
  }

  if (!ok) {
    console.error(`[${nowIso()}] scanner readiness healthcheck failed (exit ${code})`);
    process.exit(code);
  }

  console.log(`[${nowIso()}] scanner readiness healthcheck passed`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
