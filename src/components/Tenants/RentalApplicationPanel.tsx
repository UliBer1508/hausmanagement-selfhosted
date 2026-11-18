import { useQuery } from '@tanstack/react-query';
import { ExternalLink, FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface RentalApplicationPanelProps {
  offerId: string;
}

const datum = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '—');
const euro = (n?: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(Number(n));

/**
 * Selbstauskunft (rental_applications) und vom Kunden hochgeladene Unterlagen
 * (documents über document_links, entity_type 'mietangebot') zu einem Angebot. SQL 73.
 * Die Dateien liegen in OneDrive (Dokumentenverwaltung, Typ „Mieterunterlagen“).
 */
const RentalApplicationPanel = ({ offerId }: RentalApplicationPanelProps) => {
  const { data, isLoading } = useQuery({
    queryKey: ['rental-application', offerId],
    queryFn: async () => {
      const [a, l] = await Promise.all([
        (supabase as any).from('rental_applications').select('*').eq('offer_id', offerId).maybeSingle(),
        (supabase as any).from('document_links')
          .select('documents(id, file_name, onedrive_web_url, created_at)')
          .eq('entity_type', 'mietangebot').eq('entity_id', offerId),
      ]);
      if (a.error) throw a.error;
      if (l.error) throw l.error;
      const docs = ((l.data || []) as any[]).map(x => x.documents).filter(Boolean)
        .sort((x: any, y: any) => String(x.created_at).localeCompare(String(y.created_at)));
      return { app: a.data as any | null, docs: docs as { id: string; file_name: string; onedrive_web_url: string | null; created_at: string }[] };
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />Unterlagen werden geladen…
      </div>
    );
  }

  const app = data?.app;
  const docs = data?.docs ?? [];
  const zeile = (label: string, wert: string | number | null | undefined) => (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{wert === null || wert === undefined || wert === '' ? '—' : wert}</span>
    </div>
  );

  return (
    <div className="rounded-lg border p-3 space-y-3 text-sm">
      <div className="font-semibold">Selbstauskunft und Unterlagen</div>
      {app ? (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
          {zeile('Name', app.full_name)}
          {zeile('Geburtsdatum', datum(app.birth_date))}
          {zeile('Adresse', app.current_address)}
          {zeile('Beruf', app.occupation)}
          {zeile('Arbeitgeber', app.employer)}
          {zeile('Beschäftigt seit', app.employed_since)}
          {zeile('Nettoeinkommen / Monat', euro(app.net_income_month))}
          {zeile('Erwachsene / Kinder', `${app.adults ?? '—'} / ${app.children ?? '—'}`)}
          {zeile('Haustiere', app.pets)}
          {zeile('Bisheriger Vermieter', app.previous_landlord)}
          {zeile('Keine Exekution/Insolvenz', app.no_debt_enforcement ? 'bestätigt' : 'nicht bestätigt')}
          {zeile('Eingegangen', datum(app.updated_at ?? app.created_at))}
          {app.remarks && <p className="sm:col-span-2 whitespace-pre-line bg-muted/50 rounded p-2">{app.remarks}</p>}
        </div>
      ) : (
        <p className="text-muted-foreground">Noch keine Selbstauskunft. Der Kunde füllt sie nach der Zusage auf der Angebotsseite aus.</p>
      )}

      <div>
        <div className="font-medium mb-1">Unterlagen ({docs.length})</div>
        {docs.length === 0 ? (
          <p className="text-muted-foreground">Noch keine Unterlagen hochgeladen.</p>
        ) : (
          <ul className="space-y-1">
            {docs.map(d => (
              <li key={d.id} className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                {d.onedrive_web_url ? (
                  <a href={d.onedrive_web_url} target="_blank" rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1">
                    {d.file_name}<ExternalLink className="h-3 w-3" />
                  </a>
                ) : d.file_name}
                <span className="text-xs text-muted-foreground">{datum(d.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground mt-1">Ablage: Dokumentenverwaltung, Typ „Mieterunterlagen“ (OneDrive).</p>
      </div>
    </div>
  );
};

export default RentalApplicationPanel;
