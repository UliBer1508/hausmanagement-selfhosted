import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowDownLeft, ArrowUpRight, MessageSquarePlus, Inbox } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  useGuestCommunications,
  type GuestCommunication,
} from '@/hooks/useGuestCommunications';
import { channelLabel } from '@/lib/communicationChannels';
import LogCommunicationDialog from './LogCommunicationDialog';

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
          <Badge variant="outline" className="text-[10px]">
            {channelLabel(item.channel)}
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
  const [open, setOpen] = useState(false);

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
          Nachricht notieren
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

      {/* Richtung und Kanal wählbar (26.09.2026) — vorher nur "Antwort des
          Gastes" per E-Mail. */}
      <LogCommunicationDialog
        open={open}
        onOpenChange={setOpen}
        guestId={guestId}
        guestEmail={guestEmail}
        guestName={guestName}
        defaultDirection="outbound"
        defaultChannel="airbnb"
      />
    </Card>
  );
};

export default GuestCommunicationHistory;
