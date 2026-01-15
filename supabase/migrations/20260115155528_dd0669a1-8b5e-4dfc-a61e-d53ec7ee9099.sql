UPDATE system_settings 
SET value = '{"email": "steinbockchalets@gmail.com"}'::jsonb,
    updated_at = now()
WHERE key = 'usage_report_email';