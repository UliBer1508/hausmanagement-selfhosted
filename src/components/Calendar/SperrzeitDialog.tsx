import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import useSperrzeiten from "@/hooks/useSperrzeiten";
import {
  SPERR_GRUENDE,
  type SperrGrund,
  type Sperrzeit,
  sperrNaechte,
  tagAnzeigen,
  tagDanach,
} from "@/lib/sperrzeiten";

// ============================================================
// SperrzeitDialog — Zeitraum sperren / Sperre ändern / aufheben
// ============================================================
//
// Geöffnet aus dem Kalender-Tab (CalendarTab.tsx): Knopf „Zeitraum sperren"
// oder Klick auf eine gesperrte Zelle bzw. einen grauen Sperr-Balken.
// Speichern schreibt in `sperrzeiten` (SQL 66) über useSperrzeiten.
//
// Was danach automatisch passiert, steht im Dialog, damit Uli weiß, was er
// noch selbst tun muss (Booking.com).

interface HouseOption {
  id: string;
  name: string;
}

interface BookingLite {
  id: string;
  guest_name?: string;
  check_in: string;
  check_out: string;
  status?: string;
  house_id?: string;
  houses?: { id: string; name: string };
}

interface SperrzeitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  houses: HouseOption[];
  bookings: BookingLite[];
  /** Bestehende Sperrzeit bearbeiten; ohne = neu anlegen. */
  sperrzeit?: Sperrzeit | null;
  /** Vorbelegung für eine neue Sperre. */
  vorschlag?: { house_id?: string; erster_tag?: string } | null;
}

