import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  User, Bell, FileBarChart, Mail, Shield, Palette, Database,
  Settings, Save, Send, Clock, CheckCircle,
} from 'lucide-react';
import RatingReminderSettingsCard from '@/components/Settings/RatingReminderSettingsCard';
import GuestImportCard from '@/components/Settings/GuestImportCard';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ProfileSettings {
  user_name: string;
  company_name: string;
}
interface EmailSettings {
  email: string;
  display_name: string;
}
interface AppearanceSettings {
  theme: string;
  language: string;
  compact_view: boolean;
}
interface NotificationSettings {
  emailNotifications: boolean;
  browserNotifications: boolean;
  bookingNotifications: boolean;
  serviceUpdates: boolean;
}

interface SettingsTabProps {
  localProfileSettings: ProfileSettings;
  setLocalProfileSettings: React.Dispatch<React.SetStateAction<ProfileSettings>>;
  saveProfileSettings: () => void | Promise<void>;
  isSavingProfile: boolean;

  notificationSettings: NotificationSettings;
  setNotificationSettings: React.Dispatch<React.SetStateAction<NotificationSettings>>;
  saveNotificationSettings: () => void | Promise<void>;
  sendTestNotification: () => void;

  localEmailSettings: EmailSettings;
  setLocalEmailSettings: React.Dispatch<React.SetStateAction<EmailSettings>>;
  handleSaveEmailSettings: () => void | Promise<void>;
  isSavingEmail: boolean;

  localAppearanceSettings: AppearanceSettings;
  handleSaveAppearanceSettings: (settings: AppearanceSettings) => void | Promise<void>;

