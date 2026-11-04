-- IT Support Portal: private, non-persistent staff-to-IT chat
-- Run after supabase-notifications-and-management.sql.
-- Messages are delivered with Realtime Broadcast and are never written to a table.

DROP POLICY IF EXISTS "Active chat participants can receive support messages" ON realtime.messages;
CREATE POLICY "Active chat participants can receive support messages"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    realtime.topic() ~ '^support-chat-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (
      EXISTS (
        SELECT 1
        FROM public.profiles AS staff
        WHERE staff.id = (SELECT auth.uid())
          AND staff.role = 'staff'
          AND staff.is_active
          AND NOT staff.is_pending
          AND realtime.topic() = 'support-chat-' || staff.id::text
      )
      OR (
        EXISTS (
          SELECT 1
          FROM public.profiles AS admin
          WHERE admin.id = (SELECT auth.uid())
            AND admin.role = 'it_admin'
            AND admin.is_active
            AND NOT admin.is_pending
        )
        AND EXISTS (
          SELECT 1
          FROM public.profiles AS target
          WHERE target.id::text = substring(realtime.topic() FROM '^support-chat-(.*)$')
            AND target.role = 'staff'
            AND target.is_active
            AND NOT target.is_pending
        )
      )
    )
  );

DROP POLICY IF EXISTS "Active chat participants can send support messages" ON realtime.messages;
CREATE POLICY "Active chat participants can send support messages"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (
    realtime.topic() ~ '^support-chat-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (
      EXISTS (
        SELECT 1
        FROM public.profiles AS staff
        WHERE staff.id = (SELECT auth.uid())
          AND staff.role = 'staff'
          AND staff.is_active
          AND NOT staff.is_pending
          AND realtime.topic() = 'support-chat-' || staff.id::text
      )
      OR (
        EXISTS (
          SELECT 1
          FROM public.profiles AS admin
          WHERE admin.id = (SELECT auth.uid())
            AND admin.role = 'it_admin'
            AND admin.is_active
            AND NOT admin.is_pending
        )
        AND EXISTS (
          SELECT 1
          FROM public.profiles AS target
          WHERE target.id::text = substring(realtime.topic() FROM '^support-chat-(.*)$')
            AND target.role = 'staff'
            AND target.is_active
            AND NOT target.is_pending
        )
      )
    )
  );
