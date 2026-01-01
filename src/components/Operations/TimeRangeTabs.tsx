import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TimeRange } from '@/hooks/useOperationsDashboard';

interface TimeRangeTabsProps {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
}

export function TimeRangeTabs({ value, onChange }: TimeRangeTabsProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as TimeRange)}>
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="this_week">Diese Woche</TabsTrigger>
        <TabsTrigger value="next_week">Nächste Woche</TabsTrigger>
        <TabsTrigger value="month">Dieser Monat</TabsTrigger>
        <TabsTrigger value="year">Dieses Jahr</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
