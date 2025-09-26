import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Send, Mail } from 'lucide-react';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  content: string;
}

interface Guest {
  guest_name: string;
  guest_email?: string;
  guest_phone?: string;
}

interface GuestEmailDialogProps {
  guest: Guest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GuestEmailDialog = ({ guest, open, onOpenChange }: GuestEmailDialogProps) => {
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Load email templates from localStorage (same as GuestCommunication)
  const emailTemplates: Record<string, EmailTemplate> = (() => {
    const saved = localStorage.getItem('steinbock_email_templates');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (error) {
        console.error('Failed to load saved templates:', error);
      }
    }
    
    // Default templates
    return {
      welcome: {
        id: 'welcome',
        name: 'Willkommens-E-Mail',
        subject: 'Willkommen - Wir freuen uns auf Sie!',
        content: `Liebe/r {guestName},

vielen Dank für Ihre Buchung! Wir freuen uns sehr, Sie bei uns begrüßen zu dürfen.

Falls Sie Fragen haben, können Sie uns gerne kontaktieren.

Herzliche Grüße
Ihr Steinbock Chalets Team`
      },
      reminder: {
        id: 'reminder',
        name: 'Check-in Erinnerung',
        subject: 'Ihr Aufenthalt beginnt bald!',
        content: `Liebe/r {guestName},

Ihr Aufenthalt bei uns beginnt in Kürze!

Wichtige Hinweise:
- Check-in Zeit: ab 15:00 Uhr
- Parkplätze sind verfügbar
- Bei Fragen: +43 123 456 789

Wir freuen uns auf Sie!
Ihr Steinbock Chalets Team`
      },
      feedback: {
        id: 'feedback',
        name: 'Feedback-Anfrage',
        subject: 'Wie war Ihr Aufenthalt bei uns?',
        content: `Liebe/r {guestName},

wir hoffen, Sie hatten einen wunderschönen Aufenthalt bei uns!

Ihre Meinung ist uns sehr wichtig. Würden Sie uns kurz mitteilen, wie Ihnen Ihr Aufenthalt gefallen hat?

Über eine Bewertung würden wir uns sehr freuen.

Vielen Dank und bis bald!
Ihr Steinbock Chalets Team`
      },
      general: {
        id: 'general',
        name: 'Allgemeine Nachricht',
        subject: 'Nachricht von Steinbock Chalets',
        content: `Liebe/r {guestName},

[Ihre persönliche Nachricht hier]

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Herzliche Grüße
Ihr Steinbock Chalets Team`
      }
    };
  })();

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    if (templateId && emailTemplates[templateId]) {
      const template = emailTemplates[templateId];
      setCustomSubject(template.subject);
      setCustomMessage(template.content);
    } else {
      setCustomSubject('');
      setCustomMessage('');
    }
  };

  const replaceTemplatePlaceholders = (text: string, guestName: string) => {
    return text
      .replace(/\{guestName\}/g, guestName)
      .replace(/\{guest_name\}/g, guestName)
      .replace(/\{GUEST_NAME\}/g, guestName);
  };

  const handleSendEmail = async () => {
    if (!guest?.guest_email) {
      toast({
        title: "Fehler",
        description: "Keine E-Mail-Adresse für diesen Gast verfügbar.",
        variant: "destructive"
      });
      return;
    }

    if (!customSubject || !customMessage) {
      toast({
        title: "Fehler", 
        description: "Bitte füllen Sie Betreff und Nachricht aus.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      const processedSubject = replaceTemplatePlaceholders(customSubject, guest.guest_name);
      const processedContent = replaceTemplatePlaceholders(customMessage, guest.guest_name);

      const { data, error } = await supabase.functions.invoke('send-gmail', {
        body: {
          to: [guest.guest_email],
          subject: processedSubject,
          html: processedContent.replace(/\n/g, '<br>'),
          guestName: guest.guest_name
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "E-Mail gesendet",
          description: `Nachricht wurde erfolgreich an ${guest.guest_name} gesendet.`
        });
        onOpenChange(false);
        // Reset form
        setSelectedTemplate('');
        setCustomSubject('');
        setCustomMessage('');
      } else {
        throw new Error(data?.error || 'Unbekannter Fehler');
      }
    } catch (error) {
      console.error('Error sending email:', error);
      toast({
        title: "Fehler beim Senden",
        description: "Die E-Mail konnte nicht gesendet werden. Bitte versuchen Sie es später erneut.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            E-Mail an {guest?.guest_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>An:</Label>
            <Input 
              value={guest?.guest_email || ''} 
              disabled 
              className="mt-1"
            />
          </div>

          <div>
            <Label>E-Mail Vorlage auswählen</Label>
            <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Vorlage auswählen oder eigene Nachricht schreiben..." />
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

          <div>
            <Label>Betreff</Label>
            <Input
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
              placeholder="E-Mail Betreff eingeben..."
              className="mt-1"
            />
          </div>

          <div>
            <Label>Nachricht</Label>
            <Textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Ihre Nachricht hier eingeben..."
              rows={12}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {'{guestName}'} wird automatisch durch "{guest?.guest_name}" ersetzt
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Abbrechen
            </Button>
            <Button 
              onClick={handleSendEmail}
              disabled={!guest?.guest_email || isLoading}
            >
              <Send className="w-4 h-4 mr-2" />
              {isLoading ? 'Wird gesendet...' : 'E-Mail senden'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GuestEmailDialog;