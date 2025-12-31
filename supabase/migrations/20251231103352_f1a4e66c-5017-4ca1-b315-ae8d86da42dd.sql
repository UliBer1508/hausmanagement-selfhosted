-- E-Mail-Templates für Buchungsanfragen

-- Bestätigungs-Template (DE)
INSERT INTO email_templates (template_key, name, subject, content, language, is_system)
VALUES (
  'inquiry_confirmed',
  'Buchungsanfrage bestätigt',
  'Ihre Buchungsanfrage wurde bestätigt',
  'Liebe/r {guestName},

vielen Dank für Ihre Buchungsanfrage!

Wir freuen uns, Ihnen mitteilen zu können, dass Ihre Buchung bestätigt wurde:

📅 Zeitraum: {checkIn} - {checkOut}
🏠 Unterkunft: {houseName}
👥 Anzahl Gäste: {guestCount}

Wir freuen uns auf Ihren Besuch!

Mit freundlichen Grüßen',
  'de',
  true
);

-- Absage-Template (DE)
INSERT INTO email_templates (template_key, name, subject, content, language, is_system)
VALUES (
  'inquiry_rejected',
  'Buchungsanfrage nicht verfügbar',
  'Zu Ihrer Buchungsanfrage',
  'Liebe/r {guestName},

vielen Dank für Ihr Interesse an unserem Ferienhaus.

Leider müssen wir Ihnen mitteilen, dass Ihre Anfrage für den gewünschten Zeitraum ({checkIn} - {checkOut}) nicht bestätigt werden kann.

Gerne können Sie uns für alternative Termine kontaktieren.

Mit freundlichen Grüßen',
  'de',
  true
);

-- Bestätigungs-Template (EN)
INSERT INTO email_templates (template_key, name, subject, content, language, is_system)
VALUES (
  'inquiry_confirmed',
  'Booking inquiry confirmed',
  'Your booking inquiry has been confirmed',
  'Dear {guestName},

Thank you for your booking inquiry!

We are pleased to inform you that your booking has been confirmed:

📅 Period: {checkIn} - {checkOut}
🏠 Accommodation: {houseName}
👥 Number of guests: {guestCount}

We look forward to your visit!

Best regards',
  'en',
  true
);

-- Absage-Template (EN)
INSERT INTO email_templates (template_key, name, subject, content, language, is_system)
VALUES (
  'inquiry_rejected',
  'Booking inquiry unavailable',
  'Regarding your booking inquiry',
  'Dear {guestName},

Thank you for your interest in our holiday home.

Unfortunately, we have to inform you that your inquiry for the desired period ({checkIn} - {checkOut}) cannot be confirmed.

Please feel free to contact us for alternative dates.

Best regards',
  'en',
  true
);