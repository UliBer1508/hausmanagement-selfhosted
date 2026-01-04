import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGuestDuplicates, DuplicateGroup } from '@/hooks/useGuestDuplicates';
import { Users, Mail, Phone, Globe, Loader2, GitMerge, CheckCircle } from 'lucide-react';
import { GuestMergeDialog } from './GuestMergeDialog';

interface GuestDuplicatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const GuestDuplicatesDialog = ({ open, onOpenChange }: GuestDuplicatesDialogProps) => {
  const { data: duplicateGroups, isLoading } = useGuestDuplicates();
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null);

  const handleMergeComplete = () => {
    setSelectedGroup(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Gast-Duplikate prüfen
            </DialogTitle>
            <DialogDescription>
              Hier siehst du Gäste mit identischen oder ähnlichen Namen, die zusammengeführt werden können.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !duplicateGroups || duplicateGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
              <p className="text-lg font-medium">Keine Duplikate gefunden</p>
              <p className="text-muted-foreground">Alle Gäste sind eindeutig erfasst.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {duplicateGroups.length} Duplikat-Gruppe(n) gefunden mit insgesamt{' '}
                {duplicateGroups.reduce((sum, g) => sum + g.guests.length, 0)} Einträgen
              </p>

              {duplicateGroups.map((group) => (
                <Card key={group.normalizedName} className="border-orange-200 dark:border-orange-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        {group.guests[0]?.name}
                        <Badge variant="secondary">{group.guests.length} Einträge</Badge>
                      </span>
                      <Button
                        size="sm"
                        onClick={() => setSelectedGroup(group)}
                        className="gap-1"
                      >
                        <GitMerge className="h-4 w-4" />
                        Zusammenführen
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {group.guests.map((guest, idx) => (
                        <div
                          key={guest.id}
                          className="flex items-center justify-between text-sm p-2 rounded bg-muted/50"
                        >
                          <div className="flex items-center gap-4">
                            <span className="text-muted-foreground">#{idx + 1}</span>
                            <div className="flex items-center gap-2">
                              {guest.email && (
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <Mail className="h-3 w-3" />
                                  {guest.email}
                                </span>
                              )}
                              {guest.phone && (
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <Phone className="h-3 w-3" />
                                  {guest.phone}
                                </span>
                              )}
                              {guest.nationality && (
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <Globe className="h-3 w-3" />
                                  {guest.nationality}
                                </span>
                              )}
                            </div>
                          </div>
                          <Badge variant={guest.booking_count > 0 ? 'default' : 'outline'}>
                            {guest.booking_count} Buchung(en)
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {selectedGroup && (
        <GuestMergeDialog
          open={!!selectedGroup}
          onOpenChange={(open) => !open && setSelectedGroup(null)}
          duplicateGroup={selectedGroup}
          onMergeComplete={handleMergeComplete}
        />
      )}
    </>
  );
};
