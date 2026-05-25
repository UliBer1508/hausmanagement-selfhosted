Migration: EXECUTE-Recht für `public.delete_booking_cascade(uuid)` an `authenticated` und `anon` gewähren, damit der Frontend-Client die Funktion aufrufen kann. Die Funktion bleibt `SECURITY DEFINER` und führt die Cascade-Deletes weiterhin mit Postgres-Rechten aus.

```sql
GRANT EXECUTE ON FUNCTION public.delete_booking_cascade(uuid) TO authenticated, anon;
```