-- Säubere etwaige Duplikate, sonst schlägt der Unique-Index fehl
DELETE FROM public.daily_pricing a
USING public.daily_pricing b
WHERE a.ctid < b.ctid
  AND a.house_id IS NOT NULL
  AND a.house_id = b.house_id
  AND a.date = b.date;

-- Partieller Unique-Index, da house_id NULL sein darf (Competitor-Zeilen)
CREATE UNIQUE INDEX IF NOT EXISTS unique_house_date
  ON public.daily_pricing (house_id, date)
  WHERE house_id IS NOT NULL;