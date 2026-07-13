-- =============================================================================
-- 01_max_tables.sql
-- =============================================================================
-- ZWECK
--   Die drei Tabellen, auf denen Max aufbaut. Rekonstruiert aus der
--   Produktions-DB (information_schema, 13.07.2026) — sie wurden urspruenglich
--   nur per SQL-Editor angelegt und existierten in KEINER Repo-Datei.
--
-- ALLES IST "IF NOT EXISTS" / "ADD COLUMN IF NOT EXISTS"
--   Diese Datei kann gefahrlos gegen die laufende DB ausgefuehrt werden.
--   Sie legt nichts neu an, was schon da ist, und loescht nichts.
--
-- WOFUER DIE DREI TABELLEN DA SIND
--   max_actions          — das PROTOKOLL. Jeder Vorgang von Max landet hier,
--                          mit Verlaufskette (details->verlauf) und Status.
--                          Sichtbar im "Max: Aktionen"-Fenster.
--   max_ablaeufe         — die SOLL-VORGABE. Reine Doku in der DB, manuell
--                          gepflegt. STEUERT MAX NICHT. Checkliste, kein Code.
--   assistant_knowledge  — das GEDAECHTNIS. Was Uli Max beibringt
--                          (Tool save_knowledge), landet hier und wird bei
--                          jeder Anfrage in den System-Prompt geladen.
-- =============================================================================


-- =============================================================================
-- max_actions — Protokoll aller Max-Vorgaenge
-- =============================================================================
-- STATUSMODELL (Konvention, nicht per Constraint erzwungen):
--   entwurf | wartet_uli | wartet_provider | wartet_gast | beantwortet
--   | ueberfaellig | abgeschlossen | abgelehnt | problem
--
-- SCHLUESSELFELDER FUER DIE KETTE:
--   related_task_id  -> verbindet den Vorgang mit der Reinigung (service_tasks.id).
--                       Ueber dieses Feld findet der Provider-Reply-Trigger
--                       (12_max_provider_reply.sql) den richtigen Vorgang.
--   waiting_for      -> auf wen wird gewartet ('amela' | 'teuni' | 'uli')
--   due_at           -> Frist. Laeuft sie ab, setzt overdue-watch (Cron 06:15)
--                       den Status auf 'ueberfaellig'.
--   details->verlauf -> JSON-Array der Schritte. DAS ist die Kette, die im
--                       MaxActionsPanel als farbige Pills mit Pfeilen erscheint.

CREATE TABLE IF NOT EXISTS public.max_actions (
  id           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  action_type  text                     NOT NULL,
  status       text                     NOT NULL DEFAULT 'ausgefuehrt',
  booking_id   uuid,
  guest_name   text,
  details      jsonb,
  created_by   text                     NOT NULL DEFAULT 'max',
  created_at   timestamp with time zone NOT NULL DEFAULT now(),
  updated_at   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT max_actions_pkey PRIMARY KEY (id)
);

-- Workflow-Spalten (nachtraeglich ergaenzt 10.07.2026)
ALTER TABLE public.max_actions ADD COLUMN IF NOT EXISTS related_task_id uuid;
ALTER TABLE public.max_actions ADD COLUMN IF NOT EXISTS last_step       text;
ALTER TABLE public.max_actions ADD COLUMN IF NOT EXISTS waiting_for     text;
ALTER TABLE public.max_actions ADD COLUMN IF NOT EXISTS due_at          timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_max_actions_related_task ON public.max_actions (related_task_id);
CREATE INDEX IF NOT EXISTS idx_max_actions_booking      ON public.max_actions (booking_id);
CREATE INDEX IF NOT EXISTS idx_max_actions_status       ON public.max_actions (status);
CREATE INDEX IF NOT EXISTS idx_max_actions_due_at       ON public.max_actions (due_at);

ALTER TABLE public.max_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "max_actions_admin_all" ON public.max_actions;
CREATE POLICY "max_actions_admin_all" ON public.max_actions
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);


-- =============================================================================
-- max_ablaeufe — Soll-Vorgabe / Checkliste (reine Doku!)
-- =============================================================================
-- ⚠️ DIESE TABELLE STEUERT MAX NICHT.
--    Max' Verhalten steckt im Code (chat-assistant/index.ts, Tool-Definitionen).
--    Diese Tabelle ist eine manuell gepflegte Referenz: "welcher Fall ->
--    welche Funktion". Sie wird im Fenster "Max: Ablaeufe (Kontrolle)" angezeigt
--    und dient dem Abgleich Soll <-> Ist. Nicht mit dem Protokoll verwechseln.
--
--    variante: 'standard' | 'sonderfall_vorhanden' | 'automatik'
--    umsetzung: z.B. 'umgesetzt' | 'offen'  -> die roten Zeilen = Luecken

CREATE TABLE IF NOT EXISTS public.max_ablaeufe (
  id              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  aktion          text                     NOT NULL,
  aktion_label    text                     NOT NULL,
  ausloeser       text,
  variante        text                     NOT NULL DEFAULT 'standard',
  schritt_nr      integer                  NOT NULL,
  akteur          text                     NOT NULL,
  schritt         text                     NOT NULL,
  ergebnis_status text,
  karte           text,
  umsetzung       text,
  notiz           text,
  funktion        text,   -- Tool / Edge Function, die diesen Schritt ausfuehrt
  created_at      timestamp with time zone NOT NULL DEFAULT now(),
  updated_at      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT max_ablaeufe_pkey PRIMARY KEY (id)
);

ALTER TABLE public.max_ablaeufe ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "max_ablaeufe_admin_all" ON public.max_ablaeufe;
CREATE POLICY "max_ablaeufe_admin_all" ON public.max_ablaeufe
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);


-- =============================================================================
-- assistant_knowledge — Max' Gedaechtnis
-- =============================================================================
-- Was Uli Max erklaert, speichert Max hier per Tool 'save_knowledge' (nur nach
-- ausdruecklichem "ja"). Beim Aufbau des System-Prompts wird der Inhalt als
-- Block "GELERNTES WISSEN" eingesetzt.
--
-- WICHTIG ZUM VERSTAENDNIS: Das ist KEIN Fine-Tuning. Das Modell (Gemini 2.5
-- Flash) bleibt unveraendert. "Lernen" heisst hier: der Code setzt bei jeder
-- Anfrage frischen Text aus dieser Tabelle in den Prompt ein.
--
-- Der Unique-Index verhindert Dubletten desselben Begriffs (nur fuer aktive
-- Eintraege — ein deaktivierter Begriff blockiert einen neuen nicht).

CREATE TABLE IF NOT EXISTS public.assistant_knowledge (
  id         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  term       text                     NOT NULL,
  meaning    text                     NOT NULL,
  category   text                     NOT NULL DEFAULT 'sonstiges',
  is_active  boolean                  NOT NULL DEFAULT true,
  created_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT assistant_knowledge_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_knowledge_term_active
  ON public.assistant_knowledge (lower(term))
  WHERE is_active;

ALTER TABLE public.assistant_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assistant_knowledge_admin_all" ON public.assistant_knowledge;
CREATE POLICY "assistant_knowledge_admin_all" ON public.assistant_knowledge
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- updated_at automatisch pflegen
CREATE OR REPLACE FUNCTION public.set_assistant_knowledge_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_assistant_knowledge_updated_at ON public.assistant_knowledge;

CREATE TRIGGER trg_assistant_knowledge_updated_at
  BEFORE UPDATE ON public.assistant_knowledge
  FOR EACH ROW
  EXECUTE FUNCTION public.set_assistant_knowledge_updated_at();
