import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LogOut, Sparkles } from 'lucide-react';
import { CheckOutData } from '@/hooks/useOperationsDashboard';
import { format, isToday } from 'date-fns';
import { de } from 'date-fns/locale';

interface CheckOutsCardProps {
  checkOuts: CheckOutData[];
}

export function CheckOutsCard({ checkOuts }: CheckOutsCardProps) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <LogOut className="h-4 w-4 text-orange-500" />
          Abreisen
          <Badge variant="secondary" className="ml-auto">
            {checkOuts.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
        {checkOuts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Keine Abreisen in diesem Zeitraum
          </p>
        ) : (
          checkOuts.map((checkOut) => (
            <div
              key={checkOut.id}
              className={`p-3 rounded-lg border ${
                isToday(checkOut.checkOut)
                  ? 'bg-yellow-500/10 border-yellow-500/30'
                  : 'bg-muted/50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="font-medium text-sm">{checkOut.guestName}</p>
                  <p className="text-xs text-muted-foreground">{checkOut.houseName}</p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-xs font-medium">
                    {format(checkOut.checkOut, 'EEE, dd.MM.', { locale: de })}
                  </p>
                  {checkOut.hasCleaningTask && (
                    <div className="flex items-center gap-1 text-xs text-green-600 justify-end">
                      <Sparkles className="h-3 w-3" />
                      Reinigung
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                {isToday(checkOut.checkOut) && (
                  <Badge variant="outline" className="text-xs bg-yellow-500/20 text-yellow-700 border-yellow-500/30">
                    Heute
                  </Badge>
                )}
                {!checkOut.hasCleaningTask && (
                  <Badge variant="outline" className="text-xs bg-red-500/20 text-red-700 border-red-500/30">
                    Keine Reinigung
                  </Badge>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
