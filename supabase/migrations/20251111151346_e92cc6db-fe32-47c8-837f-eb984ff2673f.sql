-- Drop old unique constraint on template_key
ALTER TABLE email_templates 
DROP CONSTRAINT IF EXISTS email_templates_template_key_key;

-- Add language column
ALTER TABLE email_templates 
ADD COLUMN language TEXT NOT NULL DEFAULT 'de';

-- Create index for performance
CREATE INDEX idx_email_templates_language ON email_templates(language);

-- Add new unique constraint on template_key + language
ALTER TABLE email_templates
ADD CONSTRAINT email_templates_template_key_language_unique 
UNIQUE (template_key, language);

-- Insert English template versions
INSERT INTO email_templates (template_key, name, subject, content, language, is_system) VALUES

-- Welcome Email (English)
('welcome', 'Welcome Email', 'Welcome to Steinbock Chalets!', 
'Dear {guestName},

Welcome! We are delighted to have you as our guest at Steinbock Chalets.

📅 Your Booking Details:
• Check-in: From 3:00 PM
• Check-out: Until 10:00 AM
• Free parking available on-site

🏔️ Tips for Your Stay:
• The region offers numerous hiking trails and attractions
• We''re happy to help you plan your activities
• Excellent restaurants can be found nearby

📞 Contact us anytime:
Tel: +43 123 456 789
Email: info@steinbock-chalets.at

We wish you a wonderful stay!

Best regards,
Your Steinbock Chalets Team', 'en', true),

-- Reminder Email (English)
('reminder', 'Check-in Reminder', 'Your stay with us is coming up soon!', 
'Dear {guestName},

Your stay at Steinbock Chalets is just around the corner!

⏰ Check-in Information:
• Check-in from: 3:00 PM
• Address: [Chalet Address]
• Parking: Available directly at the property

📋 Please bring:
• ID card/Passport
• Booking confirmation

🗝️ Key Handover:
[Key handover details]

☀️ Weather Tip:
Check the current weather before your arrival to pack accordingly.

For questions or in case of delays, please contact us:
Tel: +43 123 456 789

Looking forward to welcoming you!
Your Steinbock Chalets Team', 'en', true),

-- Feedback Email (English)
('feedback', 'Feedback Request', 'How was your stay with us?', 
'Dear {guestName},

We hope you had a wonderful stay at Steinbock Chalets!

Your feedback is very important to us and helps us continuously improve our service.

⭐ Would you mind sharing:
• How did you like your chalet?
• Was everything clean and complete?
• Is there anything we could improve?
• Would you recommend us to others?

We would greatly appreciate a review on [Platform]!

As a small thank you, you''ll receive 10% discount on your next booking.

Thank you for your trust, and we hope to see you again in the mountains!

Best regards,
Your Steinbock Chalets Team', 'en', true),

-- General Message (English)
('general', 'General Message', 'Message from Steinbock Chalets', 
'Dear {guestName},

[Your personal message here]

If you have any questions or concerns, please don''t hesitate to contact us:
Tel: +49 15757153466
steinbockchalets@gmail.com

Best regards,
Max', 'en', true),

-- Returner Email (English)
('returner', 'Returning Guest Offer', 'Welcome back - Exclusive offer for you!', 
'Dear {guestName},

How wonderful that you stayed with us again!

As a valued returning guest, we would like to thank you:

🎁 Your Exclusive Offer:
• 15% discount on your next booking
• Free late check-out (subject to availability)
• Small welcome surprise in your chalet

This offer is valid until [Date] and can be redeemed with code RETURNER15.

We''ve also compiled new activities and excursion tips for you. Just ask us!

We would be delighted to welcome you back soon.

Warm regards from the mountains,
Your Steinbock Chalets Team

P.S.: Follow us on Instagram @steinbock_chalets for updates and special offers!', 'en', true);