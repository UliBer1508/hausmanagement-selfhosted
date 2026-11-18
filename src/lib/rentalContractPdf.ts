import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  BiText, FilledContract, geld, InventoryGroup, ProtocolRow, ZUSTAND,
} from '@/lib/rentalContract';

/**
 * PDF zum Mietvertrag „Wohnen auf Zeit“ (Paket D, SQL 74) — Aufbau wie Ulis Kurzfassung:
 * zweispaltig Deutsch | Englisch, je Paragraf eine Kopfzeile; danach Unterschriften,
 * Anhang 1 Übergabe- und Rückgabeprotokoll, Anhang 2 Inventarliste.
 *   vertragPdf()   → Vertrag mit beiden Anhängen
 *   protokollPdf() → nur Anhang 1 + 2 (zum Ausdrucken bei Übergabe/Rückgabe)
 * Schrift: Helvetica (Standard-Schrift von jsPDF, Zeichensatz Windows-1252). Zeichen außerhalb
 * werden ersetzt (sauber()); ² und ³ zeigt die Standardschrift nicht zuverlässig → „m2“.
 */

export interface ProtocolSnapshot {
  meters: ProtocolRow[]; keys: ProtocolRow[]; rooms: ProtocolRow[]; items: BiText[];
}
export interface PdfInput {
  contract: FilledContract;
  protocol: ProtocolSnapshot;
  inventory: InventoryGroup[];
  tenantName: string; start: string; end: string; // bereits formatiert (dd.MM.yyyy)
  footer: string;                                   // z. B. „Mietvertrag VS 316 – Max Muster“
}

const RAND = 14;
const BRAUN: [number, number, number] = [120, 84, 52];
const HELL: [number, number, number] = [244, 238, 230];

/** Zeichen, die Helvetica (Windows-1252) nicht kennt, ersetzen. */
const sauber = (s: string) =>
  s.replace(/\u2192/g, '>').replace(/\u00b2/g, '2').replace(/\u00b3/g, '3').replace(/[\u2610\u25a1]/g, '[ ]').replace(/[\u2713\u2714]/g, 'x').replace(/\u00a0/g, ' ')
    .replace(/[^\n\u0020-\u00ff\u20ac\u201e\u201c\u201d\u201a\u2018\u2019\u2013\u2014\u2026\u2022\u2122\u0160\u0161\u017d\u017e\u0152\u0153\u0178]/g, '?');

const neu = () => new jsPDF({ unit: 'mm', format: 'a4' });
const y = (doc: jsPDF) => ((doc as any).lastAutoTable?.finalY ?? 20) as number;

function kopf(doc: jsPDF, titel: string, unter: string) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...BRAUN);
  doc.text(sauber(titel), 105, 18, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60);
  const zeilen = doc.splitTextToSize(sauber(unter), 210 - 2 * RAND);
  doc.text(zeilen, 105, 24, { align: 'center' });
  return 24 + zeilen.length * 4 + 2;
}

function fusszeilen(doc: jsPDF, text: string) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120);
    doc.text(sauber(text), RAND, 290);
    doc.text(`${i} / ${n}`, 210 - RAND, 290, { align: 'right' });
  }
}

const basis = {
  theme: 'grid' as const,
  margin: { left: RAND, right: RAND, top: 16, bottom: 14 },
  styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, textColor: 30, lineColor: 200, lineWidth: 0.2, valign: 'top' as const },
  headStyles: { fillColor: HELL, textColor: BRAUN, fontStyle: 'bold' as const },
};

