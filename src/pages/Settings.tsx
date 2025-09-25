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
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16">
                  <AvatarImage src="/placeholder-avatar.jpg" />
                  <AvatarFallback>AM</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h3 className="font-medium">Admin</h3>
                  <p className="text-sm text-muted-foreground">admin@ferienhaus.de</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <div>
                  <Label htmlFor="displayName">Anzeigename</Label>
                  <Input id="displayName" defaultValue="Admin" />
                </div>
                <div>
                  <Label htmlFor="email">E-Mail</Label>
                  <Input id="email" type="email" defaultValue="admin@ferienhaus.de" />
                </div>
                <div>
                  <Label htmlFor="phone">Telefon</Label>
                  <Input id="phone" type="tel" placeholder="+49 123 456789" />
                </div>
              </div>

              <Button className="w-full">
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
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>E-Mail Benachrichtigungen</Label>
                    <p className="text-sm text-muted-foreground">
                      Erhalten Sie Updates per E-Mail
                    </p>
                  </div>
                  <Switch />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Browser Benachrichtigungen</Label>
                    <p className="text-sm text-muted-foreground">
                      Push-Nachrichten im Browser
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Buchungsbenachrichtigungen</Label>
                    <p className="text-sm text-muted-foreground">
                      Bei neuen Buchungen informieren
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Service-Updates</Label>
                    <p className="text-sm text-muted-foreground">
                      Updates zu Reinigung & Wäsche
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>

              <Button variant="outline" className="w-full">
                <Bell className="w-4 h-4 mr-2" />
                Testbenachrichtigung senden
              </Button>
            </CardContent>
          </Card>

          {/* Security Settings */}
          <Card className="task-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Sicherheit
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div>
                  <Label htmlFor="currentPassword">Aktuelles Passwort</Label>
                  <Input id="currentPassword" type="password" />
                </div>
                <div>
                  <Label htmlFor="newPassword">Neues Passwort</Label>
                  <Input id="newPassword" type="password" />
                </div>
                <div>
                  <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
                  <Input id="confirmPassword" type="password" />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Zwei-Faktor-Authentifizierung</Label>
                    <p className="text-sm text-muted-foreground">
                      Zusätzliche Sicherheit für Ihr Konto
                    </p>
                  </div>
                  <Badge variant="outline">Deaktiviert</Badge>
                </div>
              </div>

              <Button variant="outline" className="w-full">
                <Shield className="w-4 h-4 mr-2" />
                Passwort ändern
              </Button>
            </CardContent>
          </Card>

          {/* Appearance Settings */}
          <Card className="task-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-primary" />
                Erscheinungsbild
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div>
                  <Label>Design-Modus</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <Button variant="outline" size="sm">Hell</Button>
                    <Button variant="outline" size="sm">Dunkel</Button>
                  </div>
                </div>

                <div>
                  <Label>Sprache</Label>
                  <div className="grid grid-cols-1 gap-2 mt-2">
                    <Button variant="outline" size="sm" className="justify-start">
                      🇩🇪 Deutsch
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Kompakte Ansicht</Label>
                    <p className="text-sm text-muted-foreground">
                      Mehr Inhalte auf weniger Platz
                    </p>
                  </div>
                  <Switch />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* System Settings */}
          <Card className="task-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" />
                System
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm">Version</span>
                  <Badge variant="secondary">v2.1.0</Badge>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm">Datenbank</span>
                  <Badge variant="outline" className="text-green-600">Verbunden</Badge>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm">Letzte Synchronisation</span>
                  <span className="text-sm text-muted-foreground">Vor 2 Min.</span>
                </div>
              </div>

              <div className="space-y-2">
                <Button variant="outline" size="sm" className="w-full">
                  Cache leeren
                </Button>
                <Button variant="outline" size="sm" className="w-full">
                  Daten exportieren
                </Button>
                <Button variant="outline" size="sm" className="w-full text-red-600 hover:text-red-700">
                  Daten zurücksetzen
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Save All Settings */}
          <Card className="task-card lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="w-5 h-5 text-primary" />
                Aktionen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button className="w-full" size="lg">
                <Save className="w-4 h-4 mr-2" />
                Alle Einstellungen speichern
              </Button>
              
              <div className="text-center pt-4">
                <p className="text-sm text-muted-foreground">
                  Letzte Änderung: Heute, 14:30
                </p>
              </div>

              <Button variant="outline" className="w-full">
                <Database className="w-4 h-4 mr-2" />
                Konfiguration speichern
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default Settings;