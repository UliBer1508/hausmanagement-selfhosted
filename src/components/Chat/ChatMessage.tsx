import { Bot, User, ExternalLink, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { openEmail } from '@/lib/mailtoHelper';
import ActionCard from './ActionCard';

interface EntityLink {
  id: string;
  // Nur diese vier Typen erzeugt Max (buildEntityLinks im chat-assistant).
  type: 'booking' | 'cleaning_task' | 'laundry_order' | 'email_draft';
  label: string;
  // Nur bei type === 'email_draft': vorausgefüllter Begrüßungs-E-Mail-Entwurf.
  email?: {
    to: string;
    subject: string;
    body: string;
    guestName?: string;
    checkIn?: string;
    checkOut?: string;
    houseName?: string;
  };
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
    result?: any;
  }>;
}

interface ChatMessageProps {
  message: Message;
  onClose?: () => void;
}

/**
 * Stellt **Fettdruck** dar, statt die Sternchen roh anzuzeigen.
 *
 * WARUM KEINE MARKDOWN-BIBLIOTHEK (13.07.2026):
 * Max' Antworten (chat-assistant) und die Morgen-Übersicht (morning-summary)
 * erzeugen Markdown — aber praktisch NUR `**fett**`. Keine Überschriften, keine
 * Links, keine Tabellen; Aufzählungen laufen über das Zeichen „•", das ohnehin
 * reiner Text ist.
 *
 * `react-markdown` wäre für diesen einen Effekt unverhältnismäßig: neues Paket,
 * mehr Bundle-Gewicht, und es öffnet die Frage nach HTML-Injection. Diese
 * Funktion splittet stattdessen am `**` und macht jeden zweiten Abschnitt fett —
 * kein `dangerouslySetInnerHTML`, React escapt alles wie gewohnt.
 *
 * Sonderfall: Eine ungerade Zahl von `**` (z. B. ein einzelner Stern im Text)
 * lässt den letzten Abschnitt normal — es geht kein Text verloren.
 */
const renderBold = (text: string) => {
  const teile = text.split('**');
  // Ohne Sternchen: unverändert zurückgeben (der Normalfall).
  if (teile.length === 1) return text;

  return teile.map((teil, i) =>
    // Ungerade Indizes lagen ZWISCHEN zwei ** -> fett.
    i % 2 === 1
      ? <strong key={i} className="font-semibold">{teil}</strong>
      : <span key={i}>{teil}</span>
  );
};

const ChatMessage = ({ message, onClose }: ChatMessageProps) => {
  const isUser = message.role === 'user';
  const navigate = useNavigate();

  // Extrahiere Entity-Links aus Message Content
  const parseEntityLinks = (content: string): { text: string; links: EntityLink[] } => {
    // Robust gegen MEHRFACHE Marker (17.07.2026): Früher konnte der Text zwei
    // ___ENTITIES___-Blöcke enthalten (Modell ahmte den Marker nach + Backend hängte
    // seinen an). indexOf nahm den ersten -> JSON.parse bekam Müll -> Rohtext im Chat.
    // Jetzt: am LETZTEN Marker trennen und den Teil davor zusätzlich säubern.
    const marker = '___ENTITIES___';
    const lastIndex = content.lastIndexOf(marker);

    if (lastIndex === -1) return { text: content, links: [] };

    // JSON steht nach dem letzten Marker (führender \n wird toleriert).
    const jsonStr = content.substring(lastIndex + marker.length).replace(/^\s*\n?/, '');
    // Sichtbarer Text = alles vor dem ERSTEN Marker (entfernt auch etwaige
    // vom Modell mitten hineingeschriebene Marker-Reste).
    const firstIndex = content.indexOf(marker);
    const text = content.substring(0, firstIndex).trim();

    try {
      const links = JSON.parse(jsonStr) as EntityLink[];
      return { text, links };
    } catch (e) {
      console.error('Failed to parse entity links:', e);
      // Fallback: wenigstens den sichtbaren Text OHNE Marker zeigen, nie den Rohtext.
      return { text: text || content.substring(0, firstIndex).trim(), links: [] };
    }
  };

  const { text, links } = parseEntityLinks(message.content);

  const handleEntityClick = (link: EntityLink) => {
    switch (link.type) {
      case 'booking':
        navigate('/', { state: { activeTab: 'Buchungen', editBookingId: link.id } });
        break;
      case 'cleaning_task':
        navigate('/', { state: { activeTab: 'Reinigung', openTaskId: link.id } });
        break;
      case 'laundry_order':
        navigate('/', { state: { activeTab: 'Wäsche', openOrderId: link.id } });
        break;
      // ENTFERNT 13.07.2026: 'house', 'guest', 'calendar'.
      // Max erzeugt diese Button-Typen NIE (buildEntityLinks liefert nur
      // booking, cleaning_task, laundry_order, email_draft). Ausserdem wurden
      // die Parameter openHouseId / openGuestEmail von KEINER Komponente
      // verarbeitet — die Buttons haetten nur den Tab gewechselt.
      case 'email_draft':
        // Öffnet das Vorschaufenster VORAUSGEFÜLLT (Betreff/Text aus dem Entwurf).
        // Es wird nichts gesendet — Uli prüft und klickt dort "Per Gmail senden".
        if (link.email?.to) {
          void openEmail({
            to: link.email.to,
            subject: link.email.subject,
            text: link.email.body,
            recipients: [
              {
                email: link.email.to,
                guestName: link.email.guestName,
                checkIn: link.email.checkIn,
                checkOut: link.email.checkOut,
                houseName: link.email.houseName,
              },
            ],
          });
        }
        // Chat NICHT schließen: Das Vorschaufenster erscheint darüber.
        return;
    }
    // Chat schließen nach Navigation
    onClose?.();
  };

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary' : 'bg-secondary'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-primary-foreground" />
        ) : (
          <Bot className="h-4 w-4 text-secondary-foreground" />
        )}
      </div>

      {/* Message Content */}
      <div className={cn('flex-1 space-y-2', isUser && 'items-end')}>
        <div
          className={cn(
            'rounded-lg px-4 py-2 text-sm',
            isUser
              ? 'bg-primary text-primary-foreground ml-auto max-w-[85%]'
              : 'bg-muted max-w-[90%]'
          )}
        >
          {/* renderBold statt {text}: Max' Antworten und die Morgen-Übersicht
              enthalten **Fettdruck**. Ohne Aufbereitung wurden die Sternchen
              roh angezeigt („**2 Gäste vor Anreise**"). whitespace-pre-wrap
              bleibt — die Zeilenumbrüche aus dem Text sind weiterhin nötig. */}
          <p className="whitespace-pre-wrap break-words">{renderBold(text)}</p>

          {/* Entity Action Links */}
          {links.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
              <p className="text-xs font-semibold opacity-70">Schnellzugriff:</p>
              <div className="flex flex-wrap gap-2">
                {links.map((link, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    onClick={() => handleEntityClick(link)}
                    className="h-7 text-xs gap-1"
                  >
                    {link.type === 'email_draft' ? (
                      <Mail className="h-3 w-3" />
                    ) : (
                      <ExternalLink className="h-3 w-3" />
                    )}
                    {link.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tool Calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-2 max-w-[90%]">
            {message.toolCalls.map((toolCall) => (
              <ActionCard key={toolCall.id} toolCall={toolCall} />
            ))}
          </div>
        )}

        {/* Timestamp */}
        <p className={cn('text-xs text-muted-foreground', isUser && 'text-right')}>
          {message.timestamp.toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
};

export default ChatMessage;
