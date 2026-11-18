import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { Loader2, Copy, Mail, Send, Undo2, Calculator, ExternalLink, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { berechnen, euro, normalisieren } from "@/lib/rentalCalc";
import { OFFER_STATUS_LABEL, rentalOfferLink, RentalInquiry, RentalOffer } from "@/hooks/useRentalInquiries";
import RentalApplicationPanel from "./RentalApplicationPanel";
import RentalTenantTakeoverDialog from "./RentalTenantTakeoverDialog";

/** Vorlage Konditionen — wird beim ersten Angebot eingesetzt und ist frei änderbar. */
const VORLAGE_DE = [
  "Möblierte Vermietung auf Zeit.",
  "Die Kaution ist vor dem Einzug zu überweisen und wird nach Rückgabe abzüglich offener Beträge erstattet.",
  "Die Miete ist monatlich im Voraus fällig.",
  "Anmeldung bei der Gemeinde nach dem Einzug innerhalb der gesetzlichen Frist.",
  "Übergabe und Rückgabe mit Protokoll.",
  "Der Mietvertrag kommt erst mit Unterschrift beider Seiten zustande.",
].join("\n");

const VORLAGE_EN = [
  "Furnished long-term rental.",
  "The deposit is due before moving in and will be refunded after handover, less any outstanding amounts.",
  "Rent is payable monthly in advance.",
  "Registration with the municipality after moving in, within the legal deadline.",
  "Handover and return with a written report.",
  "The lease only becomes binding once signed by both parties.",
].join("\n");

interface Werte {
  rent_month: string; utilities_month: string; utilities_mode: "flat" | "advance";
  deposit: string; final_cleaning_fee: string; move_in: string; duration_months: string;
  valid_until: string; conditions_de: string; conditions_en: string; language: "de" | "en";
}

interface RentalOfferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inquiry: RentalInquiry | null;
  houseName: string;
}

const zahl = (v: string) => {
  const z = parseFloat(v.replace(",", "."));
  return Number.isFinite(z) ? z : NaN;
};

/**
 * Persönliches Angebot zu einer Mietanfrage (public.rental_offers, SQL 72).
 * Die Angebotsseite für den Kunden liegt auf der Website (steinbockchalets.com/angebot/<token>)
 * und liest über die Funktion get_rental_offer.
 * Ablauf: Entwurf speichern → nach der Besichtigung „Freigeben“ → Link an den Kunden.
 * Erst mit der Freigabe kann der Kunde das Angebot über den Link sehen.
 */
