# Invited staff account activation

This update adds a first-time password setup screen for Supabase email invitations.

## Frontend deployment

1. Replace the current project files with this updated project.
2. Ensure Netlify has `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set as environment variables.
3. Build and deploy the frontend as usual (`npm run build`, publish `dist`).

## Supabase configuration

Set the Supabase Edge Function secret `APP_URL` to the deployed portal's root URL, for example `https://your-portal.netlify.app` (no path required):

```bash
supabase secrets set APP_URL=https://your-portal.netlify.app
```

Then deploy the updated invitation function from the project root:

```bash
supabase functions deploy manage-users
```

The function sends invitation links back to the portal with `?invite=1`. The frontend processes Supabase PKCE `code` callbacks and `token_hash` invite/recovery callbacks, then requires an authenticated invitation session before allowing a password to be set. Supabase implicit-flow hash callbacks are handled by the Supabase client. If verification fails or the link has expired, the portal displays an actionable error instead of silently showing the normal login form.

## Supabase Auth URL allow-list

In Supabase Dashboard → Authentication → URL Configuration:

- Set Site URL to the deployed portal URL.
- Add the deployed portal URL to Redirect URLs.
- Add the exact deployed callback URL with `?invite=1` if required by your Auth redirect allow-list.
- Add the local development URL (for example `http://localhost:5173/**`) if you test invitations locally.

## Test

1. From Staff Management, invite a new email address that has never been registered.
2. Open the invitation email and click its link.
3. Confirm the portal displays **Activate your account** rather than the login form.
4. Set and confirm a password of at least 8 characters.
5. Confirm the employee reaches their workspace and can sign in again with the invited email and password.

Do not expose the Supabase service-role key in frontend environment variables. It remains server-side in Supabase Edge Function secrets.

## Supabase email template check

In Supabase Dashboard → Authentication → Email Templates → Invite user, keep the confirmation link in the email as `{{ .ConfirmationURL }}`. Do not replace it with a direct link to the Netlify login page. Supabase must first verify the one-time invitation token and then redirect the verified session to the configured `APP_URL` callback.

## Important behaviour

- An invited employee does **not** use Sign up / Register.
- The employee opens the invitation email and follows the Supabase confirmation link.
- The portal processes the callback and displays the password activation form only when an authenticated invitation/recovery session exists.
- The employee sets a password (minimum 8 characters). The account is then ready for normal email/password sign-in.
- If the invitation has expired or was already consumed, the portal shows an error and the IT administrator should resend the invitation.

## Deployment order

1. Deploy the frontend update to Netlify.
2. Set the Supabase Edge Function secret `APP_URL` to the exact public Netlify site origin (for example `https://your-portal.netlify.app`, without `/activate`).
3. Deploy `manage-users` from this project directory.
4. Check the Supabase Auth Site URL and Redirect URLs allow-list.
5. Send a fresh invitation to an email address that has not already accepted an invitation and test the complete flow.
