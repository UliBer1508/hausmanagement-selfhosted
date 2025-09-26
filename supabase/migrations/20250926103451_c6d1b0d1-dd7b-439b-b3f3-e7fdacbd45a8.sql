-- Add delivery_type field to linen_orders table
ALTER TABLE public.linen_orders 
ADD COLUMN delivery_type text NOT NULL DEFAULT 'delivery' 
CHECK (delivery_type IN ('delivery', 'pickup'));