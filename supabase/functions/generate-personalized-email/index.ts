import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

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

    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Create personalized prompt based on segment and guest data
    const prompt = createPersonalizationPrompt(messageType, selectedSegment, segmentAnalysis, sampleGuests);

    console.log('Generating personalized email with prompt:', prompt);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Du bist ein Experte für personalisierte Gästekommunikation für Steinbock Chalets, ein Premium-Chalet-Unternehmen in den Alpen. 
            
            Erstelle hochwertige, personalisierte E-Mail-Inhalte, die:
            - Warm und einladend sind
            - Spezifisch auf das Gästesegment zugeschnitten sind
            - Emotionale Verbindungen schaffen
            - Konkrete Mehrwerte bieten
            - Professional aber persönlich klingen
            - Deutsche Sprache verwenden
            
            Verwende Platzhalter wie {GUEST_NAME}, {HOUSE_NAME}, {CHECK_IN}, {CHECK_OUT} für personalisierte Felder.
            
            Antworte IMMER im JSON-Format: {"subject": "Betreff hier", "content": "E-Mail-Inhalt hier"}`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8,
        max_tokens: 1000
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const generatedText = data.choices[0].message.content;

    console.log('Generated content:', generatedText);

    // Parse the JSON response
    let parsedContent;
    try {
      parsedContent = JSON.parse(generatedText);
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