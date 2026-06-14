import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { geminiStructuredOutput, GeminiRateLimitError } from "../_shared/gemini.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const geminiApiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messageType, selectedSegment, segmentAnalysis, sampleGuests, offer = {}, contact: contactOverride, intent, tone, length, variantCount } = await req.json();
    const requestedVariants = Math.min(3, Math.max(1, Number(variantCount) || 3));

    if (!geminiApiKey) {
      throw new Error('Google Gemini API key not configured');
    }

    // Load contact info from system_settings (never let the AI invent it)
    let contact = contactOverride && typeof contactOverride === 'object' ? contactOverride : null;
    if (!contact) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supa = createClient(supabaseUrl, serviceKey);
        const { data: cs } = await supa
          .from('system_settings')
          .select('value')
          .eq('key', 'contact_settings')
          .maybeSingle();
        contact = (cs?.value as any) || null;
        if (!contact) {
          const { data: ps } = await supa
            .from('system_settings')
            .select('value')
            .eq('key', 'profile_settings')
            .maybeSingle();
          const { data: es } = await supa
            .from('system_settings')
            .select('value')
            .eq('key', 'email_settings')
            .maybeSingle();
          contact = {
            signature_name: (ps?.value as any)?.user_name || '',
            signature_role: (ps?.value as any)?.company_name || (es?.value as any)?.display_name || '',
            contact_email: (es?.value as any)?.email || '',
            contact_phone: '',
          };
        }
      } catch (e) {
        console.error('Failed to load contact settings:', e);
        contact = { contact_email: '', contact_phone: '', signature_name: '', signature_role: '' };
      }
    }

    // Create personalized prompt based on segment and guest data
    const prompt = createPersonalizationPrompt(messageType, selectedSegment, segmentAnalysis, sampleGuests, offer, intent, tone, length, requestedVariants);

    console.log('Generating personalized email with Gemini API (structured output)');

    const guestName = sampleGuests?.[0]?.guest_name || '';
    const houseName = sampleGuests?.[0]?.last_house || '';

    const systemPrompt = `Du bist ein Experte für personalisierte Gästekommunikation für Steinbock Chalets, ein Premium-Chalet-Unternehmen in den Alpen.

Schreibe warme, einladende, persönliche E-Mails in deutscher Sprache mit konkretem Mehrwert und klarem Call-to-Action.

STRENGE REGELN (NICHT VERLETZEN):
- ❌ KEINE erfundenen Rabatte, Prozente, Gutscheine, Geschenke, Preise oder Sonderangebote.
- ❌ KEINE erfundenen Telefonnummern, E-Mail-Adressen oder Webseiten.
- ✅ Verwende AUSSCHLIESSLICH die unten im Block "ANGEBOTSDETAILS" genannten Werte.
- ✅ Wenn dort kein Rabatt/Gutschein steht: erwähne KEINEN. Schreibe stattdessen eine freundliche, persönliche Wiedersehens-Nachricht ohne konkretes Angebot.
- ⚠️ Die optionale "ABSICHT DES VERMIETERS" steuert NUR Ton, Inhalt und Stoßrichtung. Sie ist KEINE Quelle für harte Fakten. Konkrete Rabatte, Prozente, Preise, Gutscheine oder Termine dürfen AUSSCHLIESSLICH aus "ANGEBOTSDETAILS" stammen – auch wenn die Absicht z. B. "biete 20% Rabatt" formuliert. Stehen solche Fakten nicht in ANGEBOTSDETAILS, werden sie weggelassen.
- ✅ Beende den Text OHNE Signatur, OHNE Telefonnummer, OHNE E-Mail. Die Signatur wird automatisch angehängt.
- Verwende konkrete Werte direkt im Text – KEINE Platzhalter in geschweiften Klammern wie {GUEST_NAME} oder {HOUSE_NAME}.
- Gast-Anrede verwenden: "${guestName}"${houseName ? `\n- Letztes gebuchtes Haus: "${houseName}"` : ''}
- Der Inhalt ist reiner Klartext (keine Markdown-Codeblöcke, kein HTML). Verwende \\n\\n für Absätze.`;

    let parsed: { variants?: Array<{ label: string; subject: string; content: string }>; subject?: string; content?: string };
    try {
      parsed = await geminiStructuredOutput<any>(
        geminiApiKey,
        systemPrompt,
        prompt,
        {
          name: 'create_personalized_email_variants',
          description: `Erstellt ${requestedVariants} unterschiedliche Varianten (Betreff + Klartext-Inhalt) einer personalisierten Gäste-E-Mail.`,
          parameters: {
            type: 'object',
            properties: {
              variants: {
                type: 'array',
                minItems: 1,
                maxItems: 3,
                description: `Liefere genau ${requestedVariants} Varianten, die sich in Tonalität/Stil/Aufbau deutlich unterscheiden.`,
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string', description: 'Kurzcharakter, z. B. "Herzlich & persönlich", "Sachlich & knapp", "Exklusiv & elegant".' },
                    subject: { type: 'string', description: 'Betreff, max. 80 Zeichen, ohne Platzhalter.' },
                    content: { type: 'string', description: 'Vollständiger E-Mail-Text als Klartext. Absätze mit \\n\\n. Keine Platzhalter, keine Signatur.' },
                  },
                  required: ['label', 'subject', 'content'],
                },
              },
            },
            required: ['variants'],
          },
        }
      );
    } catch (e) {
      console.error('Structured output failed:', e);
      throw e;
    }

    // Normalize: accept legacy single-shape responses too
    let variants: Array<{ label: string; subject: string; content: string }> = [];
    if (Array.isArray(parsed?.variants) && parsed.variants.length > 0) {
      variants = parsed.variants;
    } else if (parsed?.subject && parsed?.content) {
      variants = [{ label: 'Variante 1', subject: parsed.subject, content: parsed.content }];
    }

    if (variants.length === 0) {
      throw new Error('Keine Varianten von der KI erhalten.');
    }

    // Defensive: replace any leftover placeholders just in case
    const replacePlaceholders = (s: string) =>
      s
        .replace(/\{GUEST_NAME\}/g, guestName)
        .replace(/\{HOUSE_NAME\}/g, houseName)
        .replace(/\{CHECK_IN\}/g, '')
        .replace(/\{CHECK_OUT\}/g, '')
        .trim();

    const signature = buildSignature(contact);

    variants = variants.map((v, i) => {
      const subject = replacePlaceholders(v.subject || '');
      let content = replacePlaceholders(v.content || '');
      content = stripTrailingSignature(content);
      if (signature) {
        content = `${content.trim()}\n\n${signature}`;
      }
      return {
        label: v.label?.trim() || `Variante ${i + 1}`,
        subject,
        content,
      };
    });

    console.log(`Generated ${variants.length} variant(s). First subject:`, variants[0].subject);

    return new Response(
      JSON.stringify({
        variants,
        // Backward compatibility
        subject: variants[0].subject,
        content: variants[0].content,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-personalized-email function:', error);
    
    // Handle rate limits
    if (error instanceof GeminiRateLimitError) {
      return new Response(JSON.stringify({ 
        error: 'Rate Limit erreicht. Bitte versuchen Sie es in ein paar Minuten erneut.',
        subject: 'Nachricht von Steinbock Chalets',
        content: 'Es gab einen Fehler beim Generieren der personalisierten Nachricht. Bitte versuchen Sie es erneut.'
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      subject: 'Nachricht von Steinbock Chalets',
      content: 'Es gab einen Fehler beim Generieren der personalisierten Nachricht. Bitte versuchen Sie es erneut.'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function buildSignature(contact: any): string {
  if (!contact) return '';
  const lines: string[] = ['Mit herzlichen Grüßen aus den Alpen'];
  if (contact.signature_name) lines.push(contact.signature_name);
  if (contact.signature_role) lines.push(contact.signature_role);
  const contactLine: string[] = [];
  if (contact.contact_phone) contactLine.push(`Tel: ${contact.contact_phone}`);
  if (contact.contact_email) contactLine.push(`E-Mail: ${contact.contact_email}`);
  if (contactLine.length) lines.push(contactLine.join(' · '));
  return lines.join('\n');
}

function stripTrailingSignature(text: string): string {
  if (!text) return text;
  // Remove common closing blocks the LLM might append so we don't get double signatures
  return text
    .replace(/\n+\s*(Mit (herzlichen|besten|freundlichen) Grüßen|Herzliche Grüße|Liebe Grüße|Beste Grüße|Ihr Team|Ihr|Ihre)[\s\S]*$/i, '')
    .replace(/\n+\s*(Tel\.?:|Telefon:|E-?Mail:|Phone:)[\s\S]*$/i, '')
    .trim();
}

function createPersonalizationPrompt(messageType: string, selectedSegment: string, segmentAnalysis: any, sampleGuests: any[], offer: any = {}, intent?: string, tone?: string, length?: string, variantCount: number = 3) {
  const segmentDescription = getSegmentDescription(selectedSegment);
  const messageTypeDescription = getMessageTypeDescription(messageType);

  const hasDiscount = offer?.discount_percent !== null && offer?.discount_percent !== undefined && offer?.discount_percent !== '' && Number(offer.discount_percent) > 0;
  const hasVoucher = offer?.voucher && String(offer.voucher).trim().length > 0;
  const hasValidity = offer?.validity && String(offer.validity).trim().length > 0;
  const hasNote = offer?.extra_note && String(offer.extra_note).trim().length > 0;
  const hasAnyOffer = hasDiscount || hasVoucher;

  const offerBlock = hasAnyOffer || hasValidity || hasNote
    ? `\n\nANGEBOTSDETAILS (verbindlich – nutze NUR diese Werte):
${hasDiscount ? `- Rabatt: ${offer.discount_percent}% (genau diesen Wert nennen, keinen anderen)\n` : ''}${hasVoucher ? `- Gutschein/Extra: ${String(offer.voucher).trim()}\n` : ''}${hasValidity ? `- Gültigkeit: ${String(offer.validity).trim()}\n` : ''}${hasNote ? `- Zusätzlicher Hinweis: ${String(offer.extra_note).trim()}\n` : ''}`
    : `\n\nANGEBOTSDETAILS: KEIN Rabatt, KEIN Gutschein, KEIN Geschenk vorgegeben.
→ Schreibe eine warme, persönliche Wiedersehens-Nachricht OHNE jedes konkrete Angebot, OHNE Rabatte, OHNE Prozente, OHNE Geschenke. Lade den Gast freundlich zur Rückkehr ein und biete an, bei Fragen persönlich zur Verfügung zu stehen.`;

  const trimmedIntent = (intent || '').trim();
  const effectiveTone = tone || 'herzlich';
  const effectiveLength = length || 'mittel';
  const lengthHint =
    effectiveLength === 'kurz' ? 'kurz ≈ 60–90 Wörter' :
    effectiveLength === 'ausführlich' ? 'ausführlich ≈ 200+ Wörter' :
    'mittel ≈ 120–160 Wörter';

  const intentBlock = trimmedIntent
    ? `\n\nABSICHT DES VERMIETERS (höchste Priorität, leitet Ton und Inhalt – aber NICHT für harte Fakten wie Preise/Rabatte/Termine):
"${trimmedIntent}"

STILVORGABEN:
- Tonalität: ${effectiveTone}
- Länge: ${effectiveLength} (${lengthHint})`
    : `\n\nSTILVORGABEN:
- Tonalität: ${effectiveTone}
- Länge: ${effectiveLength} (${lengthHint})`;

  return `
Erstelle eine personalisierte E-Mail für Steinbock Chalets:

ZIELGRUPPE: ${segmentDescription}
- Anzahl Gäste: ${segmentAnalysis.totalGuests}
- Durchschnittlicher Umsatz: €${Math.round(segmentAnalysis.averageRevenue || 0)}
- Durchschnittliche Aufenthaltsdauer: ${Math.round(segmentAnalysis.averageStayDuration || 0)} Tage
- Beliebte Jahreszeiten: ${segmentAnalysis.commonSeasons?.join(', ') || 'Alle'}

NACHRICHTENTYP: ${messageTypeDescription}

BEISPIEL-GÄSTE (für Kontext):
${(Array.isArray(sampleGuests) ? sampleGuests : []).map(guest => {
  const bookingsCount = Array.isArray(guest?.bookings) ? guest.bookings.length : (guest?.booking_count ?? 0);
  const seasons = guest?.preferred_seasons
    ? Array.from(guest.preferred_seasons as Iterable<string>).join('/')
    : '—';
  return `
- ${guest?.guest_name ?? 'Gast'}: ${bookingsCount} Buchung(en), €${guest?.total_revenue ?? 0} Gesamtumsatz, Bevorzugte Saison: ${seasons}, Loyalitätslevel: ${guest?.loyalty_level ?? '—'}
`;
}).join('')}
${offerBlock}${intentBlock}

ANFORDERUNGEN:
- Persönliche, warme, einladende Sprache
- Bezug auf vorherigen Aufenthalt und Loyalität
- Saisonale Bezüge wenn passend
- Klarer Call-to-Action (Antwort, Anfrage – KEINE erfundenen Links/Buchungscodes)
- Erfinde NICHTS, was nicht oben in ANGEBOTSDETAILS steht
- KEINE Signatur am Ende (wird automatisch angehängt)

VARIANTEN:
- Erstelle GENAU ${variantCount} Varianten der E-Mail.
- Jede Variante muss sich in Tonalität, Aufbau und Stil DEUTLICH von den anderen unterscheiden (z. B. "Herzlich & persönlich", "Sachlich & knapp", "Exklusiv & elegant" oder ähnliche klare Charaktere).
- Alle Varianten müssen DIESELBEN harten Fakten (insb. aus ANGEBOTSDETAILS) respektieren.
- Gib jeder Variante ein kurzes, prägnantes Label, das ihren Charakter beschreibt.
`;
}

function getSegmentDescription(segment: string): string {
  switch (segment) {
    case 'vip':
      return 'VIP-Gäste (Premium-Segment mit hohem Umsatz >€2000)';
    case 'returning':
      return 'Stammgäste (Wiederkehrende Gäste mit mehreren Buchungen)';
    case 'new':
      return 'Neukunden (Erstbucher, noch keine Erfahrung mit uns)';
    default:
      return 'Alle Gäste (Gemischte Zielgruppe)';
  }
}

function getMessageTypeDescription(type: string): string {
  switch (type) {
    case 'welcome':
      return 'Willkommensnachricht - Erste Kontaktaufnahme nach Buchung';
    case 'thankyou':
      return 'Dankesnachricht - Nach dem Aufenthalt';
    case 'return_offer':
      return 'Rückkehr-Angebot - Spezielle Angebote für Wiederbuchung';
    case 'seasonal':
      return 'Saisonales Angebot - Zeitlich begrenzte Aktionen';
    case 'loyalty_reward':
      return 'Treuebonus - Belohnung für Stammgäste';
    case 'feedback_request':
      return 'Feedback-Anfrage - Bewertung und Verbesserungsvorschläge';
    default:
      return 'Allgemeine Kommunikation';
  }
}
