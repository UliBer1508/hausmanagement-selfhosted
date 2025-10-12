import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BookingLinenOverview } from "./BookingLinenOverview";
import SmartLinenDashboard from "./SmartLinenDashboard";
import { useHouses } from "@/hooks/useHouses";
import { useBookingLinenOrders } from "@/hooks/useBookingLinenOrders";
import { useMemo } from "react";

export const SmartLinenDashboardWithTabs = () => {
  const { data: houses } = useHouses();
  const firstHouse = houses?.[0];
  
  // Calculate total urgent orders across all houses
  const totalUrgent = useMemo(() => {
    if (!houses) return 0;
    
    // This would need to be calculated by fetching status for all houses
    // For now, return 0 as placeholder
    return 0;
  }, [houses]);

  return (
    <div className="container mx-auto p-4 md:p-6">
      <Tabs defaultValue="smart-analyse" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="smart-analyse" className="relative">
            Smart-Analyse
            {totalUrgent > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                {totalUrgent}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="inventory">Inventar-Übersicht</TabsTrigger>
        </TabsList>

        <TabsContent value="smart-analyse" className="space-y-6">
          {firstHouse ? (
            <BookingLinenOverview houseId={firstHouse.id} />
          ) : (
            <div className="text-center p-8 text-muted-foreground">
              Keine Häuser gefunden. Bitte fügen Sie zuerst ein Haus hinzu.
            </div>
          )}
        </TabsContent>

        <TabsContent value="inventory">
          <SmartLinenDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
};
