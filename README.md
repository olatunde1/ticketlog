# IT Support Desk — React + Tailwind + Supabase

Internal IT complaint portal for staff and IT administrators.

## Requirements
- Node.js 22.12+ recommended
- npm 10+

## Configure frontend credentials
Copy `.env.example` to `.env` and add the Supabase Project URL and publishable key:

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Never put the Supabase service-role key, Resend API key, or other server secrets in the Vite frontend.

## Install and run

```bash
npm install
npm run dev
```

## Features
- Supabase email/password authentication and role-based staff / IT administrator workspaces
- Responsive sign-in page with a locally stored IT support background illustration
- Automatic sign-out after five minutes of inactivity
- Staff complaint submission and personal complaint history
- IT ticket assignment, status changes, fault identification and resolution records
- Realtime complaint refresh and notification bell with unread state
- In-app notifications for both IT administrators on new complaints
- Private, temporary staff-to-IT live chat using Supabase Realtime
- Server-side email alerts to both IT administrators through Resend + Supabase Edge Functions
- Analytics by status, priority, department and category; CSV export
- Administrator-only staff invitations, user detail editing, role management, pending/active account status, and access deactivation/reactivation
- Responsive React + Tailwind CSS 4 interface

## Supabase setup
1. Your existing `profiles` and `complaints` tables should already be created.
2. `complaints` must include `device`, `department`, and `resolved_at` columns.
3. Run `supabase-notifications-and-management.sql` in Supabase SQL Editor.
4. Run `supabase-ephemeral-chat.sql` in Supabase SQL Editor to enable private chat channels for active staff and IT administrators.
5. Deploy the Edge Functions and configure Resend secrets using `DEPLOYMENT-GUIDE.md`. New invitations remain pending until the invitee sets a password and signs in.
6. Make sure `profiles.role` is `staff` or `it_admin`, and both IT admins have valid email addresses.

Chat messages and chat requests are transient: they are not saved to the database, and requests/messages sent while either participant is offline are not retained. Opening the staff chat sends a live request notification to currently online IT admins. Both IT admins and staff receive live message notifications and an unread chat count while the chat widget is closed, as long as they remain signed in to the portal. Opening the relevant chat clears its unread count. Signing out clears that user's chat box; the other participant's open chat remains available until they close it or sign out.

## Deployment
See `DEPLOYMENT-GUIDE.md` for Vercel and Netlify deployment instructions.
