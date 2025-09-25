import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageCircle, Mail, Phone, Send } from 'lucide-react';

const GuestCommunication = () => {
  return (
    <div className="space-y-6">
      <div className="text-center py-12">
        <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <MessageCircle className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Kommunikation wird erweitert</h3>
        <p className="text-muted-foreground max-w-md mx-auto">
          E-Mail-Templates, SMS-Versand und automatisierte 
          Gäste-Kommunikation sind in Planung.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">E-Mail Templates</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Bald verfügbar</div>
            <p className="text-xs text-muted-foreground">
              Vorgefertigte E-Mail-Vorlagen
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SMS-Versand</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Bald verfügbar</div>
            <p className="text-xs text-muted-foreground">
              Direkte SMS an Gäste
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Automatisierung</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Bald verfügbar</div>
            <p className="text-xs text-muted-foreground">
              Automatische Nachrichten
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GuestCommunication;