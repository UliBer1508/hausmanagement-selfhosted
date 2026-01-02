-- Wald Chalet: Farbe auf 'colorful' setzen
UPDATE linen_orders lo
SET linen_color = 'colorful'
FROM houses h
WHERE lo.house_id = h.id
  AND h.name = 'Wald Chalet'
  AND lo.status IN ('offen', 'bestellt', 'ausstehend');

-- Venedigersiedlung: Farbe auf 'grey_striped' setzen
UPDATE linen_orders lo
SET linen_color = 'grey_striped'
FROM houses h
WHERE lo.house_id = h.id
  AND h.name = 'Venedigersiedlung Chalet'
  AND lo.status IN ('offen', 'bestellt', 'ausstehend');