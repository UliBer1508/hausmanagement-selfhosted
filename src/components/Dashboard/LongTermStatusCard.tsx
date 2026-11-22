import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePropertyStatus } from '@/hooks/usePropertyStatus';
import type { PropertyLevel } from '@/lib/propertyIssues';

/**
 * Übersichtskarte „Mietobjekte" (obere Kartenreihe in pages/OriginalDashboard.tsx,
 * 22.11.2026): je festvermietetem Objekt eine Zeile mit Ampel und dem wichtigsten
 * offenen Punkt. Daten und Bewertung wie im Häuser-Tab
 * (`usePropertyStatus` → `lib/propertyIssues.ts`), kein KI-Aufruf.
 * Klick auf eine Zeile → Häuser-Tab, dort stehen alle Punkte.
 */

const DOT: Record<PropertyLevel, string> = {
  danger: '🔴',
  warning: '🟡',
  info: '🟢',
  ok: '🟢',
};

const TEXT_COLOR: Record<PropertyLevel, string> = {
  danger: 'text-red-600',
  warning: 'text-amber-600',
  info: 'text-green-600',
  ok: 'text-green-600',
};

const LongTermStatusCard = () => {
  const navigate = useNavigate();
  const { data, isLoading, isError } = usePropertyStatus();
  const objects = (data ?? []).filter(s => s.isLongTerm);

  return (
    <Card className="dashboard-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center">
          <span className="text-lg flex-shrink-0 mr-2">🔑</span>
          <span className="truncate">Mietobjekte ({objects.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <p className="text-xs text-muted-foreground">Wird geprüft …</p>}
        {isError && <p className="text-xs text-red-600">Status konnte nicht geladen werden</p>}
        {!isLoading && !isError && objects.length === 0 && (
          <p className="text-xs text-muted-foreground">Keine festvermieteten Objekte</p>
        )}
        {objects.map(s => {
          // Wichtigster Punkt (Liste ist nach Dringlichkeit sortiert); Hinweise zählen nicht
          const top = s.issues[0];
          const more = s.issues.filter(i => i.level !== 'info').length - 1;
          const right = top && top.level !== 'info' ? `${top.short}${more > 0 ? ` +${more}` : ''}` : 'OK';
          return (
            <button
              key={s.houseId}
              type="button"
              onClick={() => navigate('/', { state: { activeTab: 'Häuser' } })}
              title={top ? [top.title, top.detail].filter(Boolean).join(' · ') : 'Nichts offen'}
              className="w-full flex items-center justify-between gap-2 min-w-0 text-left rounded-sm hover:bg-black/[.03]"
            >
              <span className="flex items-center space-x-2 min-w-0 flex-1">
                <span className="text-sm flex-shrink-0">{s.propertyType === 'apartment' ? '🏢' : '🏠'}</span>
                <span className="text-sm font-medium truncate">{s.name}</span>
              </span>
              <span className={`text-sm font-bold whitespace-nowrap shrink-0 ${TEXT_COLOR[s.level]}`}>
                {DOT[s.level]} {right}
              </span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default LongTermStatusCard;
