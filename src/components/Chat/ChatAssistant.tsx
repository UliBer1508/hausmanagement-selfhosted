import { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, GripVertical, Bot, MessagesSquare, LayoutDashboard, Settings } from 'lucide-react';
import { OperationsDashboard } from '@/components/Operations/OperationsDashboard';
import MaxActionsPanel from './MaxActionsPanel';
import { Button } from '@/components/ui/button';
import { CloseButton } from '@/components/ui/close-button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useChat } from '@/hooks/useChat';
import { useMorningSummary } from '@/hooks/useMorningSummary';
import { useProviderMessages } from '@/hooks/useProviderMessages';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import { useLocation } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import Draggable from 'react-draggable';

type ChatMode = 'ai' | 'messaging';

const LoadingDots = () => (
  <div className="flex gap-1">
    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
  </div>
);

const ChatAssistant = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('ai');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [isMaxActionsOpen, setIsMaxActionsOpen] = useState(false);
  const location = useLocation();
  const isMobileRaw = useIsMobile();
  const isMobile = isMobileRaw === undefined ? false : isMobileRaw;
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, setMessages, isStreaming, error, sendMessage, clearMessages } = useChat();
  const { summaryMessage, isLoading: summaryLoading, shouldShow, markAsShown } = useMorningSummary();

  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-scroll to bottom on focus (for mobile keyboard)
  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 300);
  };
  
  // Load active providers with portal
  const { data: providers = [] } = useQuery({
    queryKey: ['providers-with-portal'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_providers')
        .select('*')
        .eq('is_active', true)
        .eq('has_portal', true)
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  const {
    messages: providerMessages,
    isLoading: isLoadingMessages,
    unreadCounts,
    sendMessage: sendProviderMessage,
    markAsRead,
  } = useProviderMessages(selectedProvider);

  // Auto-Insert Summary beim ersten Öffnen des Chats am Tag
  useEffect(() => {
    if (isOpen && summaryMessage && shouldShow() && !summaryLoading) {
      const summaryMsg = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: summaryMessage,
        timestamp: new Date(),
      };
      
      setMessages(prev => {
        // Nur hinzufügen wenn noch keine Summary vorhanden
        if (prev.length === 0 || !prev.some(m => m.content.includes('Guten Morgen'))) {
          markAsShown();
          return [summaryMsg, ...prev];
        }
        return prev;
      });
    }
  }, [isOpen, summaryMessage, summaryLoading, shouldShow, markAsShown, setMessages]);

  const getPageContext = () => {
    const path = location.pathname;
    if (path.includes('/bookings')) return 'bookings';
    if (path.includes('/cleaning')) return 'cleaning';
    if (path.includes('/houses')) return 'houses';
    if (path.includes('/guests')) return 'guests';
    if (path.includes('/laundry')) return 'laundry';
    return 'dashboard';
  };

  const handleSendMessage = async (content: string) => {
    if (chatMode === 'ai') {
      await sendMessage(content, { page: getPageContext() });
    } else {
      sendProviderMessage({ message: content });
    }
  };

  // Mark provider messages as read when viewing
  useEffect(() => {
    if (chatMode === 'messaging' && selectedProvider && providerMessages.length > 0) {
      const unreadMessages = providerMessages
        .filter((msg) => msg.sender_type === 'provider' && !msg.is_read)
        .map((msg) => msg.id);
      
      if (unreadMessages.length > 0) {
        markAsRead(unreadMessages);
      }
    }
  }, [chatMode, selectedProvider, providerMessages, markAsRead]);

  // Reset selected provider when switching to AI mode
  useEffect(() => {
    if (chatMode === 'ai') {
      setSelectedProvider(null);
    }
  }, [chatMode]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, providerMessages]);

  // Calculate total unread count
  const totalUnread = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);

  // Render Chat Content as a reusable section
  const renderChatContent = (isEmbedded = false) => (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="p-4 border-b bg-card flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {chatMode === 'ai' ? (
              <>
                <Bot className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">Max, dein AI Assistent</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setIsMaxActionsOpen(true)}
                  title="Max: Aktionen anzeigen"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <MessagesSquare className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">Nachrichten</h2>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isEmbedded && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsDashboardOpen(true)}
                title="Operations Dashboard"
              >
                <LayoutDashboard className="h-4 w-4" />
              </Button>
            )}
            {chatMode === 'ai' && messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearMessages}
                className="text-xs"
              >
                Löschen
              </Button>
            )}
            {!isEmbedded && (
              <CloseButton onClick={() => setIsOpen(false)} />
            )}
          </div>
        </div>
        
        {/* Mode Toggle */}
        <div className="flex gap-2">
          <Button
            variant={chatMode === 'ai' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setChatMode('ai')}
            className="flex-1"
          >
            <Bot className="h-4 w-4 mr-2" />
            KI
          </Button>
          <Button
            variant={chatMode === 'messaging' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setChatMode('messaging')}
            className="flex-1 relative"
          >
            <MessagesSquare className="h-4 w-4 mr-2" />
            Messaging
            {totalUnread > 0 && (
              <Badge className="ml-2 h-5 w-5 flex items-center justify-center p-0">
                {totalUnread}
              </Badge>
            )}
          </Button>
        </div>

        {/* Provider Selector for Messaging Mode */}
        {chatMode === 'messaging' && (
          <Select value={selectedProvider || ''} onValueChange={setSelectedProvider}>
            <SelectTrigger>
              <SelectValue placeholder="Provider auswählen" />
            </SelectTrigger>
            <SelectContent className="z-[200]">
              {providers.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  <div className="flex items-center justify-between w-full">
                    <span>{provider.name}</span>
                    {unreadCounts[provider.id] > 0 && (
                      <Badge className="ml-2 h-5 w-5 flex items-center justify-center p-0">
                        {unreadCounts[provider.id]}
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* AI Mode */}
        {chatMode === 'ai' && (
          <>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <Bot className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm">Hallo! Ich bin Max, dein Assistent.</p>
                <p className="text-xs mt-2">Stelle mir Fragen zu Buchungen, Reinigungen oder Häusern.</p>
              </div>
            )}
            
            {messages.map((message) => (
              <ChatMessage 
                key={message.id} 
                message={message}
                onClose={() => setIsOpen(false)}
              />
            ))}

            {isStreaming && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <LoadingDots />
                <span>Schreibt...</span>
              </div>
            )}

            {error && (
              <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">
                <p className="font-semibold">Fehler:</p>
                <p>{error}</p>
              </div>
            )}
          </>
        )}

        {/* Messaging Mode */}
        {chatMode === 'messaging' && (
          <>
            {!selectedProvider ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <MessagesSquare className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm">Wähle einen Provider aus</p>
                <p className="text-xs mt-2">um Nachrichten zu senden und zu empfangen.</p>
              </div>
            ) : isLoadingMessages ? (
              <div className="flex items-center justify-center h-full">
                <LoadingDots />
              </div>
            ) : providerMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <MessagesSquare className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm">Noch keine Nachrichten</p>
                <p className="text-xs mt-2">Sende die erste Nachricht an {providers.find(p => p.id === selectedProvider)?.name}</p>
              </div>
            ) : (
              providerMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      msg.sender_type === 'admin'
                        ? 'bg-primary text-primary-foreground'
                        : msg.sender_type === 'assistant'
                        ? 'bg-purple-100 dark:bg-purple-900/40 border border-purple-300 dark:border-purple-700'
                        : 'bg-muted'
                    }`}
                  >
                    {msg.sender_type === 'assistant' && (
                      <p className="text-xs font-semibold mb-1 text-purple-700 dark:text-purple-300 flex items-center gap-1">
                        <Bot className="h-3 w-3" />
                        Max (Assistent)
                      </p>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                    <p className="text-xs mt-1 opacity-70">
                      {new Date(msg.created_at).toLocaleString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))
            )}
            {error && (
              <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">
                <p className="font-semibold">Fehler:</p>
                <p>{error}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t p-4 bg-card">
        <ChatInput 
          onSendMessage={handleSendMessage} 
          disabled={chatMode === 'ai' ? isStreaming : !selectedProvider}
          onFocus={scrollToBottom}
        />
      </div>
    </div>
  );

  // Split-View Mode: Dashboard left, Chat right
  if (isDashboardOpen && !isMobile) {
    return (
      <>
        {/* Floating Action Button when closed */}
        {!isOpen && (
          <div className="fixed bottom-6 right-6 z-50">
            <Button
              onClick={() => setIsOpen(true)}
              size="icon"
              className="relative h-14 w-14 rounded-full shadow-lg hover:scale-110 transition-transform"
            >
              <MessageCircle className="h-6 w-6" />
              {totalUnread > 0 && (
                <Badge 
                  className="absolute -top-1 -right-1 h-6 w-6 flex items-center justify-center p-0 bg-destructive text-destructive-foreground animate-pulse"
                >
                  {totalUnread}
                </Badge>
              )}
            </Button>
          </div>
        )}

        {/* Split-View Container */}
        <div className="fixed inset-0 z-[100]">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50" 
            onClick={() => {
              setIsDashboardOpen(false);
              setIsOpen(false);
            }}
          />
          
          {/* Split Panels */}
          <div className="relative flex w-full h-full p-4 gap-4">
            {/* Dashboard Panel (75%) */}
            <div className="flex-[3] bg-background rounded-lg shadow-2xl overflow-hidden">
              <OperationsDashboard 
                isOpen={true} 
                onClose={() => setIsDashboardOpen(false)} 
                embedded 
              />
            </div>
            
            {/* Chat Panel (25%) */}
            <div className="flex-1 min-w-[350px] bg-background rounded-lg shadow-2xl overflow-hidden">
              {renderChatContent(true)}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button
            onClick={() => setIsOpen(true)}
            size="icon"
            className="relative h-14 w-14 rounded-full shadow-lg hover:scale-110 transition-transform"
          >
            <MessageCircle className="h-6 w-6" />
            {totalUnread > 0 && (
              <Badge 
                className="absolute -top-1 -right-1 h-6 w-6 flex items-center justify-center p-0 bg-destructive text-destructive-foreground animate-pulse"
              >
                {totalUnread}
              </Badge>
            )}
          </Button>
        </div>
      )}

      {/* Draggable Chat Window */}
      {isOpen && (
        <>
          {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 z-[90]"
          onClick={(e) => {
            // Nur schließen wenn direkt auf Backdrop geklickt wurde
            if (e.target === e.currentTarget) {
              setIsOpen(false);
            }
          }}
          onTouchEnd={(e) => {
            if (e.target === e.currentTarget) {
              e.preventDefault();
              setIsOpen(false);
            }
          }}
        />
          
          {/* Chat Window - Full Screen on Mobile, Draggable on Desktop */}
          {isMobile ? (
            <div 
              className="fixed inset-0 h-[100dvh] pointer-events-auto bg-background flex flex-col z-[100] touch-manipulation pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              {renderChatContent(false)}
            </div>
          ) : (
            <div className="fixed inset-0 pointer-events-none z-[100]">
              <Draggable
                handle=".drag-handle"
                bounds={{
                  left: 0,
                  top: 0,
                  right: Math.max(0, windowSize.width - 400),
                  bottom: Math.max(0, windowSize.height - 600)
                }}
                defaultPosition={{ x: Math.max(0, windowSize.width - 450), y: 50 }}
              >
                <div className="absolute w-[400px] h-[600px] pointer-events-auto bg-background border shadow-2xl rounded-lg flex flex-col">
                  {/* Drag handle bar */}
                  <div className="drag-handle cursor-move flex items-center justify-center gap-2 px-2 py-1 border-b bg-card rounded-t-lg text-muted-foreground">
                    <GripVertical className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-h-0 flex flex-col">
                    {renderChatContent(false)}
                  </div>
                </div>
              </Draggable>
            </div>
          )}
        </>
      )}

      {/* Operations Dashboard Modal - only used on mobile */}
      {isMobile && (
        <OperationsDashboard isOpen={isDashboardOpen} onClose={() => setIsDashboardOpen(false)} />
      )}

      {/* Max: Aktionen-Protokoll (unabhängig von Mobile/Desktop) */}
      <MaxActionsPanel open={isMaxActionsOpen} onOpenChange={setIsMaxActionsOpen} />
    </>
  );
};

export default ChatAssistant;
