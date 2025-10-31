import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { TrendingUp, Users, RefreshCw } from "lucide-react";
import { useCompetitorProperties, usePriceComparison } from "@/hooks/useCompetitorAnalysis";
import PriceComparisonTable from './PriceComparisonTable';
import PriceComparisonChart from './PriceComparisonChart';
import CompetitorSearchDialog from './CompetitorSearchDialog';
import CompetitorCard from './CompetitorCard';
import OwnPricingDialog from './OwnPricingDialog';
import AdditionalFeesDialog from './AdditionalFeesDialog';
import ManualCompetitorDialog from './ManualCompetitorDialog';
import CompetitorPriceHistoryList from './CompetitorPriceHistoryList';
import ScrapePricesDialog from './ScrapePricesDialog';
import { format } from 'date-fns';

interface CompetitorAnalysisDashboardProps {
  house_id: string;
  house_name: string;
}

const CompetitorAnalysisDashboard = ({ house_id, house_name }: CompetitorAnalysisDashboardProps) => {
  // Zeitraum für monatliche Preise: Aktueller Monat bis +12 Monate
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // 1-12
  
  const [dateRange, setDateRange] = useState({
    from: `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`,
    to: `${currentYear + 1}-${String(currentMonth).padStart(2, '0')}-28`
  });

  const { data: competitors, isLoading: competitorsLoading } = useCompetitorProperties(house_id);
  const { data: priceData, isLoading: priceLoading } = usePriceComparison(
    house_id,
    dateRange.from,
    dateRange.to
  );

  const stats = {
    competitorCount: competitors?.length || 0,
    ownPricesCount: priceData?.own_prices_count || 0,
    competitorPricesCount: priceData?.competitor_prices_count || 0,
    avgPriceDifference: priceData?.comparison_data
      ? priceData.comparison_data
          .filter(d => d.price_difference_percent !== undefined)
          .reduce((sum, d) => sum + (d.price_difference_percent || 0), 0) /
        priceData.comparison_data.filter(d => d.price_difference_percent !== undefined).length || 0
      : 0
  };

  return (
    <div className="space-y-6">
      {/* Header mit Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6" />
            Wettbewerbsanalyse
          </h2>
          <p className="text-muted-foreground mt-1">{house_name}</p>
        </div>
        <div className="flex gap-2">
          <AdditionalFeesDialog house_id={house_id} />
          <OwnPricingDialog house_id={house_id} />
          <ManualCompetitorDialog house_id={house_id} />
          <CompetitorSearchDialog house_id={house_id} />
          <ScrapePricesDialog 
            house_id={house_id} 
            disabled={!competitors || competitors.length === 0}
          />
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Wettbewerber
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.competitorCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Aktive Properties</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Eigene Preise
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.ownPricesCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Im gewählten Zeitraum</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Wettbewerber-Preise
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.competitorPricesCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Gesammelte Datenpunkte</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ø Preisdifferenz
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${
              stats.avgPriceDifference > 0 ? 'text-orange-600' : 
              stats.avgPriceDifference < 0 ? 'text-green-600' : 
              'text-muted-foreground'
            }`}>
              {stats.avgPriceDifference > 0 ? '+' : ''}
              {Math.round(stats.avgPriceDifference)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.avgPriceDifference > 10 ? 'Teurer als Markt' : 
               stats.avgPriceDifference < -10 ? 'Günstiger als Markt' : 
               'Im Marktdurchschnitt'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs mit Detailansichten */}
      <Tabs defaultValue="comparison" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="comparison">Preisvergleich</TabsTrigger>
          <TabsTrigger value="competitors">Wettbewerber ({stats.competitorCount})</TabsTrigger>
          <TabsTrigger value="chart">Visualisierung</TabsTrigger>
          <TabsTrigger value="price-history">Preisentwicklung</TabsTrigger>
        </TabsList>

        <TabsContent value="comparison" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Detaillierter Preisvergleich</CardTitle>
              <CardDescription>
                Ihre Preise im Vergleich zu {stats.competitorCount} Wettbewerbern
              </CardDescription>
            </CardHeader>
            <CardContent>
              {priceLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : priceData && priceData.comparison_data.length > 0 ? (
                <PriceComparisonTable 
                  data={priceData.comparison_data} 
                  competitors={priceData.competitors}
                />
              ) : (
                <div className="text-center py-12 text-muted-foreground space-y-4">
                  <p className="text-lg font-medium">Keine Preisdaten verfügbar</p>
                  <div className="space-y-2 text-sm">
                    <p>Um den Preisvergleich zu starten, benötigen Sie:</p>
                    <ol className="list-decimal list-inside space-y-1 text-left max-w-md mx-auto">
                      <li>Eigene monatliche Preise eingeben (Button "Eigene Preise eingeben")</li>
                      <li>Wettbewerber-Preise scrapen (Button "Preise aktualisieren")</li>
                    </ol>
                  </div>
                  <div className="flex gap-2 justify-center pt-4">
                    <OwnPricingDialog 
                      house_id={house_id}
                      trigger={
                        <Button variant="default">
                          1. Eigene Preise eingeben
                        </Button>
                      }
                    />
                    <ScrapePricesDialog 
                      house_id={house_id}
                      disabled={stats.competitorCount === 0}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="competitors" className="space-y-4">
          {competitorsLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : competitors && competitors.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {competitors.map(competitor => (
                <CompetitorCard
                  key={competitor.id}
                  competitor={competitor}
                  house_id={house_id}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">Noch keine Wettbewerber</p>
                <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
                  Suchen Sie nach vergleichbaren Ferienhäusern in Ihrer Region, um Ihre Preise zu optimieren.
                </p>
                <CompetitorSearchDialog house_id={house_id} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="chart" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Preisverlauf</CardTitle>
              <CardDescription>
                Vergleich Ihrer Preise mit dem Marktdurchschnitt über Zeit
              </CardDescription>
            </CardHeader>
            <CardContent>
              {priceLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : priceData && priceData.comparison_data.length > 0 ? (
                <PriceComparisonChart 
                  data={priceData.comparison_data}
                  competitors={priceData.competitors}
                />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Keine Daten zum Visualisieren verfügbar.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="price-history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Preisentwicklung pro Wettbewerber</CardTitle>
              <CardDescription>
                Langzeit-Analyse über 12 Monate für jeden Wettbewerber
              </CardDescription>
            </CardHeader>
            <CardContent>
              {competitorsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : competitors && competitors.length > 0 ? (
                <CompetitorPriceHistoryList 
                  competitors={competitors}
                  house_id={house_id}
                />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Keine Wettbewerber vorhanden.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CompetitorAnalysisDashboard;
