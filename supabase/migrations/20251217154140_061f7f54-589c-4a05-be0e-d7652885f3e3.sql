-- =====================================================
-- PHASE 2: JSONB-Felder Normalisierung für volle 3NF
-- =====================================================

-- 1. HOUSE_LINEN_INVENTORY: Konsolidiert alle Wäsche-Status-Felder
-- Ersetzt: linen_stock, ordered_linen, linen_in_use, linen_dirty, linen_in_cleaning, linen_reserved
CREATE TABLE IF NOT EXISTS public.house_linen_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    house_id UUID NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
    item_key TEXT NOT NULL, -- bedding, large_towels, small_towels, etc.
    status TEXT NOT NULL DEFAULT 'stock' CHECK (status IN ('stock', 'ordered', 'in_use', 'dirty', 'in_cleaning', 'reserved')),
    quantity INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(house_id, item_key, status)
);

CREATE INDEX idx_house_linen_inventory_house_id ON public.house_linen_inventory(house_id);
CREATE INDEX idx_house_linen_inventory_status ON public.house_linen_inventory(status);

-- 2. HOUSE_ADDITIONAL_FEES: Plattform-spezifische Nebenkosten
-- Ersetzt: additional_fees JSONB
CREATE TABLE IF NOT EXISTS public.house_additional_fees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    house_id UUID NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
    platform TEXT NOT NULL DEFAULT 'default' CHECK (platform IN ('default', 'airbnb', 'booking_com', 'vrbo', 'belvilla', 'direct')),
    service_fee_per_stay NUMERIC(10,2) DEFAULT 0,
    tourist_tax_per_night NUMERIC(10,2) DEFAULT 2.50,
    cleaning_fee_per_stay NUMERIC(10,2) DEFAULT 80,
    electricity_fee_per_stay NUMERIC(10,2) DEFAULT 40,
    linen_fee_per_stay NUMERIC(10,2) DEFAULT 30,
    vat_percentage NUMERIC(5,2) DEFAULT 19,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(house_id, platform)
);

CREATE INDEX idx_house_additional_fees_house_id ON public.house_additional_fees(house_id);

-- 3. HOUSE_AMENITIES: Ausstattungsmerkmale
-- Ersetzt: amenities JSONB
CREATE TABLE IF NOT EXISTS public.house_amenities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    house_id UUID NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
    amenity_key TEXT NOT NULL,
    value_boolean BOOLEAN,
    value_integer INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(house_id, amenity_key)
);

CREATE INDEX idx_house_amenities_house_id ON public.house_amenities(house_id);

-- =====================================================
-- DATENMIGRATION: Bestehende JSONB-Daten in neue Tabellen
-- =====================================================

-- Migration: linen_stock → house_linen_inventory (status='stock')
INSERT INTO public.house_linen_inventory (house_id, item_key, status, quantity)
SELECT 
    h.id,
    item.key,
    'stock',
    COALESCE((item.value)::integer, 0)
FROM public.houses h,
LATERAL jsonb_each_text(COALESCE(h.linen_stock, '{}'::jsonb)) AS item(key, value)
WHERE (item.value)::integer > 0 OR item.key IS NOT NULL
ON CONFLICT (house_id, item_key, status) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Migration: ordered_linen → house_linen_inventory (status='ordered')
INSERT INTO public.house_linen_inventory (house_id, item_key, status, quantity)
SELECT 
    h.id,
    item.key,
    'ordered',
    COALESCE((item.value)::integer, 0)
FROM public.houses h,
LATERAL jsonb_each_text(COALESCE(h.ordered_linen, '{}'::jsonb)) AS item(key, value)
WHERE (item.value)::integer > 0
ON CONFLICT (house_id, item_key, status) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Migration: linen_in_use → house_linen_inventory (status='in_use')
INSERT INTO public.house_linen_inventory (house_id, item_key, status, quantity)
SELECT 
    h.id,
    item.key,
    'in_use',
    COALESCE((item.value)::integer, 0)
