import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Trash2, CheckCircle, Link2, RotateCcw, ChevronDown, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLinenColorLabel, LinenColor, getItemColorLabel, ItemColor } from '@/types/linen';
import { translateItemType, getLinenStatusBadge } from '@/lib/linenOrderHelpers';
import { getGuestName } from '@/lib/guestHelpers';
import { getExternalStatusBadgeInfo } from '@/hooks/useExternalOrderStatus';
import NotesQuickDialog from '@/components/shared/NotesQuickDialog';
import ChangedByLine from '@/components/shared/ChangedByLine';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

const ITEM_DISPLAY_ORDER = [
  'bedding',
  'pillow_cases',
  'spannbetttuch',
  'small_towels',
  'large_towels',
  'sauna_towels',
  'bath_mats',
  'sink_towels',
  'kitchen_towels',
  'blankets',
];

const SCHLAFBEREICH_DEFAULT_ITEMS = ['bedding', 'pillow_cases', 'blankets'];
const BADBEREICH_WELLNESS_DEFAULT_ITEMS = ['large_towels', 'small_towels', 'bath_mats', 'sink_towels', 'sauna_towels', 'spannbetttuch'];

const hasLinenColor = (itemType: string): boolean => {
  if (SCHLAFBEREICH_DEFAULT_ITEMS.includes(itemType)) return true;
  const lowerType = itemType.toLowerCase();
  if (lowerType === 'spannbetttuch') return false;
  return lowerType.includes('bett') || lowerType.includes('laken') || lowerType.includes('decke') || lowerType.includes('kissen');
};

const hasItemColor = (itemType: string): boolean => {
  if (BADBEREICH_WELLNESS_DEFAULT_ITEMS.includes(itemType)) return true;
  const lowerType = itemType.toLowerCase();
  return lowerType.includes('handtuch') || lowerType.includes('towel') || lowerType.includes('matte') || lowerType.includes('sauna');
};

interface LaundryOrderCardProps {
  order: any;
  colorVariant: 'green' | 'blue' | 'purple';
  variant?: 'overview' | 'full';
  isPending?: boolean;
  onEdit?: (order: any) => Promise<void> | void;
  onDelete?: (order: any) => Promise<void> | void;
  onConfirm?: (order: any) => Promise<void> | void;
  onSync?: (order: any) => Promise<void> | void;
  onResetSync?: (order: any) => Promise<void> | void;
  isSyncing?: boolean;
  externalSyncEnabled?: boolean;
  externalStatus?: { status: string; totalPrice: number } | null;
}

