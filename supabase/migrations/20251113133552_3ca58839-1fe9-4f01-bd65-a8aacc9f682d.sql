-- Füge property_type und rental_type Spalten zur houses Tabelle hinzu
ALTER TABLE houses
ADD COLUMN property_type TEXT DEFAULT 'house' 
  CHECK (property_type IN ('house', 'apartment', 'studio', 'other')),
ADD COLUMN rental_type TEXT DEFAULT 'tourist' 
  CHECK (rental_type IN ('tourist', 'long_term'));

-- Kommentar für bessere Dokumentation
COMMENT ON COLUMN houses.property_type IS 'Art der Immobilie: house (Haus), apartment (Wohnung), studio (Studio), other (Sonstige)';
COMMENT ON COLUMN houses.rental_type IS 'Vermietungsart: tourist (Touristische Vermietung), long_term (Festvermietung)';