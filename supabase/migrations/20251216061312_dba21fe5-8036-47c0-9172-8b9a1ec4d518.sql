
-- Schedule daily cron job for automatic linen order creation at 6:00 AM
SELECT cron.schedule(
  'auto-create-linen-orders-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url:='https://usblrulkcgucxtkhugck.supabase.co/functions/v1/auto-create-linen-orders',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzYmxydWxrY2d1Y3h0a2h1Z2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NjI4MDMsImV4cCI6MjA2OTUzODgwM30.yvF7KPN9_xhOidfRzAdiYEJASycMPLbQCoXJyAJObwI"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
