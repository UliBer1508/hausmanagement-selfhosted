import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Edit, RefreshCw, Trash2, Users, MapPin, TrendingUp, KeyRound, ChevronDown, Calculator } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import EditHouseDialog from './EditHouseDialog';
import HouseCardHeader, { HEADER_GRADIENTS } from './HouseCardHeader';
import HouseIssuesCard from './HouseIssuesCard';
import { openEmail } from '@/lib/mailtoHelper';
import { infoNumber } from '@/lib/propertyIssues';
import type { PropertyStatus } from '@/hooks/usePropertyStatus';
import CompetitorAnalysisDashboard from './CompetitorAnalysis/CompetitorAnalysisDashboard';
import RentalPriceCheck from './RentalPriceCheck';
import RentalCalculationDialog from '@/components/Tenants/RentalCalculationDialog';
import { useRentalMarket } from '@/hooks/useRentalMarket';
import { possibleColdRent } from '@/lib/marketSearch';

/**
 * Ein Objekt im Häuser-Tab als Reihe aus drei Karten (Umbau 22.11.2026,
 * Aufbau wie die Übersichtskarten Buchung/Reinigung/Wäsche):
 *   1. Objekt      — Stammdaten, Ausstattung (Inventar seit 23.11.2026 nur im Haus-Dialog)
 *   2. Mietvertrag — bei Festvermietung mit Mieter (gültige Miete inkl. Mietänderungen)
 *      Vermietung  — bei Festvermietung OHNE Mieter: Zielmiete (Kalkulation),
 *                    Mietpreis Region einklappbar (rental_price_analysis), Mietanfragen
 *      Belegung    — bei touristischen Häusern (aktueller Gast, nächste Anreise)
 *   3. Issues und To-dos — `HouseIssuesCard` aus `lib/propertyIssues.ts`
 *
 * Preis-Werkzeug je Vermietungsart (23.11.2026, lib/marketSearch.ts):
 *   touristisch → CompetitorAnalysisDashboard (Nachtpreise, Booking/Airbnb, PriceLabs)
 *   Festvermietung → RentalPriceCheck (Kaltmiete je m², Immobilienportale je Land)
 */

interface HouseCardProps {
  house: any;
  /** Wird seit 23.11.2026 auf der Karte nicht mehr angezeigt (Inventar im Haus-Dialog) */
  inventoryCount?: {
    total: number;
    categories: Record<string, number>;
  };
  /** Status aus usePropertyStatus — undefined, solange er lädt */
  status?: PropertyStatus;
}

const PROPERTY_TYPE_LABEL: Record<string, { icon: string; label: string }> = {
  house: { icon: '🏠', label: 'Haus' },
  apartment: { icon: '🏢', label: 'Wohnung' },
  studio: { icon: '🛏️', label: 'Studio' },
  other: { icon: '🏗️', label: 'Objekt' },
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  bank_transfer: 'Überweisung',
  cash: 'Bar',
  direct_debit: 'Lastschrift',
};

const eur = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);

// 'yyyy-MM-dd' als lokalen Tag lesen (nicht UTC-Mitternacht)
const fmtLong = (d?: string | null) => {
  if (!d) return null;
  try { return format(parseISO(d), 'd. MMMM yyyy', { locale: de }); } catch { return d; }
};
const fmtShort = (d: string) => format(parseISO(d), 'dd.MM.yy', { locale: de });

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex justify-between gap-3">
    <span className="text-muted-foreground shrink-0">{label}</span>
    <span className="font-medium text-right min-w-0 break-words">{children}</span>
  </div>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">{children}</div>
);