const RentalOfferDialog = ({ open, onOpenChange, inquiry, houseName }: RentalOfferDialogProps) => {
  const queryClient = useQueryClient();
  const [angebot, setAngebot] = useState<RentalOffer | null>(null);
  const [w, setW] = useState<Werte | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [uebernahmeOffen, setUebernahmeOffen] = useState(false);

  useEffect(() => {
    if (!open || !inquiry) return;
    setLaedt(true);
    Promise.all([
      (supabase as any).from("rental_offers").select("*").eq("inquiry_id", inquiry.id)
        .order("created_at", { ascending: false }).limit(1),
      (supabase as any).from("rental_calculations").select("*").eq("house_id", inquiry.house_id).maybeSingle(),
    ]).then(([o, c]: { data: any; error: any }[]) => {
      const error = o.error || c.error;
      if (error) toast({ title: "Konnte nicht geladen werden", description: error.message, variant: "destructive" });
      const vorhanden = (o.data?.[0] ?? null) as RentalOffer | null;
      setAngebot(vorhanden);
      if (vorhanden) {
        setW({
          rent_month: String(vorhanden.rent_month), utilities_month: String(vorhanden.utilities_month),
          utilities_mode: vorhanden.utilities_mode, deposit: String(vorhanden.deposit),
          final_cleaning_fee: String(vorhanden.final_cleaning_fee), move_in: vorhanden.move_in,
          duration_months: vorhanden.duration_months ? String(vorhanden.duration_months) : "",
          valid_until: vorhanden.valid_until, conditions_de: vorhanden.conditions_de ?? "",
          conditions_en: vorhanden.conditions_en ?? "", language: vorhanden.language,
        });
      } else {
        const k = normalisieren(c.data, inquiry.house_id);
        const e = berechnen(k);
        setW({
          rent_month: e.grundmieteMonat ? String(e.grundmieteMonat) : "",
          utilities_month: String(e.nebenkostenMonat), utilities_mode: k.utilities_mode,
          deposit: String(e.kaution), final_cleaning_fee: String(k.final_cleaning_fee),
          move_in: inquiry.move_in,
          duration_months: inquiry.duration_months ? String(inquiry.duration_months) : "",
          valid_until: format(addDays(new Date(), 14), "yyyy-MM-dd"),
          conditions_de: VORLAGE_DE, conditions_en: VORLAGE_EN,
          language: inquiry.language === "en" ? "en" : "de",
        });
      }
      setLaedt(false);
    });
  }, [open, inquiry]);

  const gesamt = useMemo(() => {
    if (!w) return 0;
    return (zahl(w.rent_month) || 0) + (zahl(w.utilities_month) || 0);
  }, [w]);

  if (!inquiry) return null;

  const setze = <K extends keyof Werte>(k: K, v: Werte[K]) => setW(alt => (alt ? { ...alt, [k]: v } : alt));
  const gesperrt = angebot?.status === "accepted";

  const speichern = async (neuerStatus?: RentalOffer["status"]) => {
    if (!w) return;
    const miete = zahl(w.rent_month);
    if (!Number.isFinite(miete) || miete <= 0) {
      toast({ title: "Grundmiete fehlt", description: "Bitte eine Grundmiete pro Monat eintragen.", variant: "destructive" });
      return;
    }
    if (!w.move_in || !w.valid_until) {
      toast({ title: "Datum fehlt", description: "Einzug und „gültig bis“ sind Pflicht.", variant: "destructive" });
      return;
    }
    setSpeichert(true);
    const daten: Record<string, unknown> = {
      inquiry_id: inquiry.id,
      house_id: inquiry.house_id,
      guest_name: inquiry.guest_name,
      guest_email: inquiry.guest_email,
      language: w.language,
      rent_month: miete,
      utilities_month: zahl(w.utilities_month) || 0,
      utilities_mode: w.utilities_mode,
      deposit: zahl(w.deposit) || 0,
      final_cleaning_fee: zahl(w.final_cleaning_fee) || 0,
      move_in: w.move_in,
      duration_months: w.duration_months ? parseInt(w.duration_months) : null,
      conditions_de: w.conditions_de.trim() || null,
      conditions_en: w.conditions_en.trim() || null,
      valid_until: w.valid_until,
      updated_at: new Date().toISOString(),
    };
    if (neuerStatus) {
      daten.status = neuerStatus;
      if (neuerStatus === "released") daten.released_at = new Date().toISOString();
    }

    const anfrage = angebot
      ? (supabase as any).from("rental_offers").update(daten).eq("id", angebot.id).select("*").single()
      : (supabase as any).from("rental_offers").insert(daten).select("*").single();
    const { data, error } = await anfrage;
    if (error) {
      console.error("[Angebot] speichern", error);
      setSpeichert(false);
      toast({ title: "Konnte nicht gespeichert werden", description: error.message, variant: "destructive" });
      return;
    }
    // Mit der Freigabe springt die Mietanfrage auf „Angebot“.
    if (neuerStatus === "released") {
      const { error: e2 } = await (supabase as any).from("rental_inquiries")
        .update({ status: "offer", seen_at: new Date().toISOString() }).eq("id", inquiry.id).select("id");
      if (e2) console.error("[Angebot] Anfrage-Status", e2);
    }
    setSpeichert(false);
    setAngebot(data as RentalOffer);
    ["rental-offers", "rental-inquiries"].forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));

    if (neuerStatus === "released") {
      const link = rentalOfferLink((data as RentalOffer).token, w.language);
      try { await navigator.clipboard.writeText(link); } catch { /* Link steht unten */ }
      toast({ title: "Angebot freigegeben", description: "Link ist kopiert und steht unten im Dialog." });
    } else if (neuerStatus === "withdrawn") {
      toast({ title: "Angebot zurückgezogen", description: "Der Link zeigt dem Kunden nichts mehr." });
    } else {
      toast({ title: "Gespeichert" });
    }
  };

  const link = angebot ? rentalOfferLink(angebot.token, angebot.language) : null;
  const freigegeben = angebot && ["released", "viewed", "accepted", "question"].includes(angebot.status);

  const mailLink = () => {
    if (!angebot || !link) return "#";
    const en = angebot.language === "en";
    const betreff = en ? `Your offer – ${houseName}` : `Ihr Angebot – ${houseName}`;
    const text = en
      ? `Dear ${angebot.guest_name},\n\nthank you for your visit. Here is your personal offer for ${houseName}:\n${link}\n\nThe offer is valid until ${format(parseISO(angebot.valid_until), "dd.MM.yyyy")}.\n\nBest regards\nSteinbock Chalets`
      : `Hallo ${angebot.guest_name},\n\nvielen Dank für die Besichtigung. Hier ist Ihr persönliches Angebot für ${houseName}:\n${link}\n\nDas Angebot gilt bis ${format(parseISO(angebot.valid_until), "dd.MM.yyyy")}.\n\nViele Grüße\nSteinbock Chalets`;
    return `mailto:${encodeURIComponent(angebot.guest_email ?? "")}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;
  };

  const feld = (k: keyof Werte, label: string, typ = "text", platzhalter = "") => (
    <div className="space-y-1">
      <Label htmlFor={`angebot-${k}`} className="text-xs">{label}</Label>
      <Input id={`angebot-${k}`} type={typ} step={typ === "number" ? "any" : undefined}
        min={typ === "number" ? 0 : undefined} value={(w?.[k] as string) ?? ""} placeholder={platzhalter}
        disabled={gesperrt} onChange={e => setze(k, e.target.value as any)} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Angebot — {inquiry.guest_name}</DialogTitle>
          <DialogDescription>
            {houseName} · Einzug gewünscht {format(parseISO(inquiry.move_in), "dd.MM.yyyy")} ·{" "}
            {inquiry.duration_months ? `${inquiry.duration_months} Monate` : "Dauer offen"}
            {angebot && <> · <strong>{OFFER_STATUS_LABEL[angebot.status]}</strong></>}
          </DialogDescription>
        </DialogHeader>

        {laedt || !w ? (
          <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Wird geladen…</span>
          </div>
        ) : (
          <div className="space-y-5">
            {!angebot && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground rounded-lg border bg-muted/40 p-2.5">
                <Calculator className="h-4 w-4 shrink-0" />
                Werte aus der Kalkulation des Hauses vorbelegt. Erst „Freigeben“ macht das Angebot für den Kunden sichtbar.
              </p>
            )}

            {angebot && <RentalApplicationPanel offerId={angebot.id} />}

            {angebot?.converted_at && (
              <p className="flex items-center gap-2 text-sm rounded-lg border border-primary bg-primary/5 p-2.5">
                <UserCheck className="h-4 w-4 text-primary" />
                Als Mieter übernommen am {format(parseISO(angebot.converted_at), "dd.MM.yyyy")} — weiter im Tab Mieter (Verträge, Zahlungen).
              </p>
            )}

            {angebot?.guest_message && (
              <div className="rounded-lg border border-primary bg-primary/5 p-3 text-sm">
                <div className="font-semibold mb-1">Nachricht des Kunden</div>
                <p className="whitespace-pre-line">{angebot.guest_message}</p>
              </div>
            )}

            <div className="grid sm:grid-cols-3 gap-3">
              {feld("rent_month", "Grundmiete / Monat (€)", "number")}
              {feld("utilities_month", "Nebenkosten / Monat (€)", "number")}
              <div className="space-y-1">
                <Label className="text-xs">Nebenkosten als</Label>
                <Select value={w.utilities_mode} disabled={gesperrt} onValueChange={v => setze("utilities_mode", v as "flat" | "advance")}>
                  <SelectTrigger aria-label="Nebenkosten als"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat">Pauschale</SelectItem>
                    <SelectItem value="advance">Vorauszahlung</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {feld("deposit", "Kaution (€)", "number")}
              {feld("final_cleaning_fee", "Endreinigung (€)", "number")}
              <div className="flex flex-col justify-end text-sm pb-2">
                <span className="text-muted-foreground text-xs">Gesamt pro Monat</span>
                <span className="font-semibold text-lg">{euro(gesamt)}</span>
              </div>
              {feld("move_in", "Einzug", "date")}
              {feld("duration_months", "Dauer (Monate)", "number", "leer = offen")}
              {feld("valid_until", "Angebot gültig bis", "date")}
              <div className="space-y-1">
                <Label className="text-xs">Sprache des Angebots</Label>
                <Select value={w.language} disabled={gesperrt} onValueChange={v => setze("language", v as "de" | "en")}>
                  <SelectTrigger aria-label="Sprache"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="de">Deutsch</SelectItem>
                    <SelectItem value="en">Englisch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="angebot-kond-de" className="text-xs">Konditionen (Deutsch)</Label>
                <Textarea id="angebot-kond-de" rows={7} value={w.conditions_de} disabled={gesperrt}
                  onChange={e => setze("conditions_de", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="angebot-kond-en" className="text-xs">Konditionen (Englisch)</Label>
                <Textarea id="angebot-kond-en" rows={7} value={w.conditions_en} disabled={gesperrt}
                  onChange={e => setze("conditions_en", e.target.value)} />
              </div>
            </div>

            {freigegeben && link && (
              <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                <div className="text-xs font-semibold">Link für den Kunden</div>
                <div className="flex flex-wrap gap-2">
                  <Input readOnly value={link} className="flex-1 min-w-[14rem] text-xs" onFocus={e => e.target.select()} />
                  <Button variant="outline" size="sm" onClick={async () => {
                    try { await navigator.clipboard.writeText(link); toast({ title: "Link kopiert" }); }
                    catch { toast({ title: "Link", description: link }); }
                  }}>
                    <Copy className="h-4 w-4 mr-1" />Kopieren
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={mailLink()}><Mail className="h-4 w-4 mr-1" />E-Mail</a>
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 mr-1" />Ansehen</a>
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  „Ansehen“ als Admin zählt nicht als „vom Kunden geöffnet“.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
          {angebot?.status === "accepted" && !angebot.converted_at && (
            <Button onClick={() => setUebernahmeOffen(true)}>
              <UserCheck className="h-4 w-4 mr-1" />Als Mieter übernehmen
            </Button>
          )}
          {angebot && freigegeben && !gesperrt && (
            <Button variant="outline" disabled={speichert} onClick={() => speichern("withdrawn")}>
              <Undo2 className="h-4 w-4 mr-1" />Zurückziehen
            </Button>
          )}
          {!gesperrt && (
            <Button variant="outline" disabled={speichert || laedt}
              onClick={() => speichern(angebot?.status === "withdrawn" ? "draft" : undefined)}>
              {freigegeben ? "Änderungen speichern" : "Als Entwurf speichern"}
            </Button>
          )}
          {!gesperrt && !freigegeben && (
            <Button disabled={speichert || laedt} onClick={() => speichern("released")}>
              <Send className="h-4 w-4 mr-1" />Freigeben
            </Button>
          )}
        </div>
      </DialogContent>
      <RentalTenantTakeoverDialog
        open={uebernahmeOffen}
        onOpenChange={setUebernahmeOffen}
        offer={angebot}
        guestPhone={inquiry.guest_phone}
        onDone={() => setAngebot(a => (a ? { ...a, converted_at: new Date().toISOString() } : a))}
      />
    </Dialog>
  );
};

export default RentalOfferDialog;
