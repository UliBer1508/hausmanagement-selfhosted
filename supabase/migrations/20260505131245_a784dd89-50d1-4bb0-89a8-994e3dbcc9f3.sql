CREATE OR REPLACE FUNCTION public.delete_booking_cascade(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.service_tasks                WHERE booking_id = p_booking_id;
  DELETE FROM public.linen_orders                 WHERE booking_id = p_booking_id;
  DELETE FROM public.guest_preferences            WHERE booking_id = p_booking_id;
  DELETE FROM public.guest_preference_responses   WHERE booking_id = p_booking_id;
  DELETE FROM public.guest_app_sessions           WHERE booking_id = p_booking_id;
  DELETE FROM public.guest_app_events             WHERE booking_id = p_booking_id;
  DELETE FROM public.guest_saved_activities       WHERE booking_id = p_booking_id;
  DELETE FROM public.booking_activities           WHERE booking_id = p_booking_id;
  DELETE FROM public.activity_recommendations     WHERE booking_id = p_booking_id;
  DELETE FROM public.recommendation_feedback      WHERE booking_id = p_booking_id;
  DELETE FROM public.app_reviews                  WHERE booking_id = p_booking_id;
  DELETE FROM public.trip_plans                   WHERE booking_id = p_booking_id;
  DELETE FROM public.saved_trip_plans             WHERE booking_id = p_booking_id;
  DELETE FROM public.ical_preview_edits           WHERE booking_id = p_booking_id;
  DELETE FROM public.blocked_bookings             WHERE booking_id = p_booking_id;
  DELETE FROM public.booking_action_tracking      WHERE booking_id = p_booking_id;

  DELETE FROM public.bookings WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Buchung % nicht gefunden', p_booking_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_booking_cascade(uuid) TO anon, authenticated, service_role;