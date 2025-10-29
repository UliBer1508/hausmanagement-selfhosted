import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

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

interface PageContext {
  page: string;
}

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const sendMessage = useCallback(async (content: string, context?: PageContext) => {
    setError(null);
    
    // Add user message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    
    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-assistant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: messages.concat(userMessage).map((m) => ({
              role: m.role,
              content: m.content,
            })),
            context,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 429) {
          throw new Error('Zu viele Anfragen. Bitte warte einen Moment.');
        }
        if (response.status === 402) {
          throw new Error('Lovable AI Credits aufgebraucht. Bitte Credits aufladen.');
        }
        
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Keine Antwort vom Server');
      }

      // Parse streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let assistantContent = '';
      let assistantMessageId = crypto.randomUUID();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });

        // Process line by line
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta;

            if (delta?.content) {
              assistantContent += delta.content;
              
              // Update or create assistant message
              setMessages((prev) => {
                const lastMessage = prev[prev.length - 1];
                if (lastMessage?.id === assistantMessageId) {
                  return prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: assistantContent }
                      : m
                  );
                }
                return [
                  ...prev,
                  {
                    id: assistantMessageId,
                    role: 'assistant' as const,
                    content: assistantContent,
                    timestamp: new Date(),
                  },
                ];
              });
            }

            // Handle tool calls (if any)
            if (delta?.tool_calls) {
              console.log('Tool calls:', delta.tool_calls);
              // Tool calling would be handled here in future
            }
          } catch (e) {
            // Incomplete JSON, put it back
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        console.log('Remaining buffer:', textBuffer);
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ein unbekannter Fehler ist aufgetreten';
      setError(errorMessage);
      
      toast({
        title: 'Fehler',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsStreaming(false);
    }
  }, [messages, toast]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    setMessages,
    isStreaming,
    error,
    sendMessage,
    clearMessages,
  };
};