const SperrzeitDialog = ({ open, onOpenChange, houses, bookings, sperrzeit, vorschlag }: SperrzeitDialogProps) => {
  const { toast } = useToast();
  const { sperrzeiten, anlegen, aendern, loeschen, isSpeichernd } = useSperrzeiten();

  const [houseId, setHouseId] = useState("");
  const [ersterTag, setErsterTag] = useState("");
  const [letzterTag, setLetzterTag] = useState("");
  const [grund, setGrund] = useState<SperrGrund>("behoerdliche_auflage");
  const [notiz, setNotiz] = useState("");
  const [loeschenBestaetigen, setLoeschenBestaetigen] = useState(false);

  // Gibt es nur ein Haus, ist es vorgewählt. Als String (nicht das Array),
  // damit ein Neuladen der Häuser das offene Formular nicht zurücksetzt.
  const einzigesHaus = houses.length === 1 ? houses[0].id : "";

  // Beim Öffnen Formular aus der Sperrzeit bzw. dem Vorschlag füllen.
  useEffect(() => {
    if (!open) return;
    setLoeschenBestaetigen(false);
    if (sperrzeit) {
      setHouseId(sperrzeit.house_id);
      setErsterTag(sperrzeit.erster_tag);
      setLetzterTag(sperrzeit.letzter_tag);
      setGrund(sperrzeit.grund);
      setNotiz(sperrzeit.notiz ?? "");
    } else {
      setHouseId(vorschlag?.house_id ?? einzigesHaus);
      setErsterTag(vorschlag?.erster_tag ?? "");
      setLetzterTag(vorschlag?.erster_tag ?? "");
      setGrund("behoerdliche_auflage");
      setNotiz("");
    }
  }, [open, sperrzeit, vorschlag, einzigesHaus]);

  const datumOk = !!ersterTag && !!letzterTag && letzterTag >= ersterTag;

  // Überschneidung mit einer ANDEREN Sperrzeit desselben Hauses -> nicht
  // speichern (doppelte Sperren müssten sonst zweimal aufgehoben werden).
  const sperrUeberschneidung = useMemo(() => {
    if (!houseId || !datumOk) return null;
    return sperrzeiten.find((s) =>
      s.house_id === houseId && s.id !== sperrzeit?.id &&
      s.erster_tag <= letzterTag && ersterTag <= s.letzter_tag) ?? null;
  }, [sperrzeiten, houseId, ersterTag, letzterTag, datumOk, sperrzeit?.id]);

  // Überschneidung mit Buchungen -> nur Hinweis. Eine Sperre über einer
  // bestehenden Buchung ist erlaubt (die Buchung bleibt bestehen).
  const buchungsUeberschneidung = useMemo(() => {
    if (!houseId || !datumOk) return [];
    const sperrBis = tagDanach(letzterTag); // exklusiv, wie check_out
    return bookings.filter((b) => {
      if (b.status === "cancelled") return false;
      if ((b.house_id ?? b.houses?.id) !== houseId) return false;
      const ci = b.check_in.slice(0, 10);
      const co = b.check_out.slice(0, 10);
      return ci < sperrBis && co > ersterTag;
    });
  }, [bookings, houseId, ersterTag, letzterTag, datumOk]);

  const kannSpeichern = !!houseId && datumOk && !sperrUeberschneidung && !isSpeichernd;

  const speichern = async () => {
    if (!kannSpeichern) return;
    const eingabe = {
      house_id: houseId,
      erster_tag: ersterTag,
      letzter_tag: letzterTag,
      grund,
      notiz: notiz.trim() || null,
    };
    try {
      if (sperrzeit) await aendern({ id: sperrzeit.id, ...eingabe });
      else await anlegen(eingabe);
      toast({
        title: sperrzeit ? "Sperrzeit geändert" : "Zeitraum gesperrt",
        description:
          "Airbnb und VRBO übernehmen die Änderung beim nächsten Abruf (meist innerhalb weniger Stunden). " +
          "In Booking.com bitte selbst anpassen.",
      });
      onOpenChange(false);
    } catch (e) {
      console.error("[SperrzeitDialog] speichern", e);
      toast({
        title: "Sperrzeit nicht gespeichert",
        description: e instanceof Error ? e.message : "Unbekannter Fehler",
        variant: "destructive",
      });
    }
  };

  const aufheben = async () => {
    if (!sperrzeit) return;
    if (!loeschenBestaetigen) {
      setLoeschenBestaetigen(true);
      return;
    }
    try {
      await loeschen(sperrzeit.id);
      toast({
        title: "Sperre aufgehoben",
        description:
          "Airbnb und VRBO geben den Zeitraum beim nächsten Abruf wieder frei. " +
          "In Booking.com bitte selbst wieder öffnen.",
      });
      onOpenChange(false);
    } catch (e) {
      console.error("[SperrzeitDialog] aufheben", e);
      toast({
        title: "Sperre nicht aufgehoben",
        description: e instanceof Error ? e.message : "Unbekannter Fehler",
        variant: "destructive",
      });
    }
  };

  const naechte = datumOk ? sperrNaechte({ erster_tag: ersterTag, letzter_tag: letzterTag }) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sperrzeit ? "Sperrzeit bearbeiten" : "Zeitraum sperren"}</DialogTitle>
          <DialogDescription>
            Gesperrte Nächte sind auf der Website und in den Portalen nicht buchbar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sperre-haus">Haus</Label>
            <Select value={houseId} onValueChange={setHouseId}>
              <SelectTrigger id="sperre-haus">
                <SelectValue placeholder="Haus wählen" />
              </SelectTrigger>
              <SelectContent>
                {houses.map((h) => (
                  <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sperre-von">Von (erste Nacht)</Label>
              <Input
                id="sperre-von"
                type="date"
                value={ersterTag}
                onChange={(e) => {
                  setErsterTag(e.target.value);
                  if (!letzterTag || letzterTag < e.target.value) setLetzterTag(e.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sperre-bis">Bis (letzte Nacht)</Label>
              <Input
                id="sperre-bis"
                type="date"
                value={letzterTag}
                min={ersterTag || undefined}
                onChange={(e) => setLetzterTag(e.target.value)}
              />
            </div>
          </div>

          {datumOk && (
            <p className="text-xs text-muted-foreground">
              {naechte} {naechte === 1 ? "Nacht" : "Nächte"} gesperrt. Abreise am {tagAnzeigen(ersterTag)} und
              Anreise ab {tagAnzeigen(tagDanach(letzterTag))} bleiben möglich.
            </p>
          )}
          {!!ersterTag && !!letzterTag && !datumOk && (
            <p className="text-xs text-destructive">„Bis" darf nicht vor „Von" liegen.</p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="sperre-grund">Grund</Label>
            <Select value={grund} onValueChange={(v) => setGrund(v as SperrGrund)}>
              <SelectTrigger id="sperre-grund">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SPERR_GRUENDE.map((g) => (
                  <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sperre-notiz">Notiz (optional)</Label>
            <Textarea
              id="sperre-notiz"
              rows={2}
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              placeholder="z. B. Ganzvermietung nicht erlaubt"
            />
          </div>

          {sperrUeberschneidung && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-2 text-xs text-destructive">
              Überschneidet sich mit der bestehenden Sperrzeit {tagAnzeigen(sperrUeberschneidung.erster_tag)}–
              {tagAnzeigen(sperrUeberschneidung.letzter_tag)}. Bitte diese bearbeiten statt eine zweite anzulegen.
            </div>
          )}

          {buchungsUeberschneidung.length > 0 && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/5 p-2 text-xs text-amber-800 dark:text-amber-300">
              Im Zeitraum liegen Buchungen — sie bleiben bestehen:
              <ul className="mt-1 list-disc pl-4">
                {buchungsUeberschneidung.map((b) => (
                  <li key={b.id}>
                    {b.guest_name ?? "Buchung"}: {tagAnzeigen(b.check_in)}–{tagAnzeigen(b.check_out)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
            Airbnb und VRBO übernehmen die Sperre automatisch über den Export-Kalender, die Website sofort.
            <strong className="text-foreground"> In Booking.com bitte selbst schließen</strong> — der
            Kalender-Abgleich erinnert daran, bis es erledigt ist.
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {sperrzeit ? (
            <Button
              variant={loeschenBestaetigen ? "destructive" : "outline"}
              onClick={aufheben}
              disabled={isSpeichernd}
              className="w-full sm:w-auto"
            >
              {loeschenBestaetigen ? "Wirklich aufheben?" : "Sperre aufheben"}
            </Button>
          ) : <span className="hidden sm:block" />}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
              Abbrechen
            </Button>
            <Button onClick={speichern} disabled={!kannSpeichern} className="w-full sm:w-auto">
              {isSpeichernd ? "Speichern …" : "Speichern"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SperrzeitDialog;
