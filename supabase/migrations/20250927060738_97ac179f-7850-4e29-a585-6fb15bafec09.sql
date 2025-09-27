-- Create AI Linen Settings table for storing KI configuration per house
CREATE TABLE public.ai_linen_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  house_id UUID NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  lookahead_bookings INTEGER NOT NULL DEFAULT 3,
  safety_buffer DECIMAL(3,2) NOT NULL DEFAULT 1.20,
  max_storage_ratio DECIMAL(3,2) NOT NULL DEFAULT 1.50,
  reorder_threshold DECIMAL(3,2) NOT NULL DEFAULT 0.80,
  seasonal_factor BOOLEAN NOT NULL DEFAULT false,
  prices JSONB NOT NULL DEFAULT '{
    "bedding": 30,
    "large_towels": 18,
    "small_towels": 10,
    "bath_mats": 15,
    "sink_towels": 8,
    "sauna_towels": 20
  }'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(house_id)
);

-- Enable Row Level Security
ALTER TABLE public.ai_linen_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view AI settings for all houses" 
ON public.ai_linen_settings 
FOR SELECT 
USING (true);

CREATE POLICY "Users can insert AI settings for houses" 
ON public.ai_linen_settings 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can update AI settings for houses" 
ON public.ai_linen_settings 
FOR UPDATE 
USING (true);

CREATE POLICY "Users can delete AI settings for houses" 
ON public.ai_linen_settings 
FOR DELETE 
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_ai_linen_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_ai_linen_settings_updated_at
BEFORE UPDATE ON public.ai_linen_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_ai_linen_settings_updated_at();