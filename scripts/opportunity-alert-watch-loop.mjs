import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseScoutSummary = (text) => {
  const marker = '{\n  "anyAlert":';
  const idx = String(text || '').lastIndexOf(marker);
  if (idx < 0) return null;
  try {
    return JSON.parse(String(text).slice(idx));
  } catch {
    return null;
  }
};

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

const takeTail = (text, maxLines = 20) => {
  const lines = String(text || '').split(/\r?\n/).filter(Boolean);
  return lines.slice(Math.max(0, lines.length - maxLines)).join('\n');
};

const computeZeroPairStreak = (historyPath) => {
  if (!historyPath || !fs.existsSync(historyPath)) return 0;

  try {
    const lines = fs.readFileSync(historyPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    let streak = 0;
    for (let idx = lines.length - 1; idx >= 0; idx -= 1) {
      try {
        const parsed = JSON.parse(lines[idx]);
        const heartbeatStatus = String(parsed?.dataHeartbeat?.status || '').toLowerCase();
        const bestPairKeysMedian = Number(parsed?.bestProfile?.medians?.pairKeys);
        const isStarved = heartbeatStatus === 'starved'
          || (Number.isFinite(bestPairKeysMedian) && bestPairKeysMedian <= 0);
        if (!isStarved) break;
        streak += 1;
      } catch {
        break;
      }
    }
    return streak;
  } catch {
    return 0;
  }
};

const computePrecheckStreak = (historyPath) => {
  if (!historyPath || !fs.existsSync(historyPath)) return 0;

  try {
    const lines = fs.readFileSync(historyPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    let streak = 0;
    for (let idx = lines.length - 1; idx >= 0; idx -= 1) {
      try {
        const parsed = JSON.parse(lines[idx]);
        if (parsed?.precheckAlert === true) {
          streak += 1;
          continue;
        }
        break;
      } catch {
        break;
      }
    }
    return streak;
  } catch {
    return 0;
  }
};

const loadAlertState = (statePath) => {
  if (!statePath || !fs.existsSync(statePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const saveAlertState = (statePath, state) => {
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch {
    // Best-effort persistence; do not fail watch loop on state-write errors.
  }
};

const saveAlertLatch = (latchPath, payload) => {
  if (!latchPath) return;
  try {
    fs.mkdirSync(path.dirname(latchPath), { recursive: true });
    fs.writeFileSync(latchPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  } catch {
    // Best-effort persistence; do not fail watch loop on latch-write errors.
  }
};

const appendAlertHistory = (historyPath, payload) => {
  if (!historyPath) return;
  try {
    fs.mkdirSync(path.dirname(historyPath), { recursive: true });
    fs.appendFileSync(historyPath, `${JSON.stringify(payload)}\n`, 'utf8');
  } catch {
    // Best-effort persistence; do not fail watch loop on history-write errors.
  }
};

const getCooldownRemainingMs = ({ state, eventKey, cooldownMs, nowMs, cooldownOnFailedSend }) => {
  if (!cooldownMs || cooldownMs <= 0) return 0;

  const eventState = state?.[eventKey] || {};
  const lastTs = Number(
    cooldownOnFailedSend
      ? eventState.lastAttemptTs || 0
      : eventState.lastSentTs || 0,
  );
  if (!Number.isFinite(lastTs) || lastTs <= 0) return 0;

  const elapsed = nowMs - lastTs;
  if (elapsed >= cooldownMs) return 0;
  return Math.max(0, cooldownMs - elapsed);
};

const markAlertAttempt = ({ state, eventKey, nowMs }) => {
  const current = state?.[eventKey] || {};
  state[eventKey] = {
    ...current,
    lastAttemptTs: nowMs,
  };
};

const markAlertSent = ({ state, eventKey, nowMs }) => {
  const current = state?.[eventKey] || {};
  state[eventKey] = {
    ...current,
    lastSentTs: nowMs,
  };
};

const sendTelegramAlert = async ({ supabaseUrl, anonKey, chatId, message }) => {
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
      body: JSON.stringify({
        chatId,
        data: { message },
      }),
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

const numberFromEnv = (name, fallback) => {
  const raw = process.env[name];
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const boolFromEnv = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const normalized = String(raw).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const runScout = () => {
  const env = {
    ...process.env,
    ALERT_STRICT_EXIT: 'true',
  };

  return spawnSync('node', ['scripts/opportunity-alert-scout.mjs'], {
    shell: process.platform === 'win32',
    stdio: 'pipe',
    encoding: 'utf8',
    env,
  });
};

async function main() {
  const env = loadEnv();
  const runOnce = process.argv.includes('--once')
    || boolFromEnv('OPPORTUNITY_WATCH_ONCE', false);
  const maxChecks = runOnce
    ? 1
    : Math.max(1, Math.round(numberFromEnv('OPPORTUNITY_WATCH_MAX_CHECKS', 24)));
  const intervalMs = Math.max(30_000, Math.round(numberFromEnv('OPPORTUNITY_WATCH_INTERVAL_MS', 300_000)));
  const stopOnAlert = boolFromEnv('OPPORTUNITY_WATCH_STOP_ON_ALERT', true);
  const strictNoAlertExit = boolFromEnv('OPPORTUNITY_WATCH_STRICT_NO_ALERT_EXIT', false);
  const notifyOnAlert = boolFromEnv('OPPORTUNITY_WATCH_NOTIFY_ON_ALERT', true);
  const notifyOnWarm = boolFromEnv('OPPORTUNITY_WATCH_NOTIFY_ON_WARM', true);
  const notifyOnPrecheck = boolFromEnv('OPPORTUNITY_WATCH_NOTIFY_ON_PRECHECK', true);
  const notifyOnNoAlert = boolFromEnv('OPPORTUNITY_WATCH_NOTIFY_ON_NO_ALERT', false);
  const stopOnPrecheck = boolFromEnv('OPPORTUNITY_WATCH_STOP_ON_PRECHECK', false);
  const stopOnWarm = boolFromEnv('OPPORTUNITY_WATCH_STOP_ON_WARM', false);
  const strictPrecheckExit = boolFromEnv('OPPORTUNITY_WATCH_STRICT_PRECHECK_EXIT', false);
  const precheckStreakMin = Math.max(1, Math.round(numberFromEnv('OPPORTUNITY_WATCH_PRECHECK_STREAK_MIN', 2)));
  const precheckCooldownMs = Math.max(0, Math.round(numberFromEnv('OPPORTUNITY_WATCH_PRECHECK_NOTIFY_COOLDOWN_MS', 10 * 60 * 1000)));
  const heartbeatStreakMin = Math.max(1, Math.round(numberFromEnv('OPPORTUNITY_WATCH_HEARTBEAT_STREAK_MIN', 6)));
  const notifyOnHeartbeat = boolFromEnv('OPPORTUNITY_WATCH_NOTIFY_ON_HEARTBEAT', true);
  const stopOnHeartbeat = boolFromEnv('OPPORTUNITY_WATCH_STOP_ON_HEARTBEAT', false);
  const strictHeartbeatExit = boolFromEnv('OPPORTUNITY_WATCH_STRICT_HEARTBEAT_EXIT', false);
  const heartbeatCooldownMs = Math.max(0, Math.round(numberFromEnv('OPPORTUNITY_WATCH_HEARTBEAT_NOTIFY_COOLDOWN_MS', 15 * 60 * 1000)));
  const notifyOnConnectivity = boolFromEnv('OPPORTUNITY_WATCH_NOTIFY_ON_CONNECTIVITY', true);
  const stopOnConnectivity = boolFromEnv('OPPORTUNITY_WATCH_STOP_ON_CONNECTIVITY', false);
  const strictConnectivityExit = boolFromEnv('OPPORTUNITY_WATCH_STRICT_CONNECTIVITY_EXIT', false);
  const connectivityCooldownMs = Math.max(0, Math.round(numberFromEnv('OPPORTUNITY_WATCH_CONNECTIVITY_NOTIFY_COOLDOWN_MS', 15 * 60 * 1000)));
  const cooldownOnFailedSend = boolFromEnv('OPPORTUNITY_WATCH_COOLDOWN_ON_FAILED_SEND', false);
  const alertStatePath = path.resolve(process.env.OPPORTUNITY_WATCH_ALERT_STATE_FILE || 'logs/scheduler/opportunity-watch-alert-state.json');
  const alertLatchPath = path.resolve(process.env.OPPORTUNITY_WATCH_ALERT_LATCH_FILE || 'benchmark-results/high-quality-alert-latest.json');
  const alertHistoryPath = path.resolve(process.env.OPPORTUNITY_WATCH_ALERT_HISTORY_FILE || 'benchmark-results/high-quality-alert-history.jsonl');
  const scoutHistoryPath = path.resolve(process.env.ALERT_SCOUT_HISTORY_FILE || 'benchmark-results/opportunity-scout-history.jsonl');

  const supabaseUrl = String(env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
  const chatId = env.OPPORTUNITY_ALERT_CHAT_ID || env.VITE_TELEGRAM_CHAT_ID || '';

  let alerts = 0;
  let warmAlerts = 0;
  let precheckAlerts = 0;
  let noAlerts = 0;
  let heartbeatAlerts = 0;
  let connectivityAlerts = 0;
  const alertState = loadAlertState(alertStatePath);

  console.log(`[${new Date().toISOString()}] opportunity-watch start maxChecks=${maxChecks} intervalMs=${intervalMs} stopOnAlert=${stopOnAlert}`);

  for (let i = 1; i <= maxChecks; i += 1) {
    console.log(`\n--- Opportunity Check ${i}/${maxChecks} @ ${new Date().toISOString()} ---`);
    const result = runScout();
    const exitCode = typeof result.status === 'number' ? result.status : 1;
    const scoutOutput = `${result.stdout || ''}${result.stderr || ''}`;
    if (scoutOutput.trim()) {
      console.log(scoutOutput.trim());
    }
    const scoutSummary = parseScoutSummary(scoutOutput);
    const isPrecheckAlert = Boolean(scoutSummary?.precheckAlert);
    const isWarmAlert = Boolean(scoutSummary?.warmAlert);
    const endpointUnreachable = String(scoutSummary?.endpointHealth?.status || '').toLowerCase() === 'unreachable';
    const zeroPairStreak = computeZeroPairStreak(scoutHistoryPath);
    const precheckStreak = computePrecheckStreak(scoutHistoryPath);
    const heartbeatTriggered = zeroPairStreak >= heartbeatStreakMin;

    if (exitCode === 10) {
      alerts += 1;
      console.log(`Opportunity check ${i} result=ALERT`);
      const alertPayload = {
        timestamp: new Date().toISOString(),
        result: 'ALERT',
        checkIndex: i,
        maxChecks,
        scoutSummary,
      };
      saveAlertLatch(alertLatchPath, alertPayload);
      appendAlertHistory(alertHistoryPath, alertPayload);
      console.log(`Alert latch snapshot saved to ${alertLatchPath}`);
      console.log(`Alert history appended to ${alertHistoryPath}`);
      if (notifyOnAlert) {
        const message = [
          '*Scanner Opportunity ALERT*',
          `project=arbitrage-flash-profit-2`,
          `timestamp=${new Date().toISOString()}`,
          '',
          '```',
          takeTail(scoutOutput, 18),
          '```',
        ].join('\n');
        const alert = await sendTelegramAlert({ supabaseUrl, anonKey, chatId, message });
        if (alert.sent) {
          console.log('Opportunity alert sent via send-telegram-notification.');
        } else {
          console.log(`Opportunity alert not sent (${alert.reason || `status=${alert.status}`}).`);
        }
      }
      if (stopOnAlert) {
        console.log('Stopping watch because alert condition was reached.');
        break;
      }
    } else if (exitCode === 14 || isPrecheckAlert) {
      precheckAlerts += 1;
      const precheckEscalated = precheckStreak >= precheckStreakMin;
      const precheckLabel = precheckEscalated ? 'PRECHECK_STREAK_ALERT' : 'PRECHECK_ALERT';
      console.log(`Opportunity check ${i} result=${precheckLabel} precheckStreak=${precheckStreak}`);
      if (notifyOnPrecheck) {
        const nowMs = Date.now();
        const remainingMs = getCooldownRemainingMs({
          state: alertState,
          eventKey: 'precheck',
          cooldownMs: precheckCooldownMs,
          nowMs,
          cooldownOnFailedSend,
        });
        if (remainingMs > 0) {
          console.log(`Precheck alert suppressed by cooldown (${Math.ceil(remainingMs / 1000)}s remaining).`);
        } else {
          markAlertAttempt({ state: alertState, eventKey: 'precheck', nowMs });
          saveAlertState(alertStatePath, alertState);
          const message = [
            precheckEscalated ? '*Scanner Opportunity PRECHECK_STREAK_ALERT*' : '*Scanner Opportunity PRECHECK_ALERT*',
            `project=arbitrage-flash-profit-2`,
            `timestamp=${new Date().toISOString()}`,
            `precheck_streak=${precheckStreak}`,
            `profile=${scoutSummary?.bestProfile?.profile || 'unknown'}`,
            `top_watch_net=${scoutSummary?.bestProfile?.bestSeen?.topWatchNet ?? 'n/a'}`,
            `top_distance=${scoutSummary?.bestProfile?.bestSeen?.topDistance ?? 'n/a'}`,
            `closeness=${scoutSummary?.bestProfile?.closenessScore ?? 'n/a'}`,
          ].join('\n');
          const alert = await sendTelegramAlert({ supabaseUrl, anonKey, chatId, message });
          if (alert.sent) {
            markAlertSent({ state: alertState, eventKey: 'precheck', nowMs: Date.now() });
            saveAlertState(alertStatePath, alertState);
            console.log('Precheck alert sent via send-telegram-notification.');
          } else {
            console.log(`Precheck alert not sent (${alert.reason || `status=${alert.status}`}).`);
          }
        }
      }
      if (stopOnPrecheck) {
        console.log('Stopping watch because precheck-alert condition was reached.');
        break;
      }
    } else if (exitCode === 11 || isWarmAlert) {
      warmAlerts += 1;
      console.log(`Opportunity check ${i} result=WARM_ALERT`);
      if (notifyOnWarm) {
        const message = [
          '*Scanner Opportunity WARM_ALERT*',
          `project=arbitrage-flash-profit-2`,
          `timestamp=${new Date().toISOString()}`,
          `profile=${scoutSummary?.bestProfile?.profile || 'unknown'}`,
          `closeness=${scoutSummary?.bestProfile?.closenessScore ?? 'n/a'}`,
          `trend_delta=${scoutSummary?.trend?.deltaVsRecentMedian ?? 'n/a'}`,
          `top_watch_net=${scoutSummary?.bestProfile?.bestSeen?.topWatchNet ?? 'n/a'}`,
          `top_distance=${scoutSummary?.bestProfile?.bestSeen?.topDistance ?? 'n/a'}`,
        ].join('\n');
        const alert = await sendTelegramAlert({ supabaseUrl, anonKey, chatId, message });
        if (alert.sent) {
          console.log('Warm alert sent via send-telegram-notification.');
        } else {
          console.log(`Warm alert not sent (${alert.reason || `status=${alert.status}`}).`);
        }
      }
      if (stopOnWarm) {
        console.log('Stopping watch because warm-alert condition was reached.');
        break;
      }
    } else if (endpointUnreachable) {
      connectivityAlerts += 1;
      console.log(`Opportunity check ${i} result=CONNECTIVITY_ALERT`);
      if (notifyOnConnectivity) {
        const nowMs = Date.now();
        const remainingMs = getCooldownRemainingMs({
          state: alertState,
          eventKey: 'connectivity',
          cooldownMs: connectivityCooldownMs,
          nowMs,
          cooldownOnFailedSend,
        });
        if (remainingMs > 0) {
          console.log(`Connectivity alert suppressed by cooldown (${Math.ceil(remainingMs / 1000)}s remaining).`);
        } else {
          markAlertAttempt({ state: alertState, eventKey: 'connectivity', nowMs });
          saveAlertState(alertStatePath, alertState);
          const message = [
            '*Scanner Connectivity ALERT*',
            `project=arbitrage-flash-profit-2`,
            `timestamp=${new Date().toISOString()}`,
            `endpoint_status=${scoutSummary?.endpointHealth?.status || 'unknown'}`,
            `error_profiles=${scoutSummary?.endpointHealth?.errorProfiles ?? 'n/a'}`,
            '',
            '```',
            takeTail(scoutOutput, 14),
            '```',
          ].join('\n');
          const alert = await sendTelegramAlert({ supabaseUrl, anonKey, chatId, message });
          if (alert.sent) {
            markAlertSent({ state: alertState, eventKey: 'connectivity', nowMs: Date.now() });
            saveAlertState(alertStatePath, alertState);
            console.log('Connectivity alert sent via send-telegram-notification.');
          } else {
            console.log(`Connectivity alert not sent (${alert.reason || `status=${alert.status}`}).`);
          }
        }
      }
      if (stopOnConnectivity) {
        console.log('Stopping watch because connectivity alert condition was reached.');
        break;
      }
    } else if (heartbeatTriggered) {
      heartbeatAlerts += 1;
      console.log(`Opportunity check ${i} result=DATA_HEARTBEAT_ALERT zeroPairStreak=${zeroPairStreak}`);
      if (notifyOnHeartbeat) {
        const nowMs = Date.now();
        const remainingMs = getCooldownRemainingMs({
          state: alertState,
          eventKey: 'heartbeat',
          cooldownMs: heartbeatCooldownMs,
          nowMs,
          cooldownOnFailedSend,
        });
        if (remainingMs > 0) {
          console.log(`Data-heartbeat alert suppressed by cooldown (${Math.ceil(remainingMs / 1000)}s remaining).`);
        } else {
          markAlertAttempt({ state: alertState, eventKey: 'heartbeat', nowMs });
          saveAlertState(alertStatePath, alertState);
          const message = [
            '*Scanner Data Heartbeat ALERT*',
            `project=arbitrage-flash-profit-2`,
            `timestamp=${new Date().toISOString()}`,
            `zero_pair_streak=${zeroPairStreak}`,
            `heartbeat_status=${scoutSummary?.dataHeartbeat?.status || 'unknown'}`,
            `best_pair_keys_median=${scoutSummary?.dataHeartbeat?.bestPairKeysMedian ?? 'n/a'}`,
            '',
            '```',
            takeTail(scoutOutput, 14),
            '```',
          ].join('\n');
          const alert = await sendTelegramAlert({ supabaseUrl, anonKey, chatId, message });
          if (alert.sent) {
            markAlertSent({ state: alertState, eventKey: 'heartbeat', nowMs: Date.now() });
            saveAlertState(alertStatePath, alertState);
            console.log('Data-heartbeat alert sent via send-telegram-notification.');
          } else {
            console.log(`Data-heartbeat alert not sent (${alert.reason || `status=${alert.status}`}).`);
          }
        }
      }
      if (stopOnHeartbeat) {
        console.log('Stopping watch because data-heartbeat alert condition was reached.');
        break;
      }
    } else if (exitCode === 0) {
      noAlerts += 1;
      console.log(`Opportunity check ${i} result=NO_ALERT`);
      if (notifyOnNoAlert) {
        const message = [
          '*Scanner Opportunity NO_ALERT*',
          `project=arbitrage-flash-profit-2`,
          `timestamp=${new Date().toISOString()}`,
          '',
          '```',
          takeTail(scoutOutput, 14),
          '```',
        ].join('\n');
        const alert = await sendTelegramAlert({ supabaseUrl, anonKey, chatId, message });
        if (alert.sent) {
          console.log('No-alert status sent via send-telegram-notification.');
        } else {
          console.log(`No-alert status not sent (${alert.reason || `status=${alert.status}`}).`);
        }
      }
    } else {
      console.log(`Opportunity check ${i} result=ERROR (exit=${exitCode})`);
      process.exit(exitCode);
    }

    if (i < maxChecks) {
      await sleep(intervalMs);
    }
  }

  console.log('\n=== Opportunity Watch Summary ===');
  console.log(`alerts=${alerts}`);
  console.log(`precheck_alerts=${precheckAlerts}`);
  console.log(`warm_alerts=${warmAlerts}`);
  console.log(`heartbeat_alerts=${heartbeatAlerts}`);
  console.log(`connectivity_alerts=${connectivityAlerts}`);
  console.log(`no_alerts=${noAlerts}`);

  if (alerts === 0 && strictNoAlertExit) {
    process.exit(2);
  }
  if (precheckAlerts > 0 && strictPrecheckExit) {
    process.exit(14);
  }
  if (heartbeatAlerts > 0 && strictHeartbeatExit) {
    process.exit(12);
  }
  if (connectivityAlerts > 0 && strictConnectivityExit) {
    process.exit(13);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
