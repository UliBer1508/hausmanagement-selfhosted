import { useState } from 'react';
import { MessageCircle, X, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChat } from '@/hooks/useChat';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import { useLocation } from 'react-router-dom';
import Draggable from 'react-draggable';

const ChatAssistant = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { messages, isStreaming, error, sendMessage, clearMessages } = useChat();

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
    await sendMessage(content, { page: getPageContext() });
  };

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          size="icon"
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg hover:scale-110 transition-transform"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}

      {/* Draggable Chat Window */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-[90]"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Draggable Window */}
          <div className="fixed inset-0 pointer-events-none z-[100]">
            <Draggable
              handle=".drag-handle"
              bounds={{
                left: 0,
                top: 0,
                right: window.innerWidth - 400,
                bottom: window.innerHeight - 600
              }}
              defaultPosition={{ x: window.innerWidth - 450, y: 50 }}
            >
              <div className="absolute w-[400px] h-[600px] pointer-events-auto bg-background border shadow-2xl rounded-lg flex flex-col">
              {/* Header - Draggable Handle */}
              <div className="drag-handle cursor-move p-4 border-b bg-card rounded-t-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <MessageCircle className="h-5 w-5 text-primary" />
                  <h2 className="font-semibold">AI Assistent</h2>
                </div>
                <div className="flex items-center gap-2">
                  {messages.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearMessages}
                      className="text-xs"
                    >
                      Löschen
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                    <MessageCircle className="h-12 w-12 mb-4 opacity-50" />
                    <p className="text-sm">Hallo! Ich bin dein AI-Assistent.</p>
                    <p className="text-xs mt-2">Stelle mir Fragen zu Buchungen, Reinigungen oder Häusern.</p>
                  </div>
                )}
                
                {messages.map((message) => (
                  <ChatMessage key={message.id} message={message} />
                ))}

                {isStreaming && (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span>Schreibt...</span>
                  </div>
                )}

                {error && (
                  <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">
                    <p className="font-semibold">Fehler:</p>
                    <p>{error}</p>
                  </div>
                )}
              </div>

              {/* Input Area */}
              <div className="border-t p-4 bg-card rounded-b-lg">
                <ChatInput 
                  onSendMessage={handleSendMessage} 
                  disabled={isStreaming}
                />
              </div>
              </div>
            </Draggable>
          </div>
        </>
      )}
    </>
  );
};

export default ChatAssistant;
