import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, Check, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { UtilityCostCategory, useSaveUtilityCost } from '@/hooks/useUtilityCosts';

interface ImportedCost {
  excelCategory: string;
  mappedCategory: UtilityCostCategory | null;
  amount: number;
  transactions: number;
}

interface ExcelUtilityImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  houseId: string;
  year: number;
  categories: UtilityCostCategory[];
  houseName: string;
}

// Excel-Kategorie → System-Kategorie Mapping
const CATEGORY_MAPPING: Record<string, string> = {
  'trinkwasser': 'Wasserversorgung',
  'wasser': 'Wasserversorgung',
  'abwasser': 'Entwässerung',
  'grundsteuer': 'Grundsteuer',
  'gebäudeversicherung': 'Gebäudeversicherung',
  'versicherung': 'Gebäudeversicherung',
  'schornsteinfeger': 'Schornsteinreinigung',
  'schornstein': 'Schornsteinreinigung',
  'müll': 'Müllabfuhr',
  'müllabfuhr': 'Müllabfuhr',
  'heizung': 'Heizkosten',
  'heizkosten': 'Heizkosten',
  'gas': 'Heizkosten',
  'strom': 'Allgemeinstrom',
  'allgemeinstrom': 'Allgemeinstrom',
  'hausmeister': 'Hausmeister',
  'winterdienst': 'Winterdienst',
  'gartenpflege': 'Gartenpflege',
  'aufzug': 'Aufzugwartung',
  'wartung': 'Sonstige Kosten',
  'reinigung': 'Gebäudereinigung',
  'kabel': 'Kabelanschluss',
};

// Nicht-umlegbare Kategorien (werden ausgeschlossen)
const NON_ALLOCABLE_KEYWORDS = [
  'darlehen', 'kredit', 'tilgung', 'zinsen',
  'reparatur', 'instandsetzung', 'renovierung',
  'anschaffung', 'möbel', 'einrichtung',
  'mieteinnahmen', 'einnahmen', 'miete',
];

