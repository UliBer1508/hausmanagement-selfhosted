import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Mail, Phone, Send, Users, FileText, Calendar, Star, Settings, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import EmailTemplateEditor from './EmailTemplateEditor';
import GuestPersonalization from './GuestPersonalization';
import { useEmailTemplates } from '@/hooks/useEmailTemplates';

const GuestCommunication = () => {
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [selectedSegment, setSelectedSegment] = useState('all');
  const [language, setLanguage] = useState<'de' | 'en'>('de');
  const { toast } = useToast();
  
  // Use the email templates hook with language parameter
  const { 
    templates: emailTemplates, 
    isLoading: templatesLoading,
    createTemplate,
    updateTemplate,
    deleteTemplate 
  } = useEmailTemplates(language);

  // Fetch guest segments for targeting
  const { data: segmentData } = useQuery({
    queryKey: ['communication-segments', 'tourist'],
    queryFn: async () => {
      const { data: bookings } = await supabase
        .from('bookings')
        .select('*, houses!bookings_house_id_fkey!inner(rental_type)')
        .eq('houses.rental_type', 'tourist')
        .not('guest_name', 'is', null)
        .neq('status', 'cancelled');

      if (!bookings) return null;

      // Group by guest and analyze segments
      const guestMap = new Map();
      
      bookings.forEach(booking => {
        const guestKey = `${booking.guest_name}-${booking.guest_email || ''}`;
        if (!guestMap.has(guestKey)) {
          guestMap.set(guestKey, {
            guest_name: booking.guest_name,
            guest_email: booking.guest_email,
            guest_phone: booking.guest_phone,
            total_revenue: 0,
            stay_count: 0,
            last_booking: null,
          });
        }

        const guest = guestMap.get(guestKey);
        guest.total_revenue += booking.booking_amount || 0;
        guest.stay_count += 1;
        
        if (!guest.last_booking || new Date(booking.check_in) > new Date(guest.last_booking)) {
          guest.last_booking = booking.check_in;
        }
      });

      const guests = Array.from(guestMap.values()).filter(g => g.guest_email);

      return {
        all: guests.length,
        vip: guests.filter(g => g.total_revenue >= 2000).length,
        returning: guests.filter(g => g.stay_count >= 2 && g.total_revenue < 2000).length,
        new: guests.filter(g => g.stay_count === 1).length,
        recent: guests.filter(g => {
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
          return g.last_booking && new Date(g.last_booking) >= threeMonthsAgo;
        }).length,
        guests: guests // Store actual guest data for email sending
      };
    },
  });

  const getGuestEmailsForSegment = (segment: string): string[] => {
    if (!segmentData || !segmentData.guests) return [];
    
    const guests = segmentData.guests;
    
    switch (segment) {
      case 'vip':
        return guests.filter((g: any) => g.total_revenue >= 2000).map((g: any) => g.guest_email);
      case 'returning':
        return guests.filter((g: any) => g.stay_count >= 2 && g.total_revenue < 2000).map((g: any) => g.guest_email);
      case 'new':
        return guests.filter((g: any) => g.stay_count === 1).map((g: any) => g.guest_email);
      case 'recent':
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        return guests.filter((g: any) => g.last_booking && new Date(g.last_booking) >= threeMonthsAgo).map((g: any) => g.guest_email);
      default:
        return guests.map((g: any) => g.guest_email);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedTemplate && !customMessage) {
      toast({
        title: "Fehler",
        description: "Bitte wählen Sie eine Vorlage oder geben Sie eine Nachricht ein.",
        variant: "destructive",
      });
      return;
    }

    try {
      const content = customMessage || emailTemplates[selectedTemplate as keyof typeof emailTemplates]?.content || '';
      const subject = selectedTemplate ? emailTemplates[selectedTemplate as keyof typeof emailTemplates]?.subject : 'Nachricht von Steinbock Chalets';
      
      // Get guest emails based on segment
      const targetGuests = getGuestEmailsForSegment(selectedSegment);
      
      if (targetGuests.length === 0) {
        toast({
          title: "Keine Gäste gefunden",
          description: "Für das ausgewählte Segment wurden keine Gäste mit E-Mail-Adressen gefunden.",
          variant: "destructive"
        });
        return;
      }

      // Send email via our Gmail SMTP function
      const { data, error } = await supabase.functions.invoke('send-gmail', {
        body: {
          to: targetGuests,
          subject: subject,
          html: content,
          guestName: 'Liebe Gäste'
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "E-Mail gesendet",
          description: `Nachricht wurde erfolgreich an ${data.recipients || targetGuests.length} Gäste gesendet`,
        });
        
        setCustomMessage('');
        setSelectedTemplate('');
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
    }
  };

  const getSegmentName = (segment: string) => {
    switch (segment) {
      case 'vip': return 'VIP';
      case 'returning': return 'Stammgäste';
      case 'new': return 'neue';
      case 'recent': return 'kürzlich aktive';
      default: return 'alle';
    }
  };

  const getSegmentCount = (segment: string) => {
    if (!segmentData) return 0;
    return segmentData[segment as keyof typeof segmentData] || 0;
  };

  const handleSendPersonalizedMessage = async (content: string, subject: string, segment: string) => {
    try {
      const targetGuests = getGuestEmailsForSegment(segment);
      
      if (targetGuests.length === 0) {
        toast({
          title: "Keine Gäste gefunden",
          description: "Für das ausgewählte Segment wurden keine Gäste mit E-Mail-Adressen gefunden.",
          variant: "destructive"
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('send-gmail', {
        body: {
          to: targetGuests,
          subject: subject,
          html: content,
          guestName: 'Liebe Gäste'
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Personalisierte E-Mail gesendet",
          description: `KI-optimierte Nachricht wurde erfolgreich an ${data.recipients || targetGuests.length} Gäste gesendet`,
        });
      } else {
        throw new Error(data?.error || 'Unbekannter Fehler');
      }
    } catch (error) {
      console.error('Error sending personalized email:', error);
      toast({
        title: "Fehler beim Senden",
        description: "Die personalisierte E-Mail konnte nicht gesendet werden.",
        variant: "destructive"
      });
    }
  };

  return (
    <Tabs defaultValue="compose" className="space-y-6">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="compose" className="flex items-center gap-2">
          <Send className="w-4 h-4" />
          E-Mail versenden
        </TabsTrigger>
        <TabsTrigger value="personalization" className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          Personalisierung
        </TabsTrigger>
        <TabsTrigger value="manage" className="flex items-center gap-2">
          <Settings className="w-4 h-4" />
          Vorlagen verwalten
        </TabsTrigger>
      </TabsList>

      <TabsContent value="compose" className="space-y-6">
        {/* Communication Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">E-Mail versenden</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Sprache:</Label>
                <div className="flex border rounded-md">
                  <Button
                    type="button"
                    variant={language === 'de' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => {
                      setLanguage('de');
                      setSelectedTemplate('');
                    }}
                    className="rounded-r-none h-7 px-2"
                  >
                    🇩🇪 DE
                  </Button>
                  <Button
                    type="button"
                    variant={language === 'en' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => {
                      setLanguage('en');
                      setSelectedTemplate('');
                    }}
                    className="rounded-l-none h-7 px-2"
                  >
                    🇬🇧 EN
                  </Button>
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold">{getSegmentCount('all')}</div>
                <p className="text-xs text-muted-foreground">
                  Gäste mit E-Mail-Adresse
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">VIP Kontakte</CardTitle>
              <Star className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{getSegmentCount('vip')}</div>
              <p className="text-xs text-muted-foreground">
                Hochwertige Zielgruppe
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Stammgäste</CardTitle>
              <Users className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{getSegmentCount('returning')}</div>
              <p className="text-xs text-muted-foreground">
                Wiederkehrende Gäste
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Kürzlich aktiv</CardTitle>
              <Calendar className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{getSegmentCount('recent')}</div>
              <p className="text-xs text-muted-foreground">
                Letzte 3 Monate
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Email Composer */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                E-Mail versenden
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Segment Selection */}
              <div>
                <label className="text-sm font-medium">Zielgruppe auswählen</label>
                <Select value={selectedSegment} onValueChange={setSelectedSegment}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Gäste ({getSegmentCount('all')})</SelectItem>
                    <SelectItem value="vip">VIP Gäste ({getSegmentCount('vip')})</SelectItem>
                    <SelectItem value="returning">Stammgäste ({getSegmentCount('returning')})</SelectItem>
                    <SelectItem value="new">Neue Gäste ({getSegmentCount('new')})</SelectItem>
                    <SelectItem value="recent">Kürzlich aktive ({getSegmentCount('recent')})</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Template Selection */}
              <div>
                <label className="text-sm font-medium">E-Mail Vorlage</label>
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                  <SelectTrigger className="mt-1">
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

              {/* Message Preview/Editor */}
              <div>
                <label className="text-sm font-medium">
                  {selectedTemplate ? 'Nachricht (Vorlage)' : 'Eigene Nachricht'}
                </label>
                <Textarea
                  value={selectedTemplate ? emailTemplates[selectedTemplate as keyof typeof emailTemplates]?.content : customMessage}
                  onChange={(e) => selectedTemplate ? null : setCustomMessage(e.target.value)}
                  placeholder="Ihre Nachricht hier eingeben..."
                  rows={8}
                  className="mt-1"
                  readOnly={!!selectedTemplate}
                />
                {selectedTemplate && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Platzhalter wie {'{GUEST_NAME}'}, {'{CHECK_IN}'} werden automatisch ersetzt
                  </p>
                )}
              </div>

              <Button onClick={handleSendMessage} className="w-full">
                <Send className="w-4 h-4 mr-2" />
                E-Mail versenden ({getSegmentCount(selectedSegment)} Empfänger)
              </Button>
            </CardContent>
          </Card>

          {/* Templates & Features */}
          <div className="space-y-6">
            {/* Available Templates */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Verfügbare Vorlagen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(emailTemplates).map(([key, template]) => (
                    <div key={key} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">{template.name}</span>
                        <Badge variant="outline" className="text-xs">Vorlage</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">
                        {template.subject}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedTemplate(key)}
                      >
                        Verwenden
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Communication Features */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  Weitere Funktionen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Phone className="h-4 w-4" />
                      <span className="font-medium text-sm">SMS-Benachrichtigungen</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Check-in Erinnerungen und wichtige Updates per SMS
                    </p>
                    <Badge variant="secondary" className="text-xs">Geplant</Badge>
                  </div>

                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Send className="h-4 w-4" />
                      <span className="font-medium text-sm">Automatisierte Kampagnen</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Zeitgesteuerte E-Mails basierend auf Buchungsdaten
                    </p>
                    <Badge variant="secondary" className="text-xs">Geplant</Badge>
                  </div>

                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Star className="h-4 w-4" />
                      <span className="font-medium text-sm">Personalisierung</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      KI-gestützte personalisierte Nachrichtenerstellung
                    </p>
                    <Badge variant="secondary" className="text-xs">Geplant</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="personalization" className="space-y-6">
        <GuestPersonalization 
          onSendPersonalizedMessage={handleSendPersonalizedMessage}
        />
      </TabsContent>

      <TabsContent value="manage">
        <div className="mb-4 flex items-center gap-2">
          <Label>Sprachfilter:</Label>
          <div className="flex border rounded-md">
            <Button
              type="button"
              variant={language === 'de' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setLanguage('de')}
              className="rounded-r-none"
            >
              🇩🇪 Deutsch
            </Button>
            <Button
              type="button"
              variant={language === 'en' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setLanguage('en')}
              className="rounded-l-none"
            >
              🇬🇧 English
            </Button>
          </div>
        </div>
        <EmailTemplateEditor 
          language={language}
          onCreateTemplate={createTemplate}
          onUpdateTemplate={updateTemplate}
          onDeleteTemplate={deleteTemplate}
        />
      </TabsContent>
    </Tabs>
  );
};

export default GuestCommunication;