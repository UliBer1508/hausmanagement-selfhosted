-- Etappe 1 (Max-Assistent): 'assistant' als gültigen Absender in provider_messages erlauben.
-- Bisher erlaubte der CHECK-Constraint nur 'admin' und 'provider'.
-- Max schreibt als 'assistant', damit Amela/Teuni klar sehen, dass die Nachricht vom KI-Assistenten kommt.

ALTER TABLE public.provider_messages
  DROP CONSTRAINT IF EXISTS provider_messages_sender_type_check;

ALTER TABLE public.provider_messages
  ADD CONSTRAINT provider_messages_sender_type_check
  CHECK (sender_type IN ('admin', 'provider', 'assistant'));
