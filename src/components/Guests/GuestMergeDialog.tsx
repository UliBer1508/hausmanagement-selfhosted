import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DuplicateGroup, GuestWithBookingCount, useMergeGuests, getMergedGuestData } from '@/hooks/useGuestDuplicates';
import { GitMerge, ArrowLeft, ArrowRight, Mail, Phone, Globe, MapPin, Loader2, AlertTriangle } from 'lucide-react';

interface GuestMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duplicateGroup: DuplicateGroup;
  onMergeComplete: () => void;
}

export const GuestMergeDialog = ({ open, onOpenChange, duplicateGroup, onMergeComplete }: GuestMergeDialogProps) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [targetGuestId, setTargetGuestId] = useState<string>(duplicateGroup.guests[0]?.id || '');
  const [mergedData, setMergedData] = useState<Partial<GuestWithBookingCount>>({});
  
  const mergeGuests = useMergeGuests();

  // Initialisiere mit besten Daten
  useEffect(() => {
    const bestData = getMergedGuestData(duplicateGroup.guests);
    setMergedData(bestData);
  }, [duplicateGroup]);

  const handleNext = () => {
    if (step === 1 && targetGuestId) {
      setStep(2);
    }
  };

  const handleBack = () => {
    setStep(1);
  };

  const handleMerge = async () => {
    const sourceGuestIds = duplicateGroup.guests
      .filter(g => g.id !== targetGuestId)
      .map(g => g.id);

    await mergeGuests.mutateAsync({
      targetGuestId,
      sourceGuestIds,
      mergedData
    });

    onMergeComplete();
    onOpenChange(false);
  };

  const targetGuest = duplicateGroup.guests.find(g => g.id === targetGuestId);
  const sourceGuests = duplicateGroup.guests.filter(g => g.id !== targetGuestId);
  const totalBookingsToMerge = sourceGuests.reduce((sum, g) => sum + g.booking_count, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            {step === 1 ? 'Ziel-Gast wählen' : 'Daten zusammenführen'}
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Welcher Eintrag soll behalten werden? Die anderen werden nach dem Zusammenführen gelöscht.
            </p>

            <RadioGroup value={targetGuestId} onValueChange={setTargetGuestId}>
              {duplicateGroup.guests.map((guest) => (
                <div
                  key={guest.id}
                  className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors ${
                    targetGuestId === guest.id 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <RadioGroupItem value={guest.id} id={guest.id} className="mt-1" />
                  <div className="flex-1 space-y-1">
                    <Label htmlFor={guest.id} className="font-medium cursor-pointer">
                      {guest.name}
                      {guest.booking_count > 0 && (
                        <Badge variant="default" className="ml-2">
                          {guest.booking_count} Buchung(en)
                        </Badge>
                      )}
                    </Label>
                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                      {guest.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {guest.email}
                        </span>
                      )}
                      {guest.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {guest.phone}
                        </span>
                      )}
                      {guest.nationality && (
                        <span className="flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          {guest.nationality}
                        </span>
                      )}
                      {guest.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {guest.city}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>{sourceGuests.length} Eintrag/Einträge</strong> werden gelöscht.
                {totalBookingsToMerge > 0 && (
                  <> <strong>{totalBookingsToMerge} Buchung(en)</strong> werden auf "{targetGuest?.name}" übertragen.</>
                )}
              </AlertDescription>
            </Alert>

            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={mergedData.name || ''}
                  onChange={(e) => setMergedData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    value={mergedData.email || ''}
                    onChange={(e) => setMergedData(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefon</Label>
                  <Input
                    id="phone"
                    value={mergedData.phone || ''}
                    onChange={(e) => setMergedData(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nationality">Nationalität</Label>
                  <Input
                    id="nationality"
                    value={mergedData.nationality || ''}
                    onChange={(e) => setMergedData(prev => ({ ...prev, nationality: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">Stadt</Label>
                  <Input
                    id="city"
                    value={mergedData.city || ''}
                    onChange={(e) => setMergedData(prev => ({ ...prev, city: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between">
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Abbrechen
              </Button>
              <Button onClick={handleNext} disabled={!targetGuestId}>
                Weiter
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Zurück
              </Button>
              <Button 
                onClick={handleMerge} 
                disabled={mergeGuests.isPending}
                variant="destructive"
              >
                {mergeGuests.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <GitMerge className="mr-2 h-4 w-4" />
                )}
                Zusammenführen
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
