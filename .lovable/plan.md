# Preview-Fehler beheben: Fehlende JSX Closing-Tags

## Problem
`src/components/Pricing/PricingFactorsConfig.tsx` enthält in mehreren Accordion-Sektionen unvollständige JSX. Mehrere `</div>` und Container-Closings fehlen, wodurch der Build/Render bricht und die Preview nicht lädt.

Betroffene Sektionen (jeweils im `.map()`-Block bzw. Grid):
- `season` — `</div>` für Item + `</div>` für Grid fehlen
- `dow` — gleiches Muster
- `leadtime` — gleiches Muster
- `occupancy` — gleiches Muster
- `gap` — beide `</div>` der zwei Items + Grid-Closing fehlen
- `event` — Item + Grid Closing fehlen
- `weather` — Item + Grid Closing fehlen
- `holiday` — drei Item-Closings + Grid-Closing fehlen

## Fix
Alle fehlenden `</div>`-Tags in den 8 Accordion-Sektionen ergänzen, sodass jede Map-Iteration und jedes Grid sauber geschlossen wird. Keine Logik-Änderungen, nur Strukturkorrektur.

## Validierung
- Preview lädt wieder
- "Preis-Faktoren konfigurieren" Card öffnet sich, alle Accordion-Items rendern korrekt
- Speichern/Reset funktioniert weiterhin
