import { createClient } from '@supabase/supabase-js';

// External Supabase (Wäsche Oberpinzgau)
// NOTE: Direct DB access is being phased out. Status & Rechnungen laufen jetzt
// über REST-Edge-Functions (get-external-order-status, sync-laundry-invoices via Portal-Token).
// Verbleibender Use-Case: Artikel-Katalog im ExternalArticleMappingDialog
// (bis ein REST-Endpoint dafür existiert).
const EXTERNAL_SUPABASE_URL = 'https://pkpnowevagxmhyqlawng.supabase.co';
const EXTERNAL_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrcG5vd2V2YWd4bWh5cWxhd25nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwMzE5OTUsImV4cCI6MjA4MDYwNzk5NX0.yHgZOQg24yzUGTNaQnOOJK4QwWEeSfr7MgQUpq88UTY';

export const externalLaundryClient = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_ANON_KEY);

// Type for external article
export interface ExternalWaescheArtikel {
  id: string;
  artikelnummer: string;
  name: string | null;
  kategorie: string | null;
  groesse: string | null;
  farbe: string | null;
  preis: number | null;
  aktiv: boolean;
}