FROM public.houses h,
LATERAL jsonb_each_text(COALESCE(h.linen_in_use, '{}'::jsonb)) AS item(key, value)
WHERE (item.value)::integer > 0
ON CONFLICT (house_id, item_key, status) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Migration: linen_dirty → house_linen_inventory (status='dirty')
INSERT INTO public.house_linen_inventory (house_id, item_key, status, quantity)
SELECT 
    h.id,
    item.key,
    'dirty',
    COALESCE((item.value)::integer, 0)
FROM public.houses h,
LATERAL jsonb_each_text(COALESCE(h.linen_dirty, '{}'::jsonb)) AS item(key, value)
WHERE (item.value)::integer > 0
ON CONFLICT (house_id, item_key, status) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Migration: linen_in_cleaning → house_linen_inventory (status='in_cleaning')
INSERT INTO public.house_linen_inventory (house_id, item_key, status, quantity)
SELECT 
    h.id,
    item.key,
    'in_cleaning',
    COALESCE((item.value)::integer, 0)
FROM public.houses h,
LATERAL jsonb_each_text(COALESCE(h.linen_in_cleaning, '{}'::jsonb)) AS item(key, value)
WHERE (item.value)::integer > 0
ON CONFLICT (house_id, item_key, status) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Migration: linen_reserved → house_linen_inventory (status='reserved')
INSERT INTO public.house_linen_inventory (house_id, item_key, status, quantity)
SELECT 
    h.id,
    item.key,
    'reserved',
    COALESCE((item.value)::integer, 0)
FROM public.houses h,
LATERAL jsonb_each_text(COALESCE(h.linen_reserved, '{}'::jsonb)) AS item(key, value)
WHERE (item.value)::integer > 0
ON CONFLICT (house_id, item_key, status) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Migration: additional_fees (flache Struktur) → house_additional_fees
INSERT INTO public.house_additional_fees (house_id, platform, service_fee_per_stay, tourist_tax_per_night, cleaning_fee_per_stay, electricity_fee_per_stay, linen_fee_per_stay, vat_percentage)
SELECT 
    h.id,
    'default',
    COALESCE((h.additional_fees->>'service_fee_per_stay')::numeric, 0),
    COALESCE((h.additional_fees->>'tourist_tax_per_night')::numeric, 2.50),
    COALESCE((h.additional_fees->>'cleaning_fee_per_stay')::numeric, 80),
    COALESCE((h.additional_fees->>'electricity_fee_per_stay')::numeric, 40),
    COALESCE((h.additional_fees->>'linen_fee_per_stay')::numeric, 30),
    COALESCE((h.additional_fees->>'vat_percentage')::numeric, 19)
FROM public.houses h
WHERE h.additional_fees IS NOT NULL 
  AND h.additional_fees ? 'cleaning_fee_per_stay'
  AND NOT (h.additional_fees ? 'airbnb')
ON CONFLICT (house_id, platform) DO UPDATE SET
    service_fee_per_stay = EXCLUDED.service_fee_per_stay,
    tourist_tax_per_night = EXCLUDED.tourist_tax_per_night,
    cleaning_fee_per_stay = EXCLUDED.cleaning_fee_per_stay,
    electricity_fee_per_stay = EXCLUDED.electricity_fee_per_stay,
    linen_fee_per_stay = EXCLUDED.linen_fee_per_stay,
    vat_percentage = EXCLUDED.vat_percentage;

-- Migration: additional_fees (verschachtelte Struktur mit airbnb/booking_com)
INSERT INTO public.house_additional_fees (house_id, platform, service_fee_per_stay, tourist_tax_per_night, cleaning_fee_per_stay, electricity_fee_per_stay, linen_fee_per_stay, vat_percentage)
SELECT 
    h.id,
    'airbnb',
    COALESCE((h.additional_fees->'airbnb'->>'service_fee_per_stay')::numeric, 0),
    COALESCE((h.additional_fees->'airbnb'->>'tourist_tax_per_night')::numeric, 2.50),
    COALESCE((h.additional_fees->'airbnb'->>'cleaning_fee_per_stay')::numeric, 80),
    COALESCE((h.additional_fees->'airbnb'->>'electricity_fee_per_stay')::numeric, 40),
    COALESCE((h.additional_fees->'airbnb'->>'linen_fee_per_stay')::numeric, 30),
    COALESCE((h.additional_fees->'airbnb'->>'vat_percentage')::numeric, 19)
