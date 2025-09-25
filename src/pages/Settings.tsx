import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Settings as SettingsIcon, User, Bell, Shield, Palette, Database, Save } from 'lucide-react';
import AppLayout from '@/components/Layout/AppLayout';

const Settings = () => {
  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">Einstellungen</h1>
          <p className="text-muted-foreground mt-2">
            Verwalten Sie Ihre Kontoeinstellungen und Systemkonfiguration
          </p>
        </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Profile Settings */}
            <Card className="task-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  Profil
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-4">
                  <Avatar className="w-16 h-16">
                    <AvatarImage src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face" />
                    <AvatarFallback className="cleaning-gradient text-white text-lg">
                      UB
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold text-lg">Uli Berresheim</h3>
                    <p className="text-sm text-muted-foreground">Administrator</p>
                    <Badge className="bg-green-100 text-green-700 mt-1">Aktiv</Badge>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" defaultValue="Uli Berresheim" />
                  </div>
                  <div>
                    <Label htmlFor="email">E-Mail</Label>
                    <Input id="email" type="email" defaultValue="uli@ferienhaus-manager.de" />
                  </div>
                  <div>
                    <Label htmlFor="phone">Telefon</Label>
                    <Input id="phone" defaultValue="+49 123 456789" />
                  </div>
                </div>

                <Button className="w-full cleaning-gradient">
                  <Save className="w-4 h-4 mr-2" />
                  Profil speichern
                </Button>
              </CardContent>
            </Card>

            {/* Notification Settings */}
            <Card className="task-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-primary" />
                  Benachrichtigungen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="booking-notifications">Neue Buchungen</Label>
                    <p className="text-sm text-muted-foreground">
                      E-Mail bei neuen Buchungen erhalten
                    </p>
                  </div>
                  <Switch id="booking-notifications" defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="task-notifications">Aufgaben-Updates</Label>
                    <p className="text-sm text-muted-foreground">
                      Benachrichtigungen für Aufgabenstatus
                    </p>
                  </div>
                  <Switch id="task-notifications" defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="provider-notifications">Provider-Meldungen</Label>
                    <p className="text-sm text-muted-foreground">
                      Updates von Reinigung und Wäscherei
                    </p>
                  </div>
                  <Switch id="provider-notifications" />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="system-notifications">System-Updates</Label>
                    <p className="text-sm text-muted-foreground">
                      Wichtige Systembenachrichtigungen
                    </p>
                  </div>
                  <Switch id="system-notifications" defaultChecked />
                </div>
              </CardContent>
            </Card>

            {/* System Settings */}
            <Card className="task-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SettingsIcon className="w-5 h-5 text-primary" />
                  System
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="language">Sprache</Label>
                  <select className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md">
                    <option value="de">Deutsch</option>
                    <option value="en">English</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="timezone">Zeitzone</Label>
                  <select className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md">
                    <option value="Europe/Berlin">Europa/Berlin</option>
                    <option value="Europe/Vienna">Europa/Wien</option>
                    <option value="Europe/Zurich">Europa/Zürich</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="currency">Währung</Label>
                  <select className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md">
                    <option value="EUR">Euro (€)</option>
                    <option value="USD">US Dollar ($)</option>
                    <option value="CHF">Schweizer Franken (CHF)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="dark-mode">Dark Mode</Label>
                    <p className="text-sm text-muted-foreground">
                      Dunkles Design verwenden
                    </p>
                  </div>
                  <Switch id="dark-mode" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Provider Configuration */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="service-cleaning">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-700">
                  <Shield className="w-5 h-5" />
                  Reinigungsservice Konfiguration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="cleaning-provider">Provider Name</Label>
                  <Input id="cleaning-provider" defaultValue="Amela Reinigungsservice" />
                </div>
                <div>
                  <Label htmlFor="cleaning-email">E-Mail</Label>
                  <Input id="cleaning-email" type="email" defaultValue="amela@reinigung.de" />
                </div>
                <div>
                  <Label htmlFor="cleaning-phone">Telefon</Label>
                  <Input id="cleaning-phone" defaultValue="+49 123 456789" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="cleaning-active">Service aktiviert</Label>
                    <p className="text-sm text-muted-foreground">
                      Reinigungsservice verfügbar
                    </p>
                  </div>
                  <Switch id="cleaning-active" defaultChecked />
                </div>
                <Button className="w-full btn-cleaning">
                  Konfiguration speichern
                </Button>
              </CardContent>
            </Card>

            <Card className="service-laundry">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-700">
                  <Database className="w-5 h-5" />
                  Wäscherei Konfiguration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="laundry-provider">Provider Name</Label>
                  <Input id="laundry-provider" defaultValue="Teuni Wäscheservice" />
                </div>
                <div>
                  <Label htmlFor="laundry-email">E-Mail</Label>
                  <Input id="laundry-email" type="email" defaultValue="teuni@waescherei.de" />
                </div>
                <div>
                  <Label htmlFor="laundry-phone">Telefon</Label>
                  <Input id="laundry-phone" defaultValue="+49 987 654321" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="laundry-active">Service aktiviert</Label>
                    <p className="text-sm text-muted-foreground">
                      Wäscherei-Service verfügbar
                    </p>
                  </div>
                  <Switch id="laundry-active" defaultChecked />
                </div>
                <Button className="w-full btn-laundry">
                  Konfiguration speichern
                </Button>
              </CardContent>
            </Card>
        </div>
      </AppLayout>
    );
  };

export default Settings;