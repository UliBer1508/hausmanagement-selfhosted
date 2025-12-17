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
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, CheckCircle, Clock, Star, CalendarDays, Home, Baby } from 'lucide-react';
import { MarketingAction, useAffectedBookings, useBookingActionTracking, TargetCriteria } from '@/hooks/useMarketingActions';
import { formatRatingDisplay } from '@/lib/ratingHelpers';

interface ActionDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: MarketingAction;
}

const ActionDetailsDialog = ({ open, onOpenChange, action }: ActionDetailsDialogProps) => {
  const { data: bookings, isLoading } = useAffectedBookings(action.id, action.target_criteria);
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

  // Calculate stats
  const totalAffected = bookings?.length || 0;
  const applied = bookings?.filter(b => b.actionApplied).length || 0;
  const pending = totalAffected - applied;
  const reviewsWithRating = bookings?.filter(b => b.rating !== null) || [];
  const avgRating = reviewsWithRating.length > 0
    ? reviewsWithRating.reduce((sum, b) => sum + (b.rating || 0), 0) / reviewsWithRating.length
    : null;

  const now = new Date();

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

          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <Users className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <div className="text-lg font-semibold">{totalAffected}</div>
                <div className="text-xs text-muted-foreground">Betroffen</div>
              </CardContent>
            </Card>
            <Card className="bg-green-500/5 border-green-500/20">
              <CardContent className="p-3 text-center">
                <CheckCircle className="h-4 w-4 mx-auto text-green-600 mb-1" />
                <div className="text-lg font-semibold text-green-600">{applied}</div>
                <div className="text-xs text-muted-foreground">Erledigt</div>
              </CardContent>
            </Card>
            <Card className="bg-yellow-500/5 border-yellow-500/20">
              <CardContent className="p-3 text-center">
                <Clock className="h-4 w-4 mx-auto text-yellow-600 mb-1" />
                <div className="text-lg font-semibold text-yellow-600">{pending}</div>
                <div className="text-xs text-muted-foreground">Offen</div>
              </CardContent>
            </Card>
            <Card className="bg-amber-500/5 border-amber-500/20">
              <CardContent className="p-3 text-center">
                <Star className="h-4 w-4 mx-auto text-amber-600 mb-1" />
                <div className="text-lg font-semibold text-amber-600">
                  {avgRating ? `${avgRating.toFixed(1)}/10` : '-'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {reviewsWithRating.length} Bewertung{reviewsWithRating.length !== 1 ? 'en' : ''}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bookings List */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium">Betroffene Buchungen</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              ) : bookings && bookings.length > 0 ? (
                <ScrollArea className="h-[300px]">
                  <div className="divide-y">
                    {bookings.map(booking => {
                      const checkIn = new Date(booking.check_in);
                      const checkOut = new Date(booking.check_out);
                      const isPast = checkOut < now;
                      const isCurrent = checkIn <= now && checkOut >= now;
                      const isFuture = checkIn > now;
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
                              {isPast && <Badge variant="secondary" className="text-xs">Vergangen</Badge>}
                              {isCurrent && <Badge className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/20">Aktuell</Badge>}
                              {isFuture && <Badge className="text-xs bg-green-500/10 text-green-600 border-green-500/20">Zukünftig</Badge>}
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

                          {/* Rating - now shows normalized rating with platform detail */}
                          <div className="text-right">
                            {booking.rating !== null && booking.normalized_rating !== null ? (
                              <div className="flex flex-col items-end">
                                <div className="flex items-center gap-1 text-amber-600">
                                  <Star className="h-4 w-4 fill-amber-500" />
                                  <span className="font-medium">{booking.normalized_rating.toFixed(1)}/10</span>
                                </div>
                                {booking.external_rating && booking.platform && !booking.platform.toLowerCase().includes('booking') && (
                                  <span className="text-xs text-muted-foreground">
                                    ({booking.external_rating}★ {booking.platform})
                                  </span>
                                )}
                              </div>
                            ) : isPast ? (
                              <span className="text-xs text-muted-foreground">Keine Bewertung</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  Keine Buchungen entsprechen den Kriterien
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ActionDetailsDialog;
