const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PRICELABS_BASE_URL = 'https://api.pricelabs.co/v1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('PRICELABS_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'PRICELABS_API_KEY nicht konfiguriert. Bitte API-Key in den Secrets hinterlegen.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { action, listing_id, pms } = body;

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'action ist erforderlich' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const headers: Record<string, string> = {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    };

    let url: string;
    let method = 'GET';
    let fetchBody: string | undefined;

    switch (action) {
      case 'list-listings':
        url = `${PRICELABS_BASE_URL}/listings`;
        break;

      case 'get-listing':
        if (!listing_id) {
          return new Response(
            JSON.stringify({ error: 'listing_id ist erforderlich' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        url = `${PRICELABS_BASE_URL}/listings/${listing_id}`;
        if (pms) url += `?pms=${encodeURIComponent(pms)}`;
        break;

      case 'get-neighborhood':
        if (!listing_id) {
          return new Response(
            JSON.stringify({ error: 'listing_id ist erforderlich' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        url = `${PRICELABS_BASE_URL}/listings/${listing_id}/neighborhood`;
        if (pms) url += `?pms=${encodeURIComponent(pms)}`;
        break;

      case 'get-overrides':
        if (!listing_id) {
          return new Response(
            JSON.stringify({ error: 'listing_id ist erforderlich' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        url = `${PRICELABS_BASE_URL}/listings/${listing_id}/overrides`;
        if (pms) url += `?pms=${encodeURIComponent(pms)}`;
        break;

      case 'get-prices':
        method = 'POST';
        url = `${PRICELABS_BASE_URL}/prices`;
        fetchBody = JSON.stringify(body.payload || {});
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Unbekannte Aktion: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    console.log(`[pricelabs-sync] ${method} ${url}`);

    const response = await fetch(url, {
      method,
      headers,
      body: method === 'POST' ? fetchBody : undefined,
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error(`[pricelabs-sync] PriceLabs API error:`, response.status, responseData);
      return new Response(
        JSON.stringify({ 
          error: 'PriceLabs API Fehler', 
          status: response.status, 
          details: responseData 
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(responseData),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[pricelabs-sync] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
