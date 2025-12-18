-- Fehlende NK-Kategorien nach BetrKV hinzufügen
INSERT INTO utility_cost_categories (name, description, default_distribution_key, is_system, is_active)
VALUES 
  ('Allgemeinstrom', 'Kosten für Strom in Gemeinschaftsflächen (Treppenhaus, Keller, Außenanlagen)', 'wohnflaeche', true, true),
  ('Winterdienst', 'Kosten für Schneeräumung und Streudienst', 'wohnflaeche', true, true),
  ('Waschraum', 'Kosten der Gemeinschaftswaschküche', 'personen', true, true),
  ('Wartung/Prüfungen', 'Kosten für Feuerlöscher, Rauchwarnmelder und andere Sicherheitsprüfungen', 'einheiten', true, true),
  ('Dachrinnenreinigung', 'Kosten für Reinigung der Dachrinnen und Fallrohre', 'wohnflaeche', true, true);