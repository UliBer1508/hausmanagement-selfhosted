import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { geminiStructuredOutput, GeminiRateLimitError } from "../_shared/gemini.ts";

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
    const { messageType, selectedSegment, segmentAnalysis, sampleGuests } = await req.json();

    if (!geminiApiKey) {
      throw new Error('Google Gemini API key not configured');
    }

    // Create personalized prompt based on segment and guest data
    const prompt = createPersonalizationPrompt(messageType, selectedSegment, segmentAnalysis, sampleGuests);

    console.log('Generating personalized email with Gemini API (structured output)');

    const guestName = sampleGuests?.[0]?.guest_name || '';
    const houseName = sampleGuests?.[0]?.last_house || '';

    const systemPrompt = `Du bist ein Experte für personalisierte Gästekommunikation für Steinbock Chalets, ein Premium-Chalet-Unternehmen in den Alpen.

Schreibe warme, einladende, persönliche E-Mails in deutscher Sprache mit konkretem Mehrwert und klarem Call-to-Action.

WICHTIG:
- Verwende konkrete Werte direkt im Text – KEINE Platzhalter in geschweiften Klammern wie {GUEST_NAME} oder {HOUSE_NAME}.
- Gast-Anrede verwenden: "${guestName}"${houseName ? `\n- Letztes gebuchtes Haus: "${houseName}"` : ''}
- Der Inhalt ist reiner Klartext (keine Markdown-Codeblöcke, kein HTML). Verwende \\n\\n für Absätze.`;

    let parsedContent: { subject: string; content: string };
    try {
      parsedContent = await geminiStructuredOutput<{ subject: string; content: string }>(
        geminiApiKey,
        systemPrompt,
        prompt,
        {
          name: 'create_personalized_email',
          description: 'Erstellt einen Betreff und einen Klartext-Inhalt für eine personalisierte Gäste-E-Mail.',
          parameters: {
            type: 'object',
            properties: {
              subject: {
                type: 'string',
                description: 'Betreff der E-Mail in deutscher Sprache, max. 80 Zeichen, ohne Platzhalter.',
              },
              content: {
                type: 'string',
                description: 'Vollständiger E-Mail-Text als Klartext in deutscher Sprache. Absätze mit \\n\\n trennen. Keine Platzhalter wie {GUEST_NAME}.',
              },
            },
            required: ['subject', 'content'],
          },
        }
      );
    } catch (e) {
      console.error('Structured output failed:', e);
      throw e;
    }

    // Defensive: replace any leftover placeholders just in case
    const replacePlaceholders = (s: string) =>
      s
        .replace(/\{GUEST_NAME\}/g, guestName)
        .replace(/\{HOUSE_NAME\}/g, houseName)
        .replace(/\{CHECK_IN\}/g, '')
        .replace(/\{CHECK_OUT\}/g, '')
        .trim();

    parsedContent.subject = replacePlaceholders(parsedContent.subject || '');
    parsedContent.content = replacePlaceholders(parsedContent.content || '');

    console.log('Generated content OK. Subject:', parsedContent.subject);

    return new Response(JSON.stringify(parsedContent), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

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

function createPersonalizationPrompt(messageType: string, selectedSegment: string, segmentAnalysis: any, sampleGuests: any[]) {
  const segmentDescription = getSegmentDescription(selectedSegment);
  const messageTypeDescription = getMessageTypeDescription(messageType);
  
  return `
Erstelle eine personalisierte E-Mail für Steinbock Chalets:

ZIELGRUPPE: ${segmentDescription}
- Anzahl Gäste: ${segmentAnalysis.totalGuests}
- Durchschnittlicher Umsatz: €${Math.round(segmentAnalysis.averageRevenue || 0)}
- Durchschnittliche Aufenthaltsdauer: ${Math.round(segmentAnalysis.averageStayDuration || 0)} Tage
- Beliebte Jahreszeiten: ${segmentAnalysis.commonSeasons?.join(', ') || 'Alle'}

NACHRICHTENTYP: ${messageTypeDescription}

BEISPIEL-GÄSTE (für Kontext):
${sampleGuests.map(guest => `
- ${guest.guest_name}: ${guest.bookings.length} Buchung(en), €${guest.total_revenue} Gesamtumsatz, Bevorzugte Saison: ${Array.from(guest.preferred_seasons).join('/')}, Loyalitätslevel: ${guest.loyalty_level}
`).join('')}

ANFORDERUNGEN:
- Verwende spezifische Details über das Segment
- Schaffe emotionale Verbindung zu den Alpen und dem Chalet-Erlebnis
- Biete segmentspezifische Mehrwerte
- Verwende warme, einladende Sprache
- Füge konkrete Call-to-Actions hinzu
- Integriere saisonale Bezüge wenn relevant
- Beziehe sich auf Buchungshistorie und Loyalität

Erstelle Betreff und Inhalt, die speziell für diese Zielgruppe optimiert sind.
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
