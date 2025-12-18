import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FileSpreadsheet, Check, X, AlertTriangle, Plus, Minus, ArrowRight, Info, TrendingUp, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import { UtilityCostCategory, useSaveUtilityCost } from '@/hooks/useUtilityCosts';

interface ImportedCost {
  excelCategory: string;
  mappedCategory: UtilityCostCategory | null;
  amount: number;
  transactions: number;
  supplier?: string;
  excluded: boolean;
  excludeReason: string | null;
  isRevenue: boolean; // NEU: Kennzeichnung für Einnahmen
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
  // Wasser
  'trinkwasser': 'Wasserversorgung',
  'wasser': 'Wasserversorgung',
  'wasserversorgung': 'Wasserversorgung',
  'abwasser': 'Entwässerung',
  'entwässerung': 'Entwässerung',
  'kanalgebühren': 'Entwässerung',
  
  // Grundsteuer
  'grundsteuer': 'Grundsteuer',
  
  // Versicherungen
  'gebäudeversicherung': 'Gebäudeversicherung',
  'gebäudeversicherrung': 'Gebäudeversicherung',
  'versicherung': 'Gebäudeversicherung',
  'haftpflichtversicherung': 'Gebäudeversicherung',
  'haftpflicht': 'Gebäudeversicherung',
  'inhaltsversicherung': 'Gebäudeversicherung',
  'wohngebäudeversicherung': 'Gebäudeversicherung',
  
  // Heizung
  'heizung': 'Heizkosten',
  'heizkosten': 'Heizkosten',
  'gas': 'Heizkosten',
  'gasverbrauch': 'Heizkosten',
  'fernwärme': 'Heizkosten',
  'öl': 'Heizkosten',
  'heizöl': 'Heizkosten',
  
  // Schornstein
  'schornsteinfeger': 'Schornsteinreinigung',
  'schornstein': 'Schornsteinreinigung',
  
  // Müll
  'müll': 'Müllabfuhr',
  'müllabfuhr': 'Müllabfuhr',
  'abfallentsorgung': 'Müllabfuhr',
  
  // Strom/Beleuchtung
  'strom': 'Beleuchtung',
  'allgemeinstrom': 'Beleuchtung',
  'beleuchtung': 'Beleuchtung',
  
  // Hausmeister/Hauswart
  'hausmeister': 'Hauswart',
  'hauswart': 'Hauswart',
  
  // Gartenpflege
  'gartenpflege': 'Gartenpflege',
  'garten': 'Gartenpflege',
  'grünflächen': 'Gartenpflege',
  
  // Aufzug
  'aufzug': 'Aufzug',
  'aufzugwartung': 'Aufzug',
  'fahrstuhl': 'Aufzug',
  
  // Reinigung
  'reinigung': 'Gebäudereinigung',
  'gebäudereinigung': 'Gebäudereinigung',
  'treppenhausreinigung': 'Gebäudereinigung',
  
  // Kabel/Internet/Telefon
  'kabel': 'Kabelanschluss',
  'internet': 'Kabelanschluss',
  'vodafon': 'Kabelanschluss',
  'vodafone': 'Kabelanschluss',
  'telekom': 'Kabelanschluss',
  'telefon': 'Kabelanschluss',
  'dsl': 'Kabelanschluss',
  
  // Straßenreinigung
  'straßenreinigung': 'Straßenreinigung',
  
  // Sonstige Betriebskosten
  'winterdienst': 'Sonstige Betriebskosten',
  'streudienst': 'Sonstige Betriebskosten',
  'wohngeld': 'Sonstige Betriebskosten',
  'hausgeld': 'Sonstige Betriebskosten',
  'weg': 'Sonstige Betriebskosten',
  'nebenkosten': 'Sonstige Betriebskosten',
  'wartung': 'Sonstige Betriebskosten',
  'sonstig': 'Sonstige Betriebskosten',
};

