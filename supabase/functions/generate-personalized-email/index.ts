import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { geminiTextCompletion, GeminiRateLimitError } from "../_shared/gemini.ts";

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

    console.log('Generating personalized email with Gemini API');

    const systemPrompt = `Du bist ein Experte für personalisierte Gästekommunikation für Steinbock Chalets, ein Premium-Chalet-Unternehmen in den Alpen. 
            
Erstelle hochwertige, personalisierte E-Mail-Inhalte, die:
- Warm und einladend sind
- Spezifisch auf das Gästesegment zugeschnitten sind
- Emotionale Verbindungen schaffen
- Konkrete Mehrwerte bieten
- Professional aber persönlich klingen
- Deutsche Sprache verwenden

Verwende Platzhalter wie {GUEST_NAME}, {HOUSE_NAME}, {CHECK_IN}, {CHECK_OUT} für personalisierte Felder.

Antworte IMMER im JSON-Format: {"subject": "Betreff hier", "content": "E-Mail-Inhalt hier"}`;

    const generatedText = await geminiTextCompletion(
      geminiApiKey,
      systemPrompt,
      prompt,
      { maxTokens: 1000 }
    );

    console.log('Generated content:', generatedText);

    // Parse the JSON response
    let parsedContent;
    try {
      // Try to extract JSON from the response (might be wrapped in markdown code blocks)
      const jsonMatch = generatedText.match(/\{[\s\S]*"subject"[\s\S]*"content"[\s\S]*\}/);
      if (jsonMatch) {
        parsedContent = JSON.parse(jsonMatch[0]);
      } else {
        parsedContent = JSON.parse(generatedText);
      }
    } catch (e) {
      console.error('Failed to parse JSON:', generatedText);
      // Fallback parsing
      const lines = generatedText.split('\n');
      const subject = lines.find((l: string) => l.includes('Betreff') || l.includes('Subject'))?.split(':')[1]?.trim() || 'Persönliche Nachricht von Steinbock Chalets';
      const content = generatedText.replace(/.*?(Betreff|Subject):.*?\n/, '').trim();
      parsedContent = { subject, content };
    }

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
