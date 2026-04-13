const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { action, opportunity, webhooks } = await req.json().catch(() => ({}));

    if (action === 'analyze' && opportunity) {
      const profit = Number(opportunity.profit_percentage ?? 0);
      const severity = profit > 2 ? 'critical' : profit > 1 ? 'high' : profit > 0.7 ? 'medium' : 'low';
      return new Response(
        JSON.stringify({
          success: true,
          signal: {
            type: 'arbitrage',
            severity,
            token_pair: opportunity.token_pair,
            network: opportunity.network,
            data: opportunity,
            timestamp: new Date().toISOString(),
          },
          webhookResults: webhooks ? { accepted: true } : undefined,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (action === 'test-webhooks') {
      return new Response(
        JSON.stringify({ success: true, message: 'Webhook test accepted', results: { accepted: true } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, actions: ['analyze', 'test-webhooks'] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