FROM public.houses h
WHERE h.additional_fees ? 'airbnb'
ON CONFLICT (house_id, platform) DO UPDATE SET
    service_fee_per_stay = EXCLUDED.service_fee_per_stay,
    tourist_tax_per_night = EXCLUDED.tourist_tax_per_night,
    cleaning_fee_per_stay = EXCLUDED.cleaning_fee_per_stay,
    electricity_fee_per_stay = EXCLUDED.electricity_fee_per_stay,
    linen_fee_per_stay = EXCLUDED.linen_fee_per_stay,
    vat_percentage = EXCLUDED.vat_percentage;

INSERT INTO public.house_additional_fees (house_id, platform, service_fee_per_stay, tourist_tax_per_night, cleaning_fee_per_stay, electricity_fee_per_stay, linen_fee_per_stay, vat_percentage)
SELECT 
    h.id,
    'booking_com',
    COALESCE((h.additional_fees->'booking_com'->>'service_fee_per_stay')::numeric, 0),
    COALESCE((h.additional_fees->'booking_com'->>'tourist_tax_per_night')::numeric, 2.50),
    COALESCE((h.additional_fees->'booking_com'->>'cleaning_fee_per_stay')::numeric, 80),
    COALESCE((h.additional_fees->'booking_com'->>'electricity_fee_per_stay')::numeric, 40),
    COALESCE((h.additional_fees->'booking_com'->>'linen_fee_per_stay')::numeric, 30),
    COALESCE((h.additional_fees->'booking_com'->>'vat_percentage')::numeric, 19)
FROM public.houses h
WHERE h.additional_fees ? 'booking_com'
ON CONFLICT (house_id, platform) DO UPDATE SET
    service_fee_per_stay = EXCLUDED.service_fee_per_stay,
    tourist_tax_per_night = EXCLUDED.tourist_tax_per_night,
    cleaning_fee_per_stay = EXCLUDED.cleaning_fee_per_stay,
    electricity_fee_per_stay = EXCLUDED.electricity_fee_per_stay,
    linen_fee_per_stay = EXCLUDED.linen_fee_per_stay,
    vat_percentage = EXCLUDED.vat_percentage;

-- Migration: amenities → house_amenities
INSERT INTO public.house_amenities (house_id, amenity_key, value_boolean, value_integer)
SELECT 
    h.id,
    item.key,
    CASE 
        WHEN item.value = 'true' THEN true
        WHEN item.value = 'false' THEN false
        ELSE NULL
    END,
    CASE 
        WHEN item.value ~ '^\d+$' THEN item.value::integer
        ELSE NULL
    END
FROM public.houses h,
LATERAL jsonb_each_text(COALESCE(h.amenities, '{}'::jsonb)) AS item(key, value)
WHERE item.key IS NOT NULL
ON CONFLICT (house_id, amenity_key) DO UPDATE SET
    value_boolean = EXCLUDED.value_boolean,
    value_integer = EXCLUDED.value_integer;

-- =====================================================
-- TRIGGER: Sync neue Tabellen → JSONB (Abwärtskompatibilität)
-- =====================================================

-- Trigger-Funktion: house_linen_inventory → houses.linen_stock etc.
CREATE OR REPLACE FUNCTION public.sync_linen_inventory_to_houses()
RETURNS TRIGGER AS $$
DECLARE
    target_house_id UUID;
    status_column TEXT;
