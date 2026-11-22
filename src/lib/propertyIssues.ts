import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import type { LegalCase, TenantInfo } from '@/types';
import { calculateArrears, type ArrearsPayment, type ArrearsResult } from '@/lib/tenantArrears';
import {
  getActiveAdditionalCosts, getActiveRent, getPendingRentChanges, type TenantRentChange,
} from '@/hooks/useTenantRentChanges';
import { CASE_STATUS_LABELS, CASE_TYPE_LABELS, isCaseActive } from '@/hooks/useLegalCases';

/**
 * Offene Punkte („Issues und To-dos") je Objekt — reine Rechnung ohne Datenbank.
 * Daten lädt `hooks/usePropertyStatus.ts`. Angezeigt im Häuser-Tab
 * (`Houses/HouseIssuesCard.tsx`) und in der Übersichtskarte
 * (`Dashboard/LongTermStatusCard.tsx`). Keine KI, kein Server — nur vorhandene Tabellen.
 *
 * Geprüft (Stand 22.11.2026):
 * - Festvermietung: Mietrückstand (lib/tenantArrears.ts), NK-Abrechnung des
 *   Vorjahres nicht versendet, leer stehend + offene Mietanfragen,
 *   angekündigte Mietänderung.
 * - Alle Objekte: laufende Verfahren aus „Rechtliches".
 * - Touristisch: Prüfungen zu Reinigung/Wäsche/Zahlung bleiben bewusst bei Max
 *   (`check_upcoming_bookings`) und den Übersichtskarten — keine zweite Logik.
 */

export type IssueLevel = 'danger' | 'warning' | 'info';
export type PropertyLevel = IssueLevel | 'ok';

/** Ziel beim Klick: Haupt-Tab und ggf. Sub-Tab im Mieter-Tab */
export interface IssueTarget {
  activeTab: string;
  tenantSubTab?: string;
}

export interface PropertyIssue {
  key: string;
  level: IssueLevel;
  title: string;
  /** Kurzform für die Übersichtskarte (eine Zeile, wenig Platz) */
  short: string;
  detail?: string;
  target?: IssueTarget;
}

export interface StatusHouse {
  id: string;
  name: string;
  rental_type: string | null;
  tenant_info: TenantInfo | null;
}

export interface StatusStatement {
  house_id: string;
  year: number;
  status: 'draft' | 'final' | 'sent' | string;
  sent_at: string | null;
}

export interface StatusInquiry {
  house_id: string | null;
  status: string;
  move_in: string | null;
  seen_at: string | null;
}

export interface StatusLegalCase {
  house_id: string;
  title: string;
  case_type: LegalCase['case_type'];
  status: LegalCase['status'];
}

export interface PropertyIssueInput {
  house: StatusHouse;
  payments: ArrearsPayment[];
  rentChanges: TenantRentChange[];
  statements: StatusStatement[];
  /** Land aus utility_settings ('DE' Standard, 'AT') */
  country: string | null;
  inquiries: StatusInquiry[];
  legalCases: StatusLegalCase[];
  today: Date;
}

export interface PropertyStatusResult {
  isLongTerm: boolean;
  /** Festvermietung ohne Mietername */
  vacant: boolean;
  /** Gültige Kaltmiete heute (letzte Mietänderung, sonst tenant_info.monthly_rent) */
  activeRent: number;
  /** Gültige NK-Vorauszahlung heute */
  activeAdditionalCosts: number;
  arrears: ArrearsResult | null;
  issues: PropertyIssue[];
  level: PropertyLevel;
}

const OPEN_INQUIRY = ['new', 'contacted', 'viewing', 'offer'];
const LEVEL_RANK: Record<IssueLevel, number> = { danger: 0, warning: 1, info: 2 };

const eur = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: string) => format(parseISO(d), 'dd.MM.yyyy', { locale: de });
const toISO = (d: Date) => format(d, 'yyyy-MM-dd');

/** Zahl aus tenant_info (kann als Zahl oder Text gespeichert sein) */
export const infoNumber = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

export const hasTenant = (info: TenantInfo | null | undefined) => !!info?.tenant_name?.trim();

/**
 * Abrechnungsfrist für das Vorjahr.
 * DE: § 556 Abs. 3 BGB — 12 Monate nach Ende des Abrechnungszeitraums (31.12.).
 * AT: § 21 Abs. 3 MRG — bis 30.06. (nur bei Vollanwendung des MRG; sonst
 * entscheidet der Mietvertrag, siehe docs/Nebenkosten-Touristisch-vs-Festvermietung.md).
 */
const statementDeadline = (year: number, country: string | null) =>
  country === 'AT' ? `${year + 1}-06-30` : `${year + 1}-12-31`;

