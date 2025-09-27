import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Send, Loader2, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface GuestPersonalizationProps {
  onSendPersonalizedMessage: (content: string, subject: string, segment: string) => void;
}

const GuestPersonalization = ({ onSendPersonalizedMessage }: GuestPersonalizationProps) => {
  const [selectedSegment, setSelectedSegment] = useState('all');
  const [messageType, setMessageType] = useState('welcome');
  const [personalizedContent, setPersonalizedContent] = useState('');
  const [generatedSubject, setGeneratedSubject] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  // Fetch guest data for personalization
  const { data: guestData } = useQuery({
    queryKey: ['guest-personalization-data'],
    queryFn: async () => {
      const { data: bookings } = await supabase
        .from('bookings')
        .select('*')
        .not('guest_name', 'is', null)
        .not('guest_email', 'is', null);

      if (!bookings) return null;

      // Analyze guest patterns
      const guestMap = new Map();
      bookings.forEach(booking => {
        const guestKey = `${booking.guest_name}-${booking.guest_email}`;
        if (!guestMap.has(guestKey)) {
          guestMap.set(guestKey, {
            guest_name: booking.guest_name,
            guest_email: booking.guest_email,
            bookings: [],
            total_revenue: 0,
            average_stay_duration: 0,
            preferred_seasons: new Set(),
            loyalty_level: 'new'
          });
        }

        const guest = guestMap.get(guestKey);
        guest.bookings.push(booking);
        guest.total_revenue += booking.booking_amount || 0;
        
        // Calculate stay duration
        const checkIn = new Date(booking.check_in);
        const checkOut = new Date(booking.check_out);
        const duration = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
        
        guest.average_stay_duration = guest.bookings.reduce((acc, b) => {
          const cIn = new Date(b.check_in);
          const cOut = new Date(b.check_out);
          return acc + Math.ceil((cOut.getTime() - cIn.getTime()) / (1000 * 60 * 60 * 24));
        }, 0) / guest.bookings.length;

        // Determine season preference
        const month = checkIn.getMonth();
        if (month >= 11 || month <= 2) guest.preferred_seasons.add('winter');
        else if (month >= 3 && month <= 5) guest.preferred_seasons.add('spring');
        else if (month >= 6 && month <= 8) guest.preferred_seasons.add('summer');
        else guest.preferred_seasons.add('autumn');

        // Determine loyalty level
        if (guest.total_revenue >= 3000) guest.loyalty_level = 'platinum';
        else if (guest.total_revenue >= 1500) guest.loyalty_level = 'gold';
        else if (guest.bookings.length >= 2) guest.loyalty_level = 'returning';
        else guest.loyalty_level = 'new';
      });

      return Array.from(guestMap.values());
    },
  });

  const generatePersonalizedMessage = async () => {
    if (!guestData) {
      toast({
        title: "Fehler",
        description: "Gastdaten sind noch nicht geladen.",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);

    try {
      // Filter guests based on segment
      let targetGuests = guestData;
      
      switch (selectedSegment) {
        case 'vip':
          targetGuests = guestData.filter(g => g.total_revenue >= 2000);
          break;
        case 'returning':
          targetGuests = guestData.filter(g => g.bookings.length >= 2 && g.total_revenue < 2000);
          break;
        case 'new':
          targetGuests = guestData.filter(g => g.bookings.length === 1);
          break;
      }

      // Analyze segment characteristics for AI prompt
      const segmentAnalysis = {
        totalGuests: targetGuests.length,
        averageRevenue: targetGuests.reduce((sum, g) => sum + g.total_revenue, 0) / targetGuests.length,
        averageStayDuration: targetGuests.reduce((sum, g) => sum + g.average_stay_duration, 0) / targetGuests.length,
        commonSeasons: Array.from(new Set(targetGuests.flatMap(g => Array.from(g.preferred_seasons)))),
        loyaltyDistribution: targetGuests.reduce((acc, g) => {
          acc[g.loyalty_level] = (acc[g.loyalty_level] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      };

      // Generate personalized content using OpenAI
      const { data, error } = await supabase.functions.invoke('generate-personalized-email', {
        body: {
          messageType,
          selectedSegment,
          segmentAnalysis,
          sampleGuests: targetGuests.slice(0, 3) // Send sample for context
        }
      });

      if (error) throw error;

      setPersonalizedContent(data.content);
      setGeneratedSubject(data.subject);

      toast({
        title: "Personalisierte Nachricht erstellt",
        description: `KI-optimierte Nachricht für ${targetGuests.length} Gäste generiert.`
      });

    } catch (error) {
      console.error('Error generating personalized message:', error);
      toast({
        title: "Fehler bei der Generierung",
        description: "Die personalisierte Nachricht konnte nicht erstellt werden.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendMessage = () => {
    if (!personalizedContent || !generatedSubject) {
      toast({
        title: "Fehler",
        description: "Bitte generieren Sie zuerst eine personalisierte Nachricht.",
        variant: "destructive"
      });
      return;
    }

    onSendPersonalizedMessage(personalizedContent, generatedSubject, selectedSegment);
  };

  const getSegmentInfo = (segment: string) => {
    if (!guestData) return { count: 0, description: '' };
    
    let filtered;
    let description;
    
    switch (segment) {
      case 'vip':
        filtered = guestData.filter(g => g.total_revenue >= 2000);
        description = 'Hochwertige Gäste mit über €2000 Gesamtumsatz';
        break;
      case 'returning':
        filtered = guestData.filter(g => g.bookings.length >= 2 && g.total_revenue < 2000);
        description = 'Stammgäste mit mehreren Buchungen';
        break;
      case 'new':
        filtered = guestData.filter(g => g.bookings.length === 1);
        description = 'Neukunden mit erster Buchung';
        break;
      default:
        filtered = guestData;
        description = 'Alle Gäste mit E-Mail-Adresse';
    }
    
    return { count: filtered.length, description };
  };

  const segmentInfo = getSegmentInfo(selectedSegment);

  return (
    <div className="space-y-6">
      {/* AI Personalization Header */}
      <Card className="border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            KI-gestützte personalisierte Nachrichtenerstellung
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Automatische Erstellung maßgeschneiderter E-Mails basierend auf Gast-Segmentierung und Buchungshistorie
          </p>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Personalisierungsoptionen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Segment Selection */}
            <div>
              <label className="text-sm font-medium">Zielgruppe</label>
              <Select value={selectedSegment} onValueChange={setSelectedSegment}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Gäste ({segmentInfo.count})</SelectItem>
                  <SelectItem value="vip">VIP Gäste ({getSegmentInfo('vip').count})</SelectItem>
                  <SelectItem value="returning">Stammgäste ({getSegmentInfo('returning').count})</SelectItem>
                  <SelectItem value="new">Neue Gäste ({getSegmentInfo('new').count})</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {segmentInfo.description}
              </p>
            </div>

            {/* Message Type */}
            <div>
              <label className="text-sm font-medium">Nachrichtentyp</label>
              <Select value={messageType} onValueChange={setMessageType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="welcome">Willkommensnachricht</SelectItem>
                  <SelectItem value="thankyou">Dankesnachricht</SelectItem>
                  <SelectItem value="return_offer">Rückkehr-Angebot</SelectItem>
                  <SelectItem value="seasonal">Saisonales Angebot</SelectItem>
                  <SelectItem value="loyalty_reward">Treuebonus</SelectItem>
                  <SelectItem value="feedback_request">Feedback-Anfrage</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Generate Button */}
            <Button 
              onClick={generatePersonalizedMessage} 
              disabled={isGenerating || !guestData}
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  KI generiert Nachricht...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Personalisierte Nachricht generieren
                </>
              )}
            </Button>

            {/* Segment Analytics */}
            {guestData && (
              <div className="pt-4 border-t">
                <h4 className="text-sm font-medium mb-2">Segment-Analyse</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span>Durchschnittlicher Umsatz:</span>
                    <Badge variant="secondary">
                      €{Math.round(guestData.filter(g => {
                        switch(selectedSegment) {
                          case 'vip': return g.total_revenue >= 2000;
                          case 'returning': return g.bookings.length >= 2 && g.total_revenue < 2000;
                          case 'new': return g.bookings.length === 1;
                          default: return true;
                        }
                      }).reduce((sum, g) => sum + g.total_revenue, 0) / segmentInfo.count || 0)}
                    </Badge>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Generated Content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Generierte Nachricht
              {personalizedContent && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generatePersonalizedMessage}
                  disabled={isGenerating}
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Neu generieren
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {generatedSubject && (
              <div>
                <label className="text-sm font-medium">Betreff</label>
                <div className="p-2 bg-muted rounded-md mt-1 text-sm">
                  {generatedSubject}
                </div>
              </div>
            )}

            <div>
              <label className="text-sm font-medium">Nachrichteninhalt</label>
              <Textarea
                value={personalizedContent}
                onChange={(e) => setPersonalizedContent(e.target.value)}
                placeholder="Klicken Sie auf 'Personalisierte Nachricht generieren', um KI-optimierten Inhalt zu erstellen..."
                rows={12}
                className="mt-1"
              />
            </div>

            {personalizedContent && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="w-3 h-3" />
                  KI-optimiert für {segmentInfo.count} Empfänger
                </div>
                
                <Button 
                  onClick={handleSendMessage} 
                  className="w-full"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Personalisierte E-Mail versenden ({segmentInfo.count} Empfänger)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GuestPersonalization;