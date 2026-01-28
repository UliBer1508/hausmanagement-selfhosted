import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Smartphone, Star, Mail, Phone, TrendingUp, Users, Calendar, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useState } from 'react';

interface AppReviewsSectionProps {
  selectedHouseId: string;
}

interface AppReview {
  id: string;
  guest_name: string;
  guest_email: string;
  rating: number;
  feedback_text: string | null;
  submitted_from_screen: string;
  preferred_language: string;
  created_at: string;
  booking_id: string;
  bookings: {
    id: string;
    guest_name: string;
    guest_email: string;
    guest_phone: string | null;
    nationality: string | null;
    check_in: string;
    check_out: string;
    number_of_guests: number;
    house_id: string;
    houses: {
      name: string;
    };
  };
}

export const AppReviewsSection = ({ selectedHouseId }: AppReviewsSectionProps) => {
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set());

  // Fetch app reviews with booking and house data
  const { data: appReviews, isLoading } = useQuery<AppReview[]>({
    queryKey: ['app-reviews', selectedHouseId],
    queryFn: async () => {
      let query = (supabase as any)
        .from('app_reviews')
        .select(`
          id,
          guest_name,
          guest_email,
          rating,
          feedback_text,
          submitted_from_screen,
          preferred_language,
          created_at,
          booking_id,
          bookings!inner(
            id,
            guest_name,
            guest_email,
            guest_phone,
            nationality,
            check_in,
            check_out,
            number_of_guests,
            house_id,
            houses!bookings_house_id_fkey!inner(
              name
            )
          )
        `)
        .order('created_at', { ascending: false });
      
      if (selectedHouseId && selectedHouseId !== 'all') {
        query = query.eq('bookings.house_id', selectedHouseId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      return (data || []) as unknown as AppReview[];
    }
  });

  // Fetch total bookings for participation rate
  const { data: totalBookingsCount } = useQuery({
    queryKey: ['total-bookings-count', selectedHouseId],
    queryFn: async () => {
      let query = supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true });
      
      if (selectedHouseId && selectedHouseId !== 'all') {
        query = query.eq('house_id', selectedHouseId);
      }
      
      const { count } = await query;
      return count || 0;
    }
  });

  // Calculate statistics
  const avgRating = appReviews?.length 
    ? (appReviews.reduce((sum, r) => sum + r.rating, 0) / appReviews.length).toFixed(1)
    : '0';

  const participationRate = totalBookingsCount && appReviews?.length
    ? ((appReviews.length / totalBookingsCount) * 100).toFixed(0)
    : '0';

  const last30Days = new Date();
  last30Days.setDate(last30Days.getDate() - 30);
  const recentReviews = appReviews?.filter(r => 
    new Date(r.created_at) >= last30Days
  ).length || 0;

  const toggleExpand = (reviewId: string) => {
    setExpandedReviews(prev => {
      const newSet = new Set(prev);
      if (newSet.has(reviewId)) {
        newSet.delete(reviewId);
      } else {
        newSet.add(reviewId);
      }
      return newSet;
    });
  };

  const getRatingColor = (rating: number) => {
    if (rating === 5) return 'text-green-600';
    if (rating === 4) return 'text-lime-500';
    if (rating === 3) return 'text-yellow-500';
    if (rating === 2) return 'text-orange-500';
    return 'text-red-500';
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-4 w-4 ${i < rating ? getRatingColor(rating) : 'text-muted'}`}
            fill={i < rating ? 'currentColor' : 'none'}
          />
        ))}
        <span className={`ml-1 font-semibold ${getRatingColor(rating)}`}>
          {rating}/5
        </span>
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            App-Bewertungen von Gästen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 bg-muted rounded" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!appReviews || appReviews.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            App-Bewertungen von Gästen
          </CardTitle>
          <CardDescription>Feedback zur Gäste-App</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Smartphone className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Noch keine App-Bewertungen</h3>
            <p className="text-muted-foreground">
              Sobald Gäste die App bewerten, erscheinen die Bewertungen hier.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-5 w-5" />
          App-Bewertungen von Gästen
        </CardTitle>
        <CardDescription>Feedback zur Gäste-App</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 mb-2">
                  <Star className="h-5 w-5 text-yellow-500" fill="currentColor" />
                  <span className="text-2xl font-bold">{avgRating}</span>
                  <span className="text-muted-foreground">/5</span>
                </div>
                <p className="text-sm text-muted-foreground">Ø Rating</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  <span className="text-2xl font-bold">{appReviews.length}</span>
                </div>
                <p className="text-sm text-muted-foreground">Bewertungen</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Users className="h-5 w-5 text-blue-500" />
                  <span className="text-2xl font-bold">{participationRate}%</span>
                </div>
                <p className="text-sm text-muted-foreground">Teilnahme</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                  <span className="text-2xl font-bold">+{recentReviews}</span>
                </div>
                <p className="text-sm text-muted-foreground">Letzte 30 Tage</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Reviews Table */}
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-4 font-semibold text-sm">Datum</th>
                  <th className="text-left p-4 font-semibold text-sm">Gast</th>
                  <th className="text-left p-4 font-semibold text-sm">Kontakt</th>
                  <th className="text-left p-4 font-semibold text-sm">Haus</th>
                  <th className="text-left p-4 font-semibold text-sm">Rating</th>
                </tr>
              </thead>
              <tbody>
                {appReviews.map((review) => {
                  const booking = review.bookings;
                  const isExpanded = expandedReviews.has(review.id);
                  const hasFeedback = review.feedback_text && review.feedback_text.trim();
                  const needsTruncation = hasFeedback && review.feedback_text.length > 100;

                  return (
                    <tr key={review.id} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {format(new Date(review.created_at), 'dd.MM.yyyy', { locale: de })}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold">{booking.guest_name}</div>
                        {booking.nationality && (
                          <div className="text-xs text-muted-foreground">{booking.nationality}</div>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-2">
                          <a href={`mailto:${booking.guest_email}`}>
                            <Button variant="outline" size="sm" className="w-full justify-start">
                              <Mail className="h-3 w-3 mr-2" />
                              Email
                            </Button>
                          </a>
                          {booking.guest_phone && (
                            <a href={`tel:${booking.guest_phone}`}>
                              <Button variant="outline" size="sm" className="w-full justify-start">
                                <Phone className="h-3 w-3 mr-2" />
                                Anrufen
                              </Button>
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm font-medium">{booking.houses.name}</div>
                      </td>
                      <td className="p-4">
                        {renderStars(review.rating)}
                      </td>
                      <td className="p-4" colSpan={5}>
                        {hasFeedback && (
                          <div className="mt-2 pt-2 border-t">
                            <div className="flex items-start gap-2">
                              <MessageSquare className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                              <div className="flex-1">
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                  {needsTruncation && !isExpanded
                                    ? `${review.feedback_text.substring(0, 100)}...`
                                    : review.feedback_text}
                                </p>
                                {needsTruncation && (
                                  <Button
                                    variant="link"
                                    size="sm"
                                    onClick={() => toggleExpand(review.id)}
                                    className="p-0 h-auto mt-1"
                                  >
                                    {isExpanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
