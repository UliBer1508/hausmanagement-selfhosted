import { Bot, User, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import ActionCard from './ActionCard';

interface EntityLink {
  id: string;
  type: 'booking' | 'cleaning_task' | 'laundry_order' | 'house';
  label: string;
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
}

const ChatMessage = ({ message }: ChatMessageProps) => {
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
        navigate('/bookings', { state: { openBookingId: link.id } });
        break;
      case 'cleaning_task':
        navigate('/cleaning', { state: { openTaskId: link.id } });
        break;
      case 'laundry_order':
        navigate('/laundry', { state: { openOrderId: link.id } });
        break;
      case 'house':
        navigate('/houses', { state: { openHouseId: link.id } });
        break;
    }
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
                    <ExternalLink className="h-3 w-3" />
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
