# IT Support Portal — notifications, analytics, user management & deployment

This upgrade adds database-backed in-app notifications, server-side email alerts, analytics/CSV reporting, and an administrator-only staff management screen.

## A. Apply the database migration

1. Open your Supabase project → SQL Editor → New query.
2. Open `supabase-notifications-and-management.sql` from this project.
3. Copy the complete SQL into the editor and run it.
4. Confirm `public.notifications` exists under Database → Table Editor.

The migration creates notification records for both IT administrators when a complaint is inserted. It also notifies the employee and assigned IT officer when a complaint is updated. It enables Realtime for `complaints` and `notifications` if those tables are not already published.

The migration does not remove or recreate your existing tables.

## B. Set up email delivery with Resend

Email is sent from a Supabase Edge Function, never directly from browser code.

1. Create a Resend account and verify a domain or sender address that your organisation is authorised to use.
2. Create a Resend API key.
3. Install the Supabase CLI and sign in:

```bash
npm install --global supabase
supabase login
```

4. From this project folder, link your Supabase project:

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

5. Set the server-side secrets (replace values; do not put them in `.env`):

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxx EMAIL_FROM="IT Support Desk <it-support@your-verified-domain.com>" APP_URL=https://your-portal-domain.com
```

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Never expose the service-role key in the React app.

6. Deploy both functions:

```bash
supabase functions deploy notify-new-complaint
supabase functions deploy manage-users
```

`notify-new-complaint` verifies the signed-in user owns the complaint before sending mail to every profile with role `it_admin`. `manage-users` verifies the caller is an active IT administrator before inviting users, editing their details, changing roles, or deactivating accounts. Deactivation disables sign-in while preserving the profile and support history; the last active IT administrator cannot be deactivated.

Before deploying account deactivation, rerun `supabase-notifications-and-management.sql` in the Supabase SQL Editor to add the `profiles.is_active` column. Then deploy the updated Edge Function with `supabase functions deploy manage-users`.

Important: the two IT administrator profiles must have valid email addresses. Resend's sender address must be verified. If the sender/domain is not verified, in-app notifications will still work but email delivery will fail.

## C. Frontend setup

Create `.env` in the project root (copy `.env.example`) and add:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Then:

```bash
npm install
npm run dev
```

The `.env` file must never contain a service-role key, Resend key, or any server-side secret.

## D. Deploy the portal

### Vercel

1. Push this project to a private Git repository.
2. Import the repository into Vercel.
3. Set the two `VITE_` variables under Project → Settings → Environment Variables.
4. Build command: `npm run build`; output directory: `dist`.
5. Deploy. `vercel.json` provides the SPA fallback rewrite.

### Netlify

1. Import the repository into Netlify.
2. Build command: `npm run build`; publish directory: `dist`.
3. Set the same two `VITE_` environment variables in Site configuration → Environment variables.
4. Deploy. `public/_redirects` provides the SPA fallback.

After deployment, ensure `APP_URL` in Supabase Edge Function secrets matches the actual portal URL. In Supabase Authentication → URL Configuration, set the Site URL to the deployed portal URL and add it to the Redirect URLs list so invitation links return to the app.

## E. What is included

- Bell menu with unread count and mark-as-read / mark-all-read actions.
- Realtime notification feed for the signed-in user.
- Automatic in-app alert to both IT administrators on new complaint submissions.
- Email alert to both IT administrators using Resend via Edge Function.
- Employee notification when their complaint changes; assigned IT officer notification on updates.
- Analytics for complaint totals, status, priority, department and category; 7-day, 30-day and all-time filters.
- CSV export with staff, assignment, resolution and ticket fields.
- Staff management: invite users, edit their name/email/role, and deactivate or reactivate account sign-in. Only active IT admins can invoke the Edge Function; self-deactivation and deactivating the last active administrator are blocked.

## F. Production checks before inviting the whole company

- Verify both IT admin emails and test delivery to both inboxes (including spam/junk).
- Test a staff invitation and activate it from the invite email.
- Confirm staff cannot read another employee's tickets or notifications.
- Confirm staff cannot invoke `manage-users` successfully.
- Keep RLS enabled on `profiles`, `complaints`, and `notifications`.
- Use HTTPS and a company-approved sender domain.
- Configure a backup/retention process for complaint records and periodically export reports.