BEGIN
    -- Bestimme house_id basierend auf Operation
    IF TG_OP = 'DELETE' THEN
        target_house_id := OLD.house_id;
    ELSE
        target_house_id := NEW.house_id;
    END IF;

    -- Aktualisiere alle JSONB-Felder für dieses Haus
    UPDATE public.houses SET
        linen_stock = COALESCE((
            SELECT jsonb_object_agg(item_key, quantity)
            FROM public.house_linen_inventory
            WHERE house_id = target_house_id AND status = 'stock'
        ), '{}'::jsonb),
        ordered_linen = COALESCE((
            SELECT jsonb_object_agg(item_key, quantity)
            FROM public.house_linen_inventory
            WHERE house_id = target_house_id AND status = 'ordered'
        ), '{}'::jsonb),
        linen_in_use = COALESCE((
            SELECT jsonb_object_agg(item_key, quantity)
            FROM public.house_linen_inventory
            WHERE house_id = target_house_id AND status = 'in_use'
        ), '{}'::jsonb),
        linen_dirty = COALESCE((
            SELECT jsonb_object_agg(item_key, quantity)
            FROM public.house_linen_inventory
            WHERE house_id = target_house_id AND status = 'dirty'
        ), '{}'::jsonb),
        linen_in_cleaning = COALESCE((
            SELECT jsonb_object_agg(item_key, quantity)
            FROM public.house_linen_inventory
            WHERE house_id = target_house_id AND status = 'in_cleaning'
        ), '{}'::jsonb),
        linen_reserved = COALESCE((
            SELECT jsonb_object_agg(item_key, quantity)
            FROM public.house_linen_inventory
            WHERE house_id = target_house_id AND status = 'reserved'
        ), '{}'::jsonb),
        updated_at = now()
    WHERE id = target_house_id;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger-Funktion: house_additional_fees → houses.additional_fees
CREATE OR REPLACE FUNCTION public.sync_additional_fees_to_houses()
RETURNS TRIGGER AS $$
DECLARE
    target_house_id UUID;
    fees_json JSONB;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_house_id := OLD.house_id;
    ELSE
        target_house_id := NEW.house_id;
    END IF;

    -- Baue JSONB-Struktur mit allen Plattformen
    SELECT jsonb_object_agg(
        platform,
        jsonb_build_object(
            'service_fee_per_stay', service_fee_per_stay,
            'tourist_tax_per_night', tourist_tax_per_night,
            'cleaning_fee_per_stay', cleaning_fee_per_stay,
            'electricity_fee_per_stay', electricity_fee_per_stay,
            'linen_fee_per_stay', linen_fee_per_stay,
            'vat_percentage', vat_percentage
        )
    ) INTO fees_json
    FROM public.house_additional_fees
    WHERE house_id = target_house_id;

    UPDATE public.houses SET
        additional_fees = COALESCE(fees_json, '{}'::jsonb),
        updated_at = now()
    WHERE id = target_house_id;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger-Funktion: house_amenities → houses.amenities
CREATE OR REPLACE FUNCTION public.sync_amenities_to_houses()
RETURNS TRIGGER AS $$
DECLARE
    target_house_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_house_id := OLD.house_id;
    ELSE
        target_house_id := NEW.house_id;
    END IF;

    UPDATE public.houses SET
        amenities = COALESCE((
            SELECT jsonb_object_agg(
                amenity_key, 
                COALESCE(value_integer::text, value_boolean::text)::jsonb
            )
            FROM public.house_amenities
            WHERE house_id = target_house_id
        ), '{}'::jsonb),
        updated_at = now()
    WHERE id = target_house_id;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Erstelle Trigger
CREATE TRIGGER sync_linen_inventory_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.house_linen_inventory
    FOR EACH ROW EXECUTE FUNCTION public.sync_linen_inventory_to_houses();

CREATE TRIGGER sync_additional_fees_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.house_additional_fees
    FOR EACH ROW EXECUTE FUNCTION public.sync_additional_fees_to_houses();

CREATE TRIGGER sync_amenities_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.house_amenities
    FOR EACH ROW EXECUTE FUNCTION public.sync_amenities_to_houses();

-- Updated_at Trigger für neue Tabellen
CREATE TRIGGER update_house_linen_inventory_updated_at
    BEFORE UPDATE ON public.house_linen_inventory
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_house_additional_fees_updated_at
    BEFORE UPDATE ON public.house_additional_fees
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();