function vertragsteil(doc: jsPDF, c: FilledContract) {
  let start = kopf(doc, `${c.title_de}  /  ${c.title_en}`, c.subtitle);

  for (const s of c.sections) {
    // Absätze bis zur Betragsliste sammeln; die Beträge bekommen eine eigene Tabelle
    const bloecke: { text: { de: string[]; en: string[] } | null; positions?: { de: string; en: string } }[] = [];
    let aktuell = { de: [] as string[], en: [] as string[] };
    for (const p of s.paragraphs) {
      if (p.type === 'positions') {
        bloecke.push({ text: aktuell });
        bloecke.push({ text: null, positions: { de: p.de, en: p.en } });
        aktuell = { de: [], en: [] };
      } else {
        aktuell.de.push(p.de); aktuell.en.push(p.en);
      }
    }
    bloecke.push({ text: aktuell });

    // Kopfzeile nicht allein unten auf der Seite stehen lassen
    if (start > 255) { doc.addPage(); start = 16; }
    let erster = true;
    for (const b of bloecke) {
      if (b.text && !b.text.de.length && !erster) continue;
      if (b.positions) {
        autoTable(doc, {
          ...basis,
          startY: y(doc),
          body: [
            [{ content: sauber(b.positions.de), styles: { fontStyle: 'bold' } }, '', { content: sauber(b.positions.en), styles: { fontStyle: 'bold' } }, ''],
            ...c.positions.map(x => [sauber(x.label_de), geld(x.amount, 'de'), sauber(x.label_en), geld(x.amount, 'en')]),
            [{ content: 'Gesamt pro Monat', styles: { fontStyle: 'bold' } }, { content: geld(c.total, 'de'), styles: { fontStyle: 'bold' } },
             { content: 'Total per month', styles: { fontStyle: 'bold' } }, { content: geld(c.total, 'en'), styles: { fontStyle: 'bold' } }],
          ],
          columnStyles: { 0: { cellWidth: 61 }, 1: { cellWidth: 30, halign: 'right' }, 2: { cellWidth: 61 }, 3: { cellWidth: 30, halign: 'right' } },
        });
        continue;
      }
      const t = b.text!;
      autoTable(doc, {
        ...basis,
        startY: erster ? start : y(doc),
        head: erster ? [[{ content: sauber(`${s.title_de}  /  ${s.title_en}`), colSpan: 2 }]] : undefined,
        body: t.de.length ? [[sauber(t.de.join('\n\n')), sauber(t.en.join('\n\n'))]] : [],
        columnStyles: { 0: { cellWidth: 91 }, 1: { cellWidth: 91 } },
      });
      erster = false;
    }
    start = y(doc);
  }

  if (c.annex_de) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(70);
    const zeilen = doc.splitTextToSize(sauber(`${c.annex_de}\n${c.annex_en}`), 210 - 2 * RAND);
    let yy = y(doc) + 5;
    if (yy + zeilen.length * 3.6 > 270) { doc.addPage(); yy = 20; }
    doc.text(zeilen, RAND, yy);
    (doc as any).lastAutoTable.finalY = yy + zeilen.length * 3.6;
  }

  autoTable(doc, {
    ...basis,
    startY: y(doc) + 4,
    rowPageBreak: 'avoid',
    head: [['', 'Vermieter / Landlord', 'Mieter / Tenant']],
    body: [['Ort, Datum / Place, date', '', ''], ['Unterschrift / Signature', '', '']],
    columnStyles: { 0: { cellWidth: 46 }, 1: { cellWidth: 68 }, 2: { cellWidth: 68 } },
    bodyStyles: { minCellHeight: 14 },
  });
}

