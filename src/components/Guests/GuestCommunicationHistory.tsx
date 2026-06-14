import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowDownLeft, ArrowUpRight, MessageSquarePlus, Inbox } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import {
  useGuestCommunications,
  useLogCommunication,
  type GuestCommunication,
} from '@/hooks/useGuestCommunications';

interface Props {
  guestEmail?: string | null;
  guestId?: string | null;
  guestName?: string | null;
  className?: string;
}

const directionLabel = (d: GuestCommunication['direction']) =>
  d === 'outbound' ? 'Gesendet' : 'Empfangen';

const directionIcon = (d: GuestCommunication['direction']) =>
  d === 'outbound' ? (
    <ArrowUpRight className="h-3.5 w-3.5" />
  ) : (
    <ArrowDownLeft className="h-3.5 w-3.5" />
  );

const HistoryItem = ({ item }: { item: GuestCommunication }) => {
  const [expanded, setExpanded] = useState(false);
  const body = item.body ?? '';
  const isLong = body.length > 240;
  const preview = expanded || !isLong ? body : `${body.slice(0, 240).trimEnd()}…`;

  return (
    <div className="rounded-lg border bg-card p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant={item.direction === 'outbound' ? 'default' : 'secondary'}
            className="gap-1 text-[10px]"
          >
            {directionIcon(item.direction)}
            {directionLabel(item.direction)}
          </Badge>
          <Badge variant="outline" className="text-[10px] uppercase">
            {item.channel}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {format(new Date(item.occurred_at), 'dd.MM.yyyy HH:mm', { locale: de })}
        </span>
      </div>
      {item.subject && (
        <div className="font-semibold text-sm break-words">{item.subject}</div>
      )}
      {body && (
        <div className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
          {preview}
          {isLong && (
            <button
              type="button"
              className="ml-2 text-xs text-primary hover:underline"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Weniger' : 'Mehr'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const GuestCommunicationHistory = ({ guestEmail, guestId, guestName, className }: Props) => {
  const { data, isLoading } = useGuestCommunications(guestEmail, guestId);
  const logMutation = useLogCommunication();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [occurredAt, setOccurredAt] = useState<string>(() =>
    new Date().toISOString().slice(0, 16),
  );

  const resetForm = () => {
    setSubject('');
    setBody('');
    setOccurredAt(new Date().toISOString().slice(0, 16));
  };

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
        direction: 'inbound',
        subject: subject.trim() || null,
        body: body.trim() || null,
        occurredAt: new Date(occurredAt).toISOString(),
      });
      toast({ title: 'Antwort gespeichert' });
      resetForm();
      setOpen(false);
    } catch (err: any) {
      toast({
        title: 'Fehler beim Speichern',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Inbox className="h-4 w-4" />
          Kommunikationsverlauf
        </CardTitle>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpen(true)}
          disabled={!guestEmail && !guestId}
        >
          <MessageSquarePlus className="h-4 w-4 mr-2" />
          Antwort notieren
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && (
          <div className="text-sm text-muted-foreground">Lädt…</div>
        )}
        {!isLoading && (!data || data.length === 0) && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Noch keine Kommunikation gespeichert.
          </div>
        )}
        {!isLoading && data && data.length > 0 && (
          <div className="space-y-2">
            {data.map((item) => (
              <HistoryItem key={item.id} item={item} />
            ))}
          </div>
        )}
      </CardContent>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Antwort des Gastes notieren</DialogTitle>
            <DialogDescription>
              Kopiere Betreff und Text aus der Gast-Antwort hier hinein.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reply-subject">Betreff</Label>
              <Input
                id="reply-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Re: …"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reply-body">Text</Label>
              <Textarea
                id="reply-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                placeholder="Antwort des Gastes…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reply-date">Empfangen am</Label>
              <Input
                id="reply-date"
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={logMutation.isPending}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={logMutation.isPending}>
              {logMutation.isPending ? 'Speichert…' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default GuestCommunicationHistory;