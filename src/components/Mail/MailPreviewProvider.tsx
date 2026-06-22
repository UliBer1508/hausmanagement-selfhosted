import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Copy, Mail as MailIcon } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  buildMailtoHref,
  setMailPreviewHandler,
  SENDER_EMAIL,
} from '@/lib/mailtoHelper';

interface MailRecipient {
  email: string;
  guestName?: string;
  checkIn?: string;
  checkOut?: string;
  houseName?: string;
}

interface MailPreview {
  to: string;
  subject: string;
  body: string;
  recipients?: MailRecipient[];
}

interface MailPreviewContextValue {
  showMailPreview: (preview: MailPreview) => void;
}

const MailPreviewContext = createContext<MailPreviewContextValue | null>(null);

export function useMailPreview(): MailPreviewContextValue {
  const ctx = useContext(MailPreviewContext);
  if (!ctx) {
    throw new Error('useMailPreview muss innerhalb von <MailPreviewProvider> verwendet werden.');
  }
  return ctx;
}

export const MailPreviewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<MailPreview>({ to: '', subject: '', body: '' });
  const [sending, setSending] = useState(false);

  const showMailPreview = useCallback((p: MailPreview) => {
    setPreview(p);
    setOpen(true);
  }, []);

  useEffect(() => {
    setMailPreviewHandler(showMailPreview);
    return () => setMailPreviewHandler(null);
  }, [showMailPreview]);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} kopiert`);
    } catch {
      toast.error('Zwischenablage nicht verfügbar');
    }
  };

  const openOutlook = () => {
    window.location.href = buildMailtoHref({ to: preview.to });
  };

  const handleSendViaGmail = async () => {
    setSending(true);
    try {
      const recips: MailRecipient[] = preview.recipients?.length
        ? preview.recipients
        : preview.to
            .split(',')
            .map((e) => ({ email: e.trim() }))
            .filter((r) => r.email);

      const { data, error } = await supabase.functions.invoke('send-guest-email', {
        body: {
          recipients: recips,
          subjectTemplate: preview.subject,
          bodyTemplate: preview.body,
        },
      });

      if (error || data?.error) {
        toast.error('Versand fehlgeschlagen: ' + (error?.message ?? data?.error));
        return;
      }

      const failedCount = data?.failed?.length ?? 0;
      toast.success(
        `${data?.sent ?? 0} E-Mail(s) gesendet` +
          (failedCount ? `, ${failedCount} fehlgeschlagen` : ''),
      );
      setOpen(false);
    } catch (e) {
      toast.error('Versand fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Unbekannter Fehler'));
    } finally {
      setSending(false);
    }
  };

  return (
    <MailPreviewContext.Provider value={{ showMailPreview }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MailIcon className="w-5 h-5" />
              E-Mail vorbereiten
            </DialogTitle>
            <DialogDescription>
              Mit „Per Gmail senden" geht die E-Mail direkt über <strong>{SENDER_EMAIL}</strong> raus.
              Alternativ in Outlook öffnen.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Empfänger</Label>
              <Input value={preview.to} readOnly />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>Betreff</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(preview.subject, 'Betreff')}
                  disabled={!preview.subject}
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  Betreff kopieren
                </Button>
              </div>
              <Input
                value={preview.subject}
                onChange={(e) => setPreview((p) => ({ ...p, subject: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>Nachricht</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(preview.body, 'Text')}
                  disabled={!preview.body}
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  Text kopieren
                </Button>
              </div>
              <Textarea
                value={preview.body}
                onChange={(e) => setPreview((p) => ({ ...p, body: e.target.value }))}
                className="min-h-[260px] max-h-[50vh] font-mono text-sm"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={sending}>
              Schließen
            </Button>
            <Button type="button" variant="outline" onClick={openOutlook} disabled={sending}>
              <MailIcon className="w-4 h-4 mr-2" />
              In Outlook öffnen
            </Button>
            <Button
              type="button"
              onClick={handleSendViaGmail}
              disabled={sending || !preview.subject || !preview.body || !preview.to}
            >
              <MailIcon className="w-4 h-4 mr-2" />
              {sending ? 'Senden …' : 'Per Gmail senden'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MailPreviewContext.Provider>
  );
};

export default MailPreviewProvider;