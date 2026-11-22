import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { TenantInfo } from '@/types';
import type { ArrearsPayment } from '@/lib/tenantArrears';
import type { TenantRentChange } from '@/hooks/useTenantRentChanges';
import {
  buildPropertyIssues,
  type PropertyStatusResult, type StatusInquiry, type StatusLegalCase, type StatusStatement,
} from '@/lib/propertyIssues';

/**
 * Status je Objekt für den Häuser-Tab (drei Karten je Objekt, 22.11.2026).
 *
 * EINE Abfragerunde über alle Objekte (acht kleine Tabellen, parallel) —
 * keine Edge Function, kein KI-Aufruf. Die Bewertung macht
 * `buildPropertyIssues()` in `lib/propertyIssues.ts`.
 *
 * Einige Tabellen (tenant_payments, legal_cases, rental_inquiries …) fehlen noch
 * in integrations/supabase/types.ts → `as any` wie in useTenantPayments.ts.
 */

export interface PropertyBooking {
  id: string;
  check_in: string;
  check_out: string;
  status: string | null;
  guestName: string;
}

export interface PropertyStatus extends PropertyStatusResult {
  houseId: string;
  name: string;
  propertyType: string | null;
  rentalType: string | null;
  tenantInfo: TenantInfo | null;
  /** Nur touristisch: Gast, der gerade im Haus ist */
  currentBooking: PropertyBooking | null;
  /** Nur touristisch: nächste Anreise (ohne Zeitgrenze) */
  nextBooking: PropertyBooking | null;
}

export const PROPERTY_STATUS_KEY = ['property-status'];

interface HouseRow {
  id: string;
  name: string | null;
  property_type: string | null;
  rental_type: string | null;
  tenant_info: TenantInfo | null;
}

interface BookingRow {
  id: string;
  house_id: string;
  check_in: string;
  check_out: string;
  status: string | null;
  guest_name: string | null;
  guests: { name: string | null } | null;
}

interface HouseRef { house_id: string | null }

// Mehrere Tabellen fehlen noch in integrations/supabase/types.ts (generiert) →
// lose Tabellen-Abfrage wie in useTenantPayments.ts ('…' as any), Zeilen hier eng typisiert.
type LooseResult = { data: unknown[] | null; error: Error | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (name: string) => supabase.from(name as any) as any;

const rowsOf = <T,>(r: LooseResult) => (r.data ?? []) as T[];
const byHouse = <T extends HouseRef>(rows: T[], houseId: string) => rows.filter(r => r.house_id === houseId);

export const usePropertyStatus = () =>
  useQuery({
    queryKey: PROPERTY_STATUS_KEY,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PropertyStatus[]> => {
      const today = new Date();
      const todayISO = format(today, 'yyyy-MM-dd');

      const results: LooseResult[] = await Promise.all([
        table('houses').select('id, name, property_type, rental_type, tenant_info').order('name'),
        table('tenant_payments').select('house_id, amount, status, due_date, payment_date, payment_type'),
        table('tenant_rent_changes').select('*'),
        table('utility_statements').select('house_id, year, status, sent_at'),
        table('utility_settings').select('house_id, country'),
        table('rental_inquiries').select('house_id, status, move_in, seen_at'),
        table('legal_cases').select('house_id, title, case_type, status'),
        // Gastname über die guests-Relation (AGENTS.md: Gastdaten-Migration)
        table('bookings')
          .select('id, house_id, check_in, check_out, status, guest_name, guests(name)')
          .in('status', ['confirmed', 'checked_in'])
          .gte('check_out', todayISO)
          .order('check_in', { ascending: true }),
      ]);
      const failed = results.find(r => r.error);
      if (failed?.error) throw failed.error;

      const [housesR, paymentsR, rentChangesR, statementsR, settingsR, inquiriesR, casesR, bookingsR] = results;
      const payments = rowsOf<ArrearsPayment & HouseRef>(paymentsR);
      const rentChanges = rowsOf<TenantRentChange>(rentChangesR);
      const statements = rowsOf<StatusStatement>(statementsR);
      const settings = rowsOf<{ house_id: string; country: string | null }>(settingsR);
      const inquiries = rowsOf<StatusInquiry>(inquiriesR);
      const cases = rowsOf<StatusLegalCase>(casesR);
      const bookings = rowsOf<BookingRow>(bookingsR);

      const toBooking = (b: BookingRow): PropertyBooking => ({
        id: b.id,
        check_in: b.check_in,
        check_out: b.check_out,
        status: b.status,
        guestName: b.guests?.name || b.guest_name || 'Unbekannt',
      });

      return rowsOf<HouseRow>(housesR).map((h): PropertyStatus => {
        const houseBookings = bookings.filter(b => b.house_id === h.id);
        const current = houseBookings.find(b => b.check_in <= todayISO && b.check_out >= todayISO);
        const next = houseBookings.find(b => b.check_in > todayISO);
        const name = (h.name ?? '').trim();

        const result = buildPropertyIssues({
          house: { id: h.id, name, rental_type: h.rental_type, tenant_info: h.tenant_info },
          payments: byHouse(payments, h.id),
          rentChanges: rentChanges.filter(r => r.house_id === h.id),
          statements: byHouse(statements, h.id),
          country: settings.find(st => st.house_id === h.id)?.country ?? null,
          inquiries: byHouse(inquiries, h.id),
          legalCases: byHouse(cases, h.id),
          today,
        });

        return {
          ...result,
          houseId: h.id,
          name,
          propertyType: h.property_type,
          rentalType: h.rental_type,
          tenantInfo: h.tenant_info,
          currentBooking: current ? toBooking(current) : null,
          nextBooking: next ? toBooking(next) : null,
        };
      });
    },
  });
