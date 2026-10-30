import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { complaintId } = await req.json();
    if (!complaintId) return new Response(JSON.stringify({ error: 'complaintId is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(url, serviceKey);
    const { data: complaint, error: complaintError } = await admin.from('complaints').select('id,ticket_number,title,description,priority,department,device,location,created_by').eq('id', complaintId).single();
    if (complaintError || !complaint || complaint.created_by !== user.id) return new Response(JSON.stringify({ error: 'Complaint not found or access denied' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: admins, error: adminsError } = await admin.from('profiles').select('email,full_name').eq('role', 'it_admin').not('email', 'is', null);
    if (adminsError) throw adminsError;
    const recipients = [...new Set((admins || []).map((a) => a.email).filter(Boolean))];
    if (!recipients.length) return new Response(JSON.stringify({ sent: false, reason: 'No IT administrator email addresses configured' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const resendKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('EMAIL_FROM');
    if (!resendKey || !from) throw new Error('Set RESEND_API_KEY and EMAIL_FROM secrets for this function.');

    const html = `<h2>New IT support complaint</h2><p><b>Ticket:</b> ${escapeHtml(complaint.ticket_number)}</p><p><b>Issue:</b> ${escapeHtml(complaint.title)}</p><p><b>Department:</b> ${escapeHtml(complaint.department || 'Not specified')}</p><p><b>Device:</b> ${escapeHtml(complaint.device || 'Not specified')}</p><p><b>Priority:</b> ${escapeHtml(complaint.priority)}</p><p><b>Location:</b> ${escapeHtml(complaint.location || 'Not specified')}</p><p>${escapeHtml(complaint.description)}</p><p>Sign in to the IT Support Desk to review and assign this ticket.</p>`;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: recipients, subject: `New IT complaint: ${complaint.ticket_number} — ${complaint.title}`, html }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Email provider rejected the request');
    return new Response(JSON.stringify({ sent: true, recipients: recipients.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}
