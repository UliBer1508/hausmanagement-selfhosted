import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Download } from "lucide-react";

const MarketDataImportCard = () => {
  const [location, setLocation] = useState("");
  const [csv, setCsv] = useState("");
  const [loading, setLoading] = useState(false);

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

  const handleImport = async () => {
    if (!location.trim()) {
      toast.error("Bitte einen Standort angeben");
      return;
    }
    if (csv.trim().length < 10) {
      toast.error("Bitte gültigen CSV-Inhalt einfügen");
      return;
    }
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="w-5 h-5 text-primary" />
          Marktdaten-Import
        </CardTitle>
        <CardDescription>
          Inside Airbnb CSV-Daten importieren — schätzt die durchschnittliche Marktauslastung pro Tag für die nächsten 365 Tage.
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
        <Button onClick={handleImport} disabled={loading}>
          {loading ? "Importiere…" : "Inside Airbnb Daten importieren"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default MarketDataImportCard;