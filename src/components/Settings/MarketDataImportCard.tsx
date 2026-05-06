import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Download, FileUp, X } from "lucide-react";
import { usePricingSettings } from "@/hooks/usePricingSettings";

const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200 MB Sicherheitsgrenze

const MarketDataImportCard = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: cfg } = usePricingSettings();
  const location = (cfg?.airroi_district?.trim() || cfg?.airroi_locality?.trim() || "").toString();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > MAX_FILE_BYTES) {
      toast.error(`Datei zu groß (${(f.size / 1024 / 1024).toFixed(1)} MB). Maximum: 200 MB.`);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(f);
  };

  const clearFile = () => {
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const readFileAsText = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("Datei konnte nicht gelesen werden"));
      reader.readAsText(f);
    });

  const handleImport = async () => {
    if (!location) { toast.error("Bitte zuerst Ort/Markt in der Marktdefinition oben festlegen"); return; }
    if (!file) { toast.error("Bitte CSV-Datei auswählen"); return; }
    setLoading(true);
    const tId = toast.loading("Inside Airbnb Import läuft…");
    try {
      const csv = await readFileAsText(file);
      if (csv.trim().length < 10) throw new Error("Datei ist leer oder zu klein");

      const { data, error } = await supabase.functions.invoke("import-inside-airbnb", {
        body: { location, csv_content: csv },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error(JSON.stringify((data as any).error));
      const d = data as { imported_listings: number; days_written: number; base_occupancy: number };
      toast.success(
        `Import erfolgreich: ${d.imported_listings} Listings, ${d.days_written} Tage (Basis-Auslastung ${(d.base_occupancy * 100).toFixed(1)}%)`,
        { id: tId },
      );
      clearFile();
    } catch (e) {
      toast.error(`Import fehlgeschlagen: ${(e as Error).message}`, { id: tId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Download className="w-5 h-5 text-primary" />
          Marktdaten-Import (Inside Airbnb CSV)
        </CardTitle>
        <CardDescription>
          Inside Airbnb <code>listings.csv</code> hochladen, um die Marktauslastung der nächsten 365 Tage zu schätzen.
          Verwendet die oben definierte Marktregion: <strong>{location || "—"}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="market-csv-file">CSV-Datei (listings.csv)</Label>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={loading}
            >
              <FileUp className="w-4 h-4 mr-2" />
              Datei auswählen
            </Button>
            <input
              ref={fileRef}
              id="market-csv-file"
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileChange}
            />
            {file && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono">{file.name}</span>
                <span>({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={clearFile}
                  disabled={loading}
                  aria-label="Datei entfernen"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Inside Airbnb CSV-Dateien sind häufig sehr groß (50.000–500.000 Zeilen). Maximum: 200 MB.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleImport} disabled={loading || !file}>
            {loading ? "Importiere…" : "Inside Airbnb Daten importieren"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default MarketDataImportCard;