function protokollteil(doc: jsPDF, inp: PdfInput, mitNeuerSeite: boolean) {
  if (mitNeuerSeite) doc.addPage();
  const start = kopf(doc, 'ANHANG 1: ÜBERGABE- UND RÜCKGABEPROTOKOLL',
    `ANNEX 1: HANDOVER AND RETURN PROTOCOL – ${inp.contract.subtitle.split(' – ').slice(1).join(' – ')}`);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(30);
  doc.text(sauber(`Mieter / Tenant: ${inp.tenantName}     Mietbeginn / Start: ${inp.start}     Mietende / End: ${inp.end || '____________'}`), RAND, start + 2);

  const ueber = (t: string, yy: number) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...BRAUN);
    doc.text(sauber(t), RAND, yy);
  };

  ueber('1. Zählerstände / Meter readings', start + 9);
  autoTable(doc, {
    ...basis, startY: start + 11,
    head: [['Zähler / Meter', 'Zähler-Nr. / Meter no.', 'Einzug Datum / Move-in date', 'Einzug Stand / Reading', 'Auszug Datum / Move-out date', 'Auszug Stand / Reading']],
    body: (inp.protocol.meters.length ? inp.protocol.meters : [{ de: 'Strom / Electricity', en: '' }])
      .map(m => [sauber(m.en ? `${m.de} / ${m.en}` : m.de), sauber(m.no ?? ''), '', '', '', '']),
    columnStyles: { 0: { cellWidth: 52 } },
    bodyStyles: { minCellHeight: 8 },
    styles: { ...basis.styles, fontSize: 7.5 },
  });
  doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(80);
  doc.text(sauber('Hinweis: Zähler-Nr. mit der Rechnung des Energieversorgers abgleichen und jeden Zählerstand fotografieren. / Note: check meter no. against the utility invoice and photograph every reading.'), RAND, y(doc) + 4, { maxWidth: 182 });

  ueber('2. Schlüssel / Keys', y(doc) + 12);
  autoTable(doc, {
    ...basis, startY: y(doc) + 14,
    head: [['Schlüssel / Keys', 'Anzahl Einzug / Qty move-in', 'Anzahl Auszug / Qty move-out', 'Bemerkung / Note']],
    body: (inp.protocol.keys.length ? inp.protocol.keys : [{ de: 'Haustür', en: 'Front door' }])
      .map(k => [sauber(k.en ? `${k.de} / ${k.en}` : k.de), '', '', '']),
    columnStyles: { 0: { cellWidth: 52 }, 1: { cellWidth: 32 }, 2: { cellWidth: 32 } },
    bodyStyles: { minCellHeight: 8 },
  });

  ueber('3. Zustand der Räume / Condition of rooms', y(doc) + 7);
  autoTable(doc, {
    ...basis, startY: y(doc) + 9,
    head: [['Raum / Room', 'Zustand Einzug, Mängel / Condition at move-in, defects', 'Zustand Auszug, Schäden / Condition at move-out, damage']],
    body: (inp.protocol.rooms.length ? inp.protocol.rooms : [{ de: 'Wohnräume', en: 'Living areas' }])
      .map(r => [sauber(r.en && r.en !== r.de ? `${r.de} / ${r.en}` : r.de), '', '']),
    columnStyles: { 0: { cellWidth: 46 } },
    bodyStyles: { minCellHeight: 11 },
    rowPageBreak: 'avoid',
  });

  let yy = y(doc) + 7;
  if (yy > 250) { doc.addPage(); yy = 20; }
  ueber('4. Inventar und Übergabe / Inventory and handover', yy);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(30);
  yy += 5;
  const punkte: BiText[] = [
    { de: 'Inventarliste (Anhang 2) übergeben und geprüft – Abweichungen: ____________________', en: 'Inventory list (Annex 2) handed over and checked – deviations: ____________________' },
    ...inp.protocol.items,
  ];
  for (const p of punkte) {
    const zeilen = doc.splitTextToSize(sauber(`${p.de} / ${p.en}`), 175);
    if (yy + zeilen.length * 4 > 275) { doc.addPage(); yy = 20; }
    doc.rect(RAND, yy - 2.8, 3.2, 3.2);
    doc.text(zeilen, RAND + 5.5, yy);
    yy += zeilen.length * 4 + 1.5;
  }
  (doc as any).lastAutoTable.finalY = yy;

  autoTable(doc, {
    ...basis, startY: y(doc) + 3,
    rowPageBreak: 'avoid',
    head: [['', 'Einzug / Move-in', 'Auszug / Move-out']],
    body: [['Datum / Date', '', ''], ['Vermieter / Landlord', '', ''], ['Mieter / Tenant', '', '']],
    columnStyles: { 0: { cellWidth: 46 }, 1: { cellWidth: 68 }, 2: { cellWidth: 68 } },
    bodyStyles: { minCellHeight: 11 },
  });

  // Anhang 2
  doc.addPage();
  const s2 = kopf(doc, 'ANHANG 2: INVENTARLISTE', 'ANNEX 2: INVENTORY LIST – Bestand laut Hausverwaltung bei Ausfertigung / stock per property records at issue');
  if (!inp.inventory.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30);
    doc.text('Keine Inventarliste hinterlegt. / No inventory list on file.', RAND, s2 + 4);
    return;
  }
  autoTable(doc, {
    ...basis, startY: s2,
    head: [['Gegenstand / Item', 'Menge / Qty', 'Zustand / Condition', 'Einzug ok / Move-in ok', 'Auszug ok / Move-out ok', 'Bemerkung / Note']],
    body: inp.inventory.flatMap(g => [
      [{ content: sauber(g.location), colSpan: 6, styles: { fontStyle: 'bold' as const, fillColor: [250, 247, 242] as [number, number, number] } }],
      ...g.items.map(i => [sauber(i.name), i.quantity ?? '', sauber(ZUSTAND[i.condition ?? ''] ?? i.condition ?? ''), '', '', '']),
    ]),
    columnStyles: { 0: { cellWidth: 62 }, 1: { cellWidth: 16, halign: 'right' }, 2: { cellWidth: 28 }, 3: { cellWidth: 20 }, 4: { cellWidth: 20 } },
    styles: { ...basis.styles, fontSize: 8, cellPadding: 1.5 },
  });
}

export function vertragPdf(inp: PdfInput): Blob {
  const doc = neu();
  vertragsteil(doc, inp.contract);
  protokollteil(doc, inp, true);
  fusszeilen(doc, inp.footer);
  return doc.output('blob');
}

export function protokollPdf(inp: PdfInput): Blob {
  const doc = neu();
  protokollteil(doc, inp, false);
  fusszeilen(doc, inp.footer.replace(/^Mietvertrag/, 'Übergabeprotokoll'));
  return doc.output('blob');
}
