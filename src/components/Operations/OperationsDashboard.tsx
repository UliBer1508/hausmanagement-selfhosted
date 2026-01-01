import { useState } from 'react';
import { X, RefreshCw, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOperationsDashboard, TimeRange } from '@/hooks/useOperationsDashboard';
import { TimeRangeTabs } from './TimeRangeTabs';
import { CheckInsCard } from './CheckInsCard';
import { CheckOutsCard } from './CheckOutsCard';
import { CleaningsCard } from './CleaningsCard';
import { LinenDeliveriesCard } from './LinenDeliveriesCard';
import { RevenueCard } from './RevenueCard';

interface OperationsDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
}

export function OperationsDashboard({ isOpen, onClose, embedded = false }: OperationsDashboardProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('this_week');
  const { data, isLoading, refetch } = useOperationsDashboard(timeRange);

  if (!isOpen) return null;

  // Embedded mode - renders without backdrop and fixed positioning
  if (embedded) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-card">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Operations Dashboard</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Aktualisieren
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Time Range Tabs */}
        <div className="p-4 border-b bg-card/50">
          <TimeRangeTabs value={timeRange} onChange={setTimeRange} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-4">
                <div className="flex gap-1">
                  <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <p className="text-sm text-muted-foreground">Lade Daten...</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CheckInsCard checkIns={data.checkIns} />
              <CheckOutsCard checkOuts={data.checkOuts} />
              <CleaningsCard cleanings={data.cleanings} />
              <RevenueCard revenue={data.revenue} />
              <div className="md:col-span-2">
                <LinenDeliveriesCard linenDeliveries={data.linenDeliveries} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-[200]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-4 md:inset-8 lg:inset-12 bg-background rounded-lg shadow-2xl z-[201] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-card">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Operations Dashboard</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Aktualisieren
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Time Range Tabs */}
        <div className="p-4 border-b bg-card/50">
          <TimeRangeTabs value={timeRange} onChange={setTimeRange} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-4">
                <div className="flex gap-1">
                  <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <p className="text-sm text-muted-foreground">Lade Daten...</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {/* Check-ins */}
              <CheckInsCard checkIns={data.checkIns} />

              {/* Check-outs */}
              <CheckOutsCard checkOuts={data.checkOuts} />

              {/* Cleanings */}
              <CleaningsCard cleanings={data.cleanings} />

              {/* Revenue - spans 1 column on smaller screens, full width on xl */}
              <div className="md:col-span-2 lg:col-span-1">
                <RevenueCard revenue={data.revenue} />
              </div>

              {/* Linen Deliveries - full width on bottom */}
              <div className="md:col-span-2 lg:col-span-3 xl:col-span-4">
                <LinenDeliveriesCard linenDeliveries={data.linenDeliveries} />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
