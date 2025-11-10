-- Create system_settings table for storing admin configuration
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert admin email for usage reports
INSERT INTO system_settings (key, value) 
VALUES ('usage_report_email', '{"email": "uli.berresheim@hotmail.de"}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Create usage_reports table for logging report history
CREATE TABLE IF NOT EXISTS usage_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date TIMESTAMPTZ DEFAULT now(),
  database_size_mb NUMERIC,
  total_rows INTEGER,
  edge_function_calls_estimated INTEGER,
  storage_size_mb NUMERIC,
  recommendation TEXT,
  urgency TEXT CHECK (urgency IN ('none', 'low', 'medium', 'high')),
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable pg_cron and pg_net extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule weekly usage report: Every Monday at 9:00 AM
SELECT cron.schedule(
  'weekly-supabase-usage-report',
  '0 9 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://usblrulkcgucxtkhugck.supabase.co/functions/v1/check-supabase-usage',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzYmxydWxrY2d1Y3h0a2h1Z2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NjI4MDMsImV4cCI6MjA2OTUzODgwM30.yvF7KPN9_xhOidfRzAdiYEJASycMPLbQCoXJyAJObwI"}'::jsonb,
    body := '{"scheduled": true, "trigger": "cron"}'::jsonb
  ) as request_id;
  $$
);