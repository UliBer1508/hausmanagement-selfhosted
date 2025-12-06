import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Mail, Send, X } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface LinenOrderEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
  houseName: string;
  onSendEmail: (emailData: {
    to: string;
    subject: string;
    customText: string;
    orderDetails: string;
  }) => void;
  isLoading?: boolean;
}

const LinenOrderEmailDialog = ({
  open,
  onOpenChange,
  order,
  houseName,
  onSendEmail,
  isLoading = false
}: LinenOrderEmailDialogProps) => {
  const [customText, setCustomText] = useState('');
  // Immer Teuni's E-Mail-Adresse verwenden (Wäscherei-Anbieter)
  const [recipientEmail, setRecipientEmail] = useState(
    order?.service_providers?.contact_email || 'waescheoberpinzgau@gmail.com'
  );
  const [subject, setSubject] = useState(
    `Neue Wäschebestellung #${order?.id?.slice(-8)} - ${houseName}`
  );

  const linenLabels: Record<string, string> = {
    bedding: 'Bettwäsche',
    large_towels: 'Badetücher',
    small_towels: 'Handtücher',
    sauna_towels: 'Saunatücher',
    bath_mats: 'Badematten',
    sink_towels: 'WB-Handtücher',
    kitchen_towels: 'Küchentücher',
    blankets: 'Decken',
    pillow_cases: 'Kopfkissen',
  };

  // Generate order details text
  const generateOrderDetails = () => {
    if (!order) return '';

    const itemsList = Object.entries(order.items || {})
      .map(([itemType, quantity]) => `- ${linenLabels[itemType] || itemType}: ${quantity} Stück`)
      .join('\n');

    const deliveryTypeText = order.delivery_type === 'pickup' ? 'Abholung' : 'Lieferung';
    const deliveryDateTime = order.delivery_date ? 
      `${format(new Date(order.delivery_date), 'dd.MM.yyyy', { locale: de })}${order.delivery_time ? ` um ${order.delivery_time.slice(0, 5)} Uhr` : ''}` : 
      'Nicht angegeben';

    return `
🏠 OBJEKT: ${houseName}
📋 BESTELLNUMMER: #${order.id.slice(-8)}
📅 ERSTELLT AM: ${format(new Date(order.created_at), 'dd.MM.yyyy HH:mm', { locale: de })}

📦 BESTELLTE ARTIKEL:
${itemsList}

📊 GESAMT: ${order.total_items} Artikel

🚚 ${deliveryTypeText.toUpperCase()}:
Datum: ${deliveryDateTime}

${order.bookings ? `👥 BUCHUNGSDETAILS:
Gast: ${order.bookings.guest_name}
Anzahl Gäste: ${order.bookings.number_of_guests}
Check-in: ${format(new Date(order.bookings.check_in), 'dd.MM.yyyy', { locale: de })}
Check-out: ${format(new Date(order.bookings.check_out), 'dd.MM.yyyy', { locale: de })}
${order.bookings.external_booking_id ? `Buchungs-ID: ${order.bookings.external_booking_id}` : ''}
` : ''}${order.notes ? `📝 BEMERKUNGEN:
${order.notes}
` : ''}`.trim();
  };

  const orderDetails = generateOrderDetails();

  const handleSend = () => {
    onSendEmail({
      to: recipientEmail,
      subject,
      customText,
      orderDetails
    });
  };

  const fullEmailText = `${customText ? `${customText}\n\n` : ''}${orderDetails}\n\nBitte bestätigen Sie den Erhalt dieser Bestellung.\n\nMit freundlichen Grüßen\nSteinbock Chalets Team`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            E-Mail an Anbieter senden
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Recipient */}
          <div className="space-y-2">
            <Label htmlFor="recipient">An:</Label>
            <Input
              id="recipient"
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="E-Mail-Adresse des Anbieters"
            />
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">Betreff:</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="E-Mail Betreff"
            />
          </div>

          {/* Custom Text */}
          <div className="space-y-2">
            <Label htmlFor="customText">Persönliche Nachricht (optional):</Label>
            <Textarea
              id="customText"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Liebe/r [Anbieter-Name],

hier ist eine zusätzliche Nachricht..."
              className="min-h-[100px]"
            />
          </div>

          {/* Email Preview */}
          <div className="space-y-2">
            <Label>E-Mail Vorschau:</Label>
            <div className="p-3 bg-muted rounded-lg border max-h-[300px] overflow-y-auto">
              <pre className="text-sm whitespace-pre-wrap font-sans">{fullEmailText}</pre>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            <X className="w-4 h-4 mr-2" />
            Abbrechen
          </Button>
          <Button
            onClick={handleSend}
            disabled={isLoading || !recipientEmail.trim() || !subject.trim()}
          >
            <Send className="w-4 h-4 mr-2" />
            {isLoading ? 'Sende...' : 'E-Mail senden'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LinenOrderEmailDialog;