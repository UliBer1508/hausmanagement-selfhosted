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
import {
  buildMailtoHref,
  setMailPreviewHandler,
  SENDER_EMAIL,
} from '@/lib/mailtoHelper';

interface MailPreview {
  to: string;
  subject: string;
  body: string;
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
              Absender in Outlook auf <strong>{SENDER_EMAIL}</strong> stellen, dann Betreff und Text einfügen.
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
              <Input value={preview.subject} readOnly />
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
                readOnly
                className="min-h-[260px] max-h-[50vh] font-mono text-sm"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Schließen
            </Button>
            <Button type="button" onClick={openOutlook}>
              <MailIcon className="w-4 h-4 mr-2" />
              In Outlook öffnen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MailPreviewContext.Provider>
  );
};

export default MailPreviewProvider;