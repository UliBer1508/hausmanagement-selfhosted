import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TimeRange } from '@/hooks/useOperationsDashboard';

interface TimeRangeTabsProps {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
}

export function TimeRangeTabs({ value, onChange }: TimeRangeTabsProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as TimeRange)}>
      <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto sm:h-10 gap-1">
        <TabsTrigger value="this_week" className="text-xs sm:text-sm py-2 sm:py-1.5">
          Diese Woche
        </TabsTrigger>
        <TabsTrigger value="next_week" className="text-xs sm:text-sm py-2 sm:py-1.5">
          Nächste Woche
        </TabsTrigger>
        <TabsTrigger value="month" className="text-xs sm:text-sm py-2 sm:py-1.5">
          Dieser Monat
        </TabsTrigger>
        <TabsTrigger value="year" className="text-xs sm:text-sm py-2 sm:py-1.5">
          Dieses Jahr
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
