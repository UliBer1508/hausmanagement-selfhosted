import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Download, RefreshCw } from "lucide-react";
import { useSyncAirROI } from "@/hooks/useAirROI";

const MarketDataImportCard = () => {
  const [location, setLocation] = useState("");
  const [csv, setCsv] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastAirroiSync, setLastAirroiSync] = useState<string | null>(null);
  const syncAirROI = useSyncAirROI();

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("houses")
        .select("name, address")
        .limit(1);
      const first = data?.[0] as any;
      if (first) setLocation(first.address || first.name || "");
    })();
  }, []);

  useEffect(() => {
    if (!location) return;
    (async () => {
      const { data } = await supabase
        .from("market_data_cache")
        .select("fetched_at")
        .eq("location", location)
        .eq("source", "airroi")
        .order("fetched_at", { ascending: false })
        .limit(1);
      setLastAirroiSync((data?.[0] as any)?.fetched_at ?? null);
    })();
  }, [location, syncAirROI.isSuccess]);

  const handleImport = async () => {
    if (!location.trim()) { toast.error("Bitte einen Standort angeben"); return; }
    if (csv.trim().length < 10) { toast.error("Bitte gültigen CSV-Inhalt einfügen"); return; }
    setLoading(true);
    const tId = toast.loading("Inside Airbnb Import läuft…");
    try {
      const { data, error } = await supabase.functions.invoke("import-inside-airbnb", {
        body: { location: location.trim(), csv_content: csv },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error(JSON.stringify((data as any).error));
      const d = data as { imported_listings: number; days_written: number; base_occupancy: number };
      toast.success(
        `Import erfolgreich: ${d.imported_listings} Listings, ${d.days_written} Tage (Basis-Auslastung ${(d.base_occupancy * 100).toFixed(1)}%)`,
        { id: tId },
      );
    } catch (e) {
      toast.error(`Import fehlgeschlagen: ${(e as Error).message}`, { id: tId });
    } finally {
      setLoading(false);
    }
  };

  const handleAirROI = () => {
    if (!location.trim()) { toast.error("Bitte einen Standort angeben"); return; }
    syncAirROI.mutate({ location: location.trim() });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="w-5 h-5 text-primary" />
          Marktdaten-Import
        </CardTitle>
        <CardDescription>
          Inside Airbnb CSV-Daten oder AirROI API verwenden, um die Marktauslastung der nächsten 365 Tage zu schätzen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="market-location">Standort</Label>
          <Input
            id="market-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="z. B. Saalbach-Hinterglemm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="market-csv">CSV-Inhalt (Inside Airbnb listings.csv)</Label>
          <Textarea
            id="market-csv"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder="id,neighbourhood,room_type,price,minimum_nights,number_of_reviews,last_review,reviews_per_month,calculated_host_listings_count,availability_365&#10;..."
            className="font-mono text-xs min-h-[220px]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleImport} disabled={loading}>
            {loading ? "Importiere…" : "Inside Airbnb Daten importieren"}
          </Button>
          <Button variant="secondary" onClick={handleAirROI} disabled={syncAirROI.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncAirROI.isPending ? "animate-spin" : ""}`} />
            {syncAirROI.isPending ? "AirROI Sync läuft…" : "AirROI Sync"}
          </Button>
          {lastAirroiSync && (
            <span className="text-xs text-muted-foreground">
              Letzter AirROI Sync: {new Date(lastAirroiSync).toLocaleString("de-DE")}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default MarketDataImportCard;
