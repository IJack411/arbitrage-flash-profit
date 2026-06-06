import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const NOW = Date.now();
const indexerStaleMs = Math.max(60_000, Number(process.env.OPS_SCHED_INDEXER_STALE_MS || 12 * 60_000));
const readinessStaleMs = Math.max(120_000, Number(process.env.OPS_SCHED_READINESS_STALE_MS || 40 * 60_000));
const opportunityStaleMs = Math.max(60_000, Number(process.env.OPS_SCHED_OPPORTUNITY_STALE_MS || 12 * 60_000));
const strictMode = String(process.env.OPS_SCHEDULE_SUMMARY_STRICT || 'false').toLowerCase() === 'true';
const jsonMode = String(process.env.OPS_SCHEDULE_SUMMARY_JSON || 'false').toLowerCase() === 'true';

const runCommand = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  return {
    code: typeof result.status === 'number' ? result.status : 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
};

const parseIsoFromMarker = (line) => {
  const match = String(line || '').match(/^\[(.*?)\]/);
  if (!match) return null;
  const ts = Date.parse(match[1]);
  return Number.isFinite(ts) ? ts : null;
};

const formatAge = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) return 'n/a';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m${String(seconds).padStart(2, '0')}s`;
};

const readTextFileFlexible = (filePath) => {
  const raw = fs.readFileSync(filePath);
  const utf8 = raw.toString('utf8');
  const hasManyNulls = (utf8.match(/\u0000/g) || []).length > Math.max(4, Math.floor(utf8.length * 0.05));
  if (!hasManyNulls) {
    return utf8.replace(/^\uFEFF/, '');
  }
  const utf16le = raw.toString('utf16le').replace(/^\uFEFF/, '');
  return utf16le;
};

const findLatestOpportunityRunLog = () => {
  const dir = path.join(ROOT, 'logs', 'scheduler');
  if (!fs.existsSync(dir)) {
    return null;
  }

  const candidates = fs
    .readdirSync(dir)
    .filter((name) => /^opportunity-watch-\d{8}-\d{6}\.log$/i.test(name))
    .map((name) => {
      const absPath = path.join(dir, name);
      const stat = fs.statSync(absPath);
      const mtimeMs = Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : stat.mtime.getTime();
      return { name, absPath, mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return candidates.length > 0 ? candidates[0] : null;
};

const parseSummaryCounts = (text) => {
  const getCount = (key) => {
    const m = text.match(new RegExp(`(?:^|\\n)${key}=(\\d+)`, 'i'));
    return m ? Number(m[1]) : null;
  };

  return {
    alerts: getCount('alerts'),
    precheckAlerts: getCount('precheck_alerts'),
    warmAlerts: getCount('warm_alerts'),
    heartbeatAlerts: getCount('heartbeat_alerts'),
    connectivityAlerts: getCount('connectivity_alerts'),
    noAlerts: getCount('no_alerts'),
  };
};

const analyzeMarkers = (markers, staleThresholdMs) => {
  const starts = [];
  const completions = [];
  for (const line of markers) {
    if (line.includes('starting ')) starts.push(line);
    if (line.includes('completed ')) completions.push(line);
  }

  const lastStart = starts.length > 0 ? starts[starts.length - 1] : null;
  const lastCompletion = completions.length > 0 ? completions[completions.length - 1] : null;
  const lastStartMs = parseIsoFromMarker(lastStart);
  const lastCompletionMs = parseIsoFromMarker(lastCompletion);

  let stale = false;
  let pendingSinceMs = null;

  if (lastStartMs !== null) {
    if (lastCompletionMs === null || lastCompletionMs < lastStartMs) {
      pendingSinceMs = NOW - lastStartMs;
      stale = pendingSinceMs > staleThresholdMs;
    }
  }

  return {
    starts: starts.length,
    completions: completions.length,
    hasPendingRun: pendingSinceMs !== null,
    pendingAgeMs: pendingSinceMs,
    stale,
    lastStart,
    lastCompletion,
  };
};

const parseTaskStatus = (text) => {
  const getValue = (label) => {
    const line = text.split(/\r?\n/).find((entry) => entry.trim().startsWith(`${label}:`));
    if (!line) return 'n/a';
    return line.split(':').slice(1).join(':').trim() || 'n/a';
  };

  return {
    taskName: getValue('TaskName'),
    status: getValue('Status'),
    lastRunTime: getValue('Last Run Time'),
    lastResult: getValue('Last Result'),
    nextRunTime: getValue('Next Run Time'),
    repeatEvery: getValue('Repeat: Every'),
  };
};

const printTaskSection = (title, npmScript) => {
  console.log(`\n=== ${title} ===`);
  const result = runCommand('npm', ['run', npmScript]);
  if (result.code !== 0) {
    console.log(`WARN failed to query task status (exit ${result.code})`);
    const msg = `${result.stdout}\n${result.stderr}`.trim();
    if (msg) console.log(msg.split(/\r?\n/).slice(-20).join('\n'));
    return { ok: false, reason: 'status_query_failed', title };
  }

  const parsed = parseTaskStatus(result.stdout);
  console.log(`task=${parsed.taskName}`);
  console.log(`status=${parsed.status}`);
  console.log(`last_run=${parsed.lastRunTime}`);
  console.log(`last_result=${parsed.lastResult}`);
  console.log(`next_run=${parsed.nextRunTime}`);
  console.log(`repeat=${parsed.repeatEvery}`);

  const statusLower = String(parsed.status).toLowerCase();
  const lastResult = String(parsed.lastResult).trim();
  const runningResultCodes = new Set(['267009', '0x41301']);
  const lastResultOk = lastResult === '0' || (statusLower === 'running' && runningResultCodes.has(lastResult.toLowerCase()));
  const statusOk = statusLower === 'ready' || statusLower === 'running';

  return {
    ok: statusOk && lastResultOk,
    title,
    taskName: parsed.taskName,
    status: parsed.status,
    lastResult: parsed.lastResult,
    lastRunTime: parsed.lastRunTime,
    nextRunTime: parsed.nextRunTime,
    repeatEvery: parsed.repeatEvery,
  };
};

const printLogMarkers = (title, logPath, staleThresholdMs) => {
  console.log(`\n=== ${title} ===`);
  const absPath = path.join(ROOT, logPath);
  if (!fs.existsSync(absPath)) {
    console.log(`WARN log missing: ${logPath}`);
    return { ok: false, reason: 'missing_log', title, logPath };
  }

  const content = fs.readFileSync(absPath, 'utf8');
  const allMarkers = content
    .split(/\r?\n/)
    .filter((line) => /starting |completed /.test(line));
  const markers = allMarkers.slice(-8);

  if (allMarkers.length === 0) {
    console.log('No start/completion markers found yet.');
    return { ok: false, reason: 'no_markers', title, logPath };
  }

  for (const line of markers) {
    console.log(line);
  }

  const analysis = analyzeMarkers(allMarkers, staleThresholdMs);
  console.log(`markers starts=${analysis.starts} completed=${analysis.completions}`);

  if (analysis.hasPendingRun) {
    const age = formatAge(analysis.pendingAgeMs);
    if (analysis.stale) {
      console.log(`WARN pending run appears stale (age=${age}, threshold=${formatAge(staleThresholdMs)})`);
    } else {
      console.log(`INFO pending run in progress (age=${age})`);
    }
  }

  return {
    ok: !analysis.stale,
    title,
    logPath,
    stale: analysis.stale,
    starts: analysis.starts,
    completions: analysis.completions,
    pendingAgeMs: analysis.pendingAgeMs,
    staleThresholdMs,
  };
};

const printOpportunityRunLogSummary = (staleThresholdMs) => {
  console.log('\n=== Opportunity Run Log ===');
  const latest = findLatestOpportunityRunLog();
  if (!latest) {
    console.log('WARN no per-run opportunity logs found in logs/scheduler/.');
    return { ok: false, reason: 'missing_run_logs', title: 'Opportunity Run Log' };
  }

  const relPath = path.relative(ROOT, latest.absPath).replace(/\\/g, '/');
  const ageMs = Number.isFinite(latest.mtimeMs) ? Math.max(0, NOW - latest.mtimeMs) : Number.NaN;
  const stale = ageMs > staleThresholdMs;
  const text = readTextFileFlexible(latest.absPath);
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const tail = lines.slice(-20);
  const counts = parseSummaryCounts(text);

  console.log(`latest_log=${relPath}`);
  console.log(`updated_age=${formatAge(ageMs)} (threshold=${formatAge(staleThresholdMs)})`);
  console.log(`alerts=${counts.alerts ?? 'n/a'} precheck_alerts=${counts.precheckAlerts ?? 'n/a'} warm_alerts=${counts.warmAlerts ?? 'n/a'}`);

  if (stale) {
    console.log('WARN latest opportunity run log is stale.');
  }

  console.log('tail:');
  for (const line of tail) {
    console.log(line);
  }

  return {
    ok: !stale,
    title: 'Opportunity Run Log',
    logPath: relPath,
    stale,
    ageMs,
    staleThresholdMs,
    counts,
  };
};

const main = () => {
  console.log('Scheduler summary for arbitrage-flash-profit-2');

  const indexerTask = printTaskSection('Indexer Task', 'ops:healthcheck:schedule:status');
  const readinessTask = printTaskSection('Readiness Task', 'ops:readiness:schedule:status');
  const opportunityTask = printTaskSection('Opportunity Task', 'ops:opportunity:schedule:status');

  const indexerLogs = printLogMarkers('Indexer Log Markers', 'logs/scheduler/indexer-healthcheck.log', indexerStaleMs);
  const readinessLogs = printLogMarkers('Readiness Log Markers', 'logs/scheduler/scanner-readiness-healthcheck.log', readinessStaleMs);
  const opportunityLogs = printOpportunityRunLogSummary(opportunityStaleMs);

  const checks = [indexerTask, readinessTask, opportunityTask, indexerLogs, readinessLogs, opportunityLogs];
  const healthy = checks.every((check) => check && check.ok === true);

  const summary = {
    generatedAt: new Date().toISOString(),
    strictMode,
    healthy,
    thresholds: {
      indexerStaleMs,
      readinessStaleMs,
      opportunityStaleMs,
    },
    tasks: {
      indexer: indexerTask,
      readiness: readinessTask,
      opportunity: opportunityTask,
    },
    logs: {
      indexer: indexerLogs,
      readiness: readinessLogs,
      opportunity: opportunityLogs,
    },
  };

  console.log('\n=== Verdict ===');
  console.log(`overall=${healthy ? 'HEALTHY' : 'UNHEALTHY'}`);
  console.log(`strict_mode=${strictMode}`);

  if (jsonMode) {
    console.log('\n=== JSON ===');
    console.log(JSON.stringify(summary, null, 2));
  }

  console.log('\nDone.');

  if (!healthy && strictMode) {
    process.exit(1);
  }
};

main();
