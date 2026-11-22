import type { ReactNode } from 'react';

/**
 * Kopfbalken der drei Objekt-Karten im Häuser-Tab (22.11.2026) — gleicher Aufbau
 * wie die Übersichtskarten (Bookings/BookingCard.tsx: Symbol, Kleinzeile, Titel,
 * Status-Pille rechts).
 */
export const HEADER_GRADIENTS = {
  object: 'linear-gradient(100deg,#475569,#64748b)',
  rent: 'linear-gradient(100deg,#4f46e5,#6366f1)',
  occupancy: 'linear-gradient(100deg,#d97706,#f59e0b)',
  danger: 'linear-gradient(100deg,#dc2626,#ef4444)',
  warning: 'linear-gradient(100deg,#d97706,#f59e0b)',
  ok: 'linear-gradient(100deg,#059669,#10b981)',
} as const;

interface HouseCardHeaderProps {
  icon: string;
  kicker: string;
  title: string;
  gradient: string;
  /** Status-Pille rechts (optional) */
  pill?: string;
  /** Textfarbe der Pille — die Grundfarbe des Balkens */
  pillColor?: string;
  /** Zusätzliche Knöpfe rechts (z. B. Bearbeiten) */
  actions?: ReactNode;
}

const HouseCardHeader = ({ icon, kicker, title, gradient, pill, pillColor, actions }: HouseCardHeaderProps) => (
  <div className="flex items-center gap-2 px-3 py-2 text-white" style={{ background: gradient }}>
    <div
      className="w-7 h-7 rounded-lg grid place-items-center text-[15px] shrink-0"
      style={{ background: 'rgba(255,255,255,.22)' }}
      aria-hidden="true"
    >
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-[9px] font-bold uppercase tracking-wider opacity-90 truncate">{kicker}</div>
      <div className="text-[14px] font-extrabold leading-tight truncate">{title}</div>
    </div>
    {actions}
    {pill && (
      <span
        className="text-[10px] font-extrabold px-2 py-1 rounded-full bg-white/95 shrink-0"
        style={{ color: pillColor }}
      >
        {pill}
      </span>
    )}
  </div>
);

export default HouseCardHeader;
