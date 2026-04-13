const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- RFC 4226 / RFC 6238 TOTP implementation ---

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const base32Encode = (buffer: Uint8Array): string => {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_CHARS[(value << (5 - bits)) & 0x1f];
  return output;
};

const base32Decode = (encoded: string): Uint8Array => {
  const cleaned = encoded.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of cleaned) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
};

const hmacSha1 = async (key: Uint8Array, data: Uint8Array): Promise<Uint8Array> => {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, data);
  return new Uint8Array(sig);
};

const generateTOTP = async (secret: string, timeStep = 30, digits = 6, offsetSteps = 0): Promise<string> => {
  const key = base32Decode(secret);
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / timeStep) + offsetSteps;
  const counterBytes = new Uint8Array(8);
  const view = new DataView(counterBytes.buffer);
  view.setBigUint64(0, BigInt(counter));
  const hmac = await hmacSha1(key, counterBytes);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    10 ** digits;
  return code.toString().padStart(digits, '0');
};

const verifyTOTP = async (token: string, secret: string, window = 1): Promise<boolean> => {
  if (!/^\d{6}$/.test(token)) return false;
  for (let i = -window; i <= window; i++) {
    const expected = await generateTOTP(secret, 30, 6, i);
    if (token === expected) return true;
  }
  return false;
};

const createSecret = (): string => {
  const bytes = new Uint8Array(20); // 160-bit secret per RFC 4226
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
};

const createBackupCodes = () => Array.from({ length: 10 }, () => crypto.randomUUID().slice(0, 8).toUpperCase());

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === 'setup') {
      const secret = createSecret();
      const email = body.email ?? 'user@example.com';
      const issuer = encodeURIComponent('FlashArbitrageBot');
      const account = encodeURIComponent(email);
      const qrCodeUrl = `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

      return new Response(
        JSON.stringify({
          success: true,
          secret,
          qrCodeUrl,
          backupCodes: createBackupCodes(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (action === 'verify') {
      const token = String(body.token ?? '');
      const secret = String(body.secret ?? '');
      if (!secret) {
        return new Response(
          JSON.stringify({ success: false, valid: false, message: 'Secret is required for verification' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const valid = await verifyTOTP(token, secret);
      return new Response(
        JSON.stringify({
          success: true,
          valid,
          message: valid ? 'Token verified successfully' : 'Invalid or expired token',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: `Unsupported action: ${action ?? 'none'}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