// Manuelle Ausschlussgründe für Dropdown
const MANUAL_EXCLUDE_REASONS = [
  { value: 'repair', label: '🔧 Reparatur/Instandsetzung', reason: 'Reparatur/Instandsetzung' },
  { value: 'reserve', label: '💰 Rücklage', reason: 'Rücklage (nicht umlegbar)' },
  { value: 'loan', label: '🏦 Darlehen/Finanzierung', reason: 'Darlehen/Finanzierung' },
  { value: 'private', label: '🏠 Privat/Eigenanteil', reason: 'Privat/Eigenanteil' },
  { value: 'tenant_pays', label: '👤 Mieter zahlt direkt', reason: 'Mieter zahlt direkt' },
  { value: 'revenue', label: '📥 Einnahme (keine Kosten)', reason: 'Einnahme (keine Kosten)' },
  { value: 'other', label: '❌ Sonstig nicht umlegbar', reason: 'Manuell ausgeschlossen' },
];

type ImportStep = 'upload' | 'review' | 'confirm';

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
  const [step, setStep] = useState<ImportStep>('upload');
  const [activeTab, setActiveTab] = useState('include');
  
  const saveCost = useSaveUtilityCost();

  const findMappedCategory = (excelCategory: string): UtilityCostCategory | null => {
    const normalized = excelCategory.toLowerCase().trim();
    
    const directMatch = categories.find(c => 
      c.name.toLowerCase() === normalized
    );
    if (directMatch) return directMatch;
    
    for (const [key, mappedName] of Object.entries(CATEGORY_MAPPING)) {
      if (normalized.includes(key)) {
        const mapped = categories.find(c => c.name === mappedName);
        if (mapped) return mapped;
      }
    }
    
    return null;
  };

  const findColumnValue = (row: Record<string, unknown>, keywords: string[]): unknown => {
    for (const keyword of keywords) {
      if (row[keyword] !== undefined) return row[keyword];
    }
    for (const [key, value] of Object.entries(row)) {
      const keyLower = key.toLowerCase();
      if (keywords.some(kw => keyLower.includes(kw.toLowerCase()))) {
        return value;
      }
    }
    return undefined;
  };

  const processExcelFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const rawData = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(worksheet, { header: 1 });
        
        const headerRowIndex = rawData.findIndex(row => {
          if (!Array.isArray(row)) return false;
          const rowStr = row.map(cell => String(cell || '').toLowerCase()).join(' ');
          return (rowStr.includes('kategorie') || rowStr.includes('konto')) && 
                 (rowStr.includes('betrag') || rowStr.includes('summe') || rowStr.includes('soll') || rowStr.includes('haben'));
        });
        
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          range: headerRowIndex > 0 ? headerRowIndex : 0 
        }) as Record<string, unknown>[];
        
        // Kosten aggregieren - ALLE erfassen ohne automatische Ausschlüsse
        const costsByCategory: Record<string, { 
          amount: number; 
          transactions: number;
          suppliers: Set<string>;
          isRevenue: boolean;
        }> = {};
        
        jsonData.forEach((row) => {
          const firstCell = String(Object.values(row)[0] || '');
          if (firstCell.match(/^(Gesamt|Stand|Summe|Total|\d{4}$)/i)) {
            return;
          }
          
          const categoryCol = findColumnValue(row, ['Kategorie', 'Category', 'Konto', 'Account', 'Kontobezeichnung']);
          const amountCol = findColumnValue(row, ['Betrag', 'Amount', 'Summe', 'Value', 'Soll', 'Haben']);
          const supplierCol = findColumnValue(row, ['Empfänger', 'Lieferant', 'Supplier', 'Name', 'Beschreibung']);
          
          if (!categoryCol) return;
          
          let amount = 0;
          if (amountCol !== undefined) {
            amount = typeof amountCol === 'number' 
              ? amountCol 
              : parseFloat(String(amountCol).replace(',', '.').replace(/[^\d.-]/g, ''));
          }
          
          // Positive Beträge = Einnahmen in Banking-App-Exporten
          const originalAmount = amount;
          const isRevenue = originalAmount > 0;
          
          amount = Math.abs(amount);
          if (isNaN(amount) || amount === 0) return;
          
          const parts = String(categoryCol).split(':');
          let categoryName = parts[parts.length - 1].trim();
          if (!categoryName && parts.length > 0) {
            categoryName = String(categoryCol).trim();
          }
          
          // KEINE automatische Filterung mehr - alles erfassen!
          
          if (!costsByCategory[categoryName]) {
            costsByCategory[categoryName] = { 
              amount: 0, 
              transactions: 0, 
              suppliers: new Set(),
              isRevenue
            };
          }
          costsByCategory[categoryName].amount += amount;
          costsByCategory[categoryName].transactions += 1;
          if (supplierCol) {
            costsByCategory[categoryName].suppliers.add(String(supplierCol));
          }
        });
        
        // In ImportedCost Array umwandeln - ALLE mit excluded: false
        const imported: ImportedCost[] = Object.entries(costsByCategory)
          .map(([excelCategory, data]) => {
            const mapped = findMappedCategory(excelCategory);
            return {
              excelCategory,
              mappedCategory: mapped, // Kann null sein, wird als "Nicht zugeordnet" angezeigt
              amount: Math.round(data.amount * 100) / 100,
              transactions: data.transactions,
              supplier: Array.from(data.suppliers).join(', ') || undefined,
              excluded: false, // KEINE automatische Ausschlüsse mehr!
              excludeReason: null,
              isRevenue: data.isRevenue,
            };
          })
          .filter(c => c.amount > 0)
          .sort((a, b) => b.amount - a.amount);
        
        setImportedCosts(imported);
        setFileName(file.name);
        setStep('review');
        
        toast.success(`${imported.length} Positionen erkannt - bitte prüfen und zuweisen`);
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

  const toggleExclude = (index: number, reason?: string) => {
    setImportedCosts(prev => prev.map((cost, i) => {
      if (i !== index) return cost;
      
      if (cost.excluded) {
        // Include wieder - behalte die gemappte Kategorie
        return {
          ...cost,
          excluded: false,
          excludeReason: null,
        };
      } else {
        // Exclude mit Grund
        return {
          ...cost,
          excluded: true,
          excludeReason: reason || 'Manuell ausgeschlossen',
        };
      }
    }));
  };

  const updateCategory = (index: number, categoryId: string) => {
    // Check if it's an exclude option
    const excludeOption = MANUAL_EXCLUDE_REASONS.find(r => r.value === categoryId);
    if (excludeOption) {
      toggleExclude(index, excludeOption.reason);
      return;
    }
    
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;
    
    // Kategorie zuweisen UND aus excluded entfernen
    setImportedCosts(prev => prev.map((cost, i) => 
      i === index ? { 
        ...cost, 
        mappedCategory: category,
        excluded: false,
        excludeReason: null,
      } : cost
    ));
  };

  const handleImport = async () => {
    const validCosts = importedCosts.filter(c => !c.excluded && c.mappedCategory);
    
    if (validCosts.length === 0) {
      toast.error('Keine Kosten zum Importieren ausgewählt');
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
      resetState();
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Fehler beim Import');
    } finally {
      setImporting(false);
    }
  };

  const resetState = () => {
    setImportedCosts([]);
    setFileName(null);
    setStep('upload');
    setActiveTab('include');
  };

  // Berechnungen
  const includedCosts = importedCosts.filter(c => !c.excluded);
  const excludedCosts = importedCosts.filter(c => c.excluded);
  const totalExcelAmount = importedCosts.reduce((sum, c) => sum + c.amount, 0);
  const totalIncludedAmount = includedCosts.reduce((sum, c) => sum + c.amount, 0);
  const totalExcludedAmount = excludedCosts.reduce((sum, c) => sum + c.amount, 0);
  const unmappedCount = includedCosts.filter(c => !c.mappedCategory).length;
  const revenueCount = includedCosts.filter(c => c.isRevenue).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetState(); onOpenChange(o); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            NK-Kosten aus Excel importieren
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Importiert Nebenkosten aus Excel für <strong>{houseName}</strong> ({year}).
                  <br />
                  <span className="text-muted-foreground">
                    Alle Positionen werden angezeigt - Sie entscheiden, welche übernommen werden.
                  </span>
                </AlertDescription>
              </Alert>

              <div
                className={`
                  border-2 border-dashed rounded-lg p-8 text-center transition-colors
                  ${dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
                `}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
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
              </div>
            </>
          )}

          {/* Step 2: Review */}
          {step === 'review' && (
            <>
              {/* Übersicht */}
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold">{totalExcelAmount.toFixed(2)} €</div>
                      <div className="text-xs text-muted-foreground">Alle Positionen</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-600">{totalIncludedAmount.toFixed(2)} €</div>
                      <div className="text-xs text-muted-foreground">Zu übernehmen</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-muted-foreground">{totalExcludedAmount.toFixed(2)} €</div>
                      <div className="text-xs text-muted-foreground">Ausgeschlossen</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Warnungen */}
              {(unmappedCount > 0 || revenueCount > 0) && (
                <Alert variant="destructive" className="bg-amber-50 border-amber-300 text-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription>
                    <strong>Hinweis:</strong>
                    {unmappedCount > 0 && (
                      <span> {unmappedCount} Position(en) ohne Kategorie-Zuweisung.</span>
                    )}
                    {revenueCount > 0 && (
                      <span> {revenueCount} Einnahme(n) erkannt - bitte prüfen.</span>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* Dateiname */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileSpreadsheet className="h-4 w-4" />
                {fileName}
              </div>

              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="include" className="gap-2">
                    <Check className="h-4 w-4" />
                    Zu übernehmen ({includedCosts.length})
                  </TabsTrigger>
                  <TabsTrigger value="exclude" className="gap-2">
                    <X className="h-4 w-4" />
                    Ausgeschlossen ({excludedCosts.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="include" className="mt-4">
                  {includedCosts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Keine Kosten zur Übernahme ausgewählt
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[60px]">Typ</TableHead>
                          <TableHead>Excel-Kategorie</TableHead>
                          <TableHead>NK-Kategorie / Ausschließen</TableHead>
                          <TableHead className="text-right">Betrag</TableHead>
                          <TableHead className="w-[60px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {includedCosts.map((cost) => {
                          const originalIndex = importedCosts.indexOf(cost);
                          const isUnmapped = !cost.mappedCategory;
                          return (
                            <TableRow 
                              key={originalIndex} 
                              className={
                                cost.isRevenue ? 'bg-blue-50' : 
                                isUnmapped ? 'bg-amber-50' : ''
                              }
                            >
                              <TableCell>
                                {cost.isRevenue ? (
                                  <Badge variant="outline" className="text-blue-600 border-blue-300 gap-1">
                                    <TrendingUp className="h-3 w-3" />
                                    +
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-red-600 border-red-300 gap-1">
                                    <TrendingDown className="h-3 w-3" />
                                    -
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="font-medium">{cost.excelCategory}</div>
                                {cost.supplier && (
                                  <div className="text-xs text-muted-foreground truncate max-w-[200px]">{cost.supplier}</div>
                                )}
                                <span className="text-xs text-muted-foreground">({cost.transactions}x)</span>
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={cost.mappedCategory?.id || ''}
                                  onValueChange={(value) => updateCategory(originalIndex, value)}
                                >
                                  <SelectTrigger className={`w-[200px] ${isUnmapped ? 'border-amber-400' : ''}`}>
                                    <SelectValue placeholder="⚠️ Bitte zuweisen..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                      NK-Kategorien
                                    </div>
                                    {categories.map(cat => (
                                      <SelectItem key={cat.id} value={cat.id}>
                                        {cat.name}
                                      </SelectItem>
                                    ))}
                                    <SelectSeparator />
                                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                      Ausschließen als...
                                    </div>
                                    {MANUAL_EXCLUDE_REASONS.map(reason => (
                                      <SelectItem key={reason.value} value={reason.value} className="text-destructive">
                                        {reason.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {cost.amount.toFixed(2)} €
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleExclude(originalIndex)}
                                  className="text-destructive hover:text-destructive"
                                  title="Ausschließen"
                                >
                                  <Minus className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                <TabsContent value="exclude" className="mt-4">
                  {excludedCosts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Keine Kosten ausgeschlossen
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[60px]">Typ</TableHead>
                          <TableHead>Excel-Kategorie</TableHead>
                          <TableHead>Ausschlussgrund</TableHead>
                          <TableHead className="text-right">Betrag</TableHead>
                          <TableHead className="w-[60px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {excludedCosts.map((cost) => {
                          const originalIndex = importedCosts.indexOf(cost);
                          return (
                            <TableRow key={originalIndex}>
                              <TableCell>
                                {cost.isRevenue ? (
                                  <Badge variant="outline" className="text-blue-600 border-blue-300 gap-1">
                                    <TrendingUp className="h-3 w-3" />
                                    +
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-red-600 border-red-300 gap-1">
                                    <TrendingDown className="h-3 w-3" />
                                    -
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="font-medium">{cost.excelCategory}</div>
                                {cost.supplier && (
                                  <div className="text-xs text-muted-foreground truncate max-w-[200px]">{cost.supplier}</div>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">
                                  {cost.excludeReason}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono text-muted-foreground">
                                {cost.amount.toFixed(2)} €
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleExclude(originalIndex)}
                                  className="text-green-600 hover:text-green-600"
                                  title="Wieder aufnehmen"
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}

          {/* Step 3: Confirm */}
          {step === 'confirm' && (
            <>
              <Alert>
                <Check className="h-4 w-4" />
                <AlertDescription>
                  <strong>Bestätigung</strong> - Folgende Kosten werden importiert:
                </AlertDescription>
              </Alert>

              <Card>
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    {includedCosts.filter(c => c.mappedCategory).map((cost, idx) => (
                      <div key={idx} className="flex justify-between items-center py-1 border-b last:border-0">
                        <span className="text-sm">{cost.mappedCategory?.name}</span>
                        <span className="font-mono">{cost.amount.toFixed(2)} €</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-2 font-bold">
                      <span>Gesamt</span>
                      <span className="font-mono">{includedCosts.filter(c => c.mappedCategory).reduce((sum, c) => sum + c.amount, 0).toFixed(2)} €</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {unmappedCount > 0 && (
                <Alert variant="destructive" className="bg-amber-50 border-amber-300 text-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription>
                    {unmappedCount} Position(en) ohne Kategorie-Zuweisung werden nicht importiert.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          {step === 'upload' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
          )}
          
          {step === 'review' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>
                Zurück
              </Button>
              <Button 
                onClick={() => setStep('confirm')}
                disabled={includedCosts.filter(c => c.mappedCategory).length === 0}
                className="gap-2"
              >
                Weiter zur Bestätigung
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}
          
          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={() => setStep('review')}>
                Zurück zur Prüfung
              </Button>
              <Button 
                onClick={handleImport}
                disabled={importing}
                className="gap-2"
              >
                {importing ? 'Importiere...' : (
                  <>
                    <Check className="h-4 w-4" />
                    {includedCosts.filter(c => c.mappedCategory).length} Kosten importieren
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExcelUtilityImport;
