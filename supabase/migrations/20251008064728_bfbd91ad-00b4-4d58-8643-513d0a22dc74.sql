-- Deaktiviere RLS temporär für Entwicklung (wie vom Benutzer gewünscht)
-- Wichtig: Vor Produktivgang wieder aktivieren und Policies erstellen!

ALTER TABLE bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE houses DISABLE ROW LEVEL SECURITY;
ALTER TABLE service_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE laundry_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates DISABLE ROW LEVEL SECURITY;