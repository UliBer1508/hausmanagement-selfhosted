ALTER TABLE public.ical_preview_edits
  ALTER COLUMN booking_id TYPE uuid
  USING booking_id::uuid;

ALTER TABLE public.ical_preview_edits
  ADD CONSTRAINT ical_preview_edits_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ical_preview_edits_booking_id
  ON public.ical_preview_edits(booking_id);