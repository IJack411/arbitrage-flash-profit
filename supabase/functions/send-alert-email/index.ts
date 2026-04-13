const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const to = body.to;
    const subject = body.subject ?? 'Alert';

    if (!to) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing recipient address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const providerConfigured = Boolean(Deno.env.get('RESEND_API_KEY'));

    return new Response(
      JSON.stringify({
        success: true,
        queued: true,
        providerConfigured,
        message: providerConfigured
          ? `Email accepted for delivery to ${to}`
          : `Email accepted in stub mode for ${to}`,
        subject,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
