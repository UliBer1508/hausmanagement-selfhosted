import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Sparkles, Send, Loader2, RefreshCw, Eye, CheckCircle, XCircle, AlertTriangle, ChevronDown, Tag } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useGuestSegments } from '@/hooks/useGuests';
import { supabase } from '@/integrations/supabase/client';

interface GuestPersonalizationProps {
  onSendPersonalizedMessage: (content: string, subject: string, segment: string) => void;
}

const GuestPersonalization = ({ onSendPersonalizedMessage }: GuestPersonalizationProps) => {
  const [selectedSegment, setSelectedSegment] = useState('all');
  const [messageType, setMessageType] = useState('welcome');
  const [personalizedContent, setPersonalizedContent] = useState('');
  const [generatedSubject, setGeneratedSubject] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offer, setOffer] = useState<{
    discount_percent: string;
    voucher: string;
    validity: string;
    extra_note: string;
  }>({ discount_percent: '', voucher: '', validity: '', extra_note: '' });
  const [intent, setIntent] = useState('');
  const [tone, setTone] = useState<'herzlich' | 'sachlich' | 'exklusiv' | 'humorvoll'>('herzlich');
  const [length, setLength] = useState<'kurz' | 'mittel' | 'ausführlich'>('mittel');
  const { toast } = useToast();

  // Use the centralized guest segments hook (includes tourist filter!)
  const { data: segmentData } = useGuestSegments();

  const getFilteredGuests = (segment: string) => {
    if (!segmentData?.allGuests) return [];
    
    switch (segment) {
      case 'vip':
        return segmentData.allGuests.filter(g => g.total_revenue >= 2000);
      case 'returning':
        return segmentData.allGuests.filter(g => g.stay_count >= 2 && g.total_revenue < 2000);
      case 'new':
        return segmentData.allGuests.filter(g => g.stay_count === 1);
      default:
        return segmentData.allGuests;
    }
  };

  const generatePersonalizedMessage = async () => {
    if (!segmentData?.allGuests) {
      toast({
        title: "Fehler",
        description: "Gastdaten sind noch nicht geladen.",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);

    try {
      const targetGuests = getFilteredGuests(selectedSegment);

      // Analyze segment characteristics for AI prompt
      const segmentAnalysis = {
        totalGuests: targetGuests.length,
        averageRevenue: targetGuests.length > 0 
          ? targetGuests.reduce((sum, g) => sum + g.total_revenue, 0) / targetGuests.length 
          : 0,
        averageStayDuration: targetGuests.length > 0
          ? targetGuests.reduce((sum, g) => sum + g.average_stay_duration, 0) / targetGuests.length
          : 0,
        commonSeasons: Array.from(new Set(targetGuests.flatMap(g => g.preferred_seasons))),
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
          sampleGuests: targetGuests.slice(0, 3).map(g => ({
            guest_name: g.guest_name,
            total_revenue: g.total_revenue,
            average_stay_duration: g.average_stay_duration,
            preferred_seasons: g.preferred_seasons,
            loyalty_level: g.loyalty_level
          })),
          offer: {
            discount_percent: offer.discount_percent ? Number(offer.discount_percent) : undefined,
            voucher: offer.voucher || undefined,
            validity: offer.validity || undefined,
            extra_note: offer.extra_note || undefined,
          },
          intent: intent.trim() || undefined,
          tone,
          length,
        }
      });

      if (error) throw error;

      setPersonalizedContent(data.content);
      setGeneratedSubject(data.subject);
      setShowPreview(true);
      setIsApproved(false);

      toast({
        title: "Personalisierte Nachricht erstellt",
        description: `KI-optimierte Nachricht für ${targetGuests.length} Gäste generiert. Bitte überprüfen Sie die Nachricht vor dem Versand.`
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

  const handleApproveMessage = () => {
    setIsApproved(true);
    toast({
      title: "Nachricht genehmigt",
      description: "Die E-Mail wurde zur Überprüfung genehmigt und kann jetzt versendet werden."
    });
  };

  const handleRejectMessage = () => {
    setShowPreview(false);
    setIsApproved(false);
    setPersonalizedContent('');
    setGeneratedSubject('');
    toast({
      title: "Nachricht abgelehnt",
      description: "Die generierte Nachricht wurde zurückgewiesen. Erstellen Sie eine neue Nachricht."
    });
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

    if (!isApproved) {
      toast({
        title: "Genehmigung erforderlich",
        description: "Bitte genehmigen Sie die Nachricht vor dem Versand.",
        variant: "destructive"
      });
      return;
    }

    onSendPersonalizedMessage(personalizedContent, generatedSubject, selectedSegment);
    
    // Reset state after sending
    setShowPreview(false);
    setIsApproved(false);
    setPersonalizedContent('');
    setGeneratedSubject('');
  };

  const getSegmentInfo = (segment: string) => {
    const filtered = getFilteredGuests(segment);
    let description = '';
    
    switch (segment) {
      case 'vip':
        description = 'Hochwertige Gäste mit über €2000 Gesamtumsatz';
        break;
      case 'returning':
        description = 'Stammgäste mit mehreren Buchungen';
        break;
      case 'new':
        description = 'Neukunden mit erster Buchung';
        break;
      default:
        description = 'Alle Gäste mit E-Mail-Adresse';
    }
    
    return { count: filtered.length, description };
  };

  const segmentInfo = getSegmentInfo(selectedSegment);
  const targetGuests = getFilteredGuests(selectedSegment);

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
            Automatische Erstellung maßgeschneiderter E-Mails mit Überprüfung und Genehmigung vor dem Versand
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
                  <SelectItem value="all">Alle Gäste ({getSegmentInfo('all').count})</SelectItem>
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

            {/* Concrete Offer (optional) */}
            <Collapsible open={offerOpen} onOpenChange={setOfferOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Konkretes Angebot (optional)
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${offerOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-3">
                <p className="text-xs text-muted-foreground">
                  Diese Werte werden 1:1 an die KI übergeben. Leer lassen, wenn kein Angebot kommuniziert werden soll – die KI erfindet dann nichts.
                </p>
                <div>
                  <label className="text-xs font-medium">Rabatt in Prozent</label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={offer.discount_percent}
                    onChange={(e) => setOffer({ ...offer, discount_percent: e.target.value })}
                    placeholder="z. B. 10"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Gutschein / Extra</label>
                  <Input
                    value={offer.voucher}
                    onChange={(e) => setOffer({ ...offer, voucher: e.target.value })}
                    placeholder="z. B. Gratis Sektfrühstück"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Gültigkeit</label>
                  <Input
                    value={offer.validity}
                    onChange={(e) => setOffer({ ...offer, validity: e.target.value })}
                    placeholder="z. B. bis 31.03.2026"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Zusätzlicher Hinweis</label>
                  <Textarea
                    value={offer.extra_note}
                    onChange={(e) => setOffer({ ...offer, extra_note: e.target.value })}
                    placeholder="Optionaler Zusatz für die KI"
                    rows={3}
                    className="mt-1"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Generate Button */}
            <Button 
              onClick={generatePersonalizedMessage} 
              disabled={isGenerating || !segmentData}
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
            {targetGuests.length > 0 && (
              <div className="pt-4 border-t">
                <h4 className="text-sm font-medium mb-2">Segment-Analyse</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span>Durchschnittlicher Umsatz:</span>
                    <Badge variant="secondary">
                      €{Math.round(targetGuests.reduce((sum, g) => sum + g.total_revenue, 0) / targetGuests.length || 0)}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Ø Aufenthaltsdauer:</span>
                    <Badge variant="secondary">
                      {Math.round(targetGuests.reduce((sum, g) => sum + g.average_stay_duration, 0) / targetGuests.length || 0)} Nächte
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
              {showPreview ? 'E-Mail Vorschau & Genehmigung' : 'Generierte Nachricht'}
              {personalizedContent && !showPreview && (
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
            {showPreview && !isApproved && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Bitte überprüfen Sie die generierte E-Mail sorgfältig vor der Genehmigung. 
                  Die Nachricht wird an {segmentInfo.count} Empfänger gesendet.
                </AlertDescription>
              </Alert>
            )}

            {isApproved && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  E-Mail wurde genehmigt und kann versendet werden.
                </AlertDescription>
              </Alert>
            )}
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
                readOnly={showPreview}
              />
              {showPreview && (
                <p className="text-xs text-muted-foreground mt-1">
                  Vorschau-Modus: Inhalt kann nach Genehmigung nicht mehr bearbeitet werden
                </p>
              )}
            </div>

            {personalizedContent && (
              <div className="space-y-4">
                <Separator />
                
                {showPreview && !isApproved && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Eye className="w-4 h-4" />
                      E-Mail Überprüfung und Genehmigung
                    </div>
                    
                    <div className="flex gap-3">
                      <Button 
                        onClick={handleApproveMessage} 
                        className="flex-1"
                        variant="default"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        E-Mail genehmigen
                      </Button>
                      
                      <Button 
                        onClick={handleRejectMessage} 
                        variant="destructive"
                        className="flex-1"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Ablehnen & Neu erstellen
                      </Button>
                    </div>
                  </div>
                )}

                {isApproved && (
                  <Button 
                    onClick={handleSendMessage} 
                    className="w-full"
                    size="lg"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Genehmigte E-Mail versenden ({segmentInfo.count} Empfänger)
                  </Button>
                )}

                {!showPreview && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Sparkles className="w-3 h-3" />
                      KI-optimiert für {segmentInfo.count} Empfänger
                    </div>
                    
                    <Button 
                      onClick={() => setShowPreview(true)} 
                      className="w-full"
                      variant="outline"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Zur Vorschau & Genehmigung
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GuestPersonalization;
