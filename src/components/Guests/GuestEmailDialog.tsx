import { useState, useEffect } from 'react';
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
import { supabase } from '@/integrations/supabase/client';
import { useEmailTemplates } from '@/hooks/useEmailTemplates';

interface Guest {
  guest_name: string;
  guest_email?: string | null;
  guest_phone?: string | null;
}

interface GuestEmailDialogProps {
  guest: Guest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GuestEmailDialog = ({ guest, open, onOpenChange }: GuestEmailDialogProps) => {
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  
  // Load email templates from database
  const { templates: emailTemplates, isLoading: templatesLoading } = useEmailTemplates();

  const handleTemplateChange = (templateKey: string) => {
    setSelectedTemplate(templateKey);
    const template = emailTemplates[templateKey];
    if (template) {
      setCustomSubject(template.subject);
      setCustomMessage(template.content);
    }
  };

  const replaceTemplatePlaceholders = (text: string): string => {
    return text
      .replace(/{guestName}/g, guest.guest_name || 'Gast')
      .replace(/{GUEST_NAME}/g, guest.guest_name || 'Gast');
  };

  const handleSendEmail = async () => {
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

    setIsLoading(true);

    try {
      const processedSubject = replaceTemplatePlaceholders(customSubject);
      const processedMessage = replaceTemplatePlaceholders(customMessage);

      const { data, error } = await supabase.functions.invoke('send-gmail', {
        body: {
          to: guest.guest_email,
          subject: processedSubject,
          text: processedMessage,
          html: processedMessage.replace(/\n/g, '<br>'),
        },
      });

      if (error) throw error;

      toast({
        title: 'E-Mail versendet',
        description: `Die E-Mail wurde erfolgreich an ${guest.guest_name} gesendet.`,
      });

      onOpenChange(false);
      setSelectedTemplate('');
      setCustomSubject('');
      setCustomMessage('');
    } catch (error) {
      console.error('Error sending email:', error);
      toast({
        title: 'Fehler beim Senden',
        description: 'Die E-Mail konnte nicht gesendet werden. Bitte versuchen Sie es erneut.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
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
                    {template.name}
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
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button 
            onClick={handleSendEmail} 
            disabled={!guest.guest_email || isLoading}
          >
            {isLoading ? 'Wird gesendet...' : 'E-Mail senden'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GuestEmailDialog;