  handleShowUsageReport: () => void | Promise<void>;
  saveAllSettings: () => void | Promise<void>;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  localProfileSettings, setLocalProfileSettings, saveProfileSettings, isSavingProfile,
  notificationSettings, setNotificationSettings, saveNotificationSettings, sendTestNotification,
  localEmailSettings, setLocalEmailSettings, handleSaveEmailSettings, isSavingEmail,
  localAppearanceSettings, handleSaveAppearanceSettings,
  handleShowUsageReport, saveAllSettings,
}) => {
  const { toast } = useToast();
  const [preferLocalClient, setPreferLocalClient] = React.useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold gradient-text">Einstellungen</h1>
        <p className="text-muted-foreground mt-2">
          Verwalten Sie Ihre Kontoeinstellungen und Systemkonfiguration
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profil */}
        <Card>
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
                <AvatarFallback className="bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 text-xl font-semibold">
                  {localProfileSettings.user_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 className="font-medium">{localProfileSettings.user_name}</h3>
                <p className="text-sm text-muted-foreground">{localProfileSettings.company_name}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="userName">Benutzername</Label>
                <Input
                  id="userName"
                  value={localProfileSettings.user_name}
                  onChange={(e) => setLocalProfileSettings(prev => ({ ...prev, user_name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="companyName">Firmenname</Label>
                <Input
                  id="companyName"
                  value={localProfileSettings.company_name}
                  onChange={(e) => setLocalProfileSettings(prev => ({ ...prev, company_name: e.target.value }))}
                />
              </div>
            </div>

            <Button className="w-full" onClick={saveProfileSettings} disabled={isSavingProfile}>
              <Save className="w-4 h-4 mr-2" />
              {isSavingProfile ? 'Speichern...' : 'Profil speichern'}
            </Button>
          </CardContent>
        </Card>

        {/* Benachrichtigungen */}
        <Card>
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
                  <p className="text-sm text-muted-foreground">Erhalten Sie Updates per E-Mail</p>
                </div>
                <Switch
                  checked={notificationSettings.emailNotifications}
                  onCheckedChange={(checked) => setNotificationSettings(prev => ({ ...prev, emailNotifications: checked }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Browser Benachrichtigungen</Label>
                  <p className="text-sm text-muted-foreground">Push-Nachrichten im Browser</p>
                </div>
                <Switch
                  checked={notificationSettings.browserNotifications}
                  onCheckedChange={(checked) => setNotificationSettings(prev => ({ ...prev, browserNotifications: checked }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Buchungsbenachrichtigungen</Label>
                  <p className="text-sm text-muted-foreground">Bei neuen Buchungen informieren</p>
                </div>
                <Switch
                  checked={notificationSettings.bookingNotifications}
                  onCheckedChange={(checked) => setNotificationSettings(prev => ({ ...prev, bookingNotifications: checked }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Service-Updates</Label>
                  <p className="text-sm text-muted-foreground">Updates zu Reinigung & Wäsche</p>
                </div>
                <Switch
                  checked={notificationSettings.serviceUpdates}
                  onCheckedChange={(checked) => setNotificationSettings(prev => ({ ...prev, serviceUpdates: checked }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Button variant="outline" className="w-full" onClick={sendTestNotification}>
                <Bell className="w-4 h-4 mr-2" />
                Testbenachrichtigung senden
              </Button>
              <Button className="w-full" onClick={saveNotificationSettings}>
                <Save className="w-4 h-4 mr-2" />
                Benachrichtigungen speichern
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Nutzungsberichte */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileBarChart className="w-5 h-5 text-primary" />
              Nutzungsberichte
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Detaillierte Analyse der Supabase-Nutzung mit Empfehlungen
              </p>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Automatisch jeden Montag um 9:00 Uhr</span>
              </div>
            </div>

            <Button className="w-full" onClick={handleShowUsageReport}>
              <FileBarChart className="w-4 h-4 mr-2" />
              Bericht anzeigen
            </Button>
          </CardContent>
        </Card>

        {/* E-Mail-Versand */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              E-Mail-Versand
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <Label htmlFor="emailAddress">Absender-Adresse</Label>
                <Input
                  id="emailAddress"
                  type="email"
                  value={localEmailSettings.email}
                  onChange={(e) => setLocalEmailSettings(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="emailDisplayName">Anzeigename</Label>
                <Input
                  id="emailDisplayName"
                  value={localEmailSettings.display_name}
                  onChange={(e) => setLocalEmailSettings(prev => ({ ...prev, display_name: e.target.value }))}
                />
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium">Status</span>
                <Badge variant="outline" className="text-green-600">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  {preferLocalClient ? 'Lokaler E-Mail-Client' : 'Gmail (Web)'}
                </Badge>
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label>Im lokalen Client (Outlook) öffnen</Label>
                  <p className="text-sm text-muted-foreground">
                    Aus = Gmail im Browser (Absender automatisch korrekt)
                  </p>
                </div>
                <Switch
                  checked={preferLocalClient}
                  onCheckedChange={setPreferLocalClient}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {preferLocalClient
                ? 'Alle E-Mails öffnen sich als Entwurf in Ihrem lokal installierten E-Mail-Client (z. B. Outlook). Der Absender muss ggf. manuell gewechselt werden.'
                : 'Alle E-Mails öffnen sich als Entwurf in Gmail im Browser. Absender ist automatisch steinbockchalets@gmail.com.'}
            </p>

            <div className="space-y-2">
              <Button className="w-full" onClick={handleSaveEmailSettings} disabled={isSavingEmail}>
                <Save className="w-4 h-4 mr-2" />
                {isSavingEmail ? 'Speichern...' : 'E-Mail-Einstellungen speichern'}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={async () => {
                  const { openEmail } = await import('@/lib/mailtoHelper');
                  openEmail({
                    to: localEmailSettings.email,
                    subject: 'Test-E-Mail vom Ferienhaus Management',
                    text: `Dies ist eine Test-E-Mail.\n\nErstellt am: ${new Date().toLocaleString('de-DE')}\n\nWenn sich der E-Mail-Client geöffnet hat, funktioniert die Integration korrekt.\n\nMit freundlichen Grüßen\n${localEmailSettings.display_name} System`,
                    preferLocalClient,
                  });
                  toast({
                    title: 'Test-Entwurf geöffnet',
                    description: preferLocalClient
                      ? 'Ein Test-Entwurf wurde in Ihrem lokalen E-Mail-Client geöffnet.'
                      : 'Ein Test-Entwurf wurde in Gmail (Web) geöffnet.',
                  });
                }}
              >
                <Send className="w-4 h-4 mr-2" />
                Test-Entwurf öffnen
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Sicherheit */}
        <Card>
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
                  <p className="text-sm text-muted-foreground">Zusätzliche Sicherheit für Ihr Konto</p>
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

        {/* Erscheinungsbild */}
        <Card>
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
                  <Button
                    variant={localAppearanceSettings.theme === 'light' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleSaveAppearanceSettings({ ...localAppearanceSettings, theme: 'light' })}
                  >
                    Hell
                  </Button>
                  <Button
                    variant={localAppearanceSettings.theme === 'dark' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleSaveAppearanceSettings({ ...localAppearanceSettings, theme: 'dark' })}
                  >
                    Dunkel
                  </Button>
                </div>
              </div>

              <div>
                <Label>Sprache</Label>
                <Select
                  value={localAppearanceSettings.language}
                  onValueChange={(value) => handleSaveAppearanceSettings({ ...localAppearanceSettings, language: value })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Sprache auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="de">🇩🇪 Deutsch</SelectItem>
                    <SelectItem value="en">🇬🇧 English</SelectItem>
                    <SelectItem value="fr">🇫🇷 Français</SelectItem>
                    <SelectItem value="it">🇮🇹 Italiano</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Kompakte Ansicht</Label>
                  <p className="text-sm text-muted-foreground">Mehr Inhalte auf weniger Platz</p>
                </div>
                <Switch
                  checked={localAppearanceSettings.compact_view}
                  onCheckedChange={(checked) => handleSaveAppearanceSettings({ ...localAppearanceSettings, compact_view: checked })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bewertungs-Erinnerungen */}
        <RatingReminderSettingsCard />

        {/* Gästeliste Import */}
        <GuestImportCard />

        {/* System */}
        <Card>
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
              <Button variant="outline" size="sm" className="w-full">Cache leeren</Button>
              <Button variant="outline" size="sm" className="w-full">Daten exportieren</Button>
              <Button variant="outline" size="sm" className="w-full text-red-600 hover:text-red-700">
                Daten zurücksetzen
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Aktionen */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              Aktionen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button className="w-full" size="lg" onClick={saveAllSettings}>
              <Save className="w-4 h-4 mr-2" />
              Alle Einstellungen speichern
            </Button>

            <div className="text-center pt-4">
              <p className="text-sm text-muted-foreground">
                Letzte Änderung: {new Date().toLocaleString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
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
  );
};

export default SettingsTab;