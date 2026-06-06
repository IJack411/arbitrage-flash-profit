// Telegram message sender — formats findings into readable messages
import fetch from 'node-fetch';

const SEVERITY_ICONS = {
  recommendation: '💡',
  warning: '⚠️',
  info: 'ℹ️',
  error: '🔴',
};

export async function sendFindings(botToken, chatId, findings) {
  if (!findings.length) {
    return { ok: true, sentChunks: 0, failedChunks: 0, errors: [] };
  }

  // Group by severity
  const recs = findings.filter(f => f.severity === 'recommendation');
  const warnings = findings.filter(f => f.severity === 'warning');
  const infos = findings.filter(f => f.severity === 'info');

  let message = '🔍 <b>Scout Agent Report</b>\n';
  message += `<i>${new Date().toUTCString()}</i>\n\n`;

  if (recs.length > 0) {
    message += '━━━ <b>Recommendations</b> ━━━\n\n';
    for (const f of recs) {
      message += `${SEVERITY_ICONS[f.severity]} <b>${esc(f.title)}</b>\n`;
      message += `${esc(f.detail)}\n`;
      if (f.action) message += `➤ <i>${esc(f.action)}</i>\n`;
      message += '\n';
    }
  }

  if (warnings.length > 0) {
    message += '━━━ <b>Warnings</b> ━━━\n\n';
    for (const f of warnings) {
      message += `${SEVERITY_ICONS[f.severity]} <b>${esc(f.title)}</b>\n`;
      message += `${esc(f.detail)}\n`;
      if (f.action) message += `➤ <i>${esc(f.action)}</i>\n`;
      message += '\n';
    }
  }

  if (infos.length > 0) {
    message += '━━━ <b>Status</b> ━━━\n\n';
    for (const f of infos) {
      message += `${SEVERITY_ICONS[f.severity]} ${esc(f.title)}: ${esc(f.detail)}\n`;
    }
  }

  message += `\n<i>Next scan in ${process.env.SCAN_INTERVAL_MINUTES || 15} min</i>`;

  // Telegram has a 4096 char limit — split if needed
  const chunks = splitMessage(message, 4000);
  let sentChunks = 0;
  let failedChunks = 0;
  const errors = [];

  for (const chunk of chunks) {
    const result = await sendTelegramMessage(botToken, chatId, chunk);
    if (result.ok) {
      sentChunks++;
    } else {
      failedChunks++;
      if (result.error) errors.push(result.error);
    }
  }

  return {
    ok: failedChunks === 0,
    sentChunks,
    failedChunks,
    errors,
  };
}

async function sendTelegramMessage(botToken, chatId, text) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error('Telegram send failed:', data.description);
      return {
        ok: false,
        error: `Telegram API: ${data.description || 'unknown error'}`,
      };
    }
    return { ok: true };
  } catch (err) {
    console.error('Telegram error:', err.message);
    return {
      ok: false,
      error: `Request failed: ${err.message}`,
    };
  }
}

function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt < maxLen * 0.5) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
