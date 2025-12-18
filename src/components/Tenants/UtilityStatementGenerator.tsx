import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Building2, FileText, Calculator, CheckCircle, Clock, Send, Euro } from 'lucide-react';
import { useHouses } from '@/hooks/useHouses';
import { useTenantPayments } from '@/hooks/useTenantPayments';
import {
  useUtilitySettings,
  useUtilityCosts,
  useUtilityStatements,
  useGenerateStatement,
  useUpdateStatementStatus,
  calculateTenantShare,
  distributionKeyLabels,
  UtilitySettings,
  UtilityStatement,
} from '@/hooks/useUtilityCosts';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { TenantInfo } from '@/types';

const currentYear = new Date().getFullYear();

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: 'Entwurf', color: 'bg-amber-500/10 text-amber-600 border-amber-500/30', icon: <Clock className="h-3 w-3" /> },
  final: { label: 'Finalisiert', color: 'bg-blue-500/10 text-blue-600 border-blue-500/30', icon: <CheckCircle className="h-3 w-3" /> },
  sent: { label: 'Versendet', color: 'bg-green-500/10 text-green-600 border-green-500/30', icon: <Send className="h-3 w-3" /> },
};

const UtilityStatementGenerator = () => {
  const { data: houses } = useHouses({ rental_type: 'long_term' });
  const [selectedHouseId, setSelectedHouseId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(currentYear - 1); // Abrechnung für Vorjahr
  const [manualPrepayments, setManualPrepayments] = useState<string>('');

  const { data: settings } = useUtilitySettings(selectedHouseId);
  const { data: costs } = useUtilityCosts(selectedHouseId, selectedYear);
  const { data: statements } = useUtilityStatements(selectedHouseId);
  const { data: payments } = useTenantPayments();
  const generateStatement = useGenerateStatement();
  const updateStatus = useUpdateStatementStatus();

  const selectedHouse = houses?.find(h => h.id === selectedHouseId);
  const tenantInfo = selectedHouse?.tenant_info as TenantInfo | null;
  const existingStatement = statements?.find(s => s.year === selectedYear);

  useEffect(() => {
    if (houses?.length && !selectedHouseId) {
      setSelectedHouseId(houses[0].id);
    }
  }, [houses, selectedHouseId]);

  // Berechne Vorauszahlungen aus tenant_payments oder tenant_info
  useEffect(() => {
    if (selectedHouseId && tenantInfo) {
      // Versuche, Vorauszahlungen aus Zahlungen zu berechnen
      const yearPayments = payments?.filter(p => 
        p.house_id === selectedHouseId && 
        p.status === 'paid' &&
        new Date(p.payment_date).getFullYear() === selectedYear
      ) || [];

      if (yearPayments.length > 0) {
        // Falls separate Nebenkosten-Zahlungen existieren würden
        // Für jetzt: nutze monthly additional_costs × 12
        const monthlyNK = tenantInfo.additional_costs || 0;
        setManualPrepayments((monthlyNK * 12).toFixed(2));
      } else {
        const monthlyNK = tenantInfo.additional_costs || 0;
        setManualPrepayments((monthlyNK * 12).toFixed(2));
      }
    }
  }, [selectedHouseId, tenantInfo, payments, selectedYear]);

  const handleGenerate = () => {
    if (!selectedHouseId || !settings || !costs?.length) return;

    generateStatement.mutate({
      houseId: selectedHouseId,
      year: selectedYear,
      costs,
      settings: settings as UtilitySettings,
      prepayments: parseFloat(manualPrepayments) || 0,
    });
  };

  const handleStatusChange = (status: 'draft' | 'final' | 'sent') => {
    if (!existingStatement || !selectedHouseId) return;
    updateStatus.mutate({ id: existingStatement.id, status, houseId: selectedHouseId });
  };

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 1 - i);

  // Berechne aktuelle Werte für Vorschau
  const totalCosts = costs?.reduce((sum, c) => sum + c.total_amount, 0) || 0;
  const tenantShare = costs?.reduce((sum, c) => {
    if (!settings) return sum;
    const key = c.distribution_key || c.category?.default_distribution_key || 'wohnflaeche';
    const { share } = calculateTenantShare(c.total_amount, key, settings as UtilitySettings);
    return sum + share;
  }, 0) || 0;
  const prepayments = parseFloat(manualPrepayments) || 0;
  const result = tenantShare - prepayments;

  if (!houses?.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Keine Festvermietungen vorhanden.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <Select value={selectedHouseId || ''} onValueChange={setSelectedHouseId}>
                <SelectTrigger>
                  <Building2 className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Objekt wählen..." />
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
            <div className="w-32">
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(year => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedHouseId && (
        <>
          {/* Bestehende Abrechnung oder Vorschau */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5" />
                  Nebenkostenabrechnung {selectedYear}
                </CardTitle>
                {existingStatement && (
                  <Badge variant="outline" className={statusConfig[existingStatement.status].color}>
                    {statusConfig[existingStatement.status].icon}
                    <span className="ml-1">{statusConfig[existingStatement.status].label}</span>
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Header Info */}
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Objekt:</span>
                  <span className="font-medium">{selectedHouse?.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Mieter:</span>
                  <span className="font-medium">{tenantInfo?.tenant_name || '-'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Abrechnungszeitraum:</span>
                  <span className="font-medium">01.01.{selectedYear} - 31.12.{selectedYear}</span>
                </div>
                {settings && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Wohnfläche:</span>
                    <span className="font-medium">
                      {settings.tenant_area_sqm} m² von {settings.total_area_sqm} m² 
                      ({settings.tenant_area_sqm && settings.total_area_sqm 
                        ? ((settings.tenant_area_sqm / settings.total_area_sqm) * 100).toFixed(1) 
                        : '-'}%)
                    </span>
                  </div>
                )}
              </div>

              {/* Kostenaufstellung */}
              {(existingStatement || costs?.length) ? (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kostenart</TableHead>
                        <TableHead className="text-right">Gesamt</TableHead>
                        <TableHead className="text-right">Ihr Anteil</TableHead>
                        <TableHead className="text-center">Schlüssel</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {existingStatement 
                        ? existingStatement.cost_breakdown.map((item, idx) => (
                            <TableRow key={idx}>
                              <TableCell>{item.category_name}</TableCell>
                              <TableCell className="text-right">{item.total_amount.toFixed(2)} €</TableCell>
                              <TableCell className="text-right font-medium">{item.tenant_share.toFixed(2)} €</TableCell>
                              <TableCell className="text-center text-sm text-muted-foreground">
                                {item.percentage.toFixed(1)}%
                              </TableCell>
                            </TableRow>
                          ))
                        : costs?.map(cost => {
                            const key = cost.distribution_key || cost.category?.default_distribution_key || 'wohnflaeche';
                            const { share, percentage } = settings 
                              ? calculateTenantShare(cost.total_amount, key, settings as UtilitySettings)
                              : { share: cost.total_amount, percentage: 100 };

                            return (
                              <TableRow key={cost.id}>
                                <TableCell>{cost.category?.name || 'Unbekannt'}</TableCell>
                                <TableCell className="text-right">{cost.total_amount.toFixed(2)} €</TableCell>
                                <TableCell className="text-right font-medium">{share.toFixed(2)} €</TableCell>
                                <TableCell className="text-center text-sm text-muted-foreground">
                                  {percentage.toFixed(1)}%
                                </TableCell>
                              </TableRow>
                            );
                          })
                      }
                    </TableBody>
                  </Table>

                  <Separator />

                  {/* Zusammenfassung */}
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Summe Nebenkosten</span>
                      <span className="font-medium">
                        {(existingStatement?.tenant_share || tenantShare).toFixed(2)} €
                      </span>
                    </div>

                    {!existingStatement && (
                      <div className="flex items-center gap-2">
                        <Label htmlFor="prepayments" className="text-muted-foreground whitespace-nowrap">
                          - Ihre Vorauszahlungen
                        </Label>
                        <Input
                          id="prepayments"
                          type="number"
                          step="0.01"
                          className="w-32 text-right"
                          value={manualPrepayments}
                          onChange={(e) => setManualPrepayments(e.target.value)}
                        />
                        <span>€</span>
                      </div>
                    )}

                    {existingStatement && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">- Ihre Vorauszahlungen</span>
                        <span>-{existingStatement.prepayments.toFixed(2)} €</span>
                      </div>
                    )}

                    <Separator />

                    <div className="flex justify-between text-lg font-bold">
                      <span>{(existingStatement?.result || result) >= 0 ? 'NACHZAHLUNG' : 'GUTHABEN'}</span>
                      <span className={(existingStatement?.result || result) >= 0 ? 'text-destructive' : 'text-green-600'}>
                        {Math.abs(existingStatement?.result || result).toFixed(2)} €
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Keine Kosten für {selectedYear} erfasst. Bitte zuerst Kosten im Tab "Kosten erfassen" eingeben.
                </div>
              )}

              {/* Aktionen */}
              <div className="flex gap-2 pt-4 border-t">
                {!existingStatement && costs?.length && settings ? (
                  <Button onClick={handleGenerate} disabled={generateStatement.isPending}>
                    <Calculator className="h-4 w-4 mr-2" />
                    Abrechnung erstellen
                  </Button>
                ) : existingStatement && (
                  <>
                    {existingStatement.status === 'draft' && (
                      <Button onClick={() => handleStatusChange('final')} disabled={updateStatus.isPending}>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Finalisieren
                      </Button>
                    )}
                    {existingStatement.status === 'final' && (
                      <Button onClick={() => handleStatusChange('sent')} disabled={updateStatus.isPending}>
                        <Send className="h-4 w-4 mr-2" />
                        Als versendet markieren
                      </Button>
                    )}
                    {existingStatement.status !== 'sent' && (
                      <Button 
                        variant="outline" 
                        onClick={handleGenerate} 
                        disabled={generateStatement.isPending}
                      >
                        <Calculator className="h-4 w-4 mr-2" />
                        Neu berechnen
                      </Button>
                    )}
                  </>
                )}
              </div>

              {existingStatement && (
                <p className="text-xs text-muted-foreground">
                  Erstellt am {format(new Date(existingStatement.generated_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                  {existingStatement.sent_at && ` • Versendet am ${format(new Date(existingStatement.sent_at), 'dd.MM.yyyy', { locale: de })}`}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Historische Abrechnungen */}
          {statements && statements.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Bisherige Abrechnungen</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {statements.map(stmt => (
                    <div 
                      key={stmt.id} 
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        stmt.year === selectedYear ? 'bg-primary/5 border-primary/30' : 'bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{stmt.year}</span>
                        <Badge variant="outline" className={statusConfig[stmt.status].color}>
                          {statusConfig[stmt.status].label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`font-medium ${stmt.result >= 0 ? 'text-destructive' : 'text-green-600'}`}>
                          {stmt.result >= 0 ? '+' : '-'}{Math.abs(stmt.result).toFixed(2)} €
                        </span>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setSelectedYear(stmt.year)}
                        >
                          Anzeigen
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default UtilityStatementGenerator;
