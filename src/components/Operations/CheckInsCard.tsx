import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LogIn, Users } from 'lucide-react';
import { CheckInData } from '@/hooks/useOperationsDashboard';
import { format, isToday } from 'date-fns';
import { de } from 'date-fns/locale';

interface CheckInsCardProps {
  checkIns: CheckInData[];
}

export function CheckInsCard({ checkIns }: CheckInsCardProps) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <LogIn className="h-4 w-4 text-green-500" />
          Ankünfte
          <Badge variant="secondary" className="ml-auto">
            {checkIns.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
        {checkIns.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Keine Ankünfte in diesem Zeitraum
          </p>
        ) : (
          checkIns.map((checkIn) => (
            <div
              key={checkIn.id}
              className={`p-3 rounded-lg border ${
                isToday(checkIn.checkIn)
                  ? 'bg-yellow-500/10 border-yellow-500/30'
                  : 'bg-muted/50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="font-medium text-sm">{checkIn.guestName}</p>
                  <p className="text-xs text-muted-foreground">{checkIn.houseName}</p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-xs font-medium">
                    {format(checkIn.checkIn, 'EEE, dd.MM.', { locale: de })}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
                    <Users className="h-3 w-3" />
                    {checkIn.guestCount}
                  </div>
                </div>
              </div>
              {isToday(checkIn.checkIn) && (
                <Badge variant="outline" className="mt-2 text-xs bg-yellow-500/20 text-yellow-700 border-yellow-500/30">
                  Heute
                </Badge>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