const HouseCard = ({ house, status }: HouseCardProps) => {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [showPriceAnalysis, setShowPriceAnalysis] = useState(false);
  const [showCalculation, setShowCalculation] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const navigate = useNavigate();

  const isLongTerm = house.rental_type === 'long_term';
  const type = PROPERTY_TYPE_LABEL[house.property_type] ?? PROPERTY_TYPE_LABEL.house;
  const name = (house.name ?? '').trim();
  const info = house.tenant_info ?? null;
  const hasTenant = !!info?.tenant_name?.trim();

  // Beträge: gültig heute (Mietänderungen berücksichtigt), sonst tenant_info.
  // Zahlen immer als Zahl prüfen — `{0 && …}` würde React eine „0" malen.
  const rent = status ? status.activeRent : infoNumber(info?.monthly_rent);
  const additional = status ? status.activeAdditionalCosts : infoNumber(info?.additional_costs);
  const deposit = infoNumber(info?.deposit_amount);
  const paymentDay = infoNumber(info?.payment_day);
  const figures = status?.figures;
  const livingArea = infoNumber(house.living_area_sqm);

  // Leerstand Festvermietung: Zielmiete + Marktmiete (nur dann laden)
  const isVacantLongTerm = isLongTerm && !hasTenant;
  const { data: market } = useRentalMarket(house.id, isVacantLongTerm);
  const calc = market?.calculation ?? null;
  const analysis = market?.analysis ?? null;
  const possibleRent = possibleColdRent(livingArea, analysis?.price_per_sqm);
  // Gleicher Text wie im Issue „Leer stehend" (eine Quelle: lib/propertyIssues.ts)
  const inquiryText = status?.issues?.find(i => i.key === 'vacant')?.detail;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
        {/* ── 1. Objekt ─────────────────────────────────────────────── */}
        <Card className="border-l-4 border-l-slate-500 overflow-hidden flex flex-col h-full">
          <HouseCardHeader
            icon={type.icon}
            kicker={`${type.label} · ${isLongTerm ? 'Festvermietung' : 'Touristisch'}`}
            title={name}
            gradient={HEADER_GRADIENTS.object}
            actions={
              <div className="flex items-center shrink-0">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white hover:bg-white/20 hover:text-white" aria-label="Bearbeiten" onClick={() => setIsEditDialogOpen(true)}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white hover:bg-white/20 hover:text-white" aria-label="Aktualisieren">
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white hover:bg-white/20 hover:text-white" aria-label="Löschen">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            }
          />
          {house.image_url && (
            <div className="h-36 overflow-hidden">
              <img src={house.image_url} alt={name} className="w-full h-full object-cover" />
            </div>
          )}
          <CardContent className="p-3 space-y-3 text-sm flex-1">
            {/* Name und Adresse (Adresse kann Zeilenumbrüche enthalten) */}
            <div>
              <div className="text-base font-bold leading-tight">{name}</div>
              {house.address && (
                <div className="flex items-start text-muted-foreground mt-1">
                  <MapPin className="w-4 h-4 mr-1 mt-0.5 shrink-0" />
                  <span className="whitespace-pre-line">{house.address}</span>
                </div>
              )}
            </div>

            {/* Eckdaten */}
            <div className="space-y-1">
              <SectionLabel>Eckdaten</SectionLabel>
              <Row label="Art">{type.label} · {isLongTerm ? 'Festvermietung' : 'Touristisch'}</Row>
              {livingArea > 0 ? (
                <Row label="Wohnfläche">{house.living_area_sqm} m²</Row>
              ) : isLongTerm && (
                <Row label="Wohnfläche">
                  <button type="button" onClick={() => setIsEditDialogOpen(true)} className="font-semibold text-amber-700 hover:underline">
                    fehlt – eintragen
                  </button>
                </Row>
              )}
              {infoNumber(house.bedrooms) > 0 && <Row label="Schlafzimmer">{house.bedrooms}</Row>}
              {infoNumber(house.bathrooms) > 0 && <Row label="Badezimmer">{house.bathrooms}</Row>}
              {!isLongTerm && infoNumber(house.max_guests) > 0 && (
                <Row label="Max. Gäste"><span className="inline-flex items-center"><Users className="w-3.5 h-3.5 mr-1" />{house.max_guests}</span></Row>
              )}
            </div>

            {/* Kennzahlen laufendes Jahr (lib/propertyFigures.ts) */}
            {figures && (
              <div className="space-y-1">
                <SectionLabel>Kennzahlen {figures.year}</SectionLabel>
                {isLongTerm && hasTenant && (
                  <>
                    <Row label={`Mieteinnahmen ${figures.year}`}>{eur(figures.rentReceivedYear)}</Row>
                    {figures.rentTargetYear > 0 && <Row label="Jahresmiete (warm, Soll)">{eur(figures.rentTargetYear)}</Row>}
                    {figures.coldRentPerSqm > 0 && <Row label="Kaltmiete je m²">{eur(figures.coldRentPerSqm)}</Row>}
                    {figures.tenantYears !== null && (
                      <Row label="Mietdauer">{figures.tenantYears} {figures.tenantYears === 1 ? 'Jahr' : 'Jahre'}</Row>
                    )}
                  </>
                )}
                {figures.bookingsYear > 0 && (
                  <>
                    <Row label={`Auszahlungen Buchungen ${figures.year}`}>{eur(figures.payoutYear)}</Row>
                    <Row label="Buchungen · Nächte">{figures.bookingsYear} · {figures.nightsYear}</Row>
                    <Row label="Belegung (gebucht)">{figures.occupancyYear} %</Row>
                  </>
                )}
                {!(isLongTerm && hasTenant) && figures.bookingsYear === 0 && (
                  <p className="text-muted-foreground">Keine Einnahmen in {figures.year}</p>
                )}
              </div>
            )}

            {house.amenities && Object.values(house.amenities).some(v => v) && (
              <div className="flex flex-wrap gap-1.5">
                {house.amenities.sauna && <Badge variant="secondary" className="text-xs">🧖 Sauna</Badge>}
                {house.amenities.terrace && <Badge variant="secondary" className="text-xs">☀️ Terrasse</Badge>}
                {house.amenities.ski_cellar && <Badge variant="secondary" className="text-xs">⛷️ Skikeller</Badge>}
                {house.amenities.glacier_view && <Badge variant="secondary" className="text-xs">🏔️ Gletscherblick</Badge>}
                {house.amenities.garage_spaces > 0 && <Badge variant="secondary" className="text-xs">🚗 Garage ({house.amenities.garage_spaces})</Badge>}
                {house.amenities.additional_toilet && <Badge variant="secondary" className="text-xs">🚻 Zusätzliche Toilette</Badge>}
              </div>
            )}

          </CardContent>
        </Card>

        {/* ── 2. Mietvertrag (Festvermietung) bzw. Belegung (touristisch) ── */}
        {isLongTerm ? (
          <Card className="border-l-4 border-l-indigo-500 bg-indigo-50/40 overflow-hidden flex flex-col h-full">
            <HouseCardHeader
              icon="🔑"
              kicker={`Miete · ${name}`}
              title={hasTenant ? 'Mietvertrag' : 'Vermietung'}
              gradient={HEADER_GRADIENTS.rent}
              pill={hasTenant ? (info?.contract_end ? `bis ${fmtShort(info.contract_end)}` : 'Unbefristet') : 'Leer'}
              pillColor="#4f46e5"
            />
            <CardContent className="p-3 space-y-3 text-sm flex-1">
              {hasTenant ? (
                <>
                  <div>
                    <SectionLabel>Mieter</SectionLabel>
                    <div className="text-base font-bold">{info.tenant_name}</div>
                    {info.tenant_email && (
                      <button
                        type="button"
                        onClick={() => openEmail({ to: info.tenant_email })}
                        className="block text-primary hover:underline text-left break-all"
                      >
                        {info.tenant_email}
                      </button>
                    )}
                    {info.tenant_phone && (
                      <a href={`tel:${info.tenant_phone}`} className="block text-primary hover:underline">{info.tenant_phone}</a>
                    )}
                  </div>
                  <div className="space-y-1">
                    <SectionLabel>Vertrag und Zahlung</SectionLabel>
                    {info.contract_start && <Row label="Beginn">{fmtLong(info.contract_start)}</Row>}
                    {/* Reihenfolge nach Uli-Vorgabe 22.11.2026: Warmmiete, NK, Kaltmiete, gültig seit */}
                    {rent + additional > 0 && (
                      <div className="flex justify-between gap-3 text-base">
                        <span className="font-semibold">Warmmiete</span>
                        <span className="font-bold">{eur(rent + additional)} / Monat</span>
                      </div>
                    )}
                    {additional > 0 && <Row label="NK-Vorauszahlung">{eur(additional)}</Row>}
                    {rent > 0 && <Row label="Kaltmiete">{eur(rent)}</Row>}
                    {status?.activeRentSince && rent > 0 && (
                      <Row label="Miete gültig seit">{fmtLong(status.activeRentSince)}</Row>
                    )}
                    {deposit > 0 && <Row label="Kaution">{eur(deposit)}</Row>}
                    {paymentDay > 0 && <Row label="Zahltag">{paymentDay}. des Monats</Row>}
                    {info.payment_method && <Row label="Zahlungsart">{PAYMENT_METHOD_LABEL[info.payment_method] ?? info.payment_method}</Row>}
                  </div>
                  {info.notes && (
                    <div>
                      <SectionLabel>Notizen</SectionLabel>
                      <p className="text-xs text-muted-foreground italic">{info.notes}</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  {/* Zielmiete aus der internen Kalkulation (lib/rentalCalc.ts) */}
                  <div>
                    <SectionLabel>Zielmiete</SectionLabel>
                    {calc ? (
                      <>
                        <div className="flex justify-between gap-3 text-base">
                          <span className="font-semibold">Warmmiete</span>
                          <span className="font-bold">{eur(calc.gesamtMonat)} / Monat</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          kalt {eur(calc.grundmieteMonat)} · NK {eur(calc.nebenkostenMonat)} · Kaution {eur(calc.kaution)}
                        </div>
                      </>
                    ) : (
                      <button type="button" onClick={() => setShowCalculation(true)} className="text-xs font-semibold text-amber-700 hover:underline">
                        Noch keine Kalkulation – anlegen
                      </button>
                    )}
                  </div>

                  {/* Mietpreis Region — wird nur einmal gebraucht, daher eingeklappt */}
                  <Collapsible open={marketOpen} onOpenChange={setMarketOpen} className="rounded-md border border-indigo-100 bg-white">
                    <CollapsibleTrigger className="w-full min-h-[40px] flex items-center justify-between gap-2 px-3 py-2 text-left">
                      <span className="min-w-0">
                        <span className="font-semibold">Mietpreis Region</span>
                        <span className="text-muted-foreground">
                          {analysis?.price_per_sqm
                            ? ` · ${eur(analysis.price_per_sqm)}/m²${possibleRent ? ` · möglich ${eur(possibleRent)}` : ''}`
                            : ' · noch nicht ermittelt'}
                        </span>
                      </span>
                      <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${marketOpen ? 'rotate-180' : ''}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-3 pb-3 space-y-1 border-t border-indigo-50">
                      <div className="pt-2" />
                      <Row label="Ø Kaltmiete je m²">{analysis?.price_per_sqm ? eur(analysis.price_per_sqm) : '–'}</Row>
                      <Row label="Wohnfläche">{livingArea > 0 ? `${livingArea} m²` : 'fehlt'}</Row>
                      <Row label="Möglich kalt">{possibleRent ? eur(possibleRent) : '–'}</Row>
                      {analysis && (
                        <Row label="Stand">{fmtShort(analysis.analysis_date.slice(0, 10))}{analysis.manual ? ' · manuell' : ''}</Row>
                      )}
                      <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => setShowPriceAnalysis(true)}>
                        <TrendingUp className="w-4 h-4 mr-2" />
                        Mietpreis ermitteln
                      </Button>
                    </CollapsibleContent>
                  </Collapsible>

                  <p className="text-muted-foreground">{inquiryText ?? 'Keine offene Mietanfrage'}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate('/', { state: { activeTab: 'Mieter', tenantSubTab: 'interessenten' } })}
                    >
                      <KeyRound className="w-4 h-4 mr-2" />
                      Interessenten
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowCalculation(true)}>
                      <Calculator className="w-4 h-4 mr-2" />
                      Kalkulation
                    </Button>
                  </div>
                </div>
              )}
              {/* Festvermietung → Mietpreis-Werkzeug (nicht die touristische Analyse). Leer: im Klappbereich oben */}
              {hasTenant && (
                <Button onClick={() => setShowPriceAnalysis(true)} variant="outline" size="sm" className="w-full">
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Mietpreis Region
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-l-4 border-l-amber-500 bg-yellow-50 overflow-hidden flex flex-col h-full">
            <HouseCardHeader
              icon="🗓️"
              kicker={`Vermietung · ${name}`}
              title="Belegung"
              gradient={HEADER_GRADIENTS.occupancy}
              pill={status ? (status.currentBooking ? 'Belegt' : 'Frei') : undefined}
              pillColor="#d97706"
            />
            <CardContent className="p-3 space-y-3 text-sm flex-1 flex flex-col">
              <div>
                <SectionLabel>Im Haus</SectionLabel>
                {status?.currentBooking ? (
                  <div>
                    <span className="font-bold">{status.currentBooking.guestName}</span>
                    <span className="text-muted-foreground"> · bis {fmtShort(status.currentBooking.check_out)}</span>
                  </div>
                ) : (
                  <div className="text-muted-foreground">{status ? 'Niemand' : '…'}</div>
                )}
              </div>
              <div>
                <SectionLabel>Nächste Anreise</SectionLabel>
                {status?.nextBooking ? (
                  <div>
                    <span className="font-bold">{status.nextBooking.guestName}</span>
                    <span className="text-muted-foreground">
                      {' '}· {fmtShort(status.nextBooking.check_in)} – {fmtShort(status.nextBooking.check_out)}
                    </span>
                  </div>
                ) : (
                  <div className="text-muted-foreground">{status ? 'Keine Buchung' : '…'}</div>
                )}
              </div>
              <Button onClick={() => setShowPriceAnalysis(true)} variant="outline" size="sm" className="w-full mt-auto">
                <TrendingUp className="w-4 h-4 mr-2" />
                Preisanalyse
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── 3. Issues und To-dos ──────────────────────────────────── */}
        <div className="md:col-span-2 xl:col-span-1">
          <HouseIssuesCard
            objectLabel={name}
            issues={status?.issues}
            level={status?.level}
            isLongTerm={isLongTerm}
          />
        </div>
      </div>

      <EditHouseDialog
        house={house}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
      />

      <Dialog open={showPriceAnalysis} onOpenChange={setShowPriceAnalysis}>
        {isLongTerm ? (
          <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-auto">
            <RentalPriceCheck houseId={house.id} houseName={name} livingAreaSqm={livingArea > 0 ? livingArea : null} />
          </DialogContent>
        ) : (
          <DialogContent className="max-w-[95vw] h-[90vh] overflow-auto">
            <CompetitorAnalysisDashboard
              house_id={house.id}
              house_name={house.name}
              rental_type={house.rental_type}
            />
          </DialogContent>
        )}
      </Dialog>

      {isLongTerm && (
        <RentalCalculationDialog
          open={showCalculation}
          onOpenChange={setShowCalculation}
          houseId={house.id}
          houseName={name}
        />
      )}
    </>
  );
};

export default HouseCard;
