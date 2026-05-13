import * as React from "react";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ClickableCardProps extends React.HTMLAttributes<HTMLDivElement> {
  onActivate: () => void;
  showChevron?: boolean;
  disabled?: boolean;
}

/**
 * Wrapper around <Card> that makes the whole card a clickable, keyboard-accessible
 * surface. Use for list items where clicking the card opens a detail/edit dialog.
 *
 * Inner buttons must call e.stopPropagation() to avoid double-trigger.
 */
export const ClickableCard = React.forwardRef<HTMLDivElement, ClickableCardProps>(
  ({ onActivate, showChevron = false, disabled = false, className, children, onClick, onKeyDown, ...rest }, ref) => {
    const handleClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
      onClick?.(e);
      if (e.defaultPrevented || disabled) return;
      onActivate();
    };
    const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
      onKeyDown?.(e);
      if (e.defaultPrevented || disabled) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    };
    return (
      <Card
        ref={ref}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          "transition cursor-pointer hover:shadow-md hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          disabled && "cursor-not-allowed opacity-60 hover:shadow-sm hover:border-border",
          className,
        )}
        {...rest}
      >
        {showChevron ? (
          <div className="relative">
            {children}
            <ChevronRight
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground"
              aria-hidden
            />
          </div>
        ) : (
          children
        )}
      </Card>
    );
  },
);
ClickableCard.displayName = "ClickableCard";