import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Einheitlicher, finger-freundlicher Schließen-Button.
 * Tap-Target 44×44 px (WCAG AA), Icon 20 px.
 *
 * Varianten:
 *  - "subtle" (default): transparent, für Dialoge/Sheets
 *  - "solid": mit Hintergrund, für Banner und Karten auf farbigem Grund
 */
export interface CloseButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "subtle" | "solid";
  label?: string;
}

export const CloseButton = React.forwardRef<HTMLButtonElement, CloseButtonProps>(
  ({ className, variant = "subtle", label = "Schließen", ...props }, ref) => {
    const base =
      "inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";
    const variants = {
      subtle:
        "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      solid:
        "bg-muted text-foreground hover:bg-accent hover:text-accent-foreground",
    } as const;

    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={cn(base, variants[variant], className)}
        {...props}
      >
        <X className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </button>
    );
  },
);
CloseButton.displayName = "CloseButton";

export default CloseButton;