-- Create RPC function to get actual database size
CREATE OR REPLACE FUNCTION get_database_size()
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT pg_database_size('postgres')::numeric / (1024*1024);
$$;

-- Create RPC function to count all tables in public schema
CREATE OR REPLACE FUNCTION get_all_table_rows()
RETURNS TABLE(table_name text, row_count bigint)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    relname::text,
    n_live_tup
  FROM pg_stat_user_tables
  WHERE schemaname = 'public';
$$;