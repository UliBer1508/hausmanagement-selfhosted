import { useState, useEffect } from 'react';
import { Mail, CreditCard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useEmailTemplates } from '@/hooks/useEmailTemplates';
import { openEmail } from '@/lib/mailtoHelper';
import { supabase } from '@/integrations/supabase/client';
import { logCommunication } from '@/hooks/useGuestCommunications';
import { replacePlaceholders } from '@/lib/emailPlaceholders';

interface Guest {
  guest_name: string;
  guest_email?: string | null;
  guest_phone?: string | null;
}

interface GuestEmailDialogProps {
  guest: Guest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTemplate?: string; // Pre-select a template (e.g., 'inquiry_rejected')
  templatePlaceholders?: Record<string, string>; // Additional placeholders for template
  bookingId?: string; // For inquiry_confirmed template: enables payment-link generation
}

const GuestEmailDialog = ({ 
  guest, 
  open, 
  onOpenChange, 
  defaultTemplate,
  templatePlaceholders = {},
  bookingId,
}: GuestEmailDialogProps) => {
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [language, setLanguage] = useState<'de' | 'en'>('de');
  const [openChargesTotal, setOpenChargesTotal] = useState<number>(0);
  const [hasOpenCharges, setHasOpenCharges] = useState(false);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [paymentLinkInserted, setPaymentLinkInserted] = useState(false);
  const { toast } = useToast();
  
  // Load email templates from database
  const { templates: emailTemplates, isLoading: templatesLoading } = useEmailTemplates(language);

  const handleTemplateChange = (templateKey: string) => {
    setSelectedTemplate(templateKey);
    const template = emailTemplates[templateKey];
    if (template) {
      setCustomSubject(template.subject);
      setCustomMessage(template.content);
    }
  };

  // Auto-select default template when templates are loaded
  useEffect(() => {
    if (defaultTemplate && emailTemplates[defaultTemplate] && !selectedTemplate) {
      handleTemplateChange(defaultTemplate);
    }
  }, [defaultTemplate, emailTemplates, selectedTemplate]);

  // Lade offene Forderungen, wenn Dialog für inquiry_confirmed mit Buchung geöffnet ist
  useEffect(() => {
    const loadCharges = async () => {
      if (!open || defaultTemplate !== 'inquiry_confirmed' || !bookingId) {
        setHasOpenCharges(false);
        setOpenChargesTotal(0);
        return;
      }
      const { data, error } = await supabase
        .from('booking_charges')
        .select('amount, payment_id')
        .eq('booking_id', bookingId)
        .eq('status', 'open')
        .is('payment_id', null);
      if (error) {
        console.error('Fehler beim Laden offener Forderungen:', error);
        return;
      }
      const total = (data || []).reduce(
        (sum, c: any) => sum + Number(c.amount || 0),
        0
      );
      setHasOpenCharges((data?.length || 0) > 0);
      setOpenChargesTotal(total);
    };
    loadCharges();
    setPaymentLinkInserted(false);
  }, [open, defaultTemplate, bookingId]);

  const handleGeneratePaymentLink = async () => {
    if (!bookingId) return;
    setIsGeneratingLink(true);
    try {
      // 1) Prüfen, ob bereits ein aktiver (unbezahlter) Link existiert
      const { data: existingCharges, error: existingErr } = await supabase
        .from('booking_charges')
        .select('payment_id')
        .eq('booking_id', bookingId)
        .not('payment_id', 'is', null);
      if (existingErr) throw existingErr;

      let paymentUrl: string | null = null;
      const paymentIds = Array.from(
        new Set((existingCharges || []).map((c: any) => c.payment_id).filter(Boolean))
      );
      if (paymentIds.length > 0) {
        const { data: payments } = await supabase
          .from('payments')
          .select('payment_url, status')
          .in('id', paymentIds)
          .neq('status', 'paid')
          .order('created_at', { ascending: false })
          .limit(1);
        if (payments && payments.length > 0 && payments[0].payment_url) {
          paymentUrl = payments[0].payment_url;
        }
      }

      // 2) Sonst neuen Link über Edge Function erzeugen
      if (!paymentUrl) {
        const { data, error } = await supabase.functions.invoke('create-payment-link', {
          body: { booking_id: bookingId },
        });
        if (error) throw error;
        paymentUrl = data?.payment_url || data?.url || null;
        if (!paymentUrl) {
          throw new Error('Kein Zahlungslink von der Edge Function erhalten');
        }
      }

      // 3) An den E-Mail-Text anhängen
      const suffix =
        `\n\nZahlungslink / Payment link: ${paymentUrl}\n\n` +
        `Bitte schließen Sie die Buchung über diesen Link ab. / ` +
        `Please complete your booking via this link.`;
      setCustomMessage((prev) => (prev || '') + suffix);
      setPaymentLinkInserted(true);
      toast({
        title: 'Zahlungslink eingefügt',
        description: 'Der Link wurde an den E-Mail-Text angehängt.',
      });
    } catch (e: any) {
      console.error('Zahlungslink-Fehler:', e);
      toast({
        title: 'Fehler',
        description: e.message || 'Zahlungslink konnte nicht erstellt werden.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const replaceTemplatePlaceholders = (text: string): string => {
    let result = replacePlaceholders(text, { guestName: guest.guest_name || 'Gast' });

    // Replace additional custom placeholders
    Object.entries(templatePlaceholders).forEach(([key, value]) => {
      result = result.replace(new RegExp(`{${key}}`, 'g'), value);
    });

    return result;
  };

  const handleOpenInMailClient = async () => {
    if (!guest.guest_email) {
      toast({
        title: 'Keine E-Mail-Adresse',
        description: 'Dieser Gast hat keine E-Mail-Adresse hinterlegt.',
        variant: 'destructive',
      });
      return;
    }

    if (!customSubject || !customMessage) {
      toast({
        title: 'Fehlende Informationen',
        description: 'Bitte füllen Sie Betreff und Nachricht aus.',
        variant: 'destructive',
      });
      return;
    }

    const processedSubject = replaceTemplatePlaceholders(customSubject);
    const processedMessage = replaceTemplatePlaceholders(customMessage);

    await openEmail({
      to: guest.guest_email,
      subject: processedSubject,
      text: processedMessage,
    });

    if (guest.guest_email) {
      void logCommunication({
        guestEmail: guest.guest_email,
        guestName: guest.guest_name,
        direction: 'outbound',
        subject: processedSubject,
        body: processedMessage,
      });
    }

    toast({
      title: 'E-Mail vorbereitet',
      description: 'Vorschaufenster geöffnet — Betreff und Text prüfen, dann ‚Per Gmail senden'.',
    });
    
    onOpenChange(false);
    setSelectedTemplate('');
    setCustomSubject('');
    setCustomMessage('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>E-Mail an {guest.guest_name} senden</DialogTitle>
          <DialogDescription>
            Versenden Sie eine E-Mail an diesen Gast
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-4 pt-4">
          <Label>Vorlagensprache:</Label>
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

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="email-to">An</Label>
            <Input
              id="email-to"
              value={guest.guest_email || 'Keine E-Mail-Adresse'}
              disabled
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-select">Vorlage wählen (optional)</Label>
            <Select value={selectedTemplate} onValueChange={handleTemplateChange} disabled={templatesLoading}>
              <SelectTrigger>
                <SelectValue placeholder="Vorlage auswählen..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(emailTemplates).map(([key, template]) => (
                  <SelectItem key={key} value={key}>
                    {template.language === 'en' ? '🇬🇧' : '🇩🇪'} {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-subject">Betreff</Label>
            <Input
              id="email-subject"
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
              placeholder="E-Mail Betreff"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-message">Nachricht</Label>
            <Textarea
              id="email-message"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Ihre Nachricht..."
              className="min-h-[200px]"
            />
            <p className="text-xs text-muted-foreground">
              Tipp: Verwenden Sie {'{guestName}'} als Platzhalter für den Namen des Gastes
            </p>
          </div>

          {defaultTemplate === 'inquiry_confirmed' && bookingId && hasOpenCharges && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
              <p className="text-sm text-amber-900 dark:text-amber-200">
                Offene Forderungen: <strong>{openChargesTotal.toFixed(2)} EUR</strong>
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGeneratePaymentLink}
                disabled={isGeneratingLink || paymentLinkInserted}
              >
                {isGeneratingLink ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4 mr-2" />
                )}
                {paymentLinkInserted
                  ? 'Zahlungslink eingefügt ✓'
                  : 'Zahlungslink erstellen & in E-Mail einfügen'}
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button 
            onClick={handleOpenInMailClient} 
            disabled={!guest.guest_email}
          >
            <Mail className="h-4 w-4 mr-2" />
            Im E-Mail-Client öffnen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GuestEmailDialog;
