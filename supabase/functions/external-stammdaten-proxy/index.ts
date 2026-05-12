import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const BASE = 'https://pkpnowevagxmhyqlawng.supabase.co/functions/v1'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const BEARER = Deno.env.get('EXTERNAL_LAUNDRY_BEARER_TOKEN')
  if (!BEARER) {
    return new Response(
      JSON.stringify({ error: 'EXTERNAL_LAUNDRY_BEARER_TOKEN ist nicht konfiguriert' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  try {
    let resource: string | null = null
    let params: Record<string, string> = {}

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      resource = body.resource ?? null
      params = body.params ?? {}
    } else {
      const url = new URL(req.url)
      resource = url.searchParams.get('resource')
      url.searchParams.forEach((v, k) => {
        if (k !== 'resource') params[k] = v
      })
    }

    if (resource !== 'articles' && resource !== 'sets') {
      return new Response(
        JSON.stringify({ error: "Parameter 'resource' muss 'articles' oder 'sets' sein" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const path = resource === 'articles' ? 'external-articles' : 'external-vorlagen-sets'
    const qs = new URLSearchParams(params).toString()
    const target = `${BASE}/${path}${qs ? `?${qs}` : ''}`

    const upstream = await fetch(target, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${BEARER}`,
        Accept: 'application/json',
      },
    })

    const text = await upstream.text()
    const contentType = upstream.headers.get('content-type') ?? 'application/json'

    return new Response(text, {
      status: upstream.status,
      headers: { ...corsHeaders, 'Content-Type': contentType },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
