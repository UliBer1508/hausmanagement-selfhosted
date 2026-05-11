import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Edit, Package, Trash2, CheckCircle, Link2, RotateCcw, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLinenColorLabel, LinenColor, getItemColorLabel, ItemColor } from '@/types/linen';
import { translateItemType } from '@/lib/linenOrderHelpers';
import { getGuestName } from '@/lib/guestHelpers';
import { getExternalStatusBadgeInfo } from '@/hooks/useExternalOrderStatus';
// Feste Anzeige-Reihenfolge der Wäscheartikel
const ITEM_DISPLAY_ORDER = [
  'bedding',        // 1. Bettwäsche
  'pillow_cases',   // 2. Kissenbezüge
  'spannbetttuch',  // 3. Spannbetttuch
  'small_towels',   // 4. Handtücher
  'large_towels',   // 5. Badetücher
  'sauna_towels',   // 6. Saunatücher
  'bath_mats',      // 7. Badematten
  'sink_towels',    // 8. WB-Handtücher
  'kitchen_towels', // 9. Geschirrtücher
  'blankets',       // 10. Decken
];

// Kategorie-zu-Farbtyp-Mapping für dynamische Artikel
// Spannbetttuch gehört NICHT zu Schlafbereich (hat nur Weiß/Grau, nicht gestreift)
const SCHLAFBEREICH_DEFAULT_ITEMS = ['bedding', 'pillow_cases', 'blankets'];
const BADBEREICH_WELLNESS_DEFAULT_ITEMS = ['large_towels', 'small_towels', 'bath_mats', 'sink_towels', 'sauna_towels', 'spannbetttuch'];

// Prüft ob Artikel Schlafbereich-Farben hat (inkl. custom items)
const hasLinenColor = (itemType: string): boolean => {
  // Bekannte Schlafbereich-Artikel
  if (SCHLAFBEREICH_DEFAULT_ITEMS.includes(itemType)) return true;
  // Custom items mit "bett", "laken", "decke" im Namen - ABER NICHT spannbetttuch
  const lowerType = itemType.toLowerCase();
  if (lowerType === 'spannbetttuch') return false;
  return lowerType.includes('bett') || lowerType.includes('laken') || lowerType.includes('decke') || lowerType.includes('kissen');
};

// Prüft ob Artikel Bad/Wellness-Farben hat
const hasItemColor = (itemType: string): boolean => {
  if (BADBEREICH_WELLNESS_DEFAULT_ITEMS.includes(itemType)) return true;
  const lowerType = itemType.toLowerCase();
  return lowerType.includes('handtuch') || lowerType.includes('towel') || lowerType.includes('matte') || lowerType.includes('sauna');
};

