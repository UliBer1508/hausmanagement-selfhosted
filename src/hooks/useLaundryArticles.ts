import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/*
 * Teunis Waescheartikel als Stammdaten.
 *
 * Angelegt am 04.09.2026. Die Artikel kommen ausschliesslich aus Teunis
 * Rechnungen: Was auf einer Rechnung steht und bei uns fehlt, wird beim
 * Einlesen im Dokumenten-Tab uebernommen (DocumentsTab -> artikelNachtragen).
 * Hier wird nur gelesen.
 *
 * Ein Artikel hat ueber die Zeit MEHRERE Preise (laundry_article_prices).
 * Aktuell gueltig ist der mit gueltig_bis = null; die uebrigen Zeilen sind
 * die Historie und werden hier nicht gebraucht.
 *
 * WICHTIG fuer alles, was damit rechnet: Ein Rechnungsartikel entspricht
 * nicht zwingend EINEM Set-Eintrag. "Mietwaesche Paket 5 Tlg" (MW3/MW4) ist
 * ein Buendel aus fuenf Positionen des Wäschesets; alle fuenf zeigen auf
 * denselben Artikel und denselben Preis. Wer je Set-Zeile den Artikelpreis
 * summiert, zaehlt das Paket fuenfmal.
 */

export interface LaundryArticle {
  id: string;
  artikelnummer: string;
  bezeichnung: string | null;
  einheit: string | null;
  farbe: string | null;
  status: 'neu' | 'bestaetigt' | 'ignorieren';
  /** Zuletzt gueltiger Preis, oder null wenn keiner hinterlegt ist. */
  preis: number | null;
  gueltig_ab: string | null;
}

export function useLaundryArticles(providerAlias = 'teuni') {
  return useQuery({
    queryKey: ['laundry-articles', providerAlias],
    queryFn: async (): Promise<LaundryArticle[]> => {
      const { data: provider, error: pErr } = await supabase
        .from('service_providers')
        .select('id')
        .eq('alias', providerAlias)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!provider) return [];

      const { data, error } = await supabase
        .from('laundry_articles')
        .select('id, artikelnummer, bezeichnung, einheit, farbe, status, laundry_article_prices(preis, gueltig_ab, gueltig_bis)')
        .eq('provider_id', (provider as any).id)
        .order('artikelnummer');
      if (error) throw error;

      return ((data ?? []) as any[]).map((a) => {
        const aktuell = (a.laundry_article_prices ?? [])
          .filter((p: any) => p.gueltig_bis === null)
          .sort((x: any, y: any) => String(y.gueltig_ab).localeCompare(String(x.gueltig_ab)))[0];
        return {
          id: a.id,
          artikelnummer: a.artikelnummer,
          bezeichnung: a.bezeichnung,
          einheit: a.einheit,
          farbe: a.farbe,
          status: a.status,
          preis: aktuell ? Number(aktuell.preis) : null,
          gueltig_ab: aktuell?.gueltig_ab ?? null,
        };
      });
    },
  });
}