const LaundryOrderCard = ({ order, colorVariant, variant = 'full', isPending = false, onEdit, onDelete, onConfirm, onSync, onResetSync, isSyncing = false, externalSyncEnabled = false, externalStatus = null }: LaundryOrderCardProps) => {
  const [isItemsOpen, setIsItemsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSaveNotes = async (val: string) => {
    if (isPending || !order?.id) return;
    setSavingNotes(true);
    try {
      const { error } = await supabase
        .from('linen_orders')
        .update({ notes: val || null })
        .eq('id', order.id);
      if (error) throw error;
      // Optimistic local update so the dot reflects state immediately
      order.notes = val || null;
      queryClient.invalidateQueries({ queryKey: ['linen-orders-list'] });
      queryClient.invalidateQueries({ queryKey: ['linen-orders'] });
      toast({ title: 'Notiz gespeichert' });
    } catch (err: any) {
      toast({ title: 'Fehler beim Speichern', description: err.message, variant: 'destructive' });
    } finally {
      setSavingNotes(false);
    }
  };

  const getBorderColor = (variant: string) => {
    switch (variant) {
      case 'green':
        return 'border-l-green-500';
      case 'blue':
        return 'border-l-blue-500';
      case 'purple':
        return 'border-l-purple-500';
      default:
        return 'border-l-gray-500';
    }
  };

  const getStatusText = (status: string, isPendingFlag: boolean) => {
    if (isPendingFlag) return 'Ausstehend';
    switch (status) {
      case 'offen':
        return 'Offen';
      case 'ausstehend':
        return 'Ausstehend';
      case 'delivered':
        return 'Geliefert';
      case 'cancelled':
        return 'Storniert';
      default:
        return status;
    }
  };

  const getTotalItems = () => {
    if (order.items) {
      return Object.entries(order.items)
        .filter(([_, count]: [string, any]) => count > 0)
        .reduce((sum: number, [_, count]: [string, any]) => sum + count, 0);
    }
    return order.total_items || 0;
  };

  const houseName = order.houses?.name || 'Unbekannt';
  const guestName = order.bookings ? getGuestName(order.bookings) : null;

  const isClickable = !isPending && !!onEdit;
  const handleCardClick = async () => {
    if (!isClickable || !onEdit) return;
    try {
      await onEdit(order);
    } catch (error) {
      console.error('Error in onEdit (card click):', error);
    }
  };

  const deliveryDate = order.delivery_date
    ? new Date(order.delivery_date).toLocaleDateString('de-DE')
    : null;

  return (
    <Card
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={isClickable ? `Wäschebestellung für ${houseName} bearbeiten` : undefined}
      onClick={isClickable ? (e) => {
        if (!e.currentTarget.contains(e.target as Node)) return;
        handleCardClick();
      } : undefined}
      onKeyDown={isClickable ? (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          handleCardClick();
        }
      } : undefined}
      className={cn(
        `border-l-4 ${getBorderColor(colorVariant)} bg-laundry-bg relative flex flex-col h-full`,
        isPending && "border-dashed opacity-90",
        isClickable && "cursor-pointer hover:shadow-md transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {/* Kopfbalken */}
      <div
        className="flex items-center gap-2 px-3 py-2 text-white"
        style={{ background: 'linear-gradient(100deg,#059669,#10b981)' }}
      >
        <div
          className="w-7 h-7 rounded-lg grid place-items-center text-[15px] shrink-0"
          style={{ background: 'rgba(255,255,255,.22)' }}
        >
          📦
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-wider opacity-90">
            Wäsche · {houseName}
          </div>
          <div className="text-[14px] font-extrabold leading-tight truncate">
            Lieferschein{order.external_bestellnummer ? ` · #${order.external_bestellnummer}` : ''}
          </div>
        </div>
        {!isPending && (
          <button
            type="button"
            aria-label="Notiz anzeigen/bearbeiten"
            onClick={(e) => {
              e.stopPropagation();
              setNotesOpen(true);
            }}
            className="relative grid place-items-center w-7 h-7 rounded-md bg-white/15 hover:bg-white/25 transition-colors shrink-0"
          >
            <StickyNote className="w-4 h-4" />
            {order.notes && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-300 border border-white" />
            )}
          </button>
        )}
        <span className={cn('text-xs font-bold px-2 py-1 rounded-full border shrink-0', getLinenStatusBadge(order.status).className)}>
          {getStatusText(order.status, isPending)}
        </span>
      </div>

      <CardContent className="p-3 flex-1 flex flex-col">
        <div className="space-y-2 flex-1 flex flex-col min-h-[150px]">
          {order.houses?.address && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="shrink-0">📍</span>
              <span className="break-words">{order.houses.address}</span>
            </div>
          )}
          {/* Gastname oben links */}
          {guestName && (
            <div className="text-lg font-bold leading-tight truncate">
              {guestName}
              {order.bookings?.number_of_guests != null && (
                <span className="text-muted-foreground font-normal text-base"> ({order.bookings.number_of_guests})</span>
              )}
            </div>
          )}

          {variant === 'full' && order.bookings?.check_in && order.bookings?.check_out && (
            <div className="flex gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Check-in</div>
                <div className="text-sm">{format(new Date(order.bookings.check_in), 'dd.MM.yy', { locale: de })}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Check-out</div>
                <div className="text-sm">{format(new Date(order.bookings.check_out), 'dd.MM.yy', { locale: de })}</div>
              </div>
            </div>
          )}

          {/* Compact fields grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
            {order.service_providers?.name && (
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Provider</div>
                <div className="text-sm truncate">{order.service_providers.name}</div>
              </div>
            )}
            {deliveryDate && (
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Lieferdatum</div>
                <div className="text-sm truncate">{deliveryDate}</div>
              </div>
            )}
            {typeof order.total_cost === 'number' && order.total_cost > 0 && (
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Kosten</div>
                <div className="text-sm font-semibold text-green-700 truncate">{order.total_cost.toFixed(2)} EUR</div>
              </div>
            )}
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Artikel</div>
              {order.items ? (
                <Collapsible open={isItemsOpen} onOpenChange={setIsItemsOpen}>
                  <CollapsibleTrigger
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-sm hover:underline"
                  >
                    <span>{getTotalItems()}</span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
                        isItemsOpen && "rotate-180"
                      )}
                    />
                  </CollapsibleTrigger>
                </Collapsible>
              ) : (
                <div className="text-sm">{getTotalItems()}</div>
              )}
            </div>
          </div>

          {/* Items list (controlled by Artikel trigger above) */}
          {order.items && (
            <Collapsible open={isItemsOpen} onOpenChange={setIsItemsOpen}>
              <CollapsibleContent className="mt-1">
                <table className="w-full text-sm hidden lg:table">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left font-medium pb-1">Artikel</th>
                      <th className="text-center font-medium pb-1">Farbe</th>
                      <th className="text-right font-medium pb-1">Anz.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(order.items)
                      .filter(([_, count]: [string, any]) => count > 0)
                      .sort(([a], [b]) => {
                        const indexA = ITEM_DISPLAY_ORDER.indexOf(a);
                        const indexB = ITEM_DISPLAY_ORDER.indexOf(b);
                        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
                      })
                      .map(([itemType, count]: [string, any]) => {
                        const itemVariants = order.item_variants as Record<string, string> | null;
                        const itemColor = itemVariants?.[itemType];
                        const itemHasLinenColor = hasLinenColor(itemType);
                        const itemHasItemColor = hasItemColor(itemType);

                        return (
                          <tr key={itemType}>
                            <td className="py-0.5">{translateItemType(itemType)}</td>
                            <td className="text-center py-0.5">
                              {itemHasLinenColor
                                ? (itemColor ? getLinenColorLabel(itemColor as LinenColor) : '⬜ Weiß gestreift')
                                : itemHasItemColor
                                  ? (itemColor ? getItemColorLabel(itemColor as ItemColor) : '⬜ Weiß')
                                  : <span className="text-muted-foreground">-</span>
                              }
                            </td>
                            <td className="text-right text-muted-foreground py-0.5">{count}x</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>

                <div className="lg:hidden space-y-0.5">
                  {Object.entries(order.items)
                    .filter(([_, count]: [string, any]) => count > 0)
                    .sort(([a], [b]) => {
                      const indexA = ITEM_DISPLAY_ORDER.indexOf(a);
                      const indexB = ITEM_DISPLAY_ORDER.indexOf(b);
                      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
                    })
                    .map(([itemType, count]: [string, any]) => {
                      const itemVariants = order.item_variants as Record<string, string> | null;
                      const itemColor = itemVariants?.[itemType];
                      const itemHasLinenColor = hasLinenColor(itemType);
                      const itemHasItemColor = hasItemColor(itemType);

                      let colorLabel = '';
                      if (itemHasLinenColor) {
                        colorLabel = itemColor ? getLinenColorLabel(itemColor as LinenColor).replace('gestreift', 'gestr.') : 'Weiß gestr.';
                      } else if (itemHasItemColor) {
                        colorLabel = itemColor ? getItemColorLabel(itemColor as ItemColor) : 'Weiß';
                      }

                      return (
                        <div key={itemType} className="flex justify-between text-xs">
                          <span className="truncate">
                            {translateItemType(itemType)}
                            {colorLabel && <span className="text-muted-foreground"> ({colorLabel})</span>}
                          </span>
                          <span className="text-muted-foreground ml-2 shrink-0">{count}x</span>
                        </div>
                      );
                    })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Erstellt von / Geändert von — einheitliche Größe (text-[11px]).
              Problem: bei "Geändert von: Admin" fehlte bisher das Datum. */}
          {order.created_by_name && (
            <div className={cn("text-[11px] leading-tight text-muted-foreground", !order.status_changed_by && "mt-auto")}>
              Erstellt von: {order.created_by_name}
            </div>
          )}
          {order.status_changed_by && (
            <ChangedByLine
              by={order.status_changed_by}
              at={order.updated_at || order.status_changed_at}
              className={cn(!order.created_by_name && "mt-auto")}
            />
          )}
        </div>

        {/* Action Buttons - aligned right below content */}
        {!isPending && (onDelete || onSync || (onConfirm && order.status === 'offen')) && (
          <div className="flex gap-1 justify-end mt-2">
            {onSync && externalSyncEnabled && !order.external_bestellnummer && order.status === 'ausstehend' && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await onSync(order);
                  } catch (error) {
                    console.error('Error in onSync:', error);
                  }
                }}
                disabled={isSyncing}
              >
                <Link2 className="w-3 h-3 mr-1" />
                {isSyncing ? 'Sync...' : 'An Portal'}
              </Button>
            )}

            {onResetSync && order.external_bestellnummer && externalSyncEnabled && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-100"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await onResetSync(order);
                        } catch (error) {
                          console.error('Error in onResetSync:', error);
                        }
                      }}
                    >
                      <RotateCcw className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Sync zurücksetzen (Test)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {onConfirm && order.status === 'offen' && (
              <Button
                size="sm"
                className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await onConfirm(order);
                  } catch (error) {
                    console.error('Error in onConfirm:', error);
                  }
                }}
              >
                <CheckCircle className="w-3 h-3 mr-1" />
                Bestätigen
              </Button>
            )}

            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (window.confirm('Möchten Sie diese Wäschebestellung wirklich löschen?')) {
                    try {
                      await onDelete(order);
                    } catch (error) {
                      console.error('Error in onDelete:', error);
                    }
                  }
                }}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
        )}

        {/* External Sync Badge */}
        {order.external_bestellnummer && (
          <div className="flex justify-end mt-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  {externalStatus ? (
                    (() => {
                      const info = getExternalStatusBadgeInfo(externalStatus.status);
                      return (
                        <Badge variant={info.variant} className={cn('gap-1 text-[10px]', info.className)}>
                          <Link2 className="h-3 w-3" />
                          {info.label}
                        </Badge>
                      );
                    })()
                  ) : (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 gap-1 text-[10px]">
                      <Link2 className="h-3 w-3" />
                      Sync
                    </Badge>
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  <p>Externe Bestellnummer: {order.external_bestellnummer}</p>
                  {order.external_synced_at && (
                    <p className="text-xs text-muted-foreground">
                      Synchronisiert am {new Date(order.external_synced_at).toLocaleString('de-DE')}
                    </p>
                  )}
                  {externalStatus && (
                    <p className="text-xs text-muted-foreground">
                      Portal-Status: {externalStatus.status} · {externalStatus.totalPrice.toFixed(2)} €
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </CardContent>
      <NotesQuickDialog
        open={notesOpen}
        onOpenChange={setNotesOpen}
        title="Notiz zur Wäschebestellung"
        value={order.notes ?? ''}
        saving={savingNotes}
        onSave={handleSaveNotes}
      />
    </Card>
  );
};

export default LaundryOrderCard;
