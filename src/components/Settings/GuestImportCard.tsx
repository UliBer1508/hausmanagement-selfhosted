import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useHouses } from '@/hooks/useHouses';
import * as XLSX from 'xlsx';

interface ExcelRow {
  'Blatt-Nr.'?: string;
  'Nachname'?: string;
  'Vorname'?: string;
  'Geburtstag'?: string;
  'Straße'?: string;
  'Stadt/Ort'?: string;
  'Land'?: string;
  'Reisedokument Nr.'?: string;
  'Anreise'?: string;
  'Abreise'?: string;
  'Total'?: string;
  [key: string]: string | undefined;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  details: {
    guest: string;
    checkIn: string;
    checkOut: string;
    status: 'imported' | 'skipped' | 'error';
    reason?: string;
  }[];
}

interface PreviewData {
  totalRows: number;
  uniqueBookings: number;
  dateRange: { from: string; to: string };
  rows: ExcelRow[];
}

const GuestImportCard = () => {
  const { toast } = useToast();
  const { data: houses } = useHouses({ rental_type: 'tourist' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedHouseId, setSelectedHouseId] = useState<string>('');
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setPreviewData(null);
    setImportResult(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      
      // Excel hat spezielle Struktur: Zeile 1 = Titel, Zeile 2 = Trennlinie, Zeile 3 = Header
      // range: 2 überspringt die ersten 2 Zeilen und liest Header aus Zeile 3
      const rows = XLSX.utils.sheet_to_json<ExcelRow>(firstSheet, { 
        range: 2,
        defval: ''
      });

      console.log('Excel Spalten:', Object.keys(rows[0] || {}));
      console.log('Erste Datenzeile:', rows[0]);

      // Robuste Feld-Erkennung
      const getField = (row: ExcelRow, ...keys: string[]): string | undefined => {
        for (const key of keys) {
          if (row[key] !== undefined && row[key] !== '') return row[key];
        }
        return undefined;
      };

      // Count unique bookings by Blatt-Nr.
      const uniqueBlattNrs = new Set(
        rows.map(r => getField(r, 'Blatt-Nr.', 'Blatt-Nr', 'BlattNr')).filter(Boolean)
      );
      
      // Find date range
      const dates = rows
        .map(r => getField(r, 'Anreise'))
        .filter(Boolean)
        .map(d => {
          const parts = d!.split('.');
          if (parts.length === 3) {
            return new Date(
              parseInt(parts[2].length === 2 ? `20${parts[2]}` : parts[2]),
              parseInt(parts[1]) - 1,
              parseInt(parts[0])
            );
          }
          return null;
        })
        .filter((d): d is Date => d !== null);

      const minDate = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
      const maxDate = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;

      setPreviewData({
        totalRows: rows.length,
        uniqueBookings: uniqueBlattNrs.size,
        dateRange: {
          from: minDate ? minDate.toLocaleDateString('de-DE') : 'N/A',
          to: maxDate ? maxDate.toLocaleDateString('de-DE') : 'N/A'
        },
        rows
      });

      toast({
        title: 'Datei geladen',
        description: `${uniqueBlattNrs.size} Buchungen gefunden (${rows.length} Zeilen)`,
      });

    } catch (error) {
      console.error('Parse error:', error);
      toast({
        title: 'Fehler beim Lesen',
        description: 'Die Datei konnte nicht gelesen werden',
        variant: 'destructive',
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = async () => {
    if (!previewData || !selectedHouseId) {
      toast({
        title: 'Fehler',
        description: 'Bitte wählen Sie ein Haus und laden Sie eine Datei',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setImportResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('import-guest-list', {
        body: {
          rows: previewData.rows,
          houseId: selectedHouseId
        }
      });

      if (error) throw error;

      setImportResult(data as ImportResult);
      
      toast({
        title: 'Import abgeschlossen',
        description: `${data.imported} Buchungen importiert, ${data.skipped} übersprungen`,
      });

    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: 'Import-Fehler',
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetImport = () => {
    setPreviewData(null);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary" />
          Gästeliste importieren
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Sicherer Import:</strong> Bestehende Buchungen werden nicht geändert oder gelöscht. 
            Duplikate (gleicher Zeitraum) werden automatisch übersprungen.
          </AlertDescription>
        </Alert>

        {/* House Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Haus auswählen</label>
          <Select value={selectedHouseId} onValueChange={setSelectedHouseId}>
            <SelectTrigger>
              <SelectValue placeholder="Haus für Import wählen..." />
            </SelectTrigger>
            <SelectContent>
              {houses?.map(house => (
                <SelectItem key={house.id} value={house.id}>
                  {house.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* File Upload */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Excel-Datei hochladen</label>
          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
              id="excel-upload"
            />
            <label htmlFor="excel-upload" className="cursor-pointer">
              {isParsing ? (
                <div className="flex flex-col items-center">
                  <Loader2 className="w-10 h-10 text-primary animate-spin mb-2" />
                  <span className="text-sm text-muted-foreground">Datei wird analysiert...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <FileSpreadsheet className="w-10 h-10 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">
                    Excel-Datei (.xlsx) hier ablegen oder klicken
                  </span>
                </div>
              )}
            </label>
          </div>
        </div>

        {/* Preview */}
        {previewData && !importResult && (
          <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium">Vorschau</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Zeilen gesamt:</div>
              <div className="font-medium">{previewData.totalRows}</div>
              <div>Einzigartige Buchungen:</div>
              <div className="font-medium text-primary">{previewData.uniqueBookings}</div>
              <div>Zeitraum:</div>
              <div className="font-medium">{previewData.dateRange.from} - {previewData.dateRange.to}</div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleImport} disabled={isLoading || !selectedHouseId}>
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importiere...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    {previewData.uniqueBookings} Buchungen importieren
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={resetImport}>
                Abbrechen
              </Button>
            </div>
          </div>
        )}

        {/* Import Result */}
        {importResult && (
          <div className="space-y-3">
            <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="font-medium">{importResult.imported} importiert</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <span className="font-medium">{importResult.skipped} übersprungen</span>
              </div>
              {importResult.errors.length > 0 && (
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-600" />
                  <span className="font-medium">{importResult.errors.length} Fehler</span>
                </div>
              )}
            </div>

            <ScrollArea className="h-64 border rounded-lg">
              <div className="p-3 space-y-2">
                {importResult.details.map((detail, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-background rounded border">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{detail.guest}</div>
                      <div className="text-xs text-muted-foreground">
                        {detail.checkIn} - {detail.checkOut}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {detail.status === 'imported' && (
                        <Badge variant="default" className="bg-green-600">Importiert</Badge>
                      )}
                      {detail.status === 'skipped' && (
                        <Badge variant="secondary">{detail.reason || 'Übersprungen'}</Badge>
                      )}
                      {detail.status === 'error' && (
                        <Badge variant="destructive">{detail.reason || 'Fehler'}</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <Button variant="outline" onClick={resetImport} className="w-full">
              Neuen Import starten
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GuestImportCard;
