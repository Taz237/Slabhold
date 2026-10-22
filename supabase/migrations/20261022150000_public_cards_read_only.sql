-- public_cards is a deliberate SECURITY DEFINER (security_invoker = false) view:
-- cards SELECT RLS is owner-only, and this view is the safe public projection
-- (no paid_price, purchase_date, notes, cert_number, sell_*, acquired_*).
-- Supabase default privileges also granted INSERT/UPDATE/DELETE on it, and as a
-- simple auto-updatable view owned by postgres (BYPASSRLS) those writes skipped
-- the cards RLS. The view is read-only for API roles.
revoke insert, update, delete, truncate, references, trigger
  on public.public_cards from anon, authenticated, public;
grant select on public.public_cards to anon, authenticated;
