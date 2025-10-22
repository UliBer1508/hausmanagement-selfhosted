-- Entferne den alten unique_house_date Constraint (nicht Index)
ALTER TABLE public.daily_pricing 
DROP CONSTRAINT IF EXISTS unique_house_date;