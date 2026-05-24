import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  RefreshCw, Mail, Sparkles, Loader2, CheckCircle,
  AlertTriangle, TrendingDown, Users, Clock,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import {
  useRebookingGuests,
  useSendRebookingOffer,
  GuestRebookingData,
} from '@/hooks/useRebookingScore';
import { supabase } from '@/integrations/supabase/client';

function ScoreBadge({ score, label }: { score: number; label: GuestRebookingData['score_label'] }) {
  const config = {
    critical: { color: 'text-red-600', bg: 'bg-red-50 border-red-200', emoji: '🔴' },
    at_risk: { color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', emoji: '🟡' },
    stable: { color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', emoji: '🔵' },
    loyal: { color: 'text-green-600', bg: 'bg-green-50 border-green-200', emoji: '🟢' },
  }[label];

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${config.bg} ${config.color}`}>
      <span>{config.emoji}</span>
      <span>{score}</span>
    </div>
  );
}

function ScoreBar({ score, label }: { score: number; label: GuestRebookingData['score_label'] }) {
  const color = {
    critical: 'bg-red-500',
    at_risk: 'bg-amber-500',
    stable: 'bg-blue-500',
    loyal: 'bg-green-500',
  }[label];
  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width: `${score}%` }} />
    </div>
  );
}

function StatsBar({ guests }: { guests: GuestRebookingData[] }) {
  const critical = guests.filter((g) => g.score_label === 'critical').length;
  const atRisk = guests.filter((g) => g.score_label === 'at_risk').length;
  const avgScore = guests.length > 0
    ? Math.round(guests.reduce((s, g) => s + g.rebooking_score, 0) / guests.length)
    : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
            Kritisch
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="text-2xl font-bold text-red-600">{critical}</div>
          <p className="text-xs text-muted-foreground mt-1">Sofort ansprechen</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
            Gefährdet
            <TrendingDown className="h-4 w-4 text-amber-500" />
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="text-2xl font-bold text-amber-600">{atRisk}</div>
          <p className="text-xs text-muted-foreground mt-1">Bald aktiv werden</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
            Gäste gesamt
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="text-2xl font-bold">{guests.length}</div>
          <p className="text-xs text-muted-foreground mt-1">Mit E-Mail-Adresse</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
            Ø Score
            <Sparkles className="h-4 w-4 text-primary" />
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="text-2xl font-bold">{avgScore}</div>
          <p className="text-xs text-muted-foreground mt-1">Wiederbuchungs-Index</p>
        </CardContent>
      </Card>
    </div>
  );
}

interface OfferDialogProps {
  guest: GuestRebookingData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function OfferDialog({ guest, open, onOpenChange }: OfferDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [approved, setApproved] = useState(false);
  const { toast } = useToast();
  const sendOffer = useSendRebookingOffer();

  const handleClose = () => {
    setSubject('');
    setContent('');
    setApproved(false);
    onOpenChange(false);
  };

  const handleGenerate = async () => {
    if (!guest) return;
    setIsGenerating(true);
    setApproved(false);
    try {
      const { data, error } = await supabase.functions.invoke('generate-personalized-email', {
        body: {
          messageType: 'return_offer',
          selectedSegment: guest.score_label === 'critical' ? 'returning' : 'vip',
          segmentAnalysis: {
            totalGuests: 1,
            averageRevenue: guest.total_revenue,
            averageStayDuration: guest.avg_stay_nights,
          },
          sampleGuests: [{
            guest_name: guest.guest_name,
            total_revenue: guest.total_revenue,
            average_stay_duration: guest.avg_stay_nights,
            preferred_seasons: guest.preferred_season ? [guest.preferred_season] : [],
            loyalty_level: guest.stay_count >= 3 ? 'high' : guest.stay_count >= 2 ? 'medium' : 'low',
            last_house: guest.last_house,
            months_away: guest.months_since_last_stay,
            bookings: [],
          }],
        },
      });
      if (error) throw error;
      setSubject(data.subject || `Wir vermissen Sie, ${guest.guest_name.split(' ')[0]}!`);
      setContent(data.content || '');
      toast({ title: 'KI-Angebot generiert', description: 'Bitte prüfen und genehmigen Sie den Text.' });
    } catch (err) {
      console.error(err);
      toast({
        title: 'Fehler bei KI-Generierung',
        description: 'Bitte versuchen Sie es erneut.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!guest || !approved) return;
    setIsSending(true);
    try {
      await sendOffer.mutateAsync({ guest, aiContent: content, aiSubject: subject });
      toast({ title: 'Angebot versendet ✓', description: `E-Mail an ${guest.guest_name} gesendet.` });
      handleClose();
    } catch (err) {
      toast({ title: 'Fehler beim Versand', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  if (!guest) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            KI-Angebot für {guest.guest_name}
          </DialogTitle>
          <DialogDescription>
            {guest.stay_count}x gebucht · €{guest.total_revenue.toLocaleString('de-DE')} Umsatz ·
            Letzter Aufenthalt: {guest.months_since_last_stay} Monate her
            {guest.last_house && ` · ${guest.last_house}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
            <ScoreBadge score={guest.rebooking_score} label={guest.score_label} />
            <div className="flex-1 text-sm">
              <div className="font-medium">
                {guest.score_label === 'critical' && '⚠️ Kritisch – sofort ansprechen'}
                {guest.score_label === 'at_risk' && '⚡ Gefährdet – Angebot empfohlen'}
                {guest.score_label === 'stable' && '✓ Stabil – optionale Kontaktaufnahme'}
                {guest.score_label === 'loyal' && '⭐ Loyal – Treuebonus senden'}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Bevorzugte Saison: {guest.preferred_season || 'Unbekannt'}
              </div>
            </div>
          </div>

          {!content && (
            <Button onClick={handleGenerate} disabled={isGenerating} className="w-full">
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  KI schreibt personalisierten Text…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Personalisiertes Angebot generieren
                </>
              )}
            </Button>
          )}

          {content && (
            <>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Bitte prüfen Sie den Text sorgfältig vor dem Versand an {guest.guest_name}.
                </AlertDescription>
              </Alert>

              <div>
                <label className="text-sm font-medium">Betreff</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => { setSubject(e.target.value); setApproved(false); }}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Nachricht</label>
                <Textarea
                  value={content}
                  onChange={(e) => { setContent(e.target.value); setApproved(false); }}
                  rows={10}
                  className="mt-1 text-sm"
                />
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleGenerate} disabled={isGenerating} className="flex-1">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Neu generieren
                </Button>
                {!approved ? (
                  <Button onClick={() => setApproved(true)} className="flex-1">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Text genehmigen
                  </Button>
                ) : (
                  <Badge className="flex-1 justify-center bg-green-500/10 text-green-600 border-green-500/20 py-2">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Genehmigt
                  </Badge>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Abbrechen</Button>
          <Button onClick={handleSend} disabled={!approved || isSending || !content}>
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Wird gesendet…
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 mr-2" />
                Angebot senden
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type FilterType = 'all' | 'critical' | 'at_risk' | 'stable' | 'loyal';

interface FilterBarProps {
  active: FilterType;
  onChange: (f: FilterType) => void;
  counts: Record<FilterType, number>;
}

function FilterBar({ active, onChange, counts }: FilterBarProps) {
  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'Alle' },
    { key: 'critical', label: '🔴 Kritisch' },
    { key: 'at_risk', label: '🟡 Gefährdet' },
    { key: 'stable', label: '🔵 Stabil' },
    { key: 'loyal', label: '🟢 Loyal' },
  ];
  return (
    <div className="flex gap-2 flex-wrap">
      {filters.map((f) => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
            active === f.key
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background border-border text-muted-foreground hover:bg-muted'
          }`}
        >
          {f.label} ({counts[f.key]})
        </button>
      ))}
    </div>
  );
}

interface GuestRowProps {
  guest: GuestRebookingData;
  onOffer: () => void;
}

function GuestRow({ guest, onOffer }: GuestRowProps) {
  const urgency = {
    critical: 'border-l-red-400',
    at_risk: 'border-l-amber-400',
    stable: 'border-l-blue-300',
    loyal: 'border-l-green-400',
  }[guest.score_label];

  return (
    <Card className={`border-l-4 ${urgency}`}>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate">{guest.guest_name}</span>
              {guest.nationality && (
                <Badge variant="outline" className="text-xs font-normal">{guest.nationality}</Badge>
              )}
              {guest.stay_count >= 3 && (
                <Badge className="text-xs bg-yellow-500/10 text-yellow-700 border-yellow-500/20">VIP</Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {guest.months_since_last_stay} Mo. her
              </span>
              <span>{guest.stay_count}x gebucht</span>
              <span>€{guest.total_revenue.toLocaleString('de-DE')}</span>
              {guest.last_house && <span>{guest.last_house}</span>}
              {guest.preferred_season && <span>{guest.preferred_season}</span>}
            </div>
          </div>

          <div className="sm:w-28">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Score</span>
              <ScoreBadge score={guest.rebooking_score} label={guest.score_label} />
            </div>
            <ScoreBar score={guest.rebooking_score} label={guest.score_label} />
          </div>

          <div className="sm:w-36">
            {guest.score_label === 'loyal' ? (
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={onOffer}>
                <Mail className="h-3.5 w-3.5 mr-1.5" />
                Treuebonus senden
              </Button>
            ) : (
              <Button
                size="sm"
                className="w-full text-xs"
                variant={guest.score_label === 'critical' ? 'default' : 'outline'}
                onClick={onOffer}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                KI-Angebot erstellen
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const RebookingCampaign = () => {
  const { data: guests = [], isLoading, refetch } = useRebookingGuests();
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedGuest, setSelectedGuest] = useState<GuestRebookingData | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const counts: Record<FilterType, number> = {
    all: guests.length,
    critical: guests.filter((g) => g.score_label === 'critical').length,
    at_risk: guests.filter((g) => g.score_label === 'at_risk').length,
    stable: guests.filter((g) => g.score_label === 'stable').length,
    loyal: guests.filter((g) => g.score_label === 'loyal').length,
  };

  const filtered = filter === 'all' ? guests : guests.filter((g) => g.score_label === filter);

  const handleOffer = (guest: GuestRebookingData) => {
    setSelectedGuest(guest);
    setDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Wiederbuchungs-Kampagnen
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            KI bewertet jeden Gast automatisch – niedrigster Score = höchste Priorität
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Scores aktualisieren
        </Button>
      </div>

      {guests.length > 0 && <StatsBar guests={guests} />}

      <Card className="bg-muted/30">
        <CardContent className="p-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
            <div><span className="text-red-600 font-medium">🔴 Kritisch (0–24):</span> Sofort anschreiben</div>
            <div><span className="text-amber-600 font-medium">🟡 Gefährdet (25–49):</span> Angebot empfohlen</div>
            <div><span className="text-blue-600 font-medium">🔵 Stabil (50–74):</span> Saisonales Angebot</div>
            <div><span className="text-green-600 font-medium">🟢 Loyal (75–100):</span> Treuebonus möglich</div>
          </div>
        </CardContent>
      </Card>

      <FilterBar active={filter} onChange={setFilter} counts={counts} />

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">
              {guests.length === 0
                ? 'Keine Gäste mit E-Mail-Adresse gefunden.'
                : 'Keine Gäste in dieser Kategorie.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((guest) => (
            <GuestRow key={guest.guest_key} guest={guest} onOffer={() => handleOffer(guest)} />
          ))}
        </div>
      )}

      <OfferDialog guest={selectedGuest} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
};

export default RebookingCampaign;