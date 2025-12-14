-- Insert default settings if not exist
INSERT INTO system_settings (key, value) 
VALUES 
  ('email_settings', '{"email": "steinbockchalets@gmail.com", "display_name": "Steinbock Chalets"}'::jsonb),
  ('profile_settings', '{"user_name": "Uli Berresheim", "company_name": "Steinbock Chalets"}'::jsonb),
  ('appearance_settings', '{"theme": "light", "language": "de", "compact_view": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;