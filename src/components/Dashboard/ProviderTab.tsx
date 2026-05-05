import { Building2, Sparkles, Shirt, Users, FileSpreadsheet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export interface PortalProvider {
  id: string;
  name: string;
  service_type: string;
  portal_token: string;
  [key: string]: any;
}

interface Props {
  portalProviders: PortalProvider[] | undefined;
  onOpenProviderManagement: () => void;
  onOpenBilling: (provider: PortalProvider) => void;
}

function getServiceIcon(serviceType: string) {
  switch (serviceType) {
    case 'cleaning':
      return { icon: Sparkles, color: 'text-blue-500' };
    case 'laundry':
      return { icon: Shirt, color: 'text-purple-500' };
    default:
      return { icon: Building2, color: 'text-gray-500' };
  }
}

export default function ProviderTab({ portalProviders, onOpenProviderManagement, onOpenBilling }: Props) {
  return (
    <div className="space-y-6">
      <div className="text-center py-8">
        <Users className="w-12 h-12 mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Service Provider Portale</h3>
        <p className="text-gray-600 mb-6">Zugang zu den externen Provider-Webapps</p>

        <div className="flex justify-center">
          <Button onClick={onOpenProviderManagement} variant="outline" className="gap-2">
            <Building2 className="w-4 h-4" />
            Provider Verwalten
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {portalProviders?.length === 0 && (
          <p className="text-center text-muted-foreground col-span-full">
            Keine Provider mit Portal-Zugang konfiguriert.
          </p>
        )}

        {portalProviders?.map((provider) => {
          const { icon: Icon, color } = getServiceIcon(provider.service_type);
          const displayName =
            provider.service_type === 'cleaning'
              ? `${provider.name} Cleaning Portal`
              : `${provider.name} Laundry Portal`;
          const description =
            provider.service_type === 'cleaning'
              ? 'Reinigungsaufträge verwalten und bearbeiten'
              : 'Wäscheaufträge verwalten und bearbeiten';

          return (
            <Card key={provider.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2">
                  <Icon className={`w-5 h-5 ${color}`} />
                  {displayName}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <p className="text-sm text-gray-600">{description}</p>
                <Button className="w-full" onClick={() => window.open(provider.portal_token, '_blank')}>
                  Portal öffnen
                </Button>
                <Button
                  variant="outline"
                  className="w-full bg-green-600 text-white border-green-600 hover:bg-green-700 hover:text-white"
                  onClick={() => onOpenBilling(provider)}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Abrechnung
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
