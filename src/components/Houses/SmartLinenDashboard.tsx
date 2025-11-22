import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Package,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  ShoppingCart,
  Home,
  Clock,
  Calendar,
  Users,
  Bed,
  Bath,
  ChefHat,
  Sparkles,
  ArrowRight,
  Target,
  BarChart3
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useOptimizedLinenManagement, HouseLinenOverview, LinenDemandAnalysis } from '@/hooks/useOptimizedLinenManagement';
import LinenInventoryDialog from './LinenInventoryDialog';
import { useToast } from '@/hooks/use-toast';

const SmartLinenDashboard = () => {
  const [selectedHouse, setSelectedHouse] = useState<any>(null);
  const { housesWithLinenData, isLoading, createOptimizedOrderMutation } = useOptimizedLinenManagement();
  const { toast } = useToast();

  // Calculate overall statistics
  const overallStats = {
    totalHouses: housesWithLinenData?.length || 0,
    criticalHouses: housesWithLinenData?.filter(h => h.status === 'critical').length || 0,
    warningHouses: housesWithLinenData?.filter(h => h.status === 'warning').length || 0,
    goodHouses: housesWithLinenData?.filter(h => h.status === 'good').length || 0,
    totalCriticalItems: housesWithLinenData?.reduce((sum, h) => sum + h.criticalCount, 0) || 0,
    urgentBookings: housesWithLinenData?.filter(h => h.nextBookingDaysAway !== undefined && h.nextBookingDaysAway <= 2).length || 0,
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'bedroom': return <Bed className="w-4 h-4" />;
      case 'bathroom': return <Bath className="w-4 h-4" />;
      case 'kitchen': return <ChefHat className="w-4 h-4" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'bedroom': return 'hsl(var(--primary))';
      case 'bathroom': return 'hsl(210, 100%, 60%)';  
      case 'kitchen': return 'hsl(35, 100%, 55%)';
      default: return 'hsl(var(--muted-foreground))';
    }
  };

  const getStatusColor = (status: HouseLinenOverview['status']) => {
    switch (status) {
      case 'good': return 'border-green-200 bg-green-50/50';
      case 'warning': return 'border-yellow-200 bg-yellow-50/50';
      case 'critical': return 'border-red-200 bg-red-50/50';
      default: return 'border-muted bg-background';
    }
  };

  const getStatusBadge = (status: HouseLinenOverview['status'], nextBookingDays?: number) => {
    const isUrgent = nextBookingDays !== undefined && nextBookingDays <= 2;
    
    switch (status) {
      case 'good': 
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200">
            <CheckCircle className="w-3 h-3 mr-1" />
            Gut versorgt
          </Badge>
        );
      case 'warning': 
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
            <AlertTriangle className="w-3 h-3 mr-1" />
            {isUrgent ? 'Niedrig - DRINGEND' : 'Niedrig'}
          </Badge>
        );
      case 'critical': 
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200 animate-pulse">
            <AlertTriangle className="w-3 h-3 mr-1" />
            {isUrgent ? 'KRITISCH - SOFORT' : 'Kritisch'}
          </Badge>
        );
      default: 
        return null;
    }
  };

  const getTrendIcon = (trend: LinenDemandAnalysis['trend']) => {
    switch (trend) {
      case 'increasing': return <TrendingUp className="w-3 h-3 text-red-500" />;
      case 'decreasing': return <TrendingDown className="w-3 h-3 text-green-500" />;
      case 'stable': return <Minus className="w-3 h-3 text-muted-foreground" />;
    }
  };

  const handleQuickOrder = async (houseOverview: HouseLinenOverview) => {
    const criticalItems: Record<string, number> = {};
    
    // Collect critical items from all categories
    Object.values(houseOverview.categories).flat().forEach(item => {
      if (item.status === 'critical') {
        criticalItems[item.itemType] = item.deficit;
      }
    });

    if (Object.keys(criticalItems).length > 0) {
      const priority = houseOverview.nextBookingDaysAway !== undefined && houseOverview.nextBookingDaysAway <= 2 ? 'urgent' : 'normal';
      
      createOptimizedOrderMutation.mutate({
        houseId: houseOverview.house.id,
        orderItems: criticalItems,
        priority,
        notes: `Schnellbestellung: ${Object.keys(criticalItems).length} kritische Artikel${priority === 'urgent' ? ' - DRINGEND' : ''}`
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Intelligente Analyse läuft...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      {/* Smart Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Smart Wäsche-Dashboard</h1>
          </div>
          <p className="text-muted-foreground">
            KI-gestützte Bedarfsanalyse und prädiktive Nachbestellung
          </p>
        </div>
      </div>

      {/* Critical Action Alert */}
      {(overallStats.criticalHouses > 0 || overallStats.urgentBookings > 0) && (
        <Alert variant="destructive" className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-orange-500/10" />
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <strong>Sofortige Aufmerksamkeit erforderlich:</strong>{' '}
                {overallStats.criticalHouses > 0 && `${overallStats.criticalHouses} Häuser kritisch`}
                {overallStats.criticalHouses > 0 && overallStats.urgentBookings > 0 && ', '}
                {overallStats.urgentBookings > 0 && `${overallStats.urgentBookings} Check-ins in ≤2 Tagen`}
              </div>
              <Button size="sm" className="shrink-0">
                <Target className="w-4 h-4 mr-1" />
                Alle kritischen bestellen
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Smart Status Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Card className="relative overflow-hidden">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2">
              <Home className="w-4 md:w-5 h-4 md:h-5 text-muted-foreground" />
              <div>
                <div className="text-xl md:text-2xl font-bold">{overallStats.totalHouses}</div>
                <div className="text-xs md:text-sm text-muted-foreground">Häuser</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-green-200 bg-green-50/50">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 md:w-5 h-4 md:h-5 text-green-600" />
              <div>
                <div className="text-xl md:text-2xl font-bold text-green-600">{overallStats.goodHouses}</div>
                <div className="text-xs md:text-sm text-muted-foreground">Optimal</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-yellow-200 bg-yellow-50/50">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 md:w-5 h-4 md:h-5 text-yellow-600" />
              <div>
                <div className="text-xl md:text-2xl font-bold text-yellow-600">{overallStats.warningHouses}</div>
                <div className="text-xs md:text-sm text-muted-foreground">Überwachen</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-red-200 bg-red-50/50">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 md:w-5 h-4 md:h-5 text-red-600" />
              <div>
                <div className="text-xl md:text-2xl font-bold text-red-600">{overallStats.criticalHouses}</div>
                <div className="text-xs md:text-sm text-muted-foreground">Handeln</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Smart Houses Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
        {housesWithLinenData?.map((houseOverview) => (
          <Card key={houseOverview.house.id} className={`relative ${getStatusColor(houseOverview.status)} transition-all hover:shadow-lg`}>
            <CardHeader className="p-3 md:pb-3 md:px-6 md:pt-6">
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-sm md:text-base lg:text-lg truncate leading-tight">
                      {houseOverview.house.name}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5 md:mt-1 truncate">
                      {houseOverview.house.address}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {getStatusBadge(houseOverview.status, houseOverview.nextBookingDaysAway)}
                  </div>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-3 md:space-y-4 p-3 md:p-6 pt-0">
              {/* Next Booking Urgency */}
              {houseOverview.nextBookingDate && (
                <div className={`flex items-center gap-1.5 md:gap-2 p-1.5 md:p-2 rounded-lg ${
                  houseOverview.nextBookingDaysAway! <= 2 ? 'bg-red-50 border border-red-200' : 'bg-muted/50'
                }`}>
                  <Clock className="w-3 h-3 md:w-4 md:h-4 text-muted-foreground shrink-0" />
                  <div className="text-xs">
                    <span className="font-medium">
                      {houseOverview.nextBookingDaysAway === 0 ? 'Heute' :
                       houseOverview.nextBookingDaysAway === 1 ? 'Morgen' :
                       `In ${houseOverview.nextBookingDaysAway} Tagen`}
                    </span>
                    <span className="text-muted-foreground ml-1">
                      ({format(new Date(houseOverview.nextBookingDate), 'dd.MM', { locale: de })})
                    </span>
                  </div>
                </div>
              )}

              {/* Hierarchical Category Status */}
              <div className="space-y-2 md:space-y-3">
                {Object.entries(houseOverview.categories).map(([categoryKey, items]) => {
                  if (items.length === 0) return null;
                  
                  const criticalInCategory = items.filter(item => item.status === 'critical').length;
                  const lowInCategory = items.filter(item => item.status === 'low').length;
                  const totalInCategory = items.length;
                  
                  return (
                    <div key={categoryKey} className="space-y-1.5 md:space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
                          {getCategoryIcon(categoryKey)}
                          <span className="text-xs md:text-sm font-medium truncate">
                            {categoryKey === 'bedroom' ? 'Schlafbereich' :
                             categoryKey === 'bathroom' ? 'Badbereich' : 'Küchenbereich'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 shrink-0">
                          {criticalInCategory > 0 && (
                            <Badge variant="destructive" className="text-[10px] md:text-xs px-1 md:px-1.5 py-0 md:py-0.5 h-4 md:h-auto">
                              {criticalInCategory}
                            </Badge>
                          )}
                          {lowInCategory > 0 && (
                            <Badge variant="outline" className="text-[10px] md:text-xs px-1 md:px-1.5 py-0 md:py-0.5 h-4 md:h-auto bg-yellow-50 text-yellow-700 border-yellow-200">
                              {lowInCategory}
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      {/* Category items summary */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 md:gap-2">
                        {items.slice(0, 4).map(item => (
                          <div key={item.itemType} className="flex items-center justify-between p-1.5 md:p-2 rounded bg-background/50 text-xs min-w-0">
                            <span className="truncate flex-1 mr-1">{item.label.replace(/\w+\s/, '')}</span>
                            <div className="flex items-center gap-0.5 md:gap-1 shrink-0">
                              {getTrendIcon(item.trend)}
                              {item.deficit > 0 ? (
                                <span className="text-red-600 font-medium text-xs">-{item.deficit}</span>
                              ) : (
                                <span className="text-green-600 text-xs">✓</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col xs:flex-row gap-1.5 md:gap-2 pt-1 md:pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs h-8 md:h-9"
                  onClick={() => setSelectedHouse(houseOverview.house)}
                >
                  <Package className="w-3 h-3 md:w-4 md:h-4 md:mr-1" />
                  <span className="hidden xs:inline ml-1">Wäsche verwalten</span>
                  <span className="xs:hidden">Wäsche</span>
                </Button>
                {houseOverview.criticalCount > 0 && (
                  <Button
                    size="sm"
                    className="flex-1 text-xs h-8 md:h-9"
                    onClick={() => handleQuickOrder(houseOverview)}
                    disabled={createOptimizedOrderMutation.isPending}
                  >
                    <ShoppingCart className="w-3 h-3 md:w-4 md:h-4 md:mr-1" />
                    <span className="ml-1">
                      {houseOverview.nextBookingDaysAway !== undefined && houseOverview.nextBookingDaysAway <= 2 
                        ? 'Express' : 'Bestellen'}
                    </span>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {housesWithLinenData?.length === 0 && (
        <div className="text-center py-12">
          <Sparkles className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Keine Daten verfügbar</h3>
          <p className="text-muted-foreground">
            Fügen Sie Häuser und Wäsche-Definitionen hinzu, um die intelligente Analyse zu nutzen.
          </p>
        </div>
      )}

      {/* Linen Inventory Dialog */}
      <LinenInventoryDialog
        house={selectedHouse}
        open={!!selectedHouse}
        onOpenChange={(open) => !open && setSelectedHouse(null)}
      />
    </div>
  );
};

export default SmartLinenDashboard;