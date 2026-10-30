-- IT Support Portal: notifications + realtime + safe policies
-- Run in Supabase SQL Editor after the existing profiles/complaints tables are in place.

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  complaint_id UUID REFERENCES public.complaints(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  notification_type TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
CREATE POLICY "Users view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users mark own notifications read" ON public.notifications;
CREATE POLICY "Users mark own notifications read"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Create a notification for every IT administrator when a complaint is submitted.
CREATE OR REPLACE FUNCTION public.notify_it_admins_of_new_complaint()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  staff_name TEXT;
BEGIN
  SELECT COALESCE(full_name, email, 'A staff member') INTO staff_name
  FROM public.profiles WHERE id = NEW.created_by;

  INSERT INTO public.notifications (user_id, complaint_id, title, message, notification_type)
  SELECT p.id, NEW.id, 'New IT complaint',
    staff_name || ' submitted ' || NEW.ticket_number || ': ' || NEW.title,
    'new_complaint'
  FROM public.profiles p WHERE p.role = 'it_admin';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS complaints_notify_it_admins ON public.complaints;
CREATE TRIGGER complaints_notify_it_admins
AFTER INSERT ON public.complaints
FOR EACH ROW EXECUTE FUNCTION public.notify_it_admins_of_new_complaint();

-- Notify the employee and assigned IT officer when a complaint changes.
CREATE OR REPLACE FUNCTION public.notify_complaint_updates()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor UUID := auth.uid();
  update_text TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    update_text := 'Status changed to ' || replace(NEW.status, '_', ' ');
  ELSIF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    update_text := 'Your complaint has been assigned or reassigned.';
  ELSE
    update_text := 'Your complaint has been updated.';
  END IF;

  INSERT INTO public.notifications (user_id, complaint_id, title, message, notification_type)
  SELECT target_id, NEW.id, 'Complaint update', NEW.ticket_number || ': ' || update_text, 'complaint_update'
  FROM (
    SELECT NEW.created_by AS target_id
    UNION
    SELECT NEW.assigned_to WHERE NEW.assigned_to IS NOT NULL
  ) recipients
  WHERE target_id IS NOT NULL AND (actor IS NULL OR target_id <> actor);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS complaints_notify_updates ON public.complaints;
CREATE TRIGGER complaints_notify_updates
AFTER UPDATE ON public.complaints
FOR EACH ROW EXECUTE FUNCTION public.notify_complaint_updates();

-- Enable Realtime publication for notifications and complaints.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'complaints'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.complaints;
  END IF;
END $$;

-- API grants remain constrained by the RLS policies above.
GRANT SELECT, UPDATE ON TABLE public.notifications TO authenticated;
