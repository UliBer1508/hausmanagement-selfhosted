import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import BookingInquiryAlertBanner from '@/components/Dashboard/BookingInquiryAlertBanner';
import GuestContactAlertBanner from '@/components/Dashboard/GuestContactAlertBanner';
import RatingReminderBanner from '@/components/Dashboard/RatingReminderBanner';
import CleaningStatusAlertBanner from '@/components/Dashboard/CleaningStatusAlertBanner';
import BookingCard from '@/components/Bookings/BookingCard';
import ServiceTaskCard from '@/components/Bookings/ServiceTaskCard';
import LaundryOrderCard from '@/components/Bookings/LaundryOrderCardWithStatus';

interface OverviewTabProps {
  housesData: any[] | undefined;
  filteredBookings: any[] | undefined;
  isFiltersExpanded: boolean;
  setIsFiltersExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  serviceTypeFilter: string;
  setServiceTypeFilter: React.Dispatch<React.SetStateAction<string>>;
  statusFilter: string;
  setStatusFilter: React.Dispatch<React.SetStateAction<string>>;
  houseFilter: string;
  setHouseFilter: React.Dispatch<React.SetStateAction<string>>;
  timePeriodFilter: string;
  setTimePeriodFilter: React.Dispatch<React.SetStateAction<string>>;
  sortDirection: 'asc' | 'desc';
  setSortDirection: React.Dispatch<React.SetStateAction<'asc' | 'desc'>>;
  includeCheckedIn: boolean;
  setIncludeCheckedIn: React.Dispatch<React.SetStateAction<boolean>>;
  getBookingRelatedData: (bookingId: string) => { tasks: any[]; laundry: any[] };
  getFilteredTasksByService: (tasks: any[]) => any[];
  handleEditLinenOrder: (order: any) => void;
  handleCreateLinenOrder: (booking: any) => void;
  handleCreateCleaningTask?: (booking: any) => void;
  syncingOrderId: string | null;
  setSyncingOrderId: React.Dispatch<React.SetStateAction<string | null>>;
  syncOrder: (id: string) => Promise<any>;
  resetSync: (id: string) => Promise<any>;
  externalSyncEnabled: boolean;
  unlinkedServiceTasks?: any[];
  unlinkedLinenOrders?: any[];
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  housesData, filteredBookings,
  isFiltersExpanded, setIsFiltersExpanded,
  searchTerm, setSearchTerm,
  serviceTypeFilter, setServiceTypeFilter,
  statusFilter, setStatusFilter,
  houseFilter, setHouseFilter,
  timePeriodFilter, setTimePeriodFilter,
  sortDirection, setSortDirection,
  includeCheckedIn, setIncludeCheckedIn,
  getBookingRelatedData, getFilteredTasksByService,
  handleEditLinenOrder, syncingOrderId, setSyncingOrderId,
  handleCreateLinenOrder,
  handleCreateCleaningTask,
  syncOrder, resetSync, externalSyncEnabled,
  unlinkedServiceTasks = [],
  unlinkedLinenOrders = [],
}) => {
  const availableHouses = [
    { id: 'all', name: 'Alle Häuser' },
    ...(housesData?.map((house) => ({ id: house.id, name: house.name })) || []),
  ];

  const availableStatuses = [
    { value: 'all', label: 'Alle Status' },
    { value: 'confirmed', label: 'Bestätigt' },
    { value: 'checked_in', label: 'Eingecheckt' },
    { value: 'completed', label: 'Abgeschlossen' },
    { value: 'cancelled', label: 'Storniert' },
  ];

  const timePeriods = [
    { value: 'next3months', label: 'Nächste 3 Monate' },
    { value: 'next6months', label: 'Nächste 6 Monate' },
    { value: 'thisyear', label: 'Dieses Jahr' },
    { value: 'all', label: 'Alle Zeiträume' },
  ];

  return (
    <div>
      <BookingInquiryAlertBanner />
      <GuestContactAlertBanner />
      <div className="mt-4">
        <RatingReminderBanner />
      </div>
      <CleaningStatusAlertBanner />

      <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4 mb-6">
        <div className="mb-4">
          <Button
            variant="outline"
            onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
            className="w-full flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filter & Suche
            </span>
            {isFiltersExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>

        <div className={`${isFiltersExpanded ? 'block' : 'hidden'}`}>
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Nach Gast oder Haus suchen..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <select
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                value={serviceTypeFilter}
                onChange={(e) => setServiceTypeFilter(e.target.value)}
              >
                <option value="all">Alle Services</option>
                <option value="cleaning">Reinigung</option>
                <option value="laundry">Wäsche</option>
                <option value="maintenance">Wartung</option>
              </select>

              <select
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {availableStatuses.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>

              <select
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                value={houseFilter}
                onChange={(e) => setHouseFilter(e.target.value)}
              >
                {availableHouses.map((house) => (
                  <option key={house.id} value={house.id}>{house.name}</option>
                ))}
              </select>

              <select
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                value={timePeriodFilter}
                onChange={(e) => setTimePeriodFilter(e.target.value)}
              >
                {timePeriods.map((period) => (
                  <option key={period.value} value={period.value}>{period.label}</option>
                ))}
              </select>

              <button
                className="px-3 py-2 border border-input rounded-md text-sm flex items-center gap-1 hover:bg-accent"
                onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                title={sortDirection === 'asc' ? 'Aufsteigend (älteste zuerst)' : 'Absteigend (neueste zuerst)'}
              >
                {sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {sortDirection === 'asc' ? 'Aufsteigend' : 'Absteigend'}
              </button>

              {statusFilter === 'confirmed' && (
                <label className="flex items-center gap-2 px-3 py-2 text-sm whitespace-nowrap cursor-pointer">
                  <Checkbox
                    checked={includeCheckedIn}
                    onCheckedChange={(checked) => setIncludeCheckedIn(checked === true)}
                  />
                  <span>auch eingecheckte</span>
                </label>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Buchungen mit verknüpften Aufträgen
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Übersicht über Buchungen und ihre zugehörigen Service-Aufträge und Wäschebestellungen (inkl. abgeschlossene)
          </p>

          <div className="space-y-6">
            {filteredBookings?.map((booking, index) => {
              const { tasks, laundry } = getBookingRelatedData(booking.id);
              const filteredTasks = getFilteredTasksByService(tasks);
              const colorVariant = index === 0 ? 'green' : index === 1 ? 'blue' : 'purple';

              return (
                <div key={booking.id} className="relative bg-white rounded-lg border border-gray-200 shadow-sm">
                  <div className="p-3 sm:p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <BookingCard
                        booking={booking}
                        colorVariant={colorVariant as any}
                        onBookingUpdated={() => window.location.reload()}
                      />

                      <div className="space-y-3">
                        {filteredTasks.length > 0 ? (
                          filteredTasks.map((task) => (
                            <ServiceTaskCard key={task.id} task={task} colorVariant={colorVariant as any} onTaskUpdated={() => window.location.reload()} />
                          ))
                        ) : (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => handleCreateCleaningTask?.(booking)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleCreateCleaningTask?.(booking);
                              }
                            }}
                            className="text-center text-muted-foreground py-8 border-2 border-dashed border-muted hover:border-primary/50 hover:bg-accent/50 rounded-lg bg-blue-50 cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            <div className="flex flex-col items-center space-y-2">
                              <span className="text-lg">🧹</span>
                              <p className="font-medium">Keine Service-Aufträge</p>
                              <p className="text-xs text-primary text-slate-400">Klicken um Reinigungsauftrag zu erstellen</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        {laundry.length > 0 ? (
                          laundry.map((order) => (
                            <LaundryOrderCard
                              key={order.id}
                              order={order}
                              colorVariant={colorVariant as any}
                              onEdit={handleEditLinenOrder}
                              onSync={async (order) => {
                                setSyncingOrderId(order.id);
                                try {
                                  await syncOrder(order.id);
                                } finally {
                                  setSyncingOrderId(null);
                                }
                              }}
                              onResetSync={async (order) => { await resetSync(order.id); }}
                              isSyncing={syncingOrderId === order.id}
                              externalSyncEnabled={externalSyncEnabled}
                            />
                          ))
                        ) : (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => handleCreateLinenOrder(booking)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleCreateLinenOrder(booking);
                              }
                            }}
                            className="text-center text-muted-foreground py-8 border-2 border-dashed border-muted hover:border-primary/50 hover:bg-accent/50 rounded-lg bg-gray-50 cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            <div className="flex flex-col items-center space-y-2">
                              <span className="text-lg">👕</span>
                              <p className="font-medium">Keine Wäschebestellungen</p>
                              <p className="text-xs">Klicken um Bestellung zu erstellen</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }) ?? (
              <div className="text-center py-8">
                <p className="text-gray-500">Keine bestätigten Buchungen gefunden</p>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Service-Aufträge ohne Buchung</CardTitle>
              <p className="text-sm text-gray-600">
                Aufträge die keiner Buchung zugeordnet sind (inkl. abgeschlossene)
              </p>
            </CardHeader>
            <CardContent>
              {unlinkedServiceTasks.length > 0 ? (
                <div className="space-y-3">
                  {unlinkedServiceTasks.map((task) => (
                    <ServiceTaskCard
                      key={task.id}
                      task={task}
                      colorVariant="blue"
                      onTaskUpdated={() => window.location.reload()}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500 py-8">Keine unverbundenen Aufträge</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Wäschebestellungen ohne Buchung</CardTitle>
              <p className="text-sm text-gray-600">
                Bestellungen die keiner Buchung zugeordnet sind (inkl. abgeschlossene)
              </p>
            </CardHeader>
            <CardContent>
              {unlinkedLinenOrders.length > 0 ? (
                <div className="space-y-3">
                  {unlinkedLinenOrders.map((order) => (
                    <LaundryOrderCard
                      key={order.id}
                      order={order}
                      colorVariant="purple"
                      onEdit={handleEditLinenOrder}
                      onSync={async (o) => {
                        setSyncingOrderId(o.id);
                        try {
                          await syncOrder(o.id);
                        } finally {
                          setSyncingOrderId(null);
                        }
                      }}
                      onResetSync={async (o) => { await resetSync(o.id); }}
                      isSyncing={syncingOrderId === order.id}
                      externalSyncEnabled={externalSyncEnabled}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500 py-8">Keine unverbundenen Bestellungen</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;