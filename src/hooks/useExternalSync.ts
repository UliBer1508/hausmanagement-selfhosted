import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { externalLaundryClient } from '@/integrations/externalLaundry/client';
import { toast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';

interface SyncResult {
  success: boolean;
  bestellnummer?: string;
  error?: string;
}

export const useExternalSync = () => {
  const [isSyncing, setIsSyncing] = useState(false);

  // Lade Sync-Einstellungen
  const { data: syncSettings } = useQuery({
    queryKey: ['linen-automation-settings-sync'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_automation_settings')
        .select('external_sync_enabled, external_kundennummer')
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  const syncOrder = async (linenOrderId: string): Promise<SyncResult> => {
    setIsSyncing(true);
    
    try {
      // 1. Prüfen ob Sync aktiviert
      if (!syncSettings?.external_sync_enabled) {
        throw new Error('Externe Synchronisation ist nicht aktiviert');
      }

      // 2. Bestellung mit Haus und Buchung laden
      const { data: order, error: orderError } = await supabase
        .from('linen_orders')
        .select(`
          *,
          houses:house_id (
            id,
            name,
            external_objektnummer
          ),
          bookings:booking_id (
            id,
            guest_name,
            check_in,
            check_out,
            number_of_guests
          )
        `)
        .eq('id', linenOrderId)
        .single();

      if (orderError || !order) {
        throw new Error('Bestellung nicht gefunden');
      }

      // Nur Bestellungen mit Status 'pending' können synchronisiert werden
      if (order.status !== 'pending') {
        throw new Error('Nur Bestellungen mit Status "Ausstehend" können synchronisiert werden. Bitte erst bestätigen.');
      }

      // 3. Prüfen ob bereits synchronisiert
      if (order.external_bestellnummer) {
        throw new Error('Bestellung wurde bereits synchronisiert');
      }

      // 4. Prüfen ob Haus externe Objektnummer hat
      const externalObjektnummer = order.houses?.external_objektnummer;
      if (!externalObjektnummer) {
        throw new Error('Keine externe Objektnummer für dieses Haus konfiguriert');
      }

      // 5. Artikel-Mapping laden
      const { data: mappings, error: mappingError } = await supabase
        .from('external_article_mapping')
        .select('internal_item_key, external_artikelnummer')
        .eq('is_active', true);

      if (mappingError) {
        throw new Error('Fehler beim Laden des Artikel-Mappings');
      }

      const mappingDict: Record<string, string> = {};
      mappings?.forEach(m => {
        mappingDict[m.internal_item_key] = m.external_artikelnummer;
      });

      // 6. Kunden-ID aus externer DB holen
      const kundennummer = syncSettings.external_kundennummer;
      const { data: kundeData, error: kundeError } = await externalLaundryClient
        .from('kunden')
        .select('id')
        .eq('kundennummer', kundennummer)
        .single();

      if (kundeError || !kundeData) {
        throw new Error(`Kunde mit Nummer ${kundennummer} nicht in externer DB gefunden`);
      }

      // 7. Objekt-ID aus externer DB holen
      const { data: objektData, error: objektError } = await externalLaundryClient
        .from('objekte')
        .select('id')
        .eq('objektnummer', externalObjektnummer)
        .eq('kunde_id', kundeData.id)
        .single();

      if (objektError || !objektData) {
        throw new Error(`Objekt mit Nummer ${externalObjektnummer} nicht gefunden`);
      }

      // 8. Bestellpositionen vorbereiten
      const orderItems = order.items as Record<string, number> || {};
      const itemVariants = order.item_variants as Record<string, string> | null;
      const positionen: Array<{
        artikel_id: string;
        menge: number;
      }> = [];

      for (const [itemKey, quantity] of Object.entries(orderItems)) {
        if (quantity <= 0) continue;
        
        // Farbe aus item_variants holen für farb-basiertes Mapping
        const color = itemVariants?.[itemKey];
        
        // Mapping-Key mit Farbe konstruieren (z.B. "bedding__grey_striped") - DOPPELTER Unterstrich!
        const mappingKeyWithColor = color ? `${itemKey}__${color}` : null;
        
        console.log(`Mapping: itemKey=${itemKey}, color=${color}, mappingKeyWithColor=${mappingKeyWithColor}`);
        
        // Erst mit Farbe suchen, dann Fallback ohne Farbe
        const externalArtikelnummer = 
          (mappingKeyWithColor && mappingDict[mappingKeyWithColor]) || 
          mappingDict[itemKey];
        
        if (!externalArtikelnummer) {
          console.warn(`Kein Mapping für Artikel: ${mappingKeyWithColor || itemKey}. Verfügbare Keys:`, Object.keys(mappingDict));
          continue;
        }

        // Artikel-ID aus externer DB holen
        const { data: artikelData, error: artikelError } = await externalLaundryClient
          .from('waescheartikel')
          .select('id')
          .eq('artikelnummer', externalArtikelnummer)
          .single();

        if (artikelError) {
          console.warn(`Artikel ${externalArtikelnummer} nicht in externer DB gefunden:`, artikelError);
          continue;
        }

        if (artikelData) {
          positionen.push({
            artikel_id: artikelData.id,
            menge: quantity,
          });
        }
      }

      console.log('Gemappte Positionen:', positionen);

      if (positionen.length === 0) {
        throw new Error('Keine Artikel konnten gemappt werden. Prüfen Sie das Artikel-Mapping.');
      }

      // 9. Bestellung in externer DB erstellen (OHNE bestellnummer - Portal generiert sie)
      const { data: neueBestellung, error: bestellError } = await externalLaundryClient
        .from('waeschebestellungen')
        .insert({
          kunde_id: kundeData.id,
          objekt_id: objektData.id,
          lieferdatum: order.delivery_date,
          status: 'neu',
          notizen: order.notes || undefined,
          // Buchungsdaten
          gastname: order.bookings?.guest_name || 'Unbekannt',
          check_in: order.bookings?.check_in || null,
          check_out: order.bookings?.check_out || null,
          anzahl_personen: order.bookings?.number_of_guests || null,
        })
        .select('id, bestellnummer')
        .single();

      if (bestellError || !neueBestellung) {
        console.error('Externe Bestellung Fehler:', bestellError);
        throw new Error(`Fehler beim Erstellen der externen Bestellung: ${bestellError?.message || 'Keine Daten zurückgegeben'}`);
      }

      // 10. Bestellpositionen in externer DB erstellen
      const positionenMitBestellung = positionen.map(p => ({
        ...p,
        bestellung_id: neueBestellung.id,
      }));

      const { error: positionenError } = await externalLaundryClient
        .from('bestellpositionen')
        .insert(positionenMitBestellung);

      if (positionenError) {
        console.error('Bestellpositionen Fehler:', positionenError);
        // Rollback: Bestellung löschen
        await externalLaundryClient
          .from('waeschebestellungen')
          .delete()
          .eq('id', neueBestellung.id);
        throw new Error(`Fehler beim Erstellen der Bestellpositionen: ${positionenError.message}`);
      }

      // 11. Interne Bestellung aktualisieren
      const { error: updateError } = await supabase
        .from('linen_orders')
        .update({
          external_bestellnummer: neueBestellung.bestellnummer,
          external_synced_at: new Date().toISOString(),
        })
        .eq('id', linenOrderId);

      if (updateError) {
        console.error('Fehler beim Aktualisieren der internen Bestellung:', updateError);
      }

      toast({
        title: "✅ Synchronisation erfolgreich",
        description: `Bestellung ${neueBestellung.bestellnummer} wurde ans externe Portal übertragen.`,
      });

      return { 
        success: true, 
        bestellnummer: neueBestellung.bestellnummer 
      };

    } catch (error: any) {
      console.error('Sync error:', error);
      toast({
        variant: "destructive",
        title: "Synchronisation fehlgeschlagen",
        description: error.message || 'Unbekannter Fehler',
      });
      return { 
        success: false, 
        error: error.message 
      };
    } finally {
      setIsSyncing(false);
    }
  };

  const resetSync = async (linenOrderId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('linen_orders')
        .update({
          external_bestellnummer: null,
          external_synced_at: null,
        })
        .eq('id', linenOrderId);

      if (error) {
        toast({
          variant: "destructive",
          title: "Fehler beim Zurücksetzen",
          description: error.message,
        });
        return false;
      }

      toast({
        title: "✅ Sync zurückgesetzt",
        description: "Die Bestellung kann erneut synchronisiert werden.",
      });
      return true;
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error.message,
      });
      return false;
    }
  };

  return {
    syncOrder,
    resetSync,
    isSyncing,
    isEnabled: syncSettings?.external_sync_enabled ?? false,
  };
};
