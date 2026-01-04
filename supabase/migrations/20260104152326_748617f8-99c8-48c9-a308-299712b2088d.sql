-- =====================================================
-- DUPLIKAT-BEREINIGUNG: 4 Gruppen mit 11 Einträgen -> 4 verbleiben
-- =====================================================

-- 1. NATHALIE HOLLE (behalte a0947f3b - hat Email + Phone + 1 Buchung)
-- Die anderen 2 haben keine Buchungen, also nur löschen
DELETE FROM guests WHERE id IN (
  '5b969678-85e6-4671-b781-82d315d9786b', 
  'ce4b6cb9-0664-41ea-b456-cae974c6c704'
);

-- 2. CHRISTIAAN VAN DER HORST (behalte 02492b0e - hat 1 Buchung)
-- Die anderen 2 haben keine Buchungen
DELETE FROM guests WHERE id IN (
  'cef95d7e-57a9-4a4b-8935-ca52a2e0a743', 
  '9cbe2c01-df8b-40f4-a82c-2f632cdea359'
);

-- 3. HENNING FUCHS (behalte 7684e610 - hat 1 Buchung)
-- Die anderen 2 haben keine Buchungen
DELETE FROM guests WHERE id IN (
  '8a238d92-ddde-4013-9077-df0c2c2c52ca', 
  'f121ef9c-574d-4380-b5e2-d877e868bc23'
);

-- 4. MAXIMILIAN HERR (behalte 2bc23864 - hat 1 Buchung)
-- Der andere hat keine Buchung
DELETE FROM guests WHERE id = '445540a8-618b-4f2b-a132-7e4c0d806866';