const ExcelUtilityImport = ({
  open,
  onOpenChange,
  houseId,
  year,
  categories,
  houseName,
}: ExcelUtilityImportProps) => {
  const [importedCosts, setImportedCosts] = useState<ImportedCost[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  
  const saveCost = useSaveUtilityCost();

  const findMappedCategory = (excelCategory: string): UtilityCostCategory | null => {
    const normalized = excelCategory.toLowerCase();
    
    // Direkte Suche nach Namen
    const directMatch = categories.find(c => 
      c.name.toLowerCase() === normalized
    );
    if (directMatch) return directMatch;
    
    // Mapping-Suche
    for (const [key, mappedName] of Object.entries(CATEGORY_MAPPING)) {
      if (normalized.includes(key)) {
        const mapped = categories.find(c => c.name === mappedName);
        if (mapped) return mapped;
      }
    }
    
    return null;
  };

  const isNonAllocable = (category: string): boolean => {
    const normalized = category.toLowerCase();
    return NON_ALLOCABLE_KEYWORDS.some(keyword => normalized.includes(keyword));
  };

  const processExcelFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Erste Sheet verarbeiten
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];
        
        // Kosten aggregieren nach Kategorie
        const costsByCategory: Record<string, { amount: number; transactions: number }> = {};
        
        // Haus-Präfix ermitteln (z.B. "Haus Berlin Ausgaben:")
        const housePrefix = `Haus Berlin Ausgaben:`.toLowerCase();
        
        jsonData.forEach((row) => {
          // Kategorie-Spalte finden (verschiedene mögliche Namen)
          const categoryCol = row['Kategorie'] || row['Category'] || row['Konto'] || row['Account'];
          const amountCol = row['Betrag'] || row['Amount'] || row['Summe'] || row['Value'];
          
          if (!categoryCol || !amountCol) return;
          
          const categoryStr = String(categoryCol).toLowerCase();
          
          // Nur Ausgaben für das Haus filtern
          if (!categoryStr.includes('ausgaben')) return;
          
          // Nicht-umlegbare ausschließen
          if (isNonAllocable(categoryStr)) return;
          
          // Betrag parsen (kann negativ für Ausgaben sein)
          let amount = typeof amountCol === 'number' 
            ? amountCol 
            : parseFloat(String(amountCol).replace(',', '.').replace(/[^\d.-]/g, ''));
          
          // Ausgaben sind oft negativ, wir wollen positive Werte
          amount = Math.abs(amount);
          
          if (isNaN(amount) || amount === 0) return;
          
          // Kategorie-Name extrahieren (nach dem letzten ":")
          const parts = String(categoryCol).split(':');
          const categoryName = parts[parts.length - 1].trim();
          
          if (!costsByCategory[categoryName]) {
            costsByCategory[categoryName] = { amount: 0, transactions: 0 };
          }
          costsByCategory[categoryName].amount += amount;
          costsByCategory[categoryName].transactions += 1;
        });
        
        // In ImportedCost Array umwandeln
        const imported: ImportedCost[] = Object.entries(costsByCategory)
          .map(([excelCategory, data]) => ({
            excelCategory,
            mappedCategory: findMappedCategory(excelCategory),
            amount: Math.round(data.amount * 100) / 100,
            transactions: data.transactions,
          }))
          .filter(c => c.amount > 0)
          .sort((a, b) => b.amount - a.amount);
        
        setImportedCosts(imported);
        setFileName(file.name);
        
        if (imported.length === 0) {
          toast.warning('Keine umlegbaren Kosten in der Datei gefunden');
        } else {
          toast.success(`${imported.length} Kostenarten erkannt`);
        }
      } catch (error) {
        console.error('Excel parse error:', error);
        toast.error('Fehler beim Lesen der Excel-Datei');
      }
    };
    reader.readAsArrayBuffer(file);
  }, [categories]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files?.[0]) {
      processExcelFile(files[0]);
    }
  }, [processExcelFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.[0]) {
      processExcelFile(files[0]);
    }
  }, [processExcelFile]);

  const handleImport = async () => {
    const validCosts = importedCosts.filter(c => c.mappedCategory);
    
    if (validCosts.length === 0) {
      toast.error('Keine zuordenbaren Kosten gefunden');
      return;
    }
    
    setImporting(true);
    
    try {
      for (const cost of validCosts) {
        if (!cost.mappedCategory) continue;
        
        await saveCost.mutateAsync({
          house_id: houseId,
          category_id: cost.mappedCategory.id,
          year,
          total_amount: cost.amount,
          distribution_key: cost.mappedCategory.default_distribution_key,
        });
      }
      
      toast.success(`${validCosts.length} Kostenarten importiert`);
      onOpenChange(false);
      setImportedCosts([]);
      setFileName(null);
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Fehler beim Import');
    } finally {
      setImporting(false);
    }
  };

  const totalMapped = importedCosts.filter(c => c.mappedCategory).length;
  const totalAmount = importedCosts.filter(c => c.mappedCategory).reduce((sum, c) => sum + c.amount, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            NK-Kosten aus Excel importieren
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info */}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Importiert Nebenkosten aus Excel für <strong>{houseName}</strong> ({year}).
              Nicht-umlegbare Kosten (Darlehen, Reparaturen) werden automatisch ausgeschlossen.
            </AlertDescription>
          </Alert>

          {/* Upload Area */}
          <div
            className={`
              border-2 border-dashed rounded-lg p-8 text-center transition-colors
              ${dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
              ${fileName ? 'border-green-500 bg-green-500/5' : ''}
            `}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {fileName ? (
              <div className="flex items-center justify-center gap-2 text-green-600">
                <Check className="h-6 w-6" />
                <span className="font-medium">{fileName}</span>
              </div>
            ) : (
              <>
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground mb-2">
                  Excel-Datei hier ablegen oder
                </p>
                <label>
                  <Input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleFileInput}
                  />
                  <Button variant="secondary" asChild>
                    <span>Datei auswählen</span>
                  </Button>
                </label>
              </>
            )}
          </div>

          {/* Preview */}
          {importedCosts.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {totalMapped} von {importedCosts.length} Kostenarten zugeordnet
                </span>
                <Badge variant="secondary">
                  Gesamt: {totalAmount.toFixed(2)} €
                </Badge>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Excel-Kategorie</TableHead>
                    <TableHead>System-Kategorie</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importedCosts.map((cost, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">
                        {cost.excelCategory}
                        <span className="text-xs text-muted-foreground ml-2">
                          ({cost.transactions}x)
                        </span>
                      </TableCell>
                      <TableCell>
                        {cost.mappedCategory ? (
                          <Badge variant="outline">{cost.mappedCategory.name}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            Nicht zugeordnet
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {cost.amount.toFixed(2)} €
                      </TableCell>
                      <TableCell className="text-center">
                        {cost.mappedCategory ? (
                          <Check className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground mx-auto" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button 
            onClick={handleImport} 
            disabled={totalMapped === 0 || importing}
          >
            {importing ? 'Importiere...' : `${totalMapped} Kosten importieren`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExcelUtilityImport;
