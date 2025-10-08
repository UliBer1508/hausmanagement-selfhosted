-- Create email_templates table
CREATE TABLE email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text UNIQUE NOT NULL,
  name text NOT NULL,
  subject text NOT NULL,
  content text NOT NULL,
  is_system boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create index on template_key for faster lookups
CREATE INDEX idx_email_templates_key ON email_templates(template_key);

-- Create trigger for updated_at
CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default email templates
INSERT INTO email_templates (template_key, name, subject, content, is_system) VALUES
('welcome', 'Willkommens-E-Mail', 'Willkommen in den Steinbock Chalets!', 'Liebe/r {guestName},

herzlich willkommen! Wir freuen uns sehr, Sie bald in unseren Steinbock Chalets begrüßen zu dürfen.

📅 Ihre Buchungsdetails:
• Check-in: Ab 15:00 Uhr
• Check-out: Bis 10:00 Uhr
• Parkplätze stehen kostenfrei zur Verfügung

🏔️ Tipps für Ihren Aufenthalt:
• Die Region bietet zahlreiche Wanderwege und Ausflugsziele
• Gerne helfen wir Ihnen bei der Planung Ihrer Aktivitäten
• In der Nähe finden Sie ausgezeichnete Restaurants

📞 Bei Fragen erreichen Sie uns jederzeit:
Tel: +43 123 456 789
E-Mail: info@steinbock-chalets.at

Wir wünschen Ihnen schon jetzt einen wunderschönen Aufenthalt!

Herzliche Grüße
Ihr Steinbock Chalets Team', true),

('reminder', 'Check-in Erinnerung', 'Ihr Aufenthalt bei uns beginnt bald!', 'Liebe/r {guestName},

in Kürze ist es soweit - Ihr Aufenthalt in den Steinbock Chalets beginnt!

⏰ Check-in Informationen:
• Check-in ab: 15:00 Uhr
• Adresse: [Adresse des Chalets]
• Parkplätze: Direkt am Haus verfügbar

📋 Bitte mitbringen:
• Personalausweis/Reisepass
• Buchungsbestätigung

🗝️ Schlüsselübergabe:
[Details zur Schlüsselübergabe]

☀️ Wetter-Tipp:
Schauen Sie vor Ihrer Anreise nach dem aktuellen Wetter, um optimal packen zu können.

Bei Fragen oder Verspätungen melden Sie sich gerne:
Tel: +43 123 456 789

Wir freuen uns auf Sie!
Ihr Steinbock Chalets Team', true),

('feedback', 'Feedback-Anfrage', 'Wie war Ihr Aufenthalt bei uns?', 'Liebe/r {guestName},

wir hoffen, Sie hatten einen wunderschönen Aufenthalt in den Steinbock Chalets!

Ihre Meinung ist uns sehr wichtig und hilft uns, unseren Service stetig zu verbessern.

⭐ Würden Sie uns kurz mitteilen:
• Wie hat Ihnen Ihr Chalet gefallen?
• War alles sauber und vollständig?
• Gab es etwas, das wir verbessern können?
• Würden Sie uns weiterempfehlen?

Über eine Bewertung auf [Plattform] würden wir uns sehr freuen!

Als kleines Dankeschön erhalten Sie bei Ihrer nächsten Buchung 10% Rabatt.

Vielen Dank für Ihr Vertrauen und bis bald in den Bergen!

Herzliche Grüße
Ihr Steinbock Chalets Team', true),

('returner', 'Stammkunden-Angebot', 'Willkommen zurück - Exklusives Angebot für Sie!', 'Liebe/r {guestName},

wie schön, dass Sie wieder bei uns waren!

Als geschätzter Stammgast möchten wir uns bei Ihnen bedanken:

🎁 Ihr exklusives Angebot:
• 15% Rabatt auf Ihre nächste Buchung
• Kostenloser Late Check-out (nach Verfügbarkeit)
• Kleine Willkommensüberraschung im Chalet

Dieses Angebot ist gültig bis [Datum] und kann mit dem Code RETURNER15 eingelöst werden.

Wir haben auch wieder neue Aktivitäten und Ausflugstipps für Sie zusammengestellt. Sprechen Sie uns einfach an!

Es würde uns sehr freuen, Sie bald wieder begrüßen zu dürfen.

Herzliche Grüße aus den Bergen
Ihr Steinbock Chalets Team

P.S.: Folgen Sie uns auf Instagram @steinbock_chalets für aktuelle Einblicke und Angebote!', true),

('general', 'Allgemeine Nachricht', 'Nachricht von Steinbock Chalets', 'Liebe/r {guestName},

[Ihre persönliche Nachricht hier]

Bei Fragen oder Anliegen stehen wir Ihnen gerne zur Verfügung:
Tel: +43 123 456 789
E-Mail: info@steinbock-chalets.at

Herzliche Grüße
Ihr Steinbock Chalets Team', true);