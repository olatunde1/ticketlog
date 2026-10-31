import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await anon.auth.getUser();
    if (authError || !user) return json({ error: 'Invalid session' }, 401);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: actor } = await admin.from('profiles').select('role, is_active').eq('id', user.id).single();
    if (actor?.role !== 'it_admin' || actor.is_active === false) return json({ error: 'Only active IT administrators can manage accounts' }, 403);

    const body = await req.json();
    if (body.action === 'invite') {
      const email = String(body.email || '').trim().toLowerCase();
      const fullName = String(body.full_name || '').trim();
      const role = body.role === 'it_admin' ? 'it_admin' : 'staff';
      if (!email || !fullName) return json({ error: 'Full name and email are required' }, 400);
      const appUrl = Deno.env.get('APP_URL');
      if (!appUrl) return json({ error: 'APP_URL is not configured. Set it to your deployed portal URL in Supabase Edge Function secrets before inviting staff.' }, 500);
      const inviteRedirect = new URL(appUrl);
      inviteRedirect.searchParams.set('invite', '1');
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName }, redirectTo: inviteRedirect.toString() });
      if (error) throw error;
      // The auth trigger creates the profile. Retry briefly if the trigger has not completed yet.
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: profile } = await admin.from('profiles').select('id').eq('id', data.user.id).maybeSingle();
        if (profile) break;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      const { error: roleError } = await admin.from('profiles').update({ full_name: fullName, email, role }).eq('id', data.user.id);
      if (roleError) throw roleError;
      return json({ success: true, message: `Invitation sent to ${email}` });
    }

    if (body.action === 'set_role') {
      const userId = String(body.user_id || '');
      const role = body.role === 'it_admin' ? 'it_admin' : 'staff';
      if (!userId) return json({ error: 'user_id is required' }, 400);
      if (userId === user.id && role !== 'it_admin') return json({ error: 'You cannot remove your own administrator role here.' }, 400);
      const { error } = await admin.from('profiles').update({ role }).eq('id', userId);
      if (error) throw error;
      return json({ success: true, message: 'Account role updated.' });
    }

    if (body.action === 'update_user') {
      const userId = String(body.user_id || '');
      const fullName = String(body.full_name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const role = body.role;
      if (!userId) return json({ error: 'user_id is required' }, 400);
      if (!fullName || !email) return json({ error: 'Full name and email are required' }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address' }, 400);
      if (role !== 'staff' && role !== 'it_admin') return json({ error: 'Role must be staff or it_admin' }, 400);
      if (userId === user.id && role !== 'it_admin') return json({ error: 'You cannot remove your own administrator role.' }, 400);

      const { data: target, error: targetError } = await admin.from('profiles').select('id, email, is_active').eq('id', userId).maybeSingle();
      if (targetError) throw targetError;
      if (!target) return json({ error: 'Account not found' }, 404);

      const emailChanged = target.email?.toLowerCase() !== email;
      if (emailChanged) {
        const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
        if (authUpdateError) throw authUpdateError;
      }

      const { error: profileUpdateError } = await admin.from('profiles').update({ full_name: fullName, email, role }).eq('id', userId);
      if (profileUpdateError) {
        if (emailChanged) throw new Error(`The authentication email was changed, but the profile update failed: ${profileUpdateError.message}`);
        throw profileUpdateError;
      }
      return json({ success: true, message: 'User information updated.' });
    }

    if (body.action === 'set_access') {
      const userId = String(body.user_id || '');
      if (!userId) return json({ error: 'user_id is required' }, 400);
      if (typeof body.is_active !== 'boolean') return json({ error: 'is_active must be a boolean' }, 400);
      if (userId === user.id && !body.is_active) return json({ error: 'You cannot deactivate your own account.' }, 400);

      const { data: target, error: targetError } = await admin.from('profiles').select('id, role, is_active').eq('id', userId).maybeSingle();
      if (targetError) throw targetError;
      if (!target) return json({ error: 'Account not found' }, 404);
      const isActive = body.is_active === true;
      if (target.is_active === isActive) return json({ success: true, message: isActive ? 'Account is already active.' : 'Account is already deactivated.' });

      if (!isActive && target.role === 'it_admin') {
        const { count, error: countError } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'it_admin').eq('is_active', true);
        if (countError) throw countError;
        if (count !== null && count <= 1) return json({ error: 'You cannot deactivate the last active IT administrator.' }, 400);
      }

      if (isActive) {
        const { error: profileError } = await admin.from('profiles').update({ is_active: true }).eq('id', userId);
        if (profileError) throw profileError;
        const { error: authError } = await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
        if (authError) {
          const { error: rollbackError } = await admin.from('profiles').update({ is_active: false }).eq('id', userId);
          if (rollbackError) throw new Error(`Could not reactivate sign-in (${authError.message}) and could not restore the disabled profile (${rollbackError.message}).`);
          throw authError;
        }
        return json({ success: true, message: 'Account reactivated.' });
      }

      const { error: authError } = await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
      if (authError) throw authError;
      const { error: profileError } = await admin.from('profiles').update({ is_active: false }).eq('id', userId);
      if (profileError) {
        const { error: rollbackError } = await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
        if (rollbackError) throw new Error(`Could not mark the profile inactive (${profileError.message}) and could not restore sign-in (${rollbackError.message}).`);
        throw profileError;
      }
      return json({ success: true, message: 'Account deactivated. Sign-in is disabled and existing records are preserved.' });
    }

    return json({ error: 'Unsupported action' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
