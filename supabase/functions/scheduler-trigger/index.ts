const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const runScan = async () => {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/scan-arbitrage-opportunities`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ scheduledRun: true }),
  });

  if (!res.ok) {
    throw new Error(`scanner returned ${res.status}`);
  }

  const json = await res.json();
  if (!json?.success) {
    throw new Error(json?.error || 'scanner failed');
  }

  return json;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const scan = await runScan();

    const topOpportunity = Array.isArray(scan.opportunities) ? scan.opportunities[0] : null;
    const estimatedNetProfit = topOpportunity ? Number(topOpportunity.netProfit || 0) : 0;

    return new Response(
      JSON.stringify({
        success: true,
        jobName: body.jobName ?? 'all',
        results: [{
          jobName: body.jobName ?? 'arbitrage-scanner',
          opportunitiesFound: scan.found || 0,
          tradesExecuted: 0,
          estimatedNetProfit,
          topOpportunity,
          status: 'success',
        }],
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
