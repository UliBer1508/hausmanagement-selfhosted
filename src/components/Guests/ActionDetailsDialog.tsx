import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, CheckCircle, Clock, Star, CalendarDays, Home, Baby, ClipboardList, BarChart3, Info } from 'lucide-react';
import { MarketingAction, useAffectedBookings, useBookingActionTracking, useActionStats, TargetCriteria } from '@/hooks/useMarketingActions';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ActionDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: MarketingAction;
}

const ActionDetailsDialog = ({ open, onOpenChange, action }: ActionDetailsDialogProps) => {
  const { data: planningBookings, isLoading: isLoadingPlanning } = useAffectedBookings(action.id, action.target_criteria, 'planning');
  const { data: evaluationBookings, isLoading: isLoadingEvaluation } = useAffectedBookings(action.id, action.target_criteria, 'evaluation');
  const { data: stats, isLoading: isLoadingStats } = useActionStats(action.id, action.target_criteria);
  const { toggleActionApplied } = useBookingActionTracking();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Aktiv</Badge>;
      case 'paused':
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Pausiert</Badge>;
      case 'completed':
        return <Badge className="bg-muted text-muted-foreground">Beendet</Badge>;
      default:
        return null;
    }
  };

  const getCriteriaLabels = (criteria: TargetCriteria) => {
    const labels: string[] = [];
    if (criteria.has_children) labels.push('👨‍👩‍👧 Familien mit Kindern');
    if (criteria.min_stays && criteria.min_stays > 1) labels.push(`🔄 Stammgäste (≥${criteria.min_stays})`);
    if (criteria.nationality) labels.push(`🌍 ${criteria.nationality}`);
    if (criteria.min_nights) labels.push(`🌙 Min. ${criteria.min_nights} Nächte`);
    return labels.length > 0 ? labels : ['📋 Alle Buchungen'];
  };

  const handleToggleApplied = async (bookingId: string, currentValue: boolean) => {
    await toggleActionApplied.mutateAsync({
      bookingId,
      actionId: action.id,
      applied: !currentValue,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle className="text-xl">{action.name}</DialogTitle>
            {getStatusBadge(action.status)}
          </div>
          <DialogDescription>
            {action.description || 'Keine Beschreibung'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Criteria */}
          <div className="flex flex-wrap gap-2">
            {getCriteriaLabels(action.target_criteria).map((label, i) => (
              <Badge key={i} variant="outline">
                {label}
              </Badge>
            ))}
          </div>

          {/* Tabs for Planning and Evaluation */}
          <Tabs defaultValue="planning" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="planning" className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Planung ({stats?.planningTotal || 0})
              </TabsTrigger>
              <TabsTrigger value="evaluation" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Auswertung ({stats?.evaluationWithRating || 0})
              </TabsTrigger>
            </TabsList>

            {/* Planning Tab */}
            <TabsContent value="planning" className="space-y-4 mt-4">
              {/* Planning Stats */}
              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <Users className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                    <div className="text-lg font-semibold">{stats?.planningTotal || 0}</div>
                    <div className="text-xs text-muted-foreground">Kommende</div>
                  </CardContent>
                </Card>
                <Card className="bg-green-500/5 border-green-500/20">
                  <CardContent className="p-3 text-center">
                    <CheckCircle className="h-4 w-4 mx-auto text-green-600 mb-1" />
                    <div className="text-lg font-semibold text-green-600">{stats?.planningApplied || 0}</div>
                    <div className="text-xs text-muted-foreground">Angewendet</div>
                  </CardContent>
                </Card>
                <Card className="bg-yellow-500/5 border-yellow-500/20">
                  <CardContent className="p-3 text-center">
                    <Clock className="h-4 w-4 mx-auto text-yellow-600 mb-1" />
                    <div className="text-lg font-semibold text-yellow-600">{stats?.planningPending || 0}</div>
                    <div className="text-xs text-muted-foreground">Offen</div>
                  </CardContent>
                </Card>
              </div>

              {/* Planning Bookings List */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-medium">Kommende Buchungen</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {isLoadingPlanning ? (
                    <div className="p-4 space-y-3">
                      {[1, 2, 3].map(i => (
                        <Skeleton key={i} className="h-16" />
                      ))}
                    </div>
                  ) : planningBookings && planningBookings.length > 0 ? (
                    <ScrollArea className="h-[250px]">
                      <div className="divide-y">
                        {planningBookings.map(booking => {
                          const checkIn = new Date(booking.check_in);
                          const checkOut = new Date(booking.check_out);
                          const hasChildren = (booking.number_of_children || 0) > 0;

                          return (
                            <div
                              key={booking.id}
                              className={`p-3 flex items-center gap-3 ${
                                booking.actionApplied ? 'bg-green-500/5' : ''
                              }`}
                            >
                              <Checkbox
                                checked={booking.actionApplied}
                                onCheckedChange={() => handleToggleApplied(booking.id, booking.actionApplied)}
                              />
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium truncate">{booking.guest_name}</span>
                                  {hasChildren && (
                                    <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 border-purple-500/20">
                                      <Baby className="h-3 w-3 mr-1" />
                                      {booking.number_of_children} Kind{(booking.number_of_children || 0) > 1 ? 'er' : ''}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                  <span className="flex items-center gap-1">
                                    <CalendarDays className="h-3 w-3" />
                                    {format(checkIn, 'dd.MM.yy', { locale: de })} - {format(checkOut, 'dd.MM.yy', { locale: de })}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Home className="h-3 w-3" />
                                    {(booking.houses as any)?.name || 'Unbekannt'}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    {booking.number_of_guests} Gäste
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">
                      Keine kommenden Buchungen entsprechen den Kriterien
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Evaluation Tab */}
            <TabsContent value="evaluation" className="space-y-4 mt-4">
              {/* Evaluation Stats */}
              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <CheckCircle className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                    <div className="text-lg font-semibold">{stats?.evaluationTotal || 0}</div>
                    <div className="text-xs text-muted-foreground">Abgeschlossen</div>
                  </CardContent>
                </Card>
                <Card className="bg-amber-500/5 border-amber-500/20">
                  <CardContent className="p-3 text-center">
                    <Star className="h-4 w-4 mx-auto text-amber-600 mb-1" />
                    <div className="text-lg font-semibold text-amber-600">
                      {stats?.avgRating ? `${stats.avgRating.toFixed(1)}/10` : '-'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {stats?.evaluationWithRating || 0} Bewertung{(stats?.evaluationWithRating || 0) !== 1 ? 'en' : ''}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Evaluation Bookings List */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-medium">Abgeschlossene Buchungen mit Bewertung</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {isLoadingEvaluation ? (
                    <div className="p-4 space-y-3">
                      {[1, 2, 3].map(i => (
                        <Skeleton key={i} className="h-16" />
                      ))}
                    </div>
                  ) : evaluationBookings && evaluationBookings.length > 0 ? (
                    <ScrollArea className="h-[250px]">
                      <div className="divide-y">
                        {evaluationBookings.map(booking => {
                          const checkIn = new Date(booking.check_in);
                          const checkOut = new Date(booking.check_out);
                          const hasChildren = (booking.number_of_children || 0) > 0;

                          return (
                            <div key={booking.id} className="p-3 flex items-center gap-3">
                              <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium truncate">{booking.guest_name}</span>
                                  {hasChildren && (
                                    <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 border-purple-500/20">
                                      <Baby className="h-3 w-3 mr-1" />
                                      {booking.number_of_children} Kind{(booking.number_of_children || 0) > 1 ? 'er' : ''}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                  <span className="flex items-center gap-1">
                                    <CalendarDays className="h-3 w-3" />
                                    {format(checkIn, 'dd.MM.yy', { locale: de })} - {format(checkOut, 'dd.MM.yy', { locale: de })}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Home className="h-3 w-3" />
                                    {(booking.houses as any)?.name || 'Unbekannt'}
                                  </span>
                                </div>
                              </div>

                              {/* Rating */}
                              <div className="text-right">
                                {booking.rating !== null ? (
                                  <div className="flex flex-col items-end">
                                    <div className="flex items-center gap-1 text-amber-600">
                                      <Star className="h-4 w-4 fill-amber-500" />
                                      <span className="font-medium">{booking.rating.toFixed(1)}/10</span>
                                    </div>
                                    {booking.external_rating && booking.platform && !booking.platform.toLowerCase().includes('booking') && (
                                      <span className="text-xs text-muted-foreground">
                                        ({booking.external_rating}★ {booking.platform})
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Keine Bewertung</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="p-6">
                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                          Noch keine abgeschlossenen Buchungen mit angewendeter Aktion und Bewertung. 
                          Die Auswertung wird verfügbar, sobald Gäste nach ihrem Aufenthalt Bewertungen abgeben.
                        </AlertDescription>
                      </Alert>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ActionDetailsDialog;
