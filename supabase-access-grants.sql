-- Run this only if the app reports permission denied / 403 errors.
-- These grants do NOT bypass Row Level Security; the policies still control which rows users can access.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.complaints TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_it_admin() TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.notifications TO authenticated;
