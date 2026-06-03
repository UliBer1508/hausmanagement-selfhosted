## Plan: Enable RLS on Three Cache Tables

### Goal
Create a single Supabase migration that enables Row Level Security on the three non-critical cache tables: `weather_cache`, `route_cache`, and `activity_cache`.

### Migration SQL
The migration will run this exact pattern for each table:
1. Drop any existing policy with the same name (idempotent)
2. Enable RLS on the table
3. Create a permissive policy granting full access to authenticated users

### Scope Constraints
- **Only** these three tables are touched
- No `anon` role policies are added
- No application code changes
- No other tables are modified

### Tables Verified
All three tables exist in the database:
- `public.weather_cache`
- `public.route_cache`
- `public.activity_cache`

### Post-Migration Impact
- Authenticated admin users retain full read/write access via the permissive policy
- Edge Functions using `service_role` key bypass RLS (unchanged behavior)
- No anonymous access is granted