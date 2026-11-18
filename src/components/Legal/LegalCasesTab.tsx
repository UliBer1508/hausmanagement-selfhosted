import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Scale } from "lucide-react";
import { useHouses } from "@/hooks/useHouses";
import { useLegalCases, isCaseActive } from "@/hooks/useLegalCases";
import { LegalCase } from "@/types";
import LegalCaseCard from "./LegalCaseCard";
import LegalCaseDialog from "./LegalCaseDialog";

// Haupt-Tab „Rechtliches" (OriginalDashboard). Verfahren für JEDES Objekt —
// Ferienhaus und Festvermietung (Räumungsklage, Behörde, Gewährleistung …).
const LegalCasesTab = () => {
  const { data: houses = [] } = useHouses();
  const { data: cases = [], isLoading } = useLegalCases();
  const [houseFilter, setHouseFilter] = useState<string>('all');
  const [showClosed, setShowClosed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LegalCase | null>(null);

  const visible = useMemo(() =>
    cases.filter(c =>
      (houseFilter === 'all' || c.house_id === houseFilter) &&
      (showClosed || isCaseActive(c))),
  [cases, houseFilter, showClosed]);

  const closedCount = cases.filter(c => !isCaseActive(c)).length;

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (c: LegalCase) => { setEditing(c); setDialogOpen(true); };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Rechtliches</h1>
          <p className="text-muted-foreground mt-1">
            Verfahren, Fristen und Fragen an den Anwalt — für jedes Objekt
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> Verfahren anlegen
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
        <Select value={houseFilter} onValueChange={setHouseFilter}>
          <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Objekt filtern" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Objekte</SelectItem>
            {houses.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="show-closed" checked={showClosed} onCheckedChange={setShowClosed} />
          <Label htmlFor="show-closed">Erledigte anzeigen{closedCount > 0 ? ` (${closedCount})` : ''}</Label>
        </div>
      </div>

      {isLoading ? (
        <Card className="p-6 animate-pulse"><div className="h-4 bg-muted rounded w-1/2" /></Card>
      ) : visible.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <Scale className="h-10 w-10 mx-auto mb-3 opacity-40" />
          Keine {showClosed ? '' : 'laufenden '}Verfahren{houseFilter !== 'all' ? ' für dieses Objekt' : ''}.
        </Card>
      ) : (
        visible.map(c => <LegalCaseCard key={c.id} legalCase={c} onEdit={openEdit} />)
      )}

      <LegalCaseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        legalCase={editing}
        defaultHouseId={houseFilter !== 'all' ? houseFilter : undefined}
      />
    </div>
  );
};

export default LegalCasesTab;
