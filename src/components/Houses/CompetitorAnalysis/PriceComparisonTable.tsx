import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PriceComparisonData } from "@/hooks/useCompetitorAnalysis";
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface PriceComparisonTableProps {
  data: PriceComparisonData[];
  competitors: Array<{ id: string; property_name: string }>;
}

const PriceComparisonTable = ({ data, competitors }: PriceComparisonTableProps) => {
  const getStatusBadge = (percentDiff?: number) => {
    if (percentDiff === undefined) return null;
    
    if (percentDiff > 15) {
      return <Badge variant="destructive">Viel teurer</Badge>;
    } else if (percentDiff > 5) {
      return <Badge className="bg-orange-500">Teurer</Badge>;
    } else if (percentDiff < -15) {
      return <Badge className="bg-blue-500">Viel günstiger</Badge>;
    } else if (percentDiff < -5) {
      return <Badge className="bg-green-600">Günstiger</Badge>;
    } else {
      return <Badge variant="secondary">Wettbewerbsfähig</Badge>;
    }
  };

  return (
    <div className="rounded-md border overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Check-in Datum</TableHead>
            <TableHead className="text-right">Dein Preis (7N)</TableHead>
            {competitors.slice(0, 3).map(comp => (
              <TableHead key={comp.id} className="text-right">
                {comp.property_name} (7N)
              </TableHead>
            ))}
            <TableHead className="text-right">Ø Wettbewerber (7N)</TableHead>
            <TableHead className="text-right">Differenz</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.slice(0, 30).map((row) => {
            const checkIn = row.check_in || row.date;
            return (
              <TableRow key={checkIn}>
                <TableCell className="font-medium">
                  {format(new Date(checkIn), 'dd. MMMM yyyy', { locale: de })}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {row.own_price ? `${Math.round(row.own_price).toLocaleString('de-DE')} €` : '-'}
                </TableCell>
                {competitors.slice(0, 3).map(comp => {
                  const compPrice = row.competitor_prices[comp.id];
                  return (
                    <TableCell key={comp.id} className="text-right text-muted-foreground">
                      {compPrice ? `${Math.round(compPrice.price).toLocaleString('de-DE')} €` : '-'}
                    </TableCell>
                  );
                })}
                <TableCell className="text-right font-medium">
                  {row.average_competitor_price 
                    ? `${Math.round(row.average_competitor_price).toLocaleString('de-DE')} €` 
                    : '-'}
                </TableCell>
                <TableCell className="text-right">
                  {row.price_difference_percent !== undefined ? (
                    <span className={
                      row.price_difference_percent > 0 
                        ? 'text-orange-600 font-medium' 
                        : row.price_difference_percent < 0 
                        ? 'text-green-600 font-medium' 
                        : 'text-muted-foreground'
                    }>
                      {row.price_difference_percent > 0 ? '+' : ''}
                      {Math.round(row.price_difference_percent)}%
                    </span>
                  ) : '-'}
                </TableCell>
                <TableCell>
                  {getStatusBadge(row.price_difference_percent)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default PriceComparisonTable;
