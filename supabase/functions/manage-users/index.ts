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
    const { data: actor } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (actor?.role !== 'it_admin') return json({ error: 'Only IT administrators can manage accounts' }, 403);

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
    return json({ error: 'Unsupported action' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
