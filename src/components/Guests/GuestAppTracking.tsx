import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Users, UserCheck, CheckCircle2, Star, Bot } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useHouses } from '@/hooks/useHouses';
import {
  useGuestAppSessions,
  useGuestAppStats,
  useGuestSessionDetails,
  type SessionFilters,
  type GuestAppSession,
} from '@/hooks/useGuestAppTracking';
import { GuestSessionDetail } from './GuestSessionDetail';
import { AppReviewsSection } from './AppReviewsSection';

interface GuestAppTrackingProps {
  selectedHouseId: string;
}

// Helper functions
const formatTimeAgo = (dateString: string): string => {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `vor ${minutes} Min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std`;
  const days = Math.floor(hours / 24);
  return `vor ${days} Tagen`;
};

const getDeviceBadge = (deviceType: string | null) => {
  switch (deviceType) {
    case 'mobile':
      return '📱 Mobile';
    case 'tablet':
      return '📱 Tablet';
    default:
      return '💻 Desktop';
  }
};

const getLanguageLabel = (language: string | null) => {
  switch (language?.toLowerCase()) {
    case 'de':
      return 'DE';
    case 'en':
      return 'EN';
    default:
      return language?.toUpperCase() || '-';
  }
};

const getStatus = (session: GuestAppSession) => {
  if (session.completed_onboarding) {
    return { label: 'Fertig', variant: 'default' as const, icon: '✅' };
  }
  if (session.guest_email) {
    return { label: 'Identifiziert', variant: 'secondary' as const, icon: '👤' };
  }
  return {
    label: session.furthest_step || 'welcome',
    variant: 'outline' as const,
    icon: '⏳',
  };
};

export const GuestAppTracking = ({ selectedHouseId }: GuestAppTrackingProps) => {
  const [filters, setFilters] = useState<SessionFilters>({
    timeRange: 'all',
    houseId: selectedHouseId || 'all',
    status: 'all',
    excludeBots: true,
  });
  const [selectedSession, setSelectedSession] = useState<GuestAppSession | null>(null);

  const { data: houses } = useHouses({ rental_type: 'tourist' });
  const { data: sessions, isLoading: isLoadingSessions } = useGuestAppSessions(filters);
  const { data: stats, isLoading: isLoadingStats } = useGuestAppStats(filters);
  const sessionDetails = useGuestSessionDetails(selectedSession?.session_id || null);

  // Update house filter when prop changes
  const handleHouseChange = (value: string) => {
    setFilters((prev) => ({ ...prev, houseId: value }));
  };

  // If viewing a session detail, show that instead
  if (selectedSession) {
    return (
      <GuestSessionDetail
        session={selectedSession}
        events={sessionDetails.events}
        preferences={sessionDetails.preferences}
        activities={sessionDetails.activities}
        review={sessionDetails.review}
        isLoading={sessionDetails.isLoading}
        onBack={() => setSelectedSession(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Gäste-App Tracking</h3>
        <p className="text-sm text-muted-foreground">
          Analyse der App-Nutzung durch Ihre Gäste
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sessions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats?.totalSessions || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">gesamt</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Identifiziert</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats?.identifiedGuests || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">mit Email</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Abgeschlossen</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats?.completedOnboarding || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Onboarding</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bewertung</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">
                {stats?.averageRating ? `${stats.averageRating}★` : '-'}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Durchschnitt</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select
          value={filters.timeRange}
          onValueChange={(value) =>
            setFilters((prev) => ({
              ...prev,
              timeRange: value as SessionFilters['timeRange'],
            }))
          }
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Zeitraum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Heute</SelectItem>
            <SelectItem value="7days">7 Tage</SelectItem>
            <SelectItem value="30days">30 Tage</SelectItem>
            <SelectItem value="all">Alle</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.houseId} onValueChange={handleHouseChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Haus" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Häuser</SelectItem>
            {houses?.map((house) => (
              <SelectItem key={house.id} value={house.id}>
                {house.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.status}
          onValueChange={(value) =>
            setFilters((prev) => ({
              ...prev,
              status: value as SessionFilters['status'],
            }))
          }
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="identified">Identifiziert</SelectItem>
            <SelectItem value="completed">Abgeschlossen</SelectItem>
          </SelectContent>
        </Select>

        {/* Bot Filter Toggle */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 ml-auto">
                <Bot className="h-4 w-4 text-muted-foreground" />
                <Switch
                  id="bot-filter"
                  checked={filters.excludeBots}
                  onCheckedChange={(checked) =>
                    setFilters((prev) => ({ ...prev, excludeBots: checked }))
                  }
                />
                <Label htmlFor="bot-filter" className="text-sm cursor-pointer">
                  Nur echte Nutzer
                </Label>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Bots und Crawler ausblenden (Chrome 119, LikeWise, etc.)</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Sessions Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingSessions ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : sessions && sessions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gast</TableHead>
                  <TableHead>Haus</TableHead>
                  <TableHead>Gerät</TableHead>
                  <TableHead>Sprache</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Letzte Aktivität</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => {
                  const status = getStatus(session);
                  return (
                    <TableRow
                      key={session.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedSession(session)}
                    >
                      <TableCell className="font-medium">
                        {session.guest_name || session.booking_guest_name || '[Anonym]'}
                      </TableCell>
                      <TableCell>
                        {session.house_name || '-'}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {getDeviceBadge(session.device_type)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {getLanguageLabel(session.language)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className="text-xs">
                          {status.icon} {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {formatTimeAgo(session.last_activity_at)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">Keine Sessions gefunden</p>
              <p className="text-xs mt-1">
                Passen Sie die Filter an oder warten Sie auf neue App-Nutzungen
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* App Reviews Section */}
      <AppReviewsSection selectedHouseId={filters.houseId === 'all' ? '' : filters.houseId} />
    </div>
  );
};
