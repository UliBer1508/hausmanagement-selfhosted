
-- ============================================================
-- 1) guest_app_sessions
-- ============================================================

DROP POLICY IF EXISTS "Anyone can read sessions"        ON public.guest_app_sessions;
DROP POLICY IF EXISTS "Anyone can update their session" ON public.guest_app_sessions;

CREATE POLICY "Authenticated can read sessions"
  ON public.guest_app_sessions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can update sessions"
  ON public.guest_app_sessions
  FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- RPC: Session per session_id lesen (für anon Guest-App)
CREATE OR REPLACE FUNCTION public.get_guest_session(_session_id text)
RETURNS public.guest_app_sessions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.guest_app_sessions
  WHERE session_id = _session_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_guest_session(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_guest_session(text) TO anon, authenticated;

-- RPC: Session-Pflege ohne PII-Overwrite
CREATE OR REPLACE FUNCTION public.touch_guest_session(
  _session_id            text,
  _furthest_step         text    DEFAULT NULL,
  _completed_onboarding  boolean DEFAULT NULL,
  _language              text    DEFAULT NULL,
  _device_type           text    DEFAULT NULL,
  _user_agent            text    DEFAULT NULL,
  _referrer              text    DEFAULT NULL
)
RETURNS public.guest_app_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.guest_app_sessions;
BEGIN
  UPDATE public.guest_app_sessions s
     SET last_activity_at     = now(),
         furthest_step        = COALESCE(_furthest_step,        s.furthest_step),
         completed_onboarding = COALESCE(_completed_onboarding, s.completed_onboarding),
         language             = COALESCE(_language,             s.language),
         device_type          = COALESCE(_device_type,          s.device_type),
         user_agent           = COALESCE(_user_agent,           s.user_agent),
         referrer             = COALESCE(_referrer,             s.referrer),
         updated_at           = now()
   WHERE s.session_id = _session_id
   RETURNING * INTO row;

  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_guest_session(text,text,boolean,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.touch_guest_session(text,text,boolean,text,text,text,text) TO anon, authenticated;


-- ============================================================
-- 2) app_reviews
-- ============================================================

DROP POLICY IF EXISTS "Guests can insert their own reviews" ON public.app_reviews;

CREATE POLICY "Guests can insert reviews for own booking"
  ON public.app_reviews
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    booking_id IS NOT NULL
    AND guest_email IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      LEFT JOIN public.guests g ON g.id = b.guest_id
      WHERE b.id = app_reviews.booking_id
        AND (
          lower(trim(b.guest_email)) = lower(trim(app_reviews.guest_email))
          OR lower(trim(g.email))    = lower(trim(app_reviews.guest_email))
        )
    )
    AND EXISTS (
      SELECT 1
      FROM public.guest_app_sessions s
      WHERE s.booking_id = app_reviews.booking_id
        AND lower(trim(s.guest_email)) = lower(trim(app_reviews.guest_email))
    )
  );
