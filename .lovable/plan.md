## Ziel

Code-Qualitäts-Fixes in `src/components/Chat/ChatAssistant.tsx` und `src/components/PWA/AppStatusBar.tsx` umsetzen — ohne Funktions- oder UI-Änderungen.

## Änderungen `src/components/Chat/ChatAssistant.tsx`

1. **Mobile-Duplikate entfernen** — Der gesamte mobile `<div>`-Block (Header, Mode-Toggle, Provider-Select, Messages-Area, Input — Zeilen ~436–654) sowie der inhaltliche Inhalt im Draggable-Wrapper (Zeilen ~668–852) werden gelöscht. Beide rendern stattdessen `renderChatContent(false)`.
   - Mobile: `<div className="fixed inset-0 h-[100dvh] ... flex flex-col z-[100] touch-manipulation">{renderChatContent(false)}</div>`
   - Desktop: `<Draggable …><div className="absolute w-[400px] h-[600px] …">{/* drag-handle bar */}{renderChatContent(false)}</div></Draggable>`
   - Drag-Handle bleibt im Desktop-Wrapper als eigene schmale Leiste oberhalb von `renderChatContent` (mit Klasse `drag-handle` + `GripVertical`-Icon), sodass Header in `renderChatContent` unverändert bleibt.

2. **Auto-Scroll** — Neuer `useEffect(() => { scrollToBottom(); }, [messages, providerMessages]);`.

3. **`window.innerWidth`-Fix** — Neuer State `windowSize` + `useEffect` mit Resize-Listener. Draggable nutzt `windowSize.width / .height` statt direktem Zugriff.

4. **Error-Display für Messaging-Mode** — Im Messaging-Block dieselbe `{error && (...)}`-Box wie im AI-Mode ergänzen (innerhalb `renderChatContent`).

5. **`LoadingDots`-Komponente** — Außerhalb der `ChatAssistant`-Funktion definieren; alle 3 Dot-Vorkommen in `renderChatContent` durch `<LoadingDots />` ersetzen.

## Änderungen `src/components/PWA/AppStatusBar.tsx`

6. **`isOnline` Initial** — `useState(true)` + `useEffect(() => setIsOnline(navigator.onLine), [])`.

7. **Auto-Reload entfernen** — `controllerchange`-Listener und `handleControllerChange` komplett entfernen (inkl. Cleanup). `handleUpdate` bleibt unverändert.

8. **Minimized persistieren** — `useState(() => localStorage.getItem('statusbar-minimized') === 'true')`. Neue Funktion `handleMinimize(value)` schreibt in localStorage und wird in beiden Toggle-Buttons benutzt.

9. **iOS-Standalone Typ** — Lokales `interface NavigatorStandalone extends Navigator { standalone?: boolean }`; `(navigator as NavigatorStandalone).standalone === true`.

10. **`updateSW` als Ref** — `useRef<(() => void) | null>(null)` statt `useState`. `setShowUpdateButton(true)` + `updateSWRef.current = …` setzen; `handleUpdate` ruft `updateSWRef.current?.()`.

## Sicherstellen

- Keine Style-/Layout-/Verhalten-Änderungen über die genannten Punkte hinaus.
- Mobile Safe-Area-Padding (`pt-[calc(1rem+env(safe-area-inset-top))]` / `pb-…inset-bottom`) bleibt erhalten — entweder via Klassen am mobilen Wrapper-`<div>` oder durch optionalen `isMobile`-Hint in `renderChatContent`. Empfehlung: Klassen direkt am Mobile-Wrapper anbringen (`pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]`), damit `renderChatContent` unverändert bleibt.
- Touch-Handler (`onTouchEnd` etc.) auf Mobile-Buttons: durch das Vereinheitlichen entfallen sie — das ist akzeptiert, da `renderChatContent` bereits funktional über Standard-`onClick` arbeitet (gewünschte Vereinfachung gemäß Aufgabenstellung „remove duplication").