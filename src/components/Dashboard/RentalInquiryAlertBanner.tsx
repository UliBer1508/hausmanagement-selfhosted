import { useNavigate } from 'react-router-dom';
import { KeyRound, Check, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useRentalInquiries, useRentalOffers, useUpdateRentalInquiry, useMarkOfferResponseSeen, OFFER_STATUS_LABEL,
} from '@/hooks/useRentalInquiries';

/**
 * Hinweis in der Übersicht: neue Mietanfragen „Wohnen auf Zeit“ und Antworten von
 * Kunden auf freigegebene Angebote — bis „Gesehen“. Ergänzt (nicht ersetzt)
 * BookingInquiryAlertBanner (Urlaubsanfragen). SQL 72.
 */
const RentalInquiryAlertBanner = () => {
  const navigate = useNavigate();
  const { data: anfragen = [] } = useRentalInquiries();
  const { data: angebote = [] } = useRentalOffers();
  const update = useUpdateRentalInquiry();
  const gesehen = useMarkOfferResponseSeen();

  const neu = anfragen.filter(a => a.status === 'new' && !a.seen_at);
  const antworten = angebote.filter(o => ['accepted', 'question'].includes(o.status) && !o.response_seen_at);
  if (neu.length === 0 && antworten.length === 0) return null;

  const oeffnen = () => navigate('/', { state: { activeTab: 'Mieter', tenantSubTab: 'interessenten' } });

  return (
    <div className="mb-4 rounded-xl border border-primary bg-primary/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold">
          <KeyRound className="h-5 w-5 text-primary" />
          Wohnen auf Zeit
          {neu.length > 0 && <span>· {neu.length} neue Mietanfrage{neu.length > 1 ? 'n' : ''}</span>}
          {antworten.length > 0 && <span>· {antworten.length} Antwort{antworten.length > 1 ? 'en' : ''} auf Angebote</span>}
        </div>
        <Button size="sm" onClick={oeffnen}>
          Interessenten öffnen <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      <ul className="space-y-1.5 text-sm">
        {neu.map(a => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>{a.guest_name}</strong> · {a.houses?.name ?? '—'} · Einzug {new Date(a.move_in).toLocaleDateString('de-DE')} ·{' '}
              {a.duration_months ? `${a.duration_months} Monate` : 'Dauer offen'}
            </span>
            <Button size="sm" variant="ghost"
              onClick={() => update.mutate({ id: a.id, changes: { seen_at: new Date().toISOString() } })}>
              <Check className="h-4 w-4 mr-1" />Gesehen
            </Button>
          </li>
        ))}
        {antworten.map(o => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>{o.guest_name}</strong> · {OFFER_STATUS_LABEL[o.status]}
              {o.guest_message ? ` · „${o.guest_message.slice(0, 80)}${o.guest_message.length > 80 ? '…' : ''}“` : ''}
            </span>
            <Button size="sm" variant="ghost" onClick={() => gesehen.mutate(o.id)}>
              <Check className="h-4 w-4 mr-1" />Gesehen
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default RentalInquiryAlertBanner;
