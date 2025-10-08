import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sparkles, Droplets, Bell, Settings } from 'lucide-react';
import { Provider } from '@/types';

interface ServiceHeaderProps {
  selectedService: 'cleaning' | 'laundry';
  onServiceChange: (service: 'cleaning' | 'laundry') => void;
  provider?: Provider;
}

const ServiceHeader = ({ selectedService, onServiceChange, provider }: ServiceHeaderProps) => {
  
  const serviceConfig = {
    cleaning: {
      title: 'Reinigungsportal',
      provider: 'Amela Reinigungsservice',
      color: 'from-primary-blue to-primary-blue',
      bgColor: 'bg-primary-blue/10',
      icon: Sparkles
    },
    laundry: {
      title: 'Wäscheportal',
      provider: 'Teuni Wäscheservice',
      color: 'from-primary-green to-primary-green',
      bgColor: 'bg-primary-green/10',
      icon: Droplets
    }
  };

  const currentConfig = serviceConfig[selectedService];
  const ServiceIcon = currentConfig.icon;

  return (
    <>
    <Card className="p-6 mb-6 card-glow">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
      <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl ${currentConfig.bgColor}`}>
            <ServiceIcon className={`w-6 h-6 bg-gradient-to-r ${currentConfig.color} bg-clip-text text-transparent`} />
          </div>
          
          <div>
            <h1 className="text-2xl font-bold text-foreground">{currentConfig.title}</h1>
            <p className="text-muted-foreground">{currentConfig.provider}</p>
          </div>
          
          <Badge className="bg-primary-green/20 text-primary-green">
            Online
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          {/* Service Toggle */}
          <div className="flex items-center bg-accent/50 rounded-lg p-1">
            <Button
              variant={selectedService === 'cleaning' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onServiceChange('cleaning')}
              className={selectedService === 'cleaning' ? 'btn-gradient text-white' : ''}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Reinigung
            </Button>
            <Button
              variant={selectedService === 'laundry' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onServiceChange('laundry')}
              className={selectedService === 'laundry' ? 'bg-primary-green text-white hover:bg-primary-green/90' : ''}
            >
              <Droplets className="w-4 h-4 mr-2" />
              Wäscherei
            </Button>
          </div>

          {/* User Actions */}
          <Button variant="ghost" size="sm">
            <Bell className="w-4 h-4" />
          </Button>
          
          <Button variant="ghost" size="sm">
            <Settings className="w-4 h-4" />
          </Button>

          {/* User Avatar */}
          <Avatar className="w-8 h-8">
            <AvatarImage src={provider?.avatar} />
            <AvatarFallback className="bg-gradient-to-br from-primary-blue to-primary-purple text-white text-sm">
              {provider?.name?.split(' ').map(n => n[0]).join('') || 'P'}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </Card>
    </>
  );
};

export default ServiceHeader;