import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, Activity, HardDrive, FileText, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface UsageReportData {
  metrics: {
    database_size_mb: number;
    total_rows: number;
    edge_function_calls_monthly: number;
    storage_size_mb: number;
  };
  analysis: {
    urgency: 'none' | 'low' | 'medium' | 'high';
    reasons: string[];
    recommendation: string;
    metrics: {
      dbPercent: number;
      funcPercent: number;
      storagePercent: number;
    };
  };
}

interface UsageReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: UsageReportData | null;
}

export function UsageReportDialog({ open, onOpenChange, data }: UsageReportDialogProps) {
  if (!data) return null;

  const { metrics, analysis } = data;

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'none':
      case 'low':
        return 'default';
      case 'medium':
        return 'secondary';
      case 'high':
        return 'destructive';
      default:
        return 'default';
    }
  };

  const getUrgencyIcon = (urgency: string) => {
    switch (urgency) {
      case 'none':
      case 'low':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'medium':
        return <AlertTriangle className="w-4 h-4" />;
      case 'high':
        return <XCircle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getUrgencyLabel = (urgency: string) => {
    switch (urgency) {
      case 'none':
        return '✅ Alles gut';
      case 'low':
        return '✅ Alles gut';
      case 'medium':
        return '⚠️ Warnung';
      case 'high':
        return '🚨 Kritisch';
      default:
        return 'Status';
    }
  };

  const getProgressColor = (percent: number) => {
    if (percent < 70) return 'bg-green-500';
    if (percent < 85) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const ProgressWithThresholds = ({ value, label, maxLabel }: { value: number; label: string; maxLabel: string }) => (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">{value.toFixed(1)}%</span>
      </div>
      <div className="relative">
        <Progress value={value} className="h-2" />
        {/* Threshold Markers */}
        <div className="absolute top-0 left-[70%] w-0.5 h-2 bg-yellow-600 opacity-70" title="70% - Warnschwelle" />
        <div className="absolute top-0 left-[85%] w-0.5 h-2 bg-red-600 opacity-70" title="85% - Kritische Schwelle" />
      </div>
      <div className="text-xs text-muted-foreground">{maxLabel}</div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl">Supabase Nutzungsbericht</DialogTitle>
            <Badge variant={getUrgencyColor(analysis.urgency)} className="flex items-center gap-1">
              {getUrgencyIcon(analysis.urgency)}
              {getUrgencyLabel(analysis.urgency)}
            </Badge>
          </div>
          <DialogDescription>
            Generiert am {format(new Date(), "PPP 'um' HH:mm 'Uhr'", { locale: de })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Schwellenwerte Legende */}
          <Alert>
            <AlertDescription className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full" />
                <span>&lt; 70%: Alles gut</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                <span>70-85%: Beobachten</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full" />
                <span>&gt; 85%: Pro Plan empfohlen</span>
              </div>
            </AlertDescription>
          </Alert>

          {/* Metriken Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Aktuelle Nutzung</h3>
            
            {/* Datenbank */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Database className="w-4 h-4 text-primary" />
                  Datenbank
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ProgressWithThresholds
                  value={analysis.metrics.dbPercent}
                  label={`${metrics.database_size_mb.toFixed(2)} MB von 500 MB verwendet`}
                  maxLabel="Free Plan Limit: 500 MB"
                />
              </CardContent>
            </Card>

            {/* Edge Functions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  Edge Functions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ProgressWithThresholds
                  value={analysis.metrics.funcPercent}
                  label={`${metrics.edge_function_calls_monthly.toLocaleString()} von 500.000 Calls verwendet`}
                  maxLabel="Free Plan Limit: 500.000 Calls/Monat"
                />
              </CardContent>
            </Card>

            {/* Storage */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-primary" />
                  Storage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ProgressWithThresholds
                  value={analysis.metrics.storagePercent}
                  label={`${metrics.storage_size_mb.toFixed(2)} MB von 1.024 MB verwendet`}
                  maxLabel="Free Plan Limit: 1 GB"
                />
              </CardContent>
            </Card>

            {/* Datensätze */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Gesamt Datensätze
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{metrics.total_rows.toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          {/* Empfehlung */}
          <Alert variant={analysis.urgency === 'high' ? 'destructive' : 'default'}>
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-semibold">{analysis.recommendation}</p>
                {analysis.reasons.length > 0 && (
                  <ul className="list-disc list-inside space-y-1 text-sm mt-2">
                    {analysis.reasons.map((reason, index) => (
                      <li key={index}>{reason}</li>
                    ))}
                  </ul>
                )}
              </div>
            </AlertDescription>
          </Alert>

          {/* Plan-Vergleich */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Plan-Vergleich</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead>Free Plan</TableHead>
                  <TableHead>Pro Plan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Datenbank</TableCell>
                  <TableCell>500 MB</TableCell>
                  <TableCell>8 GB</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Edge Functions</TableCell>
                  <TableCell>500.000 / Monat</TableCell>
                  <TableCell>2 Millionen / Monat</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Storage</TableCell>
                  <TableCell>1 GB</TableCell>
                  <TableCell>100 GB</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Preis</TableCell>
                  <TableCell>Kostenlos</TableCell>
                  <TableCell>$25 / Monat</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
