import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { UtilityStatement, UtilitySettings } from '@/hooks/useUtilityCosts';
import { TenantInfo } from '@/types';

interface House {
  id: string;
  name: string;
  address?: string;
}

interface ProfileSettings {
  user_name?: string;
  company_name?: string;
}

export const generateUtilityStatementPdf = (
  statement: UtilityStatement,
  house: House,
  tenantInfo: TenantInfo | null,
  settings: UtilitySettings | null,
  profileSettings?: ProfileSettings | null
) => {
  const doc = new jsPDF();
  
  // Header - Vermieter
  doc.setFontSize(10);
  doc.setTextColor(100);
  const vermieterName = profileSettings?.company_name || profileSettings?.user_name || 'Vermieter';
  doc.text(vermieterName, 20, 15);
  
  // Titel
  doc.setFontSize(20);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text(`Nebenkostenabrechnung ${statement.year}`, 20, 30);
  
  // Status Badge
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const statusLabels: Record<string, string> = {
    draft: 'Entwurf',
    final: 'Finalisiert',
    sent: 'Versendet'
  };
  doc.text(`Status: ${statusLabels[statement.status] || statement.status}`, 150, 30);
  
  // Objektinfo Box
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(20, 40, 170, 35, 3, 3, 'F');
  
  doc.setFontSize(10);
  doc.setTextColor(60);
  
  let yPos = 48;
  doc.text(`Objekt: ${house.name}`, 25, yPos);
  yPos += 7;
  doc.text(`Mieter: ${tenantInfo?.tenant_name || '-'}`, 25, yPos);
  yPos += 7;
  doc.text(`Abrechnungszeitraum: 01.01.${statement.year} - 31.12.${statement.year}`, 25, yPos);
  yPos += 7;
  
  if (settings?.tenant_area_sqm && settings?.total_area_sqm) {
    const percentage = ((settings.tenant_area_sqm / settings.total_area_sqm) * 100).toFixed(1);
    doc.text(`Wohnfläche: ${settings.tenant_area_sqm} m² von ${settings.total_area_sqm} m² (${percentage}%)`, 25, yPos);
  }
  
  // Kostenaufstellung Tabelle
  const tableData = statement.cost_breakdown.map(item => [
    item.category_name,
    `${item.total_amount.toFixed(2)} €`,
    `${item.tenant_share.toFixed(2)} €`,
    `${item.percentage.toFixed(1)}%`
  ]);
  
  autoTable(doc, {
    startY: 85,
    head: [['Kostenart', 'Gesamtkosten', 'Ihr Anteil', 'Schlüssel']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [60, 60, 60],
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    styles: {
      fontSize: 10,
      cellPadding: 4
    },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 35, halign: 'right' },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 30, halign: 'center' }
    }
  });
  
  // Position nach Tabelle
  const finalY = (doc as any).lastAutoTable.finalY + 15;
  
  // Zusammenfassung
  doc.setFontSize(11);
  doc.setTextColor(60);
  
  // Summe
  doc.text('Summe Nebenkosten:', 20, finalY);
  doc.text(`${statement.tenant_share.toFixed(2)} €`, 170, finalY, { align: 'right' });
  
  // Vorauszahlungen
  doc.text('- Ihre Vorauszahlungen:', 20, finalY + 8);
  doc.text(`-${statement.prepayments.toFixed(2)} €`, 170, finalY + 8, { align: 'right' });
  
  // Trennlinie
  doc.setDrawColor(200);
  doc.line(20, finalY + 14, 190, finalY + 14);
  
  // Ergebnis
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  const resultLabel = statement.result >= 0 ? 'NACHZAHLUNG' : 'GUTHABEN';
  const resultColor = statement.result >= 0 ? [220, 38, 38] : [22, 163, 74]; // red or green
  doc.setTextColor(resultColor[0], resultColor[1], resultColor[2]);
  doc.text(`${resultLabel}:`, 20, finalY + 25);
  doc.text(`${Math.abs(statement.result).toFixed(2)} €`, 170, finalY + 25, { align: 'right' });
  
  // Reset Text Color
  doc.setTextColor(0);
  
  // Zahlungshinweis
  if (statement.result > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text('Bitte überweisen Sie den Nachzahlungsbetrag innerhalb von 30 Tagen.', 20, finalY + 40);
  } else if (statement.result < 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text('Das Guthaben wird mit der nächsten Mietzahlung verrechnet.', 20, finalY + 40);
  }
  
  // Fußzeile
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(
    `Erstellt am ${format(new Date(statement.generated_at), 'dd.MM.yyyy HH:mm', { locale: de })}`,
    20,
    280
  );
  if (statement.sent_at) {
    doc.text(
      `Versendet am ${format(new Date(statement.sent_at), 'dd.MM.yyyy', { locale: de })}`,
      20,
      285
    );
  }
  
  // PDF speichern
  const fileName = `Nebenkostenabrechnung_${house.name.replace(/\s+/g, '_')}_${statement.year}.pdf`;
  doc.save(fileName);
};
