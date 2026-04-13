const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const chatId = body.chatId ?? body?.data?.chatId;
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');

    if (!chatId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing chatId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!token) {
      return new Response(
        JSON.stringify({ success: true, sent: false, message: 'Stub mode: TELEGRAM_BOT_TOKEN not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const text = body?.data?.message ?? body?.message ?? 'Flash Arbitrage Bot notification';
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });

    return new Response(
      JSON.stringify({ success: response.ok, sent: response.ok }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
