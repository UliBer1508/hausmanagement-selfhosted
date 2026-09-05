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
 *
 * ---------------------------------------------------------------------
 * ERGAENZUNG 05.09.2026 — zwei Spalten aus 53_waescheartikel_nachfolger.sql
 *
 * nachfolger_id: Teuni vergibt fuer dieselbe Leistung ueber die Zeit neue
 * Nummern (MWR -> MW3 -> MW4). Eine Set-Zeile zeigt aber auf GENAU EINE
 * Nummer. Ohne die Kette zeigt sie nach einem Wechsel auf eine Nummer, an
 * der kein Preis mehr nachwaechst — der Preisstand friert ein, ohne dass es
 * auffaellt. Ein Artikel MIT Nachfolger ist nicht mehr auswaehlbar.
 *
 * set_faehig: Nicht jeder Artikel gehoert auf eine Set-Zeile. KLGEW ist eine
 * Rechnungszeile, WT/WTB ist Lohnwaesche nach kg. Deren Preise werden weiter
 * gefuehrt und beim Rechnungslesen geprueft — sie sind nur nicht waehlbar.
 * Darum NICHT ueber status='ignorieren' geloest: das hiesse "beim
 * Rechnungslesen uebergehen" und waere fachlich falsch.
 *
 * Beides sind DATEN, keine Regel im Code. Aendert Teuni ihr Sortiment,
 * aendert sich eine Zeile in der Datenbank und keine Zeile hier.
 */

export interface LaundryArticle {
  id: string;
  artikelnummer: string;
  bezeichnung: string | null;
  einheit: string | null;
  farbe: string | null;
  status: 'neu' | 'bestaetigt' | 'ignorieren';
  /** Artikel, der diesen ersetzt hat. null = dieser ist der aktuelle. */
  nachfolger_id: string | null;
  /** Nummer des Nachfolgers, aus derselben Liste aufgeloest — fuer die Anzeige.
   *  null, wenn es keinen gibt oder er nicht in der Liste steht. */
  nachfolger_nummer: string | null;
  /** Darf auf einer Set-Zeile stehen. */
  set_faehig: boolean;
  /** Zuletzt gueltiger Preis, oder null wenn keiner hinterlegt ist. */
  preis: number | null;
  gueltig_ab: string | null;
}

/**
 * Darf dieser Artikel im Waescheset ausgewaehlt werden?
 *
 * Drei Bedingungen, alle aus den Daten:
 *   - set_faehig: gehoert ueberhaupt auf eine Set-Zeile
 *   - status: nicht als "ignorieren" abgelegt
 *   - kein Nachfolger: es gibt keine neuere Nummer fuer dieselbe Leistung
 *
 * Bewusst als Funktion und nicht als Filter in der Abfrage: die Oberflaeche
 * muss auch einen bereits gesetzten, inzwischen NICHT mehr waehlbaren Artikel
 * anzeigen koennen. Ein Feld, das ploetzlich leer aussieht, obwohl ein Wert
 * gespeichert ist, waere die schlimmere Variante.
 */
export function istWaehlbar(a: LaundryArticle): boolean {
  return a.set_faehig && a.status !== 'ignorieren' && a.nachfolger_id === null;
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

      const { data, error } = await (supabase as any)
        .from('laundry_articles')
        .select('id, artikelnummer, bezeichnung, einheit, farbe, status, nachfolger_id, set_faehig, laundry_article_prices(preis, gueltig_ab, gueltig_bis)')
        .eq('provider_id', (provider as any).id)
        .order('artikelnummer');
      if (error) throw error;

      const roh = (data ?? []) as any[];

      // Nummer des Nachfolgers aus derselben Liste aufloesen — kein zweiter
      // Zugriff noetig, es sind alle Artikel dieses Dienstleisters geladen.
      const nummerZuId = new Map<string, string>(
        roh.map((a) => [a.id as string, a.artikelnummer as string]),
      );

      return roh.map((a) => {
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
          nachfolger_id: a.nachfolger_id ?? null,
          nachfolger_nummer: a.nachfolger_id ? (nummerZuId.get(a.nachfolger_id) ?? null) : null,
          // Faellt die Spalte aus irgendeinem Grund weg, ist der Artikel
          // waehlbar — die Liste wird zu lang, aber nichts verschwindet.
          set_faehig: a.set_faehig ?? true,
          preis: aktuell ? Number(aktuell.preis) : null,
          gueltig_ab: aktuell?.gueltig_ab ?? null,
        };
      });
    },
  });
}
