import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ExternalArticle {
  artikelnummer: string;
  name: string;
  bezeichnung?: string | null;
  kategorie?: string | null;
  farbe?: string | null;
  groesse?: string | null;
  preis?: number | null;
  bild_url?: string | null;
  aktiv?: boolean;
}

export interface ExternalTeuniSetPosition {
  artikelnummer: string;
  name: string;
  menge: number;
  berechnungsart: 'pro_gast' | 'pro_person' | 'pro_buchung' | string;
}

export interface ExternalTeuniSet {
  id: string;
  name: string;
  beschreibung?: string | null;
  kategorie?: string | null;
  bild_url?: string | null;
  positionen: ExternalTeuniSetPosition[];
}

const invokeProxy = async <T,>(resource: 'articles' | 'sets', params: Record<string, string | undefined> = {}): Promise<T> => {
  const cleaned: Record<string, string> = {};
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') cleaned[k] = String(v);
  });
  const { data, error } = await supabase.functions.invoke('external-stammdaten-proxy', {
    body: { resource, params: cleaned },
  });
  if (error) throw error;
  return data as T;
};

export const useExternalArticles = (
  filters: { aktiv?: boolean; kategorie?: string; search?: string } = {},
  enabled = true,
) => {
  return useQuery({
    queryKey: ['external-stammdaten', 'articles', filters],
    queryFn: async () => {
      const data = await invokeProxy<any>('articles', {
        aktiv: filters.aktiv === false ? 'false' : 'true',
        kategorie: filters.kategorie,
        search: filters.search,
      });
      if (Array.isArray(data)) return data as ExternalArticle[];
      return (data?.data ?? data?.artikel ?? []) as ExternalArticle[];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};

export const useExternalTeuniSets = (enabled = true) => {
  return useQuery({
    queryKey: ['external-stammdaten', 'sets'],
    queryFn: async () => {
      const data = await invokeProxy<any>('sets', {
        aktiv: 'true',
      });
      if (Array.isArray(data)) return data as ExternalTeuniSet[];
      return (data?.data ?? data?.sets ?? data?.vorlagen ?? []) as ExternalTeuniSet[];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};
