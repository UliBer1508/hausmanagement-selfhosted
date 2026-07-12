import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Mail as MailIcon } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { setMailPreviewHandler, SENDER_EMAIL } from '@/lib/mailtoHelper';
import { useEmailTemplates } from '@/hooks/useEmailTemplates';

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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [language, setLanguage] = useState<'de' | 'en'>('de');
  const [selectedTemplate, setSelectedTemplate] = useState('');

  const { templates: emailTemplates, isLoading: templatesLoading } = useEmailTemplates(language);

  const showMailPreview = useCallback((p: MailPreview) => {
    setPreview(p);
    setSelectedTemplate('');
    setOpen(true);
  }, []);

  useEffect(() => {
    setSelectedTemplate('');
  }, [language]);

  const handleTemplateChange = (templateKey: string) => {
    setSelectedTemplate(templateKey);
    const t = emailTemplates[templateKey];
    if (t) {
      setPreview((prev) => ({ ...prev, subject: t.subject, body: t.content }));
    }
  };

  useEffect(() => {
    setMailPreviewHandler(showMailPreview);
    return () => setMailPreviewHandler(null);
  }, [showMailPreview]);

  const handleSendViaGmail = async () => {
    setSending(true);
    try {
      const recips: MailRecipient[] = preview.to
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
      setConfirmOpen(false);
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
        <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] sm:w-full z-[300]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MailIcon className="w-5 h-5" />
              E-Mail vorbereiten
            </DialogTitle>
            <DialogDescription>
              Die E-Mail wird direkt über <strong>{SENDER_EMAIL}</strong> versendet.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2 pt-1">
              <Label className="text-muted-foreground">Vorlagensprache:</Label>
              <div className="flex border rounded-md">
                <Button
                  type="button"
                  variant={language === 'de' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setLanguage('de')}
                >
                  🇩🇪 DE
                </Button>
                <Button
                  type="button"
                  variant={language === 'en' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setLanguage('en')}
                >
                  🇬🇧 EN
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Vorlage wählen (optional)</Label>
              <Select
                value={selectedTemplate}
                onValueChange={handleTemplateChange}
                disabled={templatesLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Vorlage auswählen..." />
                </SelectTrigger>
                {/* Der DialogContent hat z-[300] (siehe oben) UND overflow-y-auto.
                    Das Popover muss deshalb:
                      (a) einen HOEHEREN z-Index haben (sonst liegt es dahinter -> unsichtbar)
                      (b) position="popper" nutzen (sonst wird es vom overflow abgeschnitten) */}
                <SelectContent position="popper" className="z-[400]">
                  {Object.entries(emailTemplates).map(([key, t]) => (
                    <SelectItem key={key} value={key}>
                      {t.language === 'en' ? '🇬🇧' : '🇩🇪'} {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Empfänger</Label>
              <Input
                value={preview.to}
                onChange={(e) => setPreview((p) => ({ ...p, to: e.target.value }))}
                placeholder="empfaenger@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Betreff</Label>
              <Input
                value={preview.subject}
                onChange={(e) => setPreview((p) => ({ ...p, subject: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Nachricht</Label>
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
            <Button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={sending || !preview.subject || !preview.body || !preview.to}
            >
              <MailIcon className="w-4 h-4 mr-2" />
              {sending ? 'Senden …' : 'Per Gmail senden'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="z-[310]">
          <AlertDialogHeader>
            <AlertDialogTitle>E-Mail wirklich senden?</AlertDialogTitle>
            <AlertDialogDescription>
              Die E-Mail wird jetzt direkt an <strong>{preview.to}</strong> über{' '}
              <strong>{SENDER_EMAIL}</strong> versendet. Das kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={sending}
              onClick={(e) => {
                e.preventDefault();
                handleSendViaGmail();
              }}
            >
              {sending ? 'Senden …' : 'Ja, senden'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MailPreviewContext.Provider>
  );
};

export default MailPreviewProvider;
