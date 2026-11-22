import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, AlertTriangle, Info, CheckCircle2, ChevronRight } from 'lucide-react';
import type { PropertyIssue, PropertyLevel } from '@/lib/propertyIssues';
import HouseCardHeader, { HEADER_GRADIENTS } from './HouseCardHeader';

/**
 * Dritte Karte je Objekt im Häuser-Tab: „Issues und To-dos" (22.11.2026).
 * Inhalt kommt fertig aus `lib/propertyIssues.ts` (über `hooks/usePropertyStatus.ts`).
 */

interface HouseIssuesCardProps {
  objectLabel: string;
  issues: PropertyIssue[] | undefined;
  level: PropertyLevel | undefined;
  isLongTerm: boolean;
}

const LEVEL_STYLE = {
  danger: { gradient: HEADER_GRADIENTS.danger, color: '#dc2626', pill: 'Kritisch', border: 'border-l-red-500', bg: 'bg-red-50/60' },
  warning: { gradient: HEADER_GRADIENTS.warning, color: '#d97706', pill: 'To-dos', border: 'border-l-amber-500', bg: 'bg-amber-50/60' },
  info: { gradient: HEADER_GRADIENTS.ok, color: '#059669', pill: 'Hinweise', border: 'border-l-emerald-500', bg: 'bg-emerald-50/40' },
  ok: { gradient: HEADER_GRADIENTS.ok, color: '#059669', pill: 'Alles erledigt', border: 'border-l-emerald-500', bg: 'bg-emerald-50/40' },
} as const;

const ISSUE_ICON = {
  danger: <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />,
  info: <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />,
};

const HouseIssuesCard = ({ objectLabel, issues, level, isLongTerm }: HouseIssuesCardProps) => {
  const navigate = useNavigate();
  const style = LEVEL_STYLE[level ?? 'ok'];
  const openCount = issues?.filter(i => i.level !== 'info').length ?? 0;

  return (
    <Card className={`border-l-4 ${style.border} ${style.bg} overflow-hidden flex flex-col h-full`}>
      <HouseCardHeader
        icon="📋"
        kicker={`Aufgaben · ${objectLabel}`}
        title="Issues und To-dos"
        gradient={style.gradient}
        pill={issues ? (openCount > 0 ? `${openCount} offen` : style.pill) : undefined}
        pillColor={style.color}
      />
      <CardContent className="p-3 flex-1">
        {!issues ? (
          <p className="text-sm text-muted-foreground">Wird geprüft …</p>
        ) : issues.length === 0 ? (
          <div className="flex items-start gap-2 text-sm text-emerald-800">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Nichts offen.
              {!isLongTerm && (
                <span className="block text-xs text-muted-foreground mt-1">
                  Reinigung, Wäsche und Zahlungen der Buchungen prüfen die Übersicht und Max.
                </span>
              )}
            </span>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {issues.map(issue => (
              <li key={issue.key}>
                <button
                  type="button"
                  disabled={!issue.target}
                  onClick={() => issue.target && navigate('/', { state: issue.target })}
                  className="w-full flex items-start gap-2 py-2 text-left rounded-sm hover:bg-black/[.03] disabled:cursor-default disabled:hover:bg-transparent"
                >
                  {ISSUE_ICON[issue.level]}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold leading-snug">{issue.title}</span>
                    {issue.detail && (
                      <span className="block text-xs text-muted-foreground leading-snug">{issue.detail}</span>
                    )}
                  </span>
                  {issue.target && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default HouseIssuesCard;
