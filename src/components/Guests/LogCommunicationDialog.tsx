import { useEffect, useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useLogCommunication } from '@/hooks/useGuestCommunications';
import { COMMUNICATION_CHANNELS } from '@/lib/communicationChannels';

// ============================================================
// Nachricht notieren (NEU 26.09.2026)
// ============================================================
//
// WARUM: Gästekommunikation läuft oft über Airbnb, Booking.com oder WhatsApp.
// Diese Nachrichten kommen nicht automatisch in die Hausverwaltung — Airbnb
// hat keine offene Schnittstelle, und eigene Nachrichten schickt Airbnb nicht
// einmal per Mail. Damit der Verlauf trotzdem vollständig ist, wird die
// Nachricht hier von Hand hineinkopiert.
//
// Ersetzt den früheren Dialog "Antwort notieren" in
// GuestCommunicationHistory, der nur EINGEHENDE Nachrichten mit Kanal
// "email" speichern konnte.
//
// Verwendet in:
//   - GuestCommunicationHistory (Gast-Details, Kommunikationsverlauf)
//   - GuestContactAlertBanner   (Knopf "Kontaktiert" -> Nachricht dazu
//                                notieren, Buchung wird als kontaktiert markiert)
//
// Der Dialog schreibt NUR in guest_communications. Was danach mit der Buchung
// passiert (z. B. guest_contact_status), entscheidet der Aufrufer über
// `onSaved` — dieser Dialog kennt keine Buchung.

type Direction = 'outbound' | 'inbound';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guestId?: string | null;
  guestEmail?: string | null;
  guestName?: string | null;
  defaultDirection?: Direction;
  defaultChannel?: string;
  /** Wird nach erfolgreichem Speichern aufgerufen. */
  onSaved?: () => void;
  /**
   * Optionaler zweiter Knopf, z. B. "Nur als kontaktiert markieren" im
   * Kontakt-Banner — für den Fall, dass Uli den Text nicht hineinkopieren will.
   */
  skipLabel?: string;
  onSkip?: () => void;
}

// Datum/Uhrzeit für <input type="datetime-local"> in LOKALER Zeit.
// WARUM nicht toISOString().slice(0, 16): Das ist UTC. Der alte Dialog zeigte
// deshalb im Sommer eine um zwei Stunden zu frühe Uhrzeit vor.
const jetztLokal = (): string => format(new Date(), "yyyy-MM-dd'T'HH:mm");

const LogCommunicationDialog = ({
  open,
  onOpenChange,
  guestId,
  guestEmail,
  guestName,
  defaultDirection = 'inbound',
  defaultChannel = 'email',
  onSaved,
  skipLabel,
  onSkip,
}: Props) => {
  const logMutation = useLogCommunication();
  const { toast } = useToast();

  const [direction, setDirection] = useState<Direction>(defaultDirection);
  const [channel, setChannel] = useState<string>(defaultChannel);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [occurredAt, setOccurredAt] = useState<string>(jetztLokal);

  // Beim Öffnen immer mit den Vorgaben des Aufrufers beginnen.
  useEffect(() => {
    if (open) {
      setDirection(defaultDirection);
      setChannel(defaultChannel);
      setSubject('');
      setBody('');
      setOccurredAt(jetztLokal());
    }
  }, [open, defaultDirection, defaultChannel]);

  const handleSave = async () => {
    if (!body.trim() && !subject.trim()) {
      toast({
        title: 'Bitte etwas eintragen',
        description: 'Betreff oder Text muss ausgefüllt sein.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await logMutation.mutateAsync({
        guestId: guestId ?? null,
        guestEmail: guestEmail ?? null,
        guestName: guestName ?? null,
        direction,
        channel,
        subject: subject.trim() || null,
        body: body.trim() || null,
        occurredAt: new Date(occurredAt).toISOString(),
      });
      toast({ title: 'Nachricht gespeichert' });
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      console.error('[LogCommunicationDialog]', err);
      toast({
        title: 'Fehler beim Speichern',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  };

  const richtungKnopf = (wert: Direction, text: string, icon: ReactNode) => (
    <Button
      type="button"
      variant={direction === wert ? 'default' : 'outline'}
      className="flex-1 gap-1.5"
      onClick={() => setDirection(wert)}
    >
      {icon}
      {text}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Nachricht notieren{guestName ? ` – ${guestName}` : ''}</DialogTitle>
          <DialogDescription>
            Text aus Airbnb, Booking.com, WhatsApp usw. hier hineinkopieren, damit der
            Verlauf in der Hausverwaltung vollständig ist.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Richtung</Label>
            <div className="flex gap-2">
              {richtungKnopf('outbound', 'Ich → Gast', <ArrowUpRight className="h-4 w-4" />)}
              {richtungKnopf('inbound', 'Gast → ich', <ArrowDownLeft className="h-4 w-4" />)}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="comm-channel">Kanal</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger id="comm-channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMUNICATION_CHANNELS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="comm-subject">Betreff (optional)</Label>
            <Input
              id="comm-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="z. B. Anreise-Infos"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="comm-body">Text</Label>
            <Textarea
              id="comm-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder={direction === 'outbound' ? 'Meine Nachricht an den Gast…' : 'Nachricht des Gastes…'}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="comm-date">{direction === 'outbound' ? 'Gesendet am' : 'Empfangen am'}</Label>
            <Input
              id="comm-date"
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={logMutation.isPending}>
            Abbrechen
          </Button>
          {skipLabel && onSkip && (
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onSkip();
              }}
              disabled={logMutation.isPending}
            >
              {skipLabel}
            </Button>
          )}
          <Button onClick={handleSave} disabled={logMutation.isPending}>
            {logMutation.isPending ? 'Speichert…' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LogCommunicationDialog;
