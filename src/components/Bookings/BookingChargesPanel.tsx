import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CreditCard, Mail, Copy, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useBookingCharges } from '@/hooks/useBookingCharges';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { openEmail } from '@/lib/mailtoHelper';

interface Props {
  bookingId: string;
  bookingAmount?: number | null;
  guestEmail?: string | null;
  guestName?: string | null;
}

const fmt = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const statusBadge = (status: string) => {
  if (status === 'paid')
    return <Badge className="bg-green-600 hover:bg-green-700 text-white">Bezahlt</Badge>;
  if (status === 'cancelled')
    return <Badge variant="secondary" className="bg-gray-300 text-gray-700">Storniert</Badge>;
  return <Badge className="bg-orange-500 hover:bg-orange-600 text-white">Offen</Badge>;
};

const BookingChargesPanel = ({ bookingId, bookingAmount, guestEmail, guestName }: Props) => {
  const { data: charges, isLoading } = useBookingCharges(bookingId);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<'create' | 'send' | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['booking_charges', bookingId] });

  const totalCharges = (charges || []).reduce((s, c) => s + Number(c.amount || 0), 0);
  const openCharges = (charges || [])
    .filter((c) => c.status === 'open')
    .reduce((s, c) => s + Number(c.amount || 0), 0);

  // Open charges that don't yet have a payment link
  const openWithoutLink = (charges || []).filter(
    (c) => c.status === 'open' && !c.payment?.payment_url,
  );
  const openWithoutLinkSum = openWithoutLink.reduce((s, c) => s + Number(c.amount || 0), 0);

  // Active (unpaid) bundled link: find any open charge that already has a payment_url
  const activeLinkCharge = (charges || []).find(
    (c) => c.status === 'open' && c.payment?.payment_url,
  );
  const activePaymentUrl = activeLinkCharge?.payment?.payment_url || null;

  const handleCreateBundledLink = async () => {
    setBusy('create');
    try {
      const { data, error } = await supabase.functions.invoke('create-payment-link', {
        body: { booking_id: bookingId },
      });
      if (error) throw error;
      toast({ title: 'Zahlungslink erstellt', description: data?.payment_url });
      refresh();
    } catch (e: any) {
      toast({ title: 'Fehler', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const handleSendLink = async (url: string) => {
    if (!guestEmail) {
      toast({ title: 'Keine E-Mail', description: 'Gast hat keine E-Mail-Adresse hinterlegt.', variant: 'destructive' });
      return;
    }
    setBusy('send');
    try {
      const html = `
        <p>Hallo ${guestName || ''},</p>
        <p>für Ihre offenen Zusatzforderungen über <strong>${fmt(openCharges)}</strong>
        finden Sie hier Ihren Zahlungslink:</p>
        <p><a href="${url}">${url}</a></p>
        <p>Vielen Dank!</p>
      `;
      const { copied } = await openEmail({
        to: guestEmail,
        subject: 'Ihr Zahlungslink',
        html,
      });
      toast({
        title: 'Gmail geöffnet',
        description: copied
          ? 'Der Text liegt in der Zwischenablage — im Mailfenster mit Strg+V einfügen und senden.'
          : 'Bitte den Text manuell einfügen und senden.',
      });
    } catch (e: any) {
      toast({ title: 'Fehler', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast({ title: 'Kopiert', description: 'Zahlungslink in Zwischenablage.' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Zusatzforderungen & Zahlungen</CardTitle>
        <div className="text-sm text-muted-foreground">
          Buchungspreis: <strong>{fmt(bookingAmount)}</strong>
          {' · '}davon Zusatzforderungen: <strong>{fmt(totalCharges)}</strong>
          {' · '}offen: <strong className={openCharges > 0 ? 'text-orange-600' : ''}>{fmt(openCharges)}</strong>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Lade Forderungen...
          </div>
        ) : !charges || charges.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Zusatzforderungen für diese Buchung.</p>
        ) : (
          <>
            {/* Bundled payment-link action bar */}
            {(openWithoutLink.length > 0 || activePaymentUrl) && (
              <div className="mb-4 rounded-md border bg-muted/40 p-3 flex flex-col gap-2">
                {activePaymentUrl ? (
                  <>
                    <div className="text-sm">
                      Aktiver Zahlungslink über <strong>{fmt(openCharges)}</strong>:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => handleSendLink(activePaymentUrl)}
                      >
                        {busy === 'send' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                        Link an Gast senden
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => handleCopy(activePaymentUrl)}>
                        <Copy className="w-4 h-4 mr-2" /> Link kopieren
                      </Button>
                      <a
                        href={activePaymentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-blue-600 underline self-center break-all"
                      >
                        {activePaymentUrl}
                      </a>
                    </div>
                    {openWithoutLink.length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={handleCreateBundledLink}
                      >
                        {busy === 'create' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
                        Neuen Link für übrige Forderungen erstellen ({fmt(openWithoutLinkSum)})
                      </Button>
                    )}
                  </>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy !== null}
                    onClick={handleCreateBundledLink}
                  >
                    {busy === 'create' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
                    Zahlungslink für alle offenen Forderungen erstellen (Summe {fmt(openWithoutLinkSum)})
                  </Button>
                )}
              </div>
            )}

            <ul className="divide-y">
            {charges.map((charge) => {
              return (
                <li key={charge.id} className="py-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{charge.description}</div>
                      <div className="text-sm text-muted-foreground">{fmt(charge.amount)}</div>
                    </div>
                    {statusBadge(charge.status)}
                  </div>

                  {charge.status === 'open' && charge.payment?.payment_url && (
                    <div className="text-xs text-muted-foreground">
                      In aktivem Zahlungslink enthalten.
                    </div>
                  )}

                  {charge.status === 'paid' && charge.payment && (
                    <div className="flex items-center gap-2 text-sm text-green-700">
                      <CheckCircle2 className="w-4 h-4" />
                      Bezahlt am{' '}
                      {charge.payment.paid_at
                        ? format(new Date(charge.payment.paid_at), 'dd.MM.yyyy HH:mm', { locale: de })
                        : '—'}
                      {charge.payment.stripe_payment_intent_id && (
                        <span className="text-muted-foreground">
                          · Stripe: {charge.payment.stripe_payment_intent_id}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default BookingChargesPanel;
