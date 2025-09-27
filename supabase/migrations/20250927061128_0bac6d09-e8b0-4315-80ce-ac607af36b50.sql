-- Disable Row Level Security for ai_linen_settings table
ALTER TABLE public.ai_linen_settings DISABLE ROW LEVEL SECURITY;

-- Drop existing RLS policies (they're no longer needed)
DROP POLICY IF EXISTS "Users can view AI settings for all houses" ON public.ai_linen_settings;
DROP POLICY IF EXISTS "Users can insert AI settings for houses" ON public.ai_linen_settings;
DROP POLICY IF EXISTS "Users can update AI settings for houses" ON public.ai_linen_settings;
DROP POLICY IF EXISTS "Users can delete AI settings for houses" ON public.ai_linen_settings;