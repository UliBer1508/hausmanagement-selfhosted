import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Mail, Phone, FileText, Calculator, Loader2, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useHouses } from '@/hooks/useHouses';
import {
  useRentalInquiries, useRentalOffers, useUpdateRentalInquiry,
  INQUIRY_STATUS_LABEL, OFFER_STATUS_LABEL, PURPOSE_LABEL, RentalInquiry, RentalInquiryStatus,
} from '@/hooks/useRentalInquiries';
import RentalOfferDialog from './RentalOfferDialog';
import RentalCalculationDialog from './RentalCalculationDialog';

const datum = (iso: string) => format(parseISO(iso), 'dd.MM.yyyy');

/**
 * Tab Mieter → „Interessenten“: Mietanfragen „Wohnen auf Zeit“ von der Website
 * (rental_inquiries), Status, persönliches Angebot (rental_offers) und die interne
 * Kalkulation je Haus (rental_calculations). SQL 72.
 * NICHT zu verwechseln mit Dashboard/BookingInquiryAlertBanner (Urlaubsanfragen → Buchung).
 */
const RentalInquiries = () => {
  const { data: anfragen = [], isLoading } = useRentalInquiries();
  const { data: angebote = [] } = useRentalOffers();
  const { data: houses = [] } = useHouses();
  const update = useUpdateRentalInquiry();
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [angebotFuer, setAngebotFuer] = useState<RentalInquiry | null>(null);
  const [kalkHaus, setKalkHaus] = useState<string>('');
  const [kalkOffen, setKalkOffen] = useState(false);

  // neuestes Angebot je Anfrage (Liste ist nach created_at absteigend sortiert)
  const angebotZu = (id: string) => angebote.find(o => o.inquiry_id === id);

  const sichtbar = useMemo(
    () => anfragen.filter(a => filter === 'all' || !['rejected', 'closed'].includes(a.status)),
    [anfragen, filter]
  );

  const hausName = (id: string) => houses.find(h => h.id === id)?.name ?? '—';
  // Häuser für die Kalkulation: Festvermietung oder mit Mietanfragen
  const kalkHaeuser = houses.filter(h => h.rental_type === 'long_term' || anfragen.some(a => a.house_id === h.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Mietinteressenten — Wohnen auf Zeit</h2>
          <p className="text-sm text-muted-foreground">
            Anfragen von steinbockchalets.com. Nach der Besichtigung: „Angebot erstellen“ → „Freigeben“ → Link an den Kunden.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={kalkHaus} onValueChange={setKalkHaus}>
            <SelectTrigger className="w-52" aria-label="Haus für die Kalkulation">
              <SelectValue placeholder="Haus für Kalkulation" />
            </SelectTrigger>
            <SelectContent>
              {kalkHaeuser.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" disabled={!kalkHaus} onClick={() => setKalkOffen(true)}>
            <Calculator className="h-4 w-4 mr-2" />Kalkulation
          </Button>
          <Select value={filter} onValueChange={v => setFilter(v as 'open' | 'all')}>
            <SelectTrigger className="w-40" aria-label="Filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Offene</SelectItem>
              <SelectItem value="all">Alle</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Wird geladen…</span>
        </div>
      ) : sichtbar.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {filter === 'open' ? 'Keine offenen Mietanfragen.' : 'Noch keine Mietanfragen.'}
        </p>
      ) : (
        <div className="space-y-3">
          {sichtbar.map(a => {
            const o = angebotZu(a.id);
            const antwortOffen = o && ['accepted', 'question'].includes(o.status) && !o.response_seen_at;
            return (
              <Card key={a.id} className={`p-4 space-y-3 ${a.status === 'new' || antwortOffen ? 'border-primary' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      {a.guest_name}
                      {a.status === 'new' && <Badge>neu</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Home className="h-3.5 w-3.5" />
                      {a.houses?.name ?? hausName(a.house_id)} · eingegangen {datum(a.created_at)} · {a.language.toUpperCase()}
                    </div>
                  </div>
                  <Select
                    value={a.status}
                    onValueChange={wert => update.mutate({
                      id: a.id,
                      changes: { status: wert as RentalInquiryStatus, seen_at: a.seen_at ?? new Date().toISOString() },
                    })}
                  >
                    <SelectTrigger className="w-40 h-8" aria-label="Status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(INQUIRY_STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <a href={`mailto:${a.guest_email}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                    <Mail className="h-3.5 w-3.5" />{a.guest_email}
                  </a>
                  <a href={`tel:${a.guest_phone}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                    <Phone className="h-3.5 w-3.5" />{a.guest_phone}
                  </a>
                  <span>Einzug: <strong>{datum(a.move_in)}</strong></span>
                  <span>Dauer: <strong>{a.duration_months ? `${a.duration_months} Monate` : 'länger / offen'}</strong></span>
                  <span>Personen: <strong>{a.persons}</strong>{a.pets ? ' · mit Haustier' : ''}</span>
                  <span>
                    Anlass: <strong>{a.purpose ? PURPOSE_LABEL[a.purpose] : '—'}</strong>
                    {a.purpose_detail ? ` – ${a.purpose_detail}` : ''}
                  </span>
                  <span>Anmeldung Gemeinde: <strong>{a.registration_confirmed ? 'zugesagt' : 'nein'}</strong></span>
                </div>

                {a.message && <p className="text-sm whitespace-pre-line bg-muted/50 rounded p-2">{a.message}</p>}
                {o?.guest_message && (
                  <p className="text-sm whitespace-pre-line rounded p-2 border border-primary bg-primary/5">
                    <strong>Antwort auf das Angebot:</strong> {o.guest_message}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`text-xs ${antwortOffen ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                    {o ? `Angebot: ${OFFER_STATUS_LABEL[o.status]}` : 'Noch kein Angebot'}
                  </span>
                  <Button size="sm" variant={o ? 'outline' : 'default'} onClick={() => setAngebotFuer(a)}>
                    <FileText className="h-4 w-4 mr-1" />
                    {o ? 'Angebot öffnen' : 'Angebot erstellen'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <RentalOfferDialog
        open={!!angebotFuer}
        onOpenChange={offen => !offen && setAngebotFuer(null)}
        inquiry={angebotFuer}
        houseName={angebotFuer ? (angebotFuer.houses?.name ?? hausName(angebotFuer.house_id)) : ''}
      />
      <RentalCalculationDialog
        open={kalkOffen}
        onOpenChange={setKalkOffen}
        houseId={kalkHaus || null}
        houseName={hausName(kalkHaus)}
      />
    </div>
  );
};

export default RentalInquiries;
