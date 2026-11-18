import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  KOSTENPOSTEN, BetragFeld, RentalCalculation, berechnen, euro, leereKalkulation, normalisieren,
} from "@/lib/rentalCalc";

interface RentalCalculationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  houseId: string | null;
  houseName: string;
}

const GRUPPEN: { key: "fix" | "energie" | "betrieb"; titel: string }[] = [
  { key: "fix", titel: "Fixkosten" },
  { key: "energie", titel: "Energie" },
  { key: "betrieb", titel: "Rücklagen und Betrieb" },
];

/**
 * Interne Kalkulation „Wohnen auf Zeit“ je Haus (public.rental_calculations, SQL 72).
 * Zum Vergleich: Betriebskosten des letzten erfassten Jahres (utility_costs) und die
 * letzte Marktmieten-Analyse (rental_price_analysis) des Hauses.
 * Nur Admins können die Tabelle lesen (RLS). Ergebnis = Vorschlag für das Angebot.
 */
const RentalCalculationDialog = ({ open, onOpenChange, houseId, houseName }: RentalCalculationDialogProps) => {
  const queryClient = useQueryClient();
  const [k, setK] = useState<RentalCalculation>(leereKalkulation(houseId ?? ""));
  const [laedt, setLaedt] = useState(false);
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    if (!open || !houseId) return;
    setLaedt(true);
    (supabase as any).from("rental_calculations").select("*").eq("house_id", houseId).maybeSingle()
      .then(({ data, error }: { data: any; error: any }) => {
        if (error) toast({ title: "Konnte nicht geladen werden", description: error.message, variant: "destructive" });
        setK(normalisieren(data, houseId));
        setLaedt(false);
      });
  }, [open, houseId]);

  const e = useMemo(() => berechnen(k), [k]);

  // Vergleich: echte Betriebskosten (letztes erfasstes Jahr) und Marktmiete
  const [vergleich, setVergleich] = useState<{ nkJahr: number | null; nkSumme: number; markt: any | null }>({
    nkJahr: null, nkSumme: 0, markt: null,
  });
  useEffect(() => {
    if (!open || !houseId) return;
    Promise.all([
      supabase.from("utility_costs").select("year, total_amount").eq("house_id", houseId),
      supabase.from("rental_price_analysis").select("avg_rent, min_rent, max_rent, price_per_sqm, analysis_date, comparable_count")
        .eq("house_id", houseId).order("analysis_date", { ascending: false }).limit(1),
    ]).then(([nk, m]) => {
      const zeilen = (nk.data || []) as { year: number; total_amount: number }[];
      const jahr = zeilen.length ? Math.max(...zeilen.map(z => z.year)) : null;
      const summe = jahr ? zeilen.filter(z => z.year === jahr).reduce((s, z) => s + Number(z.total_amount || 0), 0) : 0;
      setVergleich({ nkJahr: jahr, nkSumme: summe, markt: m.data?.[0] ?? null });
    });
  }, [open, houseId]);

  const zahl = (v: string) => {
    const z = parseFloat(v.replace(",", "."));
    return Number.isFinite(z) ? z : 0;
  };
  const setze = <F extends keyof RentalCalculation>(f: F, v: RentalCalculation[F]) => setK(alt => ({ ...alt, [f]: v }));

  const speichern = async () => {
    if (!houseId) return;
    setSpeichert(true);
    const { house_id, ...rest } = k;
    const { data: gespeichert, error } = await (supabase as any).from("rental_calculations").upsert({
      house_id,
      ...rest,
      extra_costs: k.extra_costs.filter(x => x.name.trim() || x.amount).map(x => ({ ...x, name: x.name.trim() })),
      note: k.note?.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "house_id" }).select("house_id");
    setSpeichert(false);
    if (!error && (!gespeichert || gespeichert.length === 0)) {
      toast({ title: "Nicht gespeichert", description: "Keine Zeile geändert (Rechte?).", variant: "destructive" });
      return;
    }
    if (error) {
      console.error("[Kalkulation] speichern", error);
      toast({ title: "Konnte nicht gespeichert werden", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["rental-calculation", houseId] });
    toast({ title: "Kalkulation gespeichert", description: `Vorschlag: ${euro(e.gesamtMonat)} pro Monat` });
    onOpenChange(false);
  };

  const betragFeld = (feld: BetragFeld, label: string, nebenkosten: boolean) => (
    <div key={feld} className="space-y-1">
      <Label htmlFor={`kalk-${feld}`} className="text-xs">
        {label}{nebenkosten && <span className="text-muted-foreground"> · NK</span>}
      </Label>
      <Input id={`kalk-${feld}`} type="number" step="any" min={0} value={k[feld] || ""} placeholder="0"
        onChange={ev => setze(feld, zahl(ev.target.value))} />
    </div>
  );

  const zeile = (label: string, wert: string, stark = false) => (
    <div className={`flex justify-between gap-3 text-sm ${stark ? "font-semibold" : ""}`}>
      <span className={stark ? "" : "text-muted-foreground"}>{label}</span>
      <span>{wert}</span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kalkulation Wohnen auf Zeit — {houseName}</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" />
            Nur für dich. Alle Beträge in Euro pro Jahr. „NK“ = zählt zu den Nebenkosten.
          </DialogDescription>
        </DialogHeader>

        {laedt ? (
          <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Wird geladen…</span>
          </div>
        ) : (
          <div className="grid lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 space-y-5">
              {GRUPPEN.map(g => (
                <section key={g.key}>
                  <h3 className="font-semibold mb-2">{g.titel}</h3>
                  <div className="grid sm:grid-cols-3 gap-3">
                    {KOSTENPOSTEN.filter(p => p.gruppe === g.key).map(p => betragFeld(p.feld, p.label, p.nebenkosten))}
                  </div>
                </section>
              ))}

              <section>
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="font-semibold">Weitere Posten</h3>
                  <Button variant="outline" size="sm"
                    onClick={() => setze("extra_costs", [...k.extra_costs, { name: "", amount: 0, utility: false }])}>
                    <Plus className="h-4 w-4 mr-1" />Hinzufügen
                  </Button>
                </div>
                <div className="space-y-2">
                  {k.extra_costs.map((x, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <Input className="flex-[2] min-w-[10rem]" value={x.name} placeholder="z. B. Rundfunk, Schneeräumung"
                        aria-label="Bezeichnung"
                        onChange={ev => setze("extra_costs", k.extra_costs.map((y, j) => j === i ? { ...y, name: ev.target.value } : y))} />
                      <Input className="w-28" type="number" step="any" min={0} value={x.amount || ""} placeholder="€/Jahr" aria-label="Betrag pro Jahr"
                        onChange={ev => setze("extra_costs", k.extra_costs.map((y, j) => j === i ? { ...y, amount: zahl(ev.target.value) } : y))} />
                      <label className="flex items-center gap-1.5 text-xs">
                        <Checkbox checked={x.utility}
                          onCheckedChange={v => setze("extra_costs", k.extra_costs.map((y, j) => j === i ? { ...y, utility: v === true } : y))} />
                        NK
                      </label>
                      <Button variant="ghost" size="icon" aria-label="Entfernen"
                        onClick={() => setze("extra_costs", k.extra_costs.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="font-semibold mb-2">Annahmen</h3>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="kalk-leer" className="text-xs">Leerstand (Monate pro Jahr)</Label>
                    <Input id="kalk-leer" type="number" step="any" min={0} value={k.vacancy_months}
                      onChange={ev => setze("vacancy_months", Math.min(11.5, Math.max(0, zahl(ev.target.value))))} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="kalk-gewinn" className="text-xs">Gewinnziel (€ pro Jahr)</Label>
                    <Input id="kalk-gewinn" type="number" step="any" min={0} value={k.profit_target || ""} placeholder="0"
                      onChange={ev => setze("profit_target", zahl(ev.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="kalk-kaution" className="text-xs">Kaution (Monatsmieten, max. 3)</Label>
                    <Input id="kalk-kaution" type="number" step="any" min={0} value={k.deposit_months}
                      onChange={ev => setze("deposit_months", Math.min(3, Math.max(0, zahl(ev.target.value))))} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="kalk-endreinigung" className="text-xs">Endreinigung (€ einmalig)</Label>
                    <Input id="kalk-endreinigung" type="number" step="any" min={0} value={k.final_cleaning_fee || ""} placeholder="0"
                      onChange={ev => setze("final_cleaning_fee", zahl(ev.target.value))} />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">Nebenkosten</Label>
                    <Select value={k.utilities_mode} onValueChange={v => setze("utilities_mode", v as "flat" | "advance")}>
                      <SelectTrigger aria-label="Nebenkosten"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="flat">Pauschale (abgegolten, keine Abrechnung)</SelectItem>
                        <SelectItem value="advance">Vorauszahlung (mit Abrechnung)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1 mt-3">
                  <Label htmlFor="kalk-notiz" className="text-xs">Notiz</Label>
                  <Textarea id="kalk-notiz" rows={2} value={k.note ?? ""} onChange={ev => setze("note", ev.target.value)} />
                </div>
              </section>
            </div>

            {/* Ergebnis */}
            <aside className="lg:col-span-2">
              <div className="rounded-xl border bg-muted/40 p-4 space-y-2 lg:sticky lg:top-0">
                <h3 className="font-semibold mb-1">Ergebnis</h3>
                {zeile("Fixkosten", euro(e.fix))}
                {zeile("Energie", euro(e.energie))}
                {zeile("Rücklagen und Betrieb", euro(e.betrieb))}
                {e.zusatz > 0 && zeile("Weitere Posten", euro(e.zusatz))}
                {zeile("Kosten pro Jahr", euro(e.kostenJahr), true)}
                {zeile("davon Nebenkosten", euro(e.nebenkostenJahr))}
                {zeile("Gewinnziel", euro(k.profit_target))}
                {zeile("Vermietete Monate", String(e.vermieteteMonate).replace(".", ","))}
                <div className="border-t my-2" />
                {zeile("Kostendeckend pro Monat", euro(e.kostendeckend))}
                <div className="rounded-lg bg-background border p-3 space-y-1.5 mt-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-primary">Vorschlag für das Angebot</div>
                  {zeile("Grundmiete / Monat", euro(e.grundmieteMonat))}
                  {zeile(k.utilities_mode === "flat" ? "Nebenkostenpauschale / Monat" : "NK-Vorauszahlung / Monat", euro(e.nebenkostenMonat))}
                  {zeile("Gesamt / Monat", euro(e.gesamtMonat), true)}
                  {zeile("Kaution", euro(e.kaution))}
                  {zeile("Endreinigung", euro(k.final_cleaning_fee))}
                </div>
                {zeile("Ertrag pro Jahr (nach Kosten)", euro(e.ertragJahr))}
                <div className="rounded-lg border p-3 space-y-1 text-xs">
                  <div className="font-semibold">Zum Vergleich</div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">
                      Betriebskosten {vergleich.nkJahr ? `(${vergleich.nkJahr}, NK-Abrechnung)` : ""}
                    </span>
                    <span>{vergleich.nkJahr ? `${euro(vergleich.nkSumme)} / Jahr` : "noch nicht erfasst"}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Marktmiete (letzte Analyse)</span>
                    <span>
                      {vergleich.markt
                        ? `Ø ${euro(Number(vergleich.markt.avg_rent))} (${euro(Number(vergleich.markt.min_rent))}–${euro(Number(vergleich.markt.max_rent))})`
                        : "keine Analyse"}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
                  Gerundet: Grundmiete und Kaution auf 10 €, Nebenkosten auf 5 €. Im Angebot kannst du jeden Wert ändern.
                </p>
              </div>
            </aside>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={speichern} disabled={speichert || laedt}>{speichert ? "Speichert…" : "Speichern"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RentalCalculationDialog;