interface LaundryOrderCardProps {
  order: any;
  colorVariant: 'green' | 'blue' | 'purple';
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

const LaundryOrderCard = ({ order, colorVariant, isPending = false, onEdit, onDelete, onConfirm, onSync, onResetSync, isSyncing = false, externalSyncEnabled = false, externalStatus = null }: LaundryOrderCardProps) => {
  // Debug: Check if status_changed_by is present
  console.log('[LaundryOrderCard] Order:', order.id, 'status_changed_by:', order.status_changed_by, 'status_changed_at:', order.status_changed_at);
  
  const [isItemsOpen, setIsItemsOpen] = useState(false);
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

  const getStatusBadge = (status: string, isPending: boolean) => {
    if (isPending) {
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">⏳ Ausstehend</Badge>;
    }
    switch (status) {
      case 'offen':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300">📝 Offen</Badge>;
      case 'ausstehend':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">⏳ Ausstehend</Badge>;
      case 'delivered':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">📦 Geliefert</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800 border-red-300">❌ Storniert</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTotalItems = () => {
    // Items is a JSON object like {"kitchen_towels": 1}
    if (order.items) {
      return Object.entries(order.items)
        .filter(([_, count]: [string, any]) => count > 0)
        .reduce((sum: number, [_, count]: [string, any]) => sum + count, 0);
    }
    return order.total_items || 0;
  };

  const houseName = order.houses?.name || 'Unbekannt';
  const houseAddress = order.houses?.address || '';
  const orderDate = order.order_date ? new Date(order.order_date).toLocaleDateString('de-DE') : '-';
  
  // Booking information
  const checkIn = order.bookings?.check_in ? new Date(order.bookings.check_in).toLocaleDateString('de-DE') : null;
  const checkOut = order.bookings?.check_out ? new Date(order.bookings.check_out).toLocaleDateString('de-DE') : null;
  const numberOfGuests = order.bookings?.number_of_guests || null;
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

  return (
    <Card
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={isClickable ? `Wäschebestellung für ${houseName} bearbeiten` : undefined}
      onClick={isClickable ? handleCardClick : undefined}
      onKeyDown={isClickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      } : undefined}
      className={cn(
        `border-l-4 ${getBorderColor(colorVariant)} bg-laundry-bg relative`,
        isPending && "border-dashed opacity-90",
        isClickable && "cursor-pointer hover:shadow-md transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <CardContent className="p-3 relative pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
          {/* Left Column: House Info & Booking */}
          <div className="space-y-1.5 lg:space-y-2">
            {/* Header with House Name */}
            <div className="flex items-start gap-2">
              <span className="text-sm lg:text-base">📦</span>
              <h4 className="font-medium text-sm">{houseName}</h4>
            </div>

            {/* House Address */}
            {houseAddress && (
              <div className="flex items-start gap-2 text-xs lg:text-sm">
                <span className="text-sm lg:text-base">📍</span>
                <span className="text-muted-foreground truncate">{houseAddress}</span>
              </div>
            )}

            {/* Guest Name */}
            {guestName && (
              <div className="flex items-start gap-2 text-xs lg:text-sm">
                <span className="text-sm lg:text-base">👤</span>
                <span className="truncate">{guestName}</span>
              </div>
            )}

            {/* Booking Dates */}
            {checkIn && checkOut && (
              <div className="flex items-start gap-2 text-xs lg:text-sm">
                <span className="text-sm lg:text-base">📅</span>
                <span>{checkIn} - {checkOut}</span>
              </div>
            )}

            {/* Guest Count */}
            {numberOfGuests && (
              <div className="flex items-start gap-2 text-xs lg:text-sm">
                <span className="text-sm lg:text-base">👥</span>
                <span>{numberOfGuests} {numberOfGuests === 1 ? 'Gast' : 'Gäste'}</span>
              </div>
            )}

            {/* Delivery Date */}
            {order.delivery_date && (
              <div className="flex items-start gap-2 text-xs lg:text-sm">
                <span className="text-sm lg:text-base">🚚</span>
                <span>{new Date(order.delivery_date).toLocaleDateString('de-DE')}</span>
              </div>
            )}

            {/* Linen Color - nur anzeigen wenn Schlafbereich-Items vorhanden */}
            {order.linen_color && order.items && Object.keys(order.items).some(key => 
              SCHLAFBEREICH_DEFAULT_ITEMS.includes(key) && order.items[key] > 0
            ) && (
              <div className="flex items-start gap-2 text-xs lg:text-sm">
                <span className="text-sm lg:text-base">🎨</span>
                <span>{getLinenColorLabel(order.linen_color as LinenColor)}</span>
              </div>
            )}

            {/* Pickup Date - only if exists */}
            {order.pickup_date && (
              <div className="flex items-start gap-2 text-xs lg:text-sm">
                <span className="text-sm lg:text-base">📤</span>
                <span>{new Date(order.pickup_date).toLocaleDateString('de-DE')}</span>
              </div>
            )}
          </div>

          {/* Right Column: Items & Notes */}
          <div className="space-y-2">
            {/* Items List - Collapsible */}
            {order.items && (
              <Collapsible open={isItemsOpen} onOpenChange={setIsItemsOpen}>
                <CollapsibleTrigger
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-2 w-full hover:bg-muted/50 rounded p-1 -ml-1 transition-colors"
                >
                  <ChevronDown 
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform duration-200",
                      isItemsOpen && "rotate-180"
                    )} 
                  />
                  <span className="text-xs text-muted-foreground font-medium">
                    Artikel ({getTotalItems()})
                  </span>
                </CollapsibleTrigger>
                
                <CollapsibleContent className="mt-1">
                  {/* Desktop: Table View */}
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

                  {/* Mobile: Compact List View */}
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
                        
                        // Get short color label for mobile
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

            {/* Notes */}
            {order.notes && (
              <div>
                <p className="text-xs text-muted-foreground">Notizen:</p>
                <p className="text-xs line-clamp-2">{order.notes}</p>
              </div>
            )}
          </div>
        </div>


        {/* Action Buttons - Top Right */}
        {!isPending && (onEdit || onDelete || onSync || (onConfirm && order.status === 'offen')) && (
          <div className="absolute top-2 right-2 flex gap-1 z-10">
            {/* Sync Button - nur für ausstehend status und noch nicht synchronisiert */}
            {onSync && externalSyncEnabled && !order.external_bestellnummer && order.status === 'ausstehend' && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3"
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
                <Link2 className="w-4 h-4 mr-1" />
                {isSyncing ? 'Sync...' : 'An Portal'}
              </Button>
            )}

            {/* Reset Sync Button - nur wenn bereits synchronisiert */}
            {onResetSync && order.external_bestellnummer && externalSyncEnabled && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-100"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await onResetSync(order);
                        } catch (error) {
                          console.error('Error in onResetSync:', error);
                        }
                      }}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Sync zurücksetzen (Test)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {/* Confirm Button - nur bei Status 'offen' */}
            {onConfirm && order.status === 'offen' && (
              <Button
                size="sm"
                className="h-8 px-3 bg-green-600 hover:bg-green-700 text-white"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await onConfirm(order);
                  } catch (error) {
                    console.error('Error in onConfirm:', error);
                  }
                }}
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                Bestätigen
              </Button>
            )}

            {/* Edit Button */}
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await onEdit(order);
                  } catch (error) {
                    console.error('Error in onEdit:', error);
                  }
                }}
              >
                <Edit className="w-4 h-4" />
              </Button>
            )}

            {/* Delete Button */}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
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
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}

        {/* Status Badge - Bottom Right */}
        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          {/* External Sync Badge */}
          {order.external_bestellnummer && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  {externalStatus ? (
                    (() => {
                      const info = getExternalStatusBadgeInfo(externalStatus.status);
                      return (
                        <Badge variant={info.variant} className={cn('gap-1', info.className)}>
                          <Link2 className="h-3 w-3" />
                          {info.label}
                        </Badge>
                      );
                    })()
                  ) : (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 gap-1">
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
          )}
          
          {/* Status Changed Info */}
          {order.status_changed_by && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs text-muted-foreground">
                    ({order.status_changed_by})
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Status geändert von: {order.status_changed_by}</p>
                  {order.status_changed_at && (
                    <p className="text-xs text-muted-foreground">
                      am {new Date(order.status_changed_at).toLocaleString('de-DE')}
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {getStatusBadge(order.status, isPending)}
        </div>
      </CardContent>
    </Card>
  );
};

export default LaundryOrderCard;