export const buildPropertyIssues = (input: PropertyIssueInput): PropertyStatusResult => {
  const { house, payments, rentChanges, statements, country, inquiries, legalCases, today } = input;
  const todayISO = toISO(today);
  const isLongTerm = house.rental_type === 'long_term';
  const info = house.tenant_info;
  const vacant = isLongTerm && !hasTenant(info);
  const issues: PropertyIssue[] = [];

  const activeRent = getActiveRent(rentChanges, infoNumber(info?.monthly_rent), today);
  const activeAdditionalCosts = getActiveAdditionalCosts(rentChanges, infoNumber(info?.additional_costs), today);
  const arrears = isLongTerm ? calculateArrears(payments, todayISO) : null;
  const activeCases = legalCases.filter(isCaseActive);

  // 1. Mietrückstand — ein laufendes Verfahren wird in derselben Zeile genannt
  if (arrears && arrears.rest > 0) {
    const caseText = activeCases
      .map(c => `${CASE_TYPE_LABELS[c.case_type] ?? c.case_type} (${CASE_STATUS_LABELS[c.status] ?? c.status})`)
      .join(', ');
    const parts = [`${arrears.months} ${arrears.months === 1 ? 'Monat' : 'Monate'} offen seit ${fmtDate(arrears.earliest)}`];
    if (arrears.specialTotal > 0) parts.push(`abzgl. Sonderzahlungen ${eur(arrears.specialTotal)}`);
    if (caseText) parts.push(`Verfahren: ${caseText}`);
    issues.push({
      key: 'arrears',
      level: 'danger',
      title: `Mietrückstand ${eur(arrears.rest)}`,
      short: `−${eur(arrears.rest)}`,
      detail: parts.join(' · '),
      target: { activeTab: 'Mieter', tenantSubTab: 'payments' },
    });
  }

  // 2. Laufende Verfahren (wenn nicht schon beim Rückstand genannt)
  if (!(arrears && arrears.rest > 0)) {
    activeCases.forEach((c, i) => issues.push({
      key: `case-${i}`,
      level: 'info',
      title: `Verfahren: ${c.title}`,
      short: 'Verfahren',
      detail: `${CASE_TYPE_LABELS[c.case_type] ?? c.case_type} · ${CASE_STATUS_LABELS[c.status] ?? c.status}`,
      target: { activeTab: 'Rechtliches' },
    }));
  }

  if (isLongTerm) {
    // 3. NK-Abrechnung des Vorjahres
    const prevYear = today.getFullYear() - 1;
    const start = info?.contract_start || '';
    const rentedInPrevYear = hasTenant(info) && (!start || start <= `${prevYear}-12-31`);
    if (rentedInPrevYear) {
      const st = statements.find(s => s.year === prevYear);
      const sent = !!st && (st.status === 'sent' || !!st.sent_at);
      if (!sent) {
        const deadline = statementDeadline(prevYear, country);
        const daysLeft = differenceInCalendarDays(parseISO(deadline), today);
        const deadlineText = country === 'AT'
          ? `Frist laut Mietvertrag (MRG: ${fmtDate(deadline)})`
          : `Frist ${fmtDate(deadline)}`;
        issues.push({
          key: 'utility-statement',
          level: daysLeft <= 30 ? 'danger' : 'warning',
          title: `NK-Abrechnung ${prevYear} ${st ? 'noch nicht versendet' : 'fehlt'}`,
          short: `NK ${prevYear}`,
          detail: daysLeft >= 0 ? `${deadlineText} · noch ${daysLeft} Tage` : `${deadlineText} · abgelaufen`,
          target: { activeTab: 'Mieter', tenantSubTab: 'utilities' },
        });
      }
    }

    // 4. Leer stehend / offene Mietanfragen
    const open = inquiries.filter(q => OPEN_INQUIRY.includes(q.status));
    const unseen = open.filter(q => q.status === 'new' && !q.seen_at).length;
    const moveIns = open.map(q => q.move_in).filter((d): d is string => !!d).sort();
    const inquiryText = open.length > 0
      ? `${open.length} offene ${open.length === 1 ? 'Anfrage' : 'Anfragen'}${unseen ? ` (${unseen} neu)` : ''}`
        + (moveIns[0] ? ` · Einzug ab ${fmtDate(moveIns[0])}` : '')
      : undefined;
    if (vacant) {
      issues.push({
        key: 'vacant',
        level: 'warning',
        title: 'Leer stehend',
        short: 'Leer',
        detail: inquiryText ?? 'Keine offene Mietanfrage',
        target: { activeTab: 'Mieter', tenantSubTab: 'interessenten' },
      });
    } else if (inquiryText) {
      issues.push({
        key: 'inquiries',
        level: 'info',
        title: 'Mietanfragen',
        short: 'Anfrage',
        detail: inquiryText,
        target: { activeTab: 'Mieter', tenantSubTab: 'interessenten' },
      });
    }

    // 5. Angekündigte Mietänderung (nächste 90 Tage)
    const horizon = toISO(addDays(today, 90));
    getPendingRentChanges(rentChanges, today)
      .filter(rc => rc.effective_date <= horizon)
      .forEach(rc => issues.push({
        key: `rent-change-${rc.id}`,
        level: 'info',
        title: `Mietänderung ab ${fmtDate(rc.effective_date)}`,
        short: 'Mietänderung',
        detail: `neue Miete ${eur(rc.new_rent)}`,
        target: { activeTab: 'Mieter', tenantSubTab: 'contracts' },
      }));
  }

  issues.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
  const level: PropertyLevel = issues.length === 0 ? 'ok' : issues[0].level;

  return { isLongTerm, vacant, activeRent, activeAdditionalCosts, arrears, issues, level };
};
