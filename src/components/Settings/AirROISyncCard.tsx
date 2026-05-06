import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useSyncAirROI } from "@/hooks/useAirROI";
import { usePricingSettings } from "@/hooks/usePricingSettings";

const AirROISyncCard = () => {
  const [lastAirroiSync, setLastAirroiSync] = useState<string | null>(null);
  const syncAirROI = useSyncAirROI();
  const { data: cfg } = usePricingSettings();
  const location = (cfg?.airroi_district?.trim() || cfg?.airroi_locality?.trim() || "").toString();

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

  return (
    <div className="rounded border border-border p-3 mt-4 space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        AirROI Sync
      </div>
      <p className="text-xs text-muted-foreground">
        Lädt Marktauslastungs-Daten von AirROI für die oben definierte Marktregion:{" "}
        <strong>{location || "—"}</strong>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => syncAirROI.mutate({})}
          disabled={syncAirROI.isPending || !location}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${syncAirROI.isPending ? "animate-spin" : ""}`} />
          {syncAirROI.isPending ? "AirROI Sync läuft…" : "AirROI Sync"}
        </Button>
        {lastAirroiSync && (
          <span className="text-xs text-muted-foreground">
            Letzter Sync: {new Date(lastAirroiSync).toLocaleString("de-DE")}
          </span>
        )}
      </div>
    </div>
  );
};

export default AirROISyncCard;