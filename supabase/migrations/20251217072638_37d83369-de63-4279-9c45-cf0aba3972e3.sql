-- Create marketing_actions table for tracking marketing campaigns
CREATE TABLE public.marketing_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  target_criteria JSONB NOT NULL DEFAULT '{}',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create booking_action_tracking table for tracking which bookings received which actions
CREATE TABLE public.booking_action_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  action_id UUID NOT NULL REFERENCES public.marketing_actions(id) ON DELETE CASCADE,
  action_applied BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(booking_id, action_id)
);

-- Create indexes for performance
CREATE INDEX idx_marketing_actions_status ON public.marketing_actions(status);
CREATE INDEX idx_booking_action_tracking_booking ON public.booking_action_tracking(booking_id);
CREATE INDEX idx_booking_action_tracking_action ON public.booking_action_tracking(action_id);

-- Create trigger for updated_at on marketing_actions
CREATE OR REPLACE FUNCTION public.update_marketing_actions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_marketing_actions_updated_at
  BEFORE UPDATE ON public.marketing_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_marketing_actions_updated_at();

-- Add comment for documentation
COMMENT ON TABLE public.marketing_actions IS 'Stores marketing actions/campaigns with target criteria for guest segments';
COMMENT ON TABLE public.booking_action_tracking IS 'Tracks which marketing actions were applied to which bookings';