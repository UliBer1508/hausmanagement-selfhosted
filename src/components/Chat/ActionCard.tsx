import { Search, Info, Edit, Plus, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ToolCall {
  id: string;
  name: string;
  arguments: string;
  result?: any;
}

interface ActionCardProps {
  toolCall: ToolCall;
}

const ActionCard = ({ toolCall }: ActionCardProps) => {
  const getToolIcon = () => {
    switch (toolCall.name) {
      case 'search_bookings':
      case 'search_houses':
        return <Search className="h-4 w-4" />;
      case 'get_booking_details':
      case 'get_house_details':
        return <Info className="h-4 w-4" />;
      case 'update_booking_status':
        return <Edit className="h-4 w-4" />;
      case 'create_cleaning_task':
        return <Plus className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getToolLabel = () => {
    switch (toolCall.name) {
      case 'search_bookings':
        return 'Buchungen durchsuchen';
      case 'search_houses':
        return 'Häuser durchsuchen';
      case 'get_booking_details':
        return 'Buchungsdetails abrufen';
      case 'get_house_details':
        return 'Hausdetails abrufen';
      case 'update_booking_status':
        return 'Buchungsstatus ändern';
      case 'create_cleaning_task':
        return 'Reinigungsauftrag erstellen';
      default:
        return toolCall.name;
    }
  };

  const hasResult = toolCall.result !== undefined;
  const isSuccess = hasResult && !toolCall.result?.error;

  return (
    <Card className="border-l-4" style={{ borderLeftColor: isSuccess ? 'hsl(var(--primary))' : 'hsl(var(--muted))' }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {getToolIcon()}
            {getToolLabel()}
          </CardTitle>
          {hasResult && (
            <Badge variant={isSuccess ? 'default' : 'destructive'} className="text-xs">
              {isSuccess ? (
                <>
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Erfolg
                </>
              ) : (
                <>
                  <XCircle className="h-3 w-3 mr-1" />
                  Fehler
                </>
              )}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="text-xs text-muted-foreground space-y-2">
          {/* Arguments */}
          <div>
            <p className="font-semibold mb-1">Parameter:</p>
            <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
              {JSON.stringify(JSON.parse(toolCall.arguments), null, 2)}
            </pre>
          </div>

          {/* Result */}
          {hasResult && (
            <div>
              <p className="font-semibold mb-1">Ergebnis:</p>
              {isSuccess ? (
                <div className="bg-primary/10 p-2 rounded">
                  {typeof toolCall.result === 'object' ? (
                    <pre className="text-xs overflow-x-auto">
                      {JSON.stringify(toolCall.result, null, 2)}
                    </pre>
                  ) : (
                    <p>{String(toolCall.result)}</p>
                  )}
                </div>
              ) : (
                <div className="bg-destructive/10 text-destructive p-2 rounded">
                  <p>{toolCall.result?.error || 'Unbekannter Fehler'}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ActionCard;
