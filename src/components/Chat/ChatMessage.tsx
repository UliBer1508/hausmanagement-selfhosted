import { Bot, User, ExternalLink, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { openEmail } from '@/lib/mailtoHelper';
import ActionCard from './ActionCard';

interface EntityLink {
  id: string;
  type: 'booking' | 'cleaning_task' | 'laundry_order' | 'house' | 'guest' | 'calendar' | 'email_draft';
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

const ChatMessage = ({ message, onClose }: ChatMessageProps) => {
  const isUser = message.role === 'user';
  const navigate = useNavigate();

  // Extrahiere Entity-Links aus Message Content
  const parseEntityLinks = (content: string): { text: string; links: EntityLink[] } => {
    const marker = '___ENTITIES___\n';
    const index = content.indexOf(marker);

    if (index === -1) return { text: content, links: [] };

    const text = content.substring(0, index).trim();
    const jsonStr = content.substring(index + marker.length);

    try {
      const links = JSON.parse(jsonStr) as EntityLink[];
      return { text, links };
    } catch (e) {
      console.error('Failed to parse entity links:', e);
      return { text: content, links: [] };
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
      case 'house':
        navigate('/', { state: { activeTab: 'Häuser', openHouseId: link.id } });
        break;
      case 'guest':
        navigate('/', { state: { activeTab: 'Gäste', openGuestEmail: link.id } });
        break;
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
      case 'calendar':
        navigate('/');
        break;
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
          <p className="whitespace-pre-wrap break-words">{text}</p>

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
