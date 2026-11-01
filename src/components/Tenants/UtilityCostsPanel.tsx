import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UtilityCostSettings from './UtilityCostSettings';
import UtilityCostEntry from './UtilityCostEntry';
import UtilityStatementGenerator from './UtilityStatementGenerator';

interface UtilityCostsPanelProps {
  /**
   * Fest vorgegebenes Haus. Gesetzt im Haus-Dialog (Tab „Nebenkosten" bei
   * Festvermietung); leer im Mieter-Tab, dort wählt man das Objekt selbst.
   */
  houseId?: string;
}

/**
 * Betriebskosten der Festvermietung: Einstellungen → Kosten erfassen → Abrechnung.
 * EINE Komponente für beide Einstiege (Mieter → Nebenkosten und Haus-Dialog),
 * damit kein zweiter, fast gleicher Betriebskosten-Bildschirm entsteht.
 * Touristische Gebühren (Kurtaxe, Reinigung …) sind etwas anderes:
 * `Houses/AdditionalFeesTab.tsx`.
 */
const UtilityCostsPanel = ({ houseId }: UtilityCostsPanelProps) => {
  return (
    <Tabs defaultValue="settings" className="space-y-4">
      <TabsList className="flex flex-wrap h-auto">
        <TabsTrigger value="settings">Einstellungen</TabsTrigger>
        <TabsTrigger value="costs">Kosten erfassen</TabsTrigger>
        <TabsTrigger value="statement">Abrechnung</TabsTrigger>
      </TabsList>
      <TabsContent value="settings">
        <UtilityCostSettings houseId={houseId} />
      </TabsContent>
      <TabsContent value="costs">
        <UtilityCostEntry houseId={houseId} />
      </TabsContent>
      <TabsContent value="statement">
        <UtilityStatementGenerator houseId={houseId} />
      </TabsContent>
    </Tabs>
  );
};

export default UtilityCostsPanel;
