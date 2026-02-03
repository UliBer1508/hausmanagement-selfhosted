

# Guest App: Zugriff für identifizierte Gäste auch nach Checkout

## Anforderung

Gäste sollen auch nach dem Checkout weiterhin auf die Guest App zugreifen können, aber NUR wenn:
1. Die Session eine verknüpfte Buchung hat (`booking_id`)
2. Der Gast eine Email-Adresse hat (in der `guests`-Tabelle)

## Logik

```text
Session-Validierung:

Session vorhanden?
     ↓ Ja
booking_id vorhanden?
     ↓ Ja
Email in guests-Tabelle?
     ↓ Ja
✅ ZUGRIFF ERLAUBT (auch nach Checkout)

Ansonsten:
❌ Session ungültig → Willkommensseite
```

## Änderungen für dieses Projekt (Management-App)

**Keine Änderungen nötig** - Die Management-App zeigt Sessions korrekt an. Das "Abgelaufen"-Badge ist optional und nicht mehr notwendig, da der Zugriff bewusst erlaubt wird.

## Prompt für die Guest App

Die Session-Validierung in der Guest App muss angepasst werden:

```typescript
// useSessionValidation.ts - Aktualisierte Logik

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useSessionValidation = () => {
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const validate = async () => {
      const sessionId = localStorage.getItem('guest_session_id');
      
      if (!sessionId) {
        setIsValid(false);
        setIsLoading(false);
        return;
      }

      try {
        const { data } = await supabase
          .from('guest_app_sessions')
          .select(`
            booking_id,
            bookings:booking_id (
              guest_id,
              guests:guest_id (
                email
              )
            )
          `)
          .eq('session_id', sessionId)
          .maybeSingle();

        // Validierung: booking_id UND email müssen existieren
        const hasBooking = !!data?.booking_id;
        const guestEmail = data?.bookings?.guests?.email;
        const hasEmail = !!guestEmail;

        if (hasBooking && hasEmail) {
          // ✅ Identifizierter Gast → Zugriff erlauben (auch nach Checkout)
          setIsValid(true);
        } else {
          // ❌ Nicht identifiziert → Session ungültig
          localStorage.removeItem('guest_session_id');
          setIsValid(false);
        }
      } catch (error) {
        console.error('Session validation error:', error);
        setIsValid(false);
      }
      
      setIsLoading(false);
    };

    validate();
  }, []);

  return { isValid, isLoading };
};
```

## Zusammenfassung

| Bedingung | Zugriff |
|-----------|---------|
| Keine Session | ❌ Willkommensseite |
| Session ohne booking_id | ❌ Session löschen, Willkommensseite |
| Session mit booking_id, aber ohne Email | ❌ Session löschen, Willkommensseite |
| Session mit booking_id UND Email | ✅ Zugriff (auch nach Checkout) |

## Keine Änderungen in diesem Projekt

Da die Logik komplett in der **Guest App** implementiert wird, sind hier keine Code-Änderungen erforderlich. Der Plan dient als Dokumentation und Prompt für die Guest App.
