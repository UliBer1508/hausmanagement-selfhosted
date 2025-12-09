import { createClient } from '@supabase/supabase-js';

// External Supabase (Wäsche Oberpinzgau)
const EXTERNAL_SUPABASE_URL = 'https://pkpnowevagxmhyqlawng.supabase.co';
const EXTERNAL_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrcG5vd2V2YWd4bWh5cWxhd25nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk0NzIxMDQsImV4cCI6MjA2NTA0ODEwNH0.kSYns-BvK-bm5IO3dN5r6z3GyBPjNKTSmP1FE3VnMaQ';

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
