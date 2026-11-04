import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity, Bell, CheckCircle2, Clock3, FileText, Headphones, LayoutDashboard,
  LogOut, Menu, Plus, Search, ShieldCheck, Ticket, Wrench, X, Laptop,
  Printer, Wifi, Monitor, Camera, Mail, ArrowUpRight, AlertCircle, RefreshCw, Users, BarChart3, UserPlus, ChevronDown, Pencil, KeyRound
} from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import ChatWidget from './ChatWidget'
import './index.css'

const categories = ['Hardware', 'Software', 'Network & Internet', 'Email & Accounts', 'Printer & Scanner', 'Telephone', 'CCTV & Security', 'Other']
const devices = ['Desktop PC', 'Laptop', 'Printer / Scanner', 'Network / Wi-Fi', 'Telephone', 'CCTV Camera', 'Monitor', 'Other']
const departments = ['Administration', 'Finance', 'Human Resources', 'IT', 'Logistics', 'Operations', 'Sales', 'Other']
const statuses = ['Open', 'In Progress', 'Resolved']
const priorities = ['Low', 'Medium', 'High', 'Critical']
const inactivityTimeoutMs = 5 * 60 * 1000
const cx = (...values) => values.filter(Boolean).join(' ')
const humanStatus = value => ({ open: 'Open', in_progress: 'In Progress', resolved: 'Resolved' }[value] || value)
const dbStatus = value => ({ Open: 'open', 'In Progress': 'in_progress', Resolved: 'resolved' }[value] || 'open')
const humanPriority = value => value ? value[0].toUpperCase() + value.slice(1) : 'Medium'
const formatDate = value => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const errorMessage = error => error?.message || 'Something went wrong. Please try again.'
async function functionInvokeError(error) {
  const context = error?.context
  if (context instanceof Response) {
    const body = await context.clone().text()
    if (body) {
      try {
        const payload = JSON.parse(body)
        const message = payload?.error || payload?.message
        if (message) return new Error(message)
      } catch {
        return new Error(body)
      }
    }
  }
  return new Error(errorMessage(error))
}

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [activationRequired, setActivationRequired] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('invite') === '1' || params.get('type') === 'invite' || new URLSearchParams(window.location.hash.slice(1)).get('type') === 'invite' || new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery'
  })
  const activationCompleted = useRef(false)
  const [loading, setLoading] = useState(false)
  const [tickets, setTickets] = useState([])
  const [profiles, setProfiles] = useState([])
  const [page, setPage] = useState('dashboard')
  const [formOpen, setFormOpen] = useState(false)
  const [active, setActive] = useState(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All statuses')
  const [toast, setToast] = useState('')
  const [loginNotice, setLoginNotice] = useState('')
  const [workspaceRefresh, setWorkspaceRefresh] = useState(0)
  const [navOpen, setNavOpen] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [notifications, setNotifications] = useState([])
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [notificationBusy, setNotificationBusy] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const isAdmin = profile?.role === 'it_admin'
  const flash = message => { setToast(message); window.setTimeout(() => setToast(''), 4000) }
  const nav = next => { setPage(next); setNavOpen(false); setActive(null) }

  useEffect(() => {
    if (!isSupabaseConfigured) { setAuthLoading(false); return }
    let alive = true
    const searchParams = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    const callbackType = searchParams.get('type') || hashParams.get('type')
    const isInviteCallback = searchParams.get('invite') === '1' || callbackType === 'invite' || callbackType === 'recovery'
    if (isInviteCallback) setActivationRequired(true)

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const currentSearch = new URLSearchParams(window.location.search)
      const currentHash = new URLSearchParams(window.location.hash.slice(1))
      const isCurrentInviteCallback = currentSearch.get('invite') === '1' || currentSearch.get('type') === 'invite' || currentHash.get('type') === 'invite' || currentHash.get('type') === 'recovery'
      if (!activationCompleted.current && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' && isCurrentInviteCallback)) setActivationRequired(true)
      setSession(nextSession)
      if (!nextSession) { setProfile(null); setTickets([]); setProfiles([]) }
    })

    // Handle Supabase PKCE callbacks and token-hash invitation links before checking the session.
    ;(async () => {
      let callbackError = null
      const code = searchParams.get('code')
      const tokenHash = searchParams.get('token_hash')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        callbackError = error
      } else if (tokenHash && (callbackType === 'invite' || callbackType === 'recovery')) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: callbackType })
        callbackError = error
      }
      if (!alive) return
      if (callbackError) flash(`Invitation link error: ${callbackError.message}`)
      const { data, error } = await supabase.auth.getSession()
      if (!alive) return
      if (error) flash(error.message)
      setSession(data?.session || null)
      setAuthLoading(false)
    })()

    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!session?.user) return

    let lastActivity = Date.now()
    let timeoutId
    const checkInactivity = () => {
      const remaining = inactivityTimeoutMs - (Date.now() - lastActivity)
      if (remaining <= 0) {
        setLoginNotice('You were signed out after 5 minutes of inactivity.')
        void signOut()
        return
      }
      timeoutId = window.setTimeout(checkInactivity, remaining)
    }
    const recordActivity = () => {
      const now = Date.now()
      if (now - lastActivity < 1000) return
      lastActivity = now
      window.clearTimeout(timeoutId)
      checkInactivity()
    }
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        window.clearTimeout(timeoutId)
        checkInactivity()
      }
    }

    timeoutId = window.setTimeout(checkInactivity, inactivityTimeoutMs)
    window.addEventListener('pointerdown', recordActivity)
    window.addEventListener('keydown', recordActivity)
    window.addEventListener('mousemove', recordActivity)
    window.addEventListener('scroll', recordActivity, { passive: true })
    window.addEventListener('touchstart', recordActivity, { passive: true })
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearTimeout(timeoutId)
      window.removeEventListener('pointerdown', recordActivity)
      window.removeEventListener('keydown', recordActivity)
      window.removeEventListener('mousemove', recordActivity)
      window.removeEventListener('scroll', recordActivity)
      window.removeEventListener('touchstart', recordActivity)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [session?.user?.id])

  const loadWorkspace = useCallback(async () => {
    if (!session?.user) return
    setLoading(true); setLoadError('')
    const { data: ownProfile, error: profileError } = await supabase
      .from('profiles').select('id, full_name, email, role, is_active, is_pending').eq('id', session.user.id).single()
    if (profileError) {
      setLoadError(`Could not load your profile: ${profileError.message}`)
      setLoading(false); return
    }
    if (ownProfile.is_active === false) {
      await supabase.auth.signOut()
      setLoading(false)
      setLoadError('Your account has been deactivated. Contact an IT administrator if you need access restored.')
      return
    }
    if (ownProfile.is_pending) {
      setLoading(false)
      return
    }
    setProfile(ownProfile)
    const { data: rows, error: ticketsError } = await supabase
      .from('complaints').select('*').order('created_at', { ascending: false })
    if (ticketsError) {
      setLoadError(`Could not load complaints: ${ticketsError.message}`)
      setLoading(false); return
    }
    let people = []
    if (ownProfile.role === 'it_admin') {
      const { data, error } = await supabase.from('profiles').select('id, full_name, email, role, is_active, is_pending').order('full_name')
      if (error) flash(`Could not load staff list: ${error.message}`)
      people = data || []
    }
    setProfiles(people)
    const { data: noticeRows, error: noticeError } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(30)
    if (noticeError && noticeError.code !== '42P01') flash(`Notifications unavailable: ${noticeError.message}`)
    setNotifications(noticeRows || [])
    const personMap = new Map(people.map(person => [person.id, person]))
    setTickets((rows || []).map(row => ({
      ...row,
      id: row.id,
      staff: row.created_by === ownProfile.id ? (ownProfile.full_name || ownProfile.email) : (personMap.get(row.created_by)?.full_name || personMap.get(row.created_by)?.email || 'Staff member'),
      email: row.created_by === ownProfile.id ? ownProfile.email : personMap.get(row.created_by)?.email,
      assigned: row.assigned_to ? (personMap.get(row.assigned_to)?.full_name || personMap.get(row.assigned_to)?.email || 'Assigned') : 'Unassigned',
      status: humanStatus(row.status), priority: humanPriority(row.priority), created: formatDate(row.created_at),
      resolvedAt: formatDate(row.resolved_at), fault: row.fault_identified || '', resolution: row.resolution || '',
      department: row.department || '', device: row.device || '', location: row.location || ''
    })))
    setLoading(false)
  }, [session?.user?.id])

  useEffect(() => { if (session?.user && !activationRequired) loadWorkspace() }, [session?.user?.id, activationRequired, workspaceRefresh, loadWorkspace])

  useEffect(() => {
    if (!session?.user) return
    const channel = supabase.channel(`complaints-${session.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'complaints' }, () => loadWorkspace())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session?.user?.id, loadWorkspace])

  useEffect(() => {
    if (!session?.user) return
    const channel = supabase.channel(`notifications-${session.user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` }, payload => {
        setNotifications(current => [payload.new, ...current].slice(0, 30))
        flash(payload.new.title || 'You have a new notification')
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session?.user?.id])

  useEffect(() => {
    if (!session?.user || !isAdmin) return
    const channel = supabase.channel(`profiles-${session.user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, () => loadWorkspace())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session?.user?.id, isAdmin, loadWorkspace])

  const ownTickets = tickets.filter(ticket => ticket.created_by === session?.user?.id)
  const visible = useMemo(() => tickets.filter(ticket =>
    (isAdmin || ticket.created_by === session?.user?.id) &&
    `${ticket.id} ${ticket.title} ${ticket.staff} ${ticket.department} ${ticket.device}`.toLowerCase().includes(query.toLowerCase()) &&
    (filter === 'All statuses' || ticket.status === filter)
  ), [tickets, isAdmin, session?.user?.id, query, filter])
  const counts = [
    { label: isAdmin ? 'Total tickets' : 'My requests', value: isAdmin ? tickets.length : ownTickets.length, icon: Ticket, color: 'bg-blue-50 text-blue-600' },
    { label: 'Open', value: (isAdmin ? tickets : ownTickets).filter(t => t.status === 'Open').length, icon: Clock3, color: 'bg-amber-50 text-amber-600' },
    { label: 'In progress', value: (isAdmin ? tickets : ownTickets).filter(t => t.status === 'In Progress').length, icon: Activity, color: 'bg-violet-50 text-violet-600' },
    { label: 'Resolved', value: (isAdmin ? tickets : ownTickets).filter(t => t.status === 'Resolved').length, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600' }
  ]

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const { data, error: activationError } = await supabase.functions.invoke('manage-users', { body: { action: 'activate_after_login' } })
    if (activationError) {
      await supabase.auth.signOut()
      throw await functionInvokeError(activationError)
    }
    if (data?.error) {
      await supabase.auth.signOut()
      throw new Error(data.error)
    }
    setLoginNotice('')
    activationCompleted.current = true
    setActivationRequired(false)
    window.history.replaceState({}, document.title, window.location.pathname)
    setWorkspaceRefresh(value => value + 1)
  }
  async function setAccountPassword(password) {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
    activationCompleted.current = true
    setActivationRequired(false)
    window.history.replaceState({}, document.title, window.location.pathname)
    setLoginNotice('Password saved. Sign in with your new password to activate your account.')
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) throw signOutError
  }
  async function signOut() {
    if (signingOut) return
    setSigningOut(true)
    setNotificationOpen(false)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        flash(`Could not sign out: ${error.message}`)
        return
      }
      setSession(null)
      setProfile(null)
      setTickets([])
      setProfiles([])
      setNotifications([])
      nav('dashboard')
    } catch (error) {
      flash(`Could not sign out: ${errorMessage(error)}`)
    } finally {
      setSigningOut(false)
    }
  }
  async function submitComplaint(form) {
    const ticketNumber = `IT-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`
    const payload = {
      ticket_number: ticketNumber, created_by: session.user.id, title: form.title.trim(),
      category: form.category, description: form.description.trim(), location: form.location.trim() || null,
      priority: form.priority.toLowerCase(), status: 'open', device: form.device,
      department: form.department, resolved_at: null
    }
    const { data: inserted, error } = await supabase.from('complaints').insert(payload).select('id').single()
    if (error) throw error
    // Email is sent by a server-side Edge Function; database notifications are created by a trigger.
    const { error: emailError } = await supabase.functions.invoke('notify-new-complaint', { body: { complaintId: inserted.id } })
    await loadWorkspace(); setFormOpen(false); setPage('dashboard')
    flash(emailError ? `Request ${ticketNumber} submitted. In-app alerts are active; email setup needs attention.` : `Request ${ticketNumber} submitted and IT notified by email.`)
  }
  async function saveTicket(ticket, changes) {
    const nextStatus = dbStatus(changes.status)
    if (nextStatus === 'resolved' && !changes.resolution?.trim()) throw new Error('Add resolution details before closing this ticket.')
    const payload = {
      status: nextStatus, assigned_to: changes.assigned_to || null,
      fault_identified: changes.fault_identified?.trim() || null,
      resolution: changes.resolution?.trim() || null,
      updated_at: new Date().toISOString(),
      resolved_at: nextStatus === 'resolved' ? new Date().toISOString() : null
    }
    const { error } = await supabase.from('complaints').update(payload).eq('id', ticket.id)
    if (error) throw error
    await loadWorkspace(); setActive(null); flash(`Ticket ${ticket.ticket_number} updated.`)
  }
  async function markNotificationRead(id) {
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    if (error) flash(error.message)
    else setNotifications(current => current.map(item => item.id === id ? { ...item, is_read: true } : item))
  }
  async function markAllNotificationsRead() {
    setNotificationBusy(true)
    const unread = notifications.filter(item => !item.is_read).map(item => item.id)
    if (unread.length) {
      const { error } = await supabase.from('notifications').update({ is_read: true }).in('id', unread)
      if (error) flash(error.message)
      else setNotifications(current => current.map(item => ({ ...item, is_read: true })))
    }
    setNotificationBusy(false)
  }
  async function inviteUser(form) {
    const { data, error } = await supabase.functions.invoke('manage-users', { body: { action: 'invite', ...form } })
    if (error) throw await functionInvokeError(error)
    if (data?.error) throw new Error(data.error)
    await loadWorkspace(); flash(data?.message || 'Invitation sent.')
  }
  async function updateStaffUser(person, changes) {
    const { data, error } = await supabase.functions.invoke('manage-users', { body: { action: 'update_user', user_id: person.id, ...changes } })
    if (error) throw await functionInvokeError(error)
    if (data?.error) throw new Error(data.error)
    await loadWorkspace(); flash(data?.message || 'User information updated.')
  }
  async function setStaffUserAccess(person, isActive) {
    const { data, error } = await supabase.functions.invoke('manage-users', { body: { action: 'set_access', user_id: person.id, is_active: isActive } })
    if (error) throw await functionInvokeError(error)
    if (data?.error) throw new Error(data.error)
    await loadWorkspace(); flash(data?.message || (isActive ? 'Account reactivated.' : 'Account deactivated.'))
  }
  async function sendPasswordReset(person) {
    const { data, error } = await supabase.functions.invoke('manage-users', { body: { action: 'reset_password', user_id: person.id } })
    if (error) throw await functionInvokeError(error)
    if (data?.error) throw new Error(data.error)
    flash(data?.message || `Password reset email sent to ${person.email}.`)
  }

  if (!isSupabaseConfigured) return <SetupScreen />
  if (authLoading) return <LoadingScreen label="Checking your session…" />
  if (activationRequired && session) return <SetPasswordScreen onSave={setAccountPassword} onSignOut={signOut} />
  if (activationRequired && !session) return <ActivationLinkError />
  if (!session) return <LoginScreen onLogin={signIn} notice={loginNotice} />
  if (loadError && !profile) return <ErrorScreen message={loadError} retry={loadWorkspace} onSignOut={signOut} />
  if (!profile || loading) return <LoadingScreen label="Loading your IT workspace…" />

  return <div className="min-h-screen">
    <aside className={cx('fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-y-auto border-r border-slate-200 bg-white px-4 py-6 transition-transform lg:translate-x-0', navOpen ? 'translate-x-0' : '-translate-x-full')}>
      <div className="mb-10 flex items-center gap-3 px-2"><div className="grid size-11 place-items-center rounded-2xl bg-brand-950 text-white"><Headphones size={23}/></div><div><b className="block text-sm font-extrabold">IT Support Desk</b><span className="text-[9px] font-bold tracking-[.16em] text-slate-400">INTERNAL SERVICE PORTAL</span></div><button className="ml-auto lg:hidden" onClick={() => setNavOpen(false)}><X size={19}/></button></div>
      <p className="mb-3 px-3 text-[10px] font-extrabold tracking-[.16em] text-slate-400">WORKSPACE</p>
      <SideButton icon={LayoutDashboard} active={page === 'dashboard'} onClick={() => nav('dashboard')}>Dashboard</SideButton>
      <SideButton icon={Ticket} active={page === 'requests'} onClick={() => nav('requests')}>{isAdmin ? 'All tickets' : 'My requests'}<span className="ml-auto rounded-md bg-slate-100 px-2 py-1 text-[10px]">{isAdmin ? tickets.length : ownTickets.length}</span></SideButton>
      {isAdmin && <SideButton icon={BarChart3} active={page === 'reports'} onClick={() => nav('reports')}>Analytics & reports</SideButton>}
      {isAdmin && <SideButton icon={Users} active={page === 'people'} onClick={() => nav('people')}>Staff management</SideButton>}
      <div className="mt-auto rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="mb-3 grid size-9 place-items-center rounded-lg bg-blue-100 text-blue-700"><ShieldCheck size={19}/></div><b className="text-xs">Need urgent help?</b><p className="my-2 text-[11px] leading-relaxed text-slate-500">For critical business interruptions, contact the IT team directly.</p><a className="flex items-center gap-2 text-[10px] font-bold text-blue-700" href="mailto:it-support@company.com"><Mail size={13}/>Contact IT support</a></div>
      <div className="mt-5 border-t border-slate-100 pt-4"><div className="mb-3 flex items-center gap-3"><div className="grid size-9 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{(profile.full_name || profile.email || 'U').slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><b className="block truncate text-[11px]">{profile.full_name || profile.email}</b><span className="text-[10px] text-slate-400">{isAdmin ? 'IT Administrator' : 'Staff account'}</span></div></div><button type="button" title="Sign out" onClick={signOut} disabled={signingOut} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60"><LogOut size={16}/>{signingOut ? 'Signing out…' : 'Sign out'}</button></div>
    </aside>
    {navOpen && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" onClick={() => setNavOpen(false)}/>}
    <main className="min-h-screen lg:ml-64">
      <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-slate-200 bg-white/95 px-3 backdrop-blur sm:px-8">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3"><button className="shrink-0 lg:hidden" onClick={() => setNavOpen(true)} aria-label="Open navigation"><Menu size={21}/></button><p className="min-w-0 truncate text-sm text-slate-500">Workspace <span className="mx-1 sm:mx-2">/</span><b className="text-slate-700">{page === 'dashboard' ? 'Dashboard' : page === 'requests' ? (isAdmin ? 'All tickets' : 'My requests') : page === 'people' ? 'Staff management' : 'Analytics & reports'}</b></p></div>
        <div className="relative flex shrink-0 items-center gap-1 sm:gap-3"><span className="hidden rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[9px] font-extrabold tracking-wider text-emerald-700 sm:block">● CONNECTED</span><button onClick={() => { setNotificationOpen(v => !v); }} title="Notifications" aria-label="Notifications" className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-blue-600"><Bell size={18}/>{notifications.some(n => !n.is_read) && <span className="absolute right-1 top-1 size-2 rounded-full bg-rose-500 ring-2 ring-white"/>}</button>{notificationOpen && <NotificationPanel items={notifications} onRead={markNotificationRead} onReadAll={markAllNotificationsRead} busy={notificationBusy} close={() => setNotificationOpen(false)}/>}<button onClick={() => { loadWorkspace(); flash('Refreshing your workspace…') }} title="Refresh" aria-label="Refresh workspace" className="text-slate-500 hover:text-blue-600"><RefreshCw size={17}/></button><div className="mx-1 h-7 border-l border-slate-200 sm:mx-0"/><span className="hidden max-w-48 truncate text-[11px] text-slate-500 sm:block">{profile.email}</span><button type="button" onClick={signOut} disabled={signingOut} title="Sign out" aria-label="Sign out" className="relative z-[60] inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60 sm:px-3 sm:text-sm"><LogOut size={16}/><span>{signingOut ? 'Signing out…' : 'Sign out'}</span></button></div>
      </header>
      <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-8">
        {loadError && <div className="mb-5 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle size={16}/>{loadError}<button onClick={loadWorkspace} className="ml-auto font-bold">Retry</button></div>}
        {page === 'dashboard' && <>
          <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mb-2 text-[10px] font-extrabold tracking-[.17em] text-blue-600">IT SERVICE MANAGEMENT</p><h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{isAdmin ? 'IT Support Overview' : `Welcome, ${profile.full_name || 'there'}`} <span className="text-amber-500">✦</span></h1><p className="mt-2 max-w-xl text-xs leading-relaxed text-slate-500">{isAdmin ? 'Monitor reported issues, coordinate fixes, and keep a record of every resolution.' : 'Something not working? Log it here and our IT team will help you get back on track.'}</p></div><button onClick={() => setFormOpen(true)} className="action-button inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-xs font-bold shadow-sm"><Plus size={17}/>Log a complaint</button></div>
          {isAdmin && <div className="mb-5 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-blue-700"><Bell size={18}/><div className="flex-1"><b className="block text-xs">IT workspace updates</b><span className="text-[10px] text-blue-600">New and updated complaints sync from your shared database.</span></div><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold">{tickets.filter(t => t.status === 'Open').length} open</span></div>}
          <div className="mb-7 grid grid-cols-2 gap-3 xl:grid-cols-4">{counts.map(item => <StatCard key={item.label} {...item}/>)}</div>
          <TicketSection tickets={visible.slice(0, 5)} role={isAdmin ? 'it' : 'staff'} title="Recent requests" subtitle="Your latest IT support activity" onOpen={setActive} onViewAll={() => nav('requests')} empty="No complaints have been submitted yet." />
        </>}
        {page === 'requests' && <TicketSection tickets={visible} role={isAdmin ? 'it' : 'staff'} title={isAdmin ? 'All support tickets' : 'My requests'} subtitle={isAdmin ? 'Review, assign and resolve employee complaints.' : 'Track the progress of your submitted complaints.'} onOpen={setActive} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} empty="No matching complaints found." />}
        {page === 'reports' && isAdmin && <Reports tickets={tickets}/>}
        {page === 'people' && isAdmin && <StaffManagement people={profiles} invite={inviteUser} updateUser={updateStaffUser} setUserAccess={setStaffUserAccess} sendPasswordReset={sendPasswordReset} currentUserId={session.user.id}/>}
      </div>
    </main>
    {formOpen && <ComplaintForm close={() => setFormOpen(false)} submit={submitComplaint} profile={profile}/>}
    {active && <TicketDetails ticket={active} isAdmin={isAdmin} people={profiles.filter(p => p.role === 'it_admin')} close={() => setActive(null)} save={saveTicket}/>}
    <ChatWidget profile={profile} people={profiles}/>
    {toast && <div className="fixed bottom-5 right-5 z-[70] max-w-sm rounded-xl bg-slate-900 px-4 py-3 text-xs font-medium text-white shadow-xl">{toast}</div>}
  </div>
}

function SetPasswordScreen({ onSave, onSignOut }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  async function submit(event) {
    event.preventDefault()
    setError('')
    if (password.length < 8) { setError('Use a password with at least 8 characters.'); return }
    if (password !== confirmPassword) { setError('The passwords do not match.'); return }
    setBusy(true)
    try { await onSave(password); setSuccess(true) }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  return <div className="grid min-h-screen place-items-center bg-slate-50 p-4"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9"><div className="mb-8 flex items-center gap-3"><div className="grid size-12 place-items-center rounded-2xl bg-brand-950 text-white"><ShieldCheck size={24}/></div><div><b className="block text-base">IT Support Desk</b><span className="text-[10px] tracking-widest text-slate-400">ACCOUNT ACTIVATION</span></div></div>{success ? <><h1 className="text-2xl font-extrabold text-slate-900">Password saved</h1><p className="mt-2 text-sm text-slate-600">Redirecting you to sign in. Use your email address and the password you just created.</p></> : <><p className="mb-2 text-[10px] font-extrabold tracking-[.17em] text-blue-600">WELCOME TO THE TEAM</p><h1 className="text-2xl font-extrabold text-slate-900">Activate your account</h1><p className="mt-2 mb-7 text-xs leading-relaxed text-slate-500">Create a password to finish setting up your IT Support Portal account.</p><form className="space-y-4" onSubmit={submit}><label className="block"><span className="mb-1.5 block text-[11px] font-bold text-slate-600">New password</span><input className={fieldClass} type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters"/></label><label className="block"><span className="mb-1.5 block text-[11px] font-bold text-slate-600">Confirm password</span><input className={fieldClass} type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Enter the password again"/></label>{error && <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}<button disabled={busy} className="action-button w-full rounded-lg px-4 py-3 text-xs font-bold disabled:opacity-60">{busy ? 'Saving password…' : 'Activate account'}</button></form><p className="mt-5 text-center text-[10px] text-slate-400">Use at least 8 characters. Keep your password private.</p><button onClick={onSignOut} className="mt-4 w-full text-center text-[10px] font-bold text-slate-500 hover:text-blue-700">Sign out</button></>}</div></div>
}

function ActivationLinkError() {
  return <div className="grid min-h-screen place-items-center bg-slate-50 p-4"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9"><div className="mb-5 grid size-12 place-items-center rounded-2xl bg-amber-50 text-amber-600"><ShieldCheck size={24}/></div><h1 className="text-xl font-extrabold text-slate-900">Invitation link could not be verified</h1><p className="mt-3 text-sm leading-relaxed text-slate-600">The invitation may have expired, already been used, or the link did not complete its verification. Ask your IT administrator to send a new invitation. Do not register a second account.</p><a href="/" className="action-button mt-6 inline-flex w-full justify-center rounded-lg px-4 py-3 text-xs font-bold">Return to sign in</a></div></div>
}

function LoginScreen({ onLogin, notice }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  return <main className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[1.05fr_.95fr]">
    <section
      aria-label="IT support"
      className="relative flex min-h-64 flex-col justify-end overflow-hidden bg-slate-900 bg-cover bg-center px-6 py-8 text-white sm:min-h-80 sm:px-10 lg:sticky lg:top-0 lg:h-screen lg:min-h-screen lg:px-14 lg:pb-16"
      style={{ backgroundImage: "linear-gradient(180deg, rgba(7, 20, 38, .08) 8%, rgba(7, 20, 38, .88) 100%), url('/it-support-login.png')" }}
    >
      <div className="relative z-10 max-w-xl">
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-slate-950/30 px-3 py-1.5 text-[10px] font-bold tracking-wide text-white/90 backdrop-blur-sm">
          <span className="size-2 rounded-full bg-teal-300 shadow-[0_0_12px_rgba(94,234,212,.8)]"/>Here for your team
        </span>
        <h2 className="max-w-lg text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">IT help, when you need it.</h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-200 sm:text-base">Friendly support for the tools that keep your work moving.</p>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950/15 via-transparent to-slate-950/10"/>
    </section>
    <section className="flex min-h-[65vh] items-center justify-center px-5 py-10 sm:px-8 sm:py-14 lg:min-h-screen lg:px-12">
      <div className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white p-7 shadow-xl shadow-slate-900/5 sm:p-9">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-brand-950 text-white"><Headphones size={24}/></div>
          <div><b className="block text-base">IT Support Desk</b><span className="text-[10px] tracking-widest text-slate-400">INTERNAL SERVICE PORTAL</span></div>
        </div>
        <p className="mb-2 text-[10px] font-extrabold tracking-[.17em] text-blue-600">WELCOME BACK</p>
        <h1 className="text-2xl font-extrabold text-slate-900">Sign in to your account</h1>
        <p className="mt-2 mb-7 text-xs leading-relaxed text-slate-500">Use the email address and password created for you by the IT team.</p>
        {notice && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</p>}
        <form className="space-y-4" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await onLogin(email.trim(), password) } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) } }}>
          <label className="block"><span className="mb-1.5 block text-[11px] font-bold text-slate-600">Email address</span><input className={fieldClass} type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"/></label>
          <label className="block"><span className="mb-1.5 block text-[11px] font-bold text-slate-600">Password</span><input className={fieldClass} type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password"/></label>
          {error && <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
          <button disabled={busy} className="action-button w-full rounded-lg px-4 py-3 text-xs font-bold shadow-sm disabled:opacity-60">{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="mt-6 text-center text-[10px] text-slate-400">Access is managed by your IT administrator.</p>
      </div>
    </section>
  </main>
}
const fieldClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50'
function SetupScreen() { return <div className="grid min-h-screen place-items-center bg-slate-50 p-5"><div className="max-w-xl rounded-2xl border border-amber-200 bg-white p-7 shadow-sm"><div className="mb-4 flex items-center gap-2 text-amber-700"><AlertCircle/><b>Supabase setup required</b></div><h1 className="text-xl font-extrabold">Add your project credentials</h1><p className="mt-2 text-sm text-slate-600">Create a <code>.env</code> file in the project root using <code>.env.example</code> as a guide. Add your Supabase Project URL and publishable key, then restart Vite.</p><pre className="mt-4 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-white">VITE_SUPABASE_URL=https://your-project.supabase.co{'\n'}VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key</pre><p className="mt-4 text-xs text-slate-500">Do not put a service-role or secret key in this file.</p></div></div> }
function LoadingScreen({ label }) { return <div className="grid min-h-screen place-items-center text-sm text-slate-500"><div className="flex items-center gap-3"><RefreshCw className="animate-spin" size={18}/>{label}</div></div> }
function ErrorScreen({ message, retry, onSignOut }) { return <div className="grid min-h-screen place-items-center p-5"><div className="max-w-lg rounded-xl border border-rose-200 bg-white p-6"><h2 className="font-bold text-rose-700">Workspace could not load</h2><p className="my-3 text-sm text-slate-600">{message}</p><div className="flex gap-2"><button onClick={retry} className="action-button rounded-lg px-4 py-2 text-xs font-bold">Retry</button><button onClick={onSignOut} className="rounded-lg border px-4 py-2 text-xs font-bold">Sign out</button></div></div></div> }
function SideButton({ icon: Icon, active, onClick, children }) { return <button onClick={onClick} className={cx('mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-xs font-semibold transition', active ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800')}><Icon size={17}/>{children}</button> }
function StatCard({ label, value, icon: Icon, color }) { return <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><div className="mb-4 flex items-center justify-between"><span className="text-[10px] font-semibold text-slate-500">{label}</span><span className={cx('grid size-9 place-items-center rounded-lg', color)}><Icon size={17}/></span></div><b className="text-2xl font-extrabold text-slate-900">{value}</b></div> }
function Badge({ status }) { return <span className={cx('rounded-md px-2 py-1 text-[9px] font-bold', status === 'Resolved' ? 'bg-emerald-50 text-emerald-700' : status === 'In Progress' ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-700')}>{status}</span> }
function TicketSection({ tickets, role, title, subtitle, onOpen, onViewAll, query, setQuery, filter, setFilter, empty }) { return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center"><div><h2 className="text-sm font-extrabold text-slate-900">{title}</h2><p className="mt-1 text-[10px] text-slate-400">{subtitle}</p></div><div className="flex flex-wrap gap-2">{setQuery && <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3"><Search size={14} className="text-slate-400"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tickets…" className="w-36 py-2 text-[10px] outline-none"/></label>}{setFilter && <select value={filter} onChange={e => setFilter(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-[10px] outline-none"><option>All statuses</option>{statuses.map(s => <option key={s}>{s}</option>)}</select>}{onViewAll && <button onClick={onViewAll} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600">View all</button>}</div></div>{tickets.length === 0 ? <div className="p-12 text-center text-xs text-slate-400">{empty}</div> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead className="bg-slate-50 text-[9px] font-extrabold tracking-wider text-slate-400"><tr>{['TICKET', 'ISSUE', ...(role === 'it' ? ['REPORTED BY'] : []), 'PRIORITY', 'STATUS', 'CREATED', ''].map((h, i) => <th key={i} className="px-4 py-3">{h}</th>)}</tr></thead><tbody>{tickets.map(t => <tr key={t.id} onClick={() => onOpen(t)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/70"><td className="px-4 py-4 text-[10px] font-extrabold text-blue-700">{t.ticket_number}</td><td className="px-4 py-3"><div className="flex items-center gap-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-lg border border-slate-100 text-slate-500">{t.category?.includes('Network') ? <Wifi size={15}/> : t.category?.includes('Printer') ? <Printer size={15}/> : t.category?.includes('CCTV') ? <Camera size={15}/> : t.category?.includes('Email') ? <Mail size={15}/> : t.device?.includes('Laptop') ? <Laptop size={15}/> : <Monitor size={15}/>}</span><span><b className="block text-[10px] text-slate-700">{t.title}</b><small className="mt-1 block text-[9px] text-slate-400">{t.device} · {t.department}</small></span></div></td>{role === 'it' && <td className="px-4 py-3 text-[10px] text-slate-600">{t.staff}</td>}<td className="px-4 py-3"><span className={cx('rounded-md px-2 py-1 text-[9px] font-bold', t.priority === 'Critical' || t.priority === 'High' ? 'bg-rose-50 text-rose-700' : t.priority === 'Medium' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>{t.priority}</span></td><td className="px-4 py-3"><Badge status={t.status}/></td><td className="px-4 py-3 text-[9px] text-slate-400">{t.created}</td><td className="px-4 py-3 text-slate-400"><ArrowUpRight size={15}/></td></tr>)}</tbody></table></div>}</section> }
function ComplaintForm({ close, submit, profile }) {
  const [form, setForm] = useState({ department: '', device: 'Desktop PC', category: 'Hardware', location: '', priority: 'Medium', title: '', description: '' })
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const change = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
  const label = 'mb-1.5 block text-[10px] font-bold text-slate-600'
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-sm" onMouseDown={e => e.target === e.currentTarget && close()}><div className="my-auto max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7"><div className="mb-6 flex justify-between"><div><p className="mb-1 text-[9px] font-extrabold tracking-widest text-blue-600">NEW SUPPORT REQUEST</p><h2 className="text-xl font-extrabold">Log a complaint</h2><p className="mt-1 text-[11px] text-slate-400">Submitting as {profile.full_name || profile.email}</p></div><button onClick={close} className="self-start text-slate-400"><X size={20}/></button></div><form onSubmit={async e => { e.preventDefault(); setError(''); setBusy(true); try { await submit(form) } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) } }} className="grid gap-4 sm:grid-cols-2"><label><span className={label}>Department *</span><select className={fieldClass} value={form.department} onChange={e => change('department', e.target.value)} required><option value="">Select department</option>{departments.map(x => <option key={x}>{x}</option>)}</select></label><label><span className={label}>Device / equipment *</span><select className={fieldClass} value={form.device} onChange={e => change('device', e.target.value)}>{devices.map(x => <option key={x}>{x}</option>)}</select></label><label><span className={label}>Issue category</span><select className={fieldClass} value={form.category} onChange={e => change('category', e.target.value)}>{categories.map(x => <option key={x}>{x}</option>)}</select></label><label><span className={label}>Priority</span><select className={fieldClass} value={form.priority} onChange={e => change('priority', e.target.value)}>{priorities.map(x => <option key={x}>{x}</option>)}</select></label><label className="sm:col-span-2"><span className={label}>Office / workstation location</span><input className={fieldClass} placeholder="e.g. Finance Office, Desk 04" value={form.location} onChange={e => change('location', e.target.value)}/></label><label className="sm:col-span-2"><span className={label}>Short issue title *</span><input className={fieldClass} placeholder="e.g. My computer will not start" value={form.title} onChange={e => change('title', e.target.value)} required/></label><label className="sm:col-span-2"><span className={label}>Describe the problem *</span><textarea className={fieldClass} rows="4" placeholder="What happened? When did it start? Include any error message…" value={form.description} onChange={e => change('description', e.target.value)} required/></label>{error && <p className="text-[11px] text-rose-600 sm:col-span-2">{error}</p>}<div className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-[10px] text-blue-700 sm:col-span-2"><ShieldCheck size={16}/>Your account identity is attached automatically.</div><div className="flex justify-end gap-2 border-t border-slate-100 pt-4 sm:col-span-2"><button type="button" onClick={close} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">Cancel</button><button disabled={busy} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-60"><Plus size={15}/>{busy ? 'Submitting…' : 'Submit complaint'}</button></div></form></div></div>
}
function TicketDetails({ ticket, isAdmin, people, close, save }) {
  const [status, setStatus] = useState(ticket.status); const [assignedTo, setAssignedTo] = useState(ticket.assigned_to || ''); const [fault, setFault] = useState(ticket.fault || ''); const [resolution, setResolution] = useState(ticket.resolution || ''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const input = fieldClass
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-sm" onMouseDown={e => e.target === e.currentTarget && close()}><div className="my-auto max-h-[95vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7"><div className="mb-5 flex items-start justify-between gap-4"><div><span className="text-[10px] font-extrabold text-blue-700">{ticket.ticket_number}</span><h2 className="mt-1 text-lg font-extrabold">{ticket.title}</h2><p className="mt-1 text-[10px] text-slate-400">Submitted {ticket.created}</p></div><button onClick={close} className="text-slate-400"><X size={20}/></button></div><div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4">{[['Reported by', ticket.staff], ['Department', ticket.department], ['Device', ticket.device], ['Location', ticket.location || 'Not provided'], ['Priority', ticket.priority], ['Status', ticket.status], ['Assigned to', ticket.assigned || 'Unassigned']].map(([key, value]) => <div key={key}><span className="block text-[9px] text-slate-400">{key}</span><b className="mt-1 block text-[11px] text-slate-700">{value}</b></div>)}</div><div className="border-b border-slate-100 py-4"><b className="text-[9px] tracking-wider text-slate-400">ISSUE DESCRIPTION</b><p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{ticket.description}</p></div>{isAdmin ? <div className="mt-4 space-y-3"><label className="block"><span className="mb-1.5 block text-[10px] font-bold">Ticket status</span><select className={input} value={status} onChange={e => setStatus(e.target.value)}>{statuses.map(x => <option key={x}>{x}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-[10px] font-bold">Assigned IT officer</span><select className={input} value={assignedTo} onChange={e => setAssignedTo(e.target.value)}><option value="">Unassigned</option>{people.map(person => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-[10px] font-bold">Fault identified</span><textarea className={input} rows="2" value={fault} onChange={e => setFault(e.target.value)} placeholder="Record the cause of the fault…"/></label><label className="block"><span className="mb-1.5 block text-[10px] font-bold">Corrective action / resolution {status === 'Resolved' && <em className="text-rose-500">*</em>}</span><textarea className={input} rows="3" value={resolution} onChange={e => setResolution(e.target.value)} placeholder="What did you do to fix it?"/></label>{error && <p className="text-[11px] text-rose-600">{error}</p>}<div className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-[10px] text-blue-700"><Wrench size={15}/>Record the corrective action before marking the ticket resolved.</div><div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button onClick={close} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold">Close</button><button disabled={busy} onClick={async () => { setError(''); setBusy(true); try { await save(ticket, { status, assigned_to: assignedTo, fault_identified: fault, resolution }) } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) } }} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"><CheckCircle2 size={15}/>{busy ? 'Saving…' : 'Save update'}</button></div></div> : <div className="py-4"><b className="text-[9px] tracking-wider text-slate-400">IT RESOLUTION</b><p className="mt-2 text-xs text-slate-600">{ticket.resolution || 'The IT team has not recorded a resolution yet.'}</p>{ticket.fault && <><b className="mt-4 block text-[9px] tracking-wider text-slate-400">FAULT IDENTIFIED</b><p className="mt-2 text-xs text-slate-600">{ticket.fault}</p></>}<button onClick={close} className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white">Done</button></div>}</div></div>
}
function NotificationPanel({ items, onRead, onReadAll, busy, close }) {
  const unread = items.filter(item => !item.is_read).length
  return <div className="absolute right-0 top-12 z-50 w-[min(92vw,380px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
    <div className="flex items-center justify-between border-b border-slate-100 p-4"><div><b className="text-xs">Notifications</b><p className="mt-1 text-[10px] text-slate-400">{unread ? `${unread} unread` : 'You are all caught up'}</p></div><div className="flex items-center gap-3"><button disabled={!unread || busy} onClick={onReadAll} className="text-[10px] font-bold text-blue-600 disabled:text-slate-300">Mark all read</button><button onClick={close} className="text-slate-400"><X size={16}/></button></div></div>
    <div className="max-h-[420px] overflow-y-auto">{items.length ? items.map(item => <button key={item.id} onClick={() => !item.is_read && onRead(item.id)} className={cx('block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50', !item.is_read && 'bg-blue-50/60')}><div className="flex items-start gap-3"><span className={cx('mt-1 size-2 shrink-0 rounded-full', item.is_read ? 'bg-slate-200' : 'bg-blue-600')}/><span className="min-w-0 flex-1"><b className="block text-[11px] text-slate-800">{item.title}</b><span className="mt-1 block text-[10px] leading-relaxed text-slate-500">{item.message}</span><span className="mt-2 block text-[9px] text-slate-400">{formatDate(item.created_at)}</span></span></div></button>) : <p className="p-8 text-center text-xs text-slate-400">No notifications yet.</p>}</div>
  </div>
}

function StaffManagement({ people, invite, updateUser, setUserAccess, sendPasswordReset, currentUserId }) {
  const [form, setForm] = useState({ full_name: '', email: '', role: 'staff' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [updating, setUpdating] = useState('')
  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState({ full_name: '', email: '', role: 'staff' })
  const [editError, setEditError] = useState('')
  const staffCount = people.filter(person => person.role === 'staff').length
  const adminCount = people.filter(person => person.role === 'it_admin').length
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('')
    try { await invite(form); setSuccess(`Invitation sent to ${form.email}. They should use the invitation email to activate their account.`); window.alert('Invitation sent'); setForm({ full_name: '', email: '', role: 'staff' }) }
    catch (err) { setError(errorMessage(err)) } finally { setBusy(false) }
  }
  function startEditing(person) {
    setEditing(person)
    setEditForm({ full_name: person.full_name || '', email: person.email || '', role: person.role })
    setEditError('')
  }
  async function saveUser(event) {
    event.preventDefault()
    setUpdating(editing.id); setEditError('')
    try { await updateUser(editing, editForm); setEditing(null) }
    catch (err) { setEditError(errorMessage(err)) }
    finally { setUpdating('') }
  }
  async function toggleUserAccess(person) {
    const isActive = person.is_active === false
    if (!window.confirm(`${isActive ? 'Restore' : 'Disable'} ${person.full_name || person.email}'s sign-in access? Their profile and support history will be kept.`)) return
    setUpdating(person.id); setError('')
    try { await setUserAccess(person, isActive) } catch (err) { setError(errorMessage(err)) } finally { setUpdating('') }
  }
  async function resetUserPassword(person) {
    if (person.is_active === false) {
      setError('Reactivate this account before sending a password reset email.')
      return
    }
    if (!window.confirm(`Send a password reset email to ${person.email}?`)) return
    setUpdating(person.id); setError('')
    try { await sendPasswordReset(person) } catch (err) { setError(errorMessage(err)) } finally { setUpdating('') }
  }
  return <div className="space-y-5">
    <div><p className="mb-1 text-[10px] font-extrabold tracking-widest text-blue-600">ACCESS CONTROL</p><h1 className="text-xl font-extrabold">Staff & IT personnel</h1><p className="mt-1 text-xs text-slate-500">Invite employees and manage portal roles. New users receive an account activation email.</p></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><StatCard label="Total accounts" value={people.length} icon={Users} color="bg-blue-50 text-blue-600"/><StatCard label="Staff" value={staffCount} icon={Users} color="bg-emerald-50 text-emerald-600"/><StatCard label="IT administrators" value={adminCount} icon={ShieldCheck} color="bg-violet-50 text-violet-600"/></div>
    <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="mb-4 flex items-center gap-2"><UserPlus size={17} className="text-blue-600"/><h2 className="text-sm font-extrabold">Invite a user</h2></div><form onSubmit={submit} className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-[10px] font-bold text-slate-600">Full name</span><input className={fieldClass} required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Employee full name"/></label><label><span className="mb-1 block text-[10px] font-bold text-slate-600">Email address</span><input className={fieldClass} type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="employee@example.com"/></label><label><span className="mb-1 block text-[10px] font-bold text-slate-600">Account role</span><select className={fieldClass} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="staff">Staff</option><option value="it_admin">IT administrator</option></select></label><div className="flex items-end">        <button disabled={busy} className="action-button w-full rounded-lg px-4 py-3 text-xs font-bold disabled:opacity-60">{busy ? 'Sending invitation…' : 'Send invitation'}</button></div>{error && <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700 sm:col-span-2">{error}</p>}{success && <p className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700 sm:col-span-2">{success}</p>}</form><p className="mt-3 text-[10px] leading-relaxed text-slate-400">Only trusted IT administrators should be assigned the administrator role. Account invitations are sent by Supabase Auth.</p></section>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-5"><h2 className="text-sm font-extrabold">Registered accounts</h2><p className="mt-1 text-[10px] text-slate-400">Edit user details, send password reset emails, or disable and restore sign-in access. Existing ticket history is preserved.</p></div>{error && <p className="border-b border-rose-100 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}<div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3">Employee</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{people.map(person => { const status = person.is_active === false ? 'Deactivated' : person.is_pending ? 'Pending' : 'Active'; return <tr key={person.id}><td className="px-5 py-3 text-xs font-bold text-slate-700">{person.full_name || '—'}{person.id === currentUserId && <span className="ml-2 text-[9px] text-blue-600">You</span>}</td><td className="px-5 py-3 text-[11px] text-slate-500">{person.email}</td><td className="px-5 py-3"><span className="rounded-md bg-slate-100 px-2 py-1 text-[9px] font-bold">{person.role === 'it_admin' ? 'IT administrator' : 'Staff'}</span></td><td className="px-5 py-3"><span className={cx('rounded-md px-2 py-1 text-[9px] font-bold', status === 'Deactivated' ? 'bg-rose-50 text-rose-700' : status === 'Pending' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>{status}</span></td><td className="px-5 py-3"><div className="flex items-center gap-2"><button disabled={updating === person.id || person.is_active === false} onClick={() => resetUserPassword(person)} title={person.is_active === false ? 'Reactivate this account before sending a reset email' : 'Send password reset email'} className="inline-flex items-center gap-1 rounded-md border border-blue-100 px-2 py-1.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"><KeyRound size={12}/>{updating === person.id ? 'Sending…' : 'Reset password'}</button><button disabled={updating === person.id} onClick={() => startEditing(person)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Pencil size={12}/>Edit</button><button disabled={person.id === currentUserId || updating === person.id} onClick={() => toggleUserAccess(person)} title={person.id === currentUserId ? 'You cannot deactivate your own account' : `${person.is_active === false ? 'Reactivate' : 'Deactivate'} sign-in access`} className={cx('rounded-md border px-2 py-1.5 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-40', person.is_active === false ? 'border-emerald-100 text-emerald-700 hover:bg-emerald-50' : 'border-rose-100 text-rose-700 hover:bg-rose-50')}>{updating === person.id ? 'Saving…' : person.is_active === false ? 'Reactivate' : 'Deactivate'}</button></div></td></tr> })}</tbody></table></div>{!people.length && <p className="p-6 text-center text-xs text-slate-400">No accounts found.</p>}</section>
    {editing && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><form onSubmit={saveUser} className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-xl"><div><h2 className="text-base font-extrabold">Edit user</h2><p className="mt-1 text-xs text-slate-500">Update this account's name, email, and role.</p></div><label className="block"><span className="mb-1 block text-[10px] font-bold text-slate-600">Full name</span><input className={fieldClass} required value={editForm.full_name} onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}/></label><label className="block"><span className="mb-1 block text-[10px] font-bold text-slate-600">Email address</span><input className={fieldClass} type="email" required value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })}/></label><label className="block"><span className="mb-1 block text-[10px] font-bold text-slate-600">Account role</span><select className={fieldClass} disabled={editing.id === currentUserId} value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}><option value="staff">Staff</option><option value="it_admin">IT administrator</option></select>{editing.id === currentUserId && <span className="mt-1 block text-[10px] text-slate-400">You cannot change your own administrator role.</span>}</label>{editError && <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{editError}</p>}<div className="flex justify-end gap-2"><button type="button" disabled={updating === editing.id} onClick={() => setEditing(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600">Cancel</button><button disabled={updating === editing.id} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60">{updating === editing.id ? 'Saving…' : 'Save changes'}</button></div></form></div>}
  </div>
}

function Reports({ tickets }) {
  const [period, setPeriod] = useState('all')
  const filtered = tickets.filter(ticket => {
    if (period === 'all') return true
    const days = period === '7' ? 7 : 30
    return new Date(ticket.created_at).getTime() >= Date.now() - days * 86400000
  })
  const total = filtered.length
  const resolved = filtered.filter(t => t.status === 'Resolved').length
  const resolutionRate = total ? Math.round((resolved / total) * 100) : 0
  const groupCount = (key) => Object.entries(filtered.reduce((acc, ticket) => { const name = ticket[key] || 'Not specified'; acc[name] = (acc[name] || 0) + 1; return acc }, {})).sort((a,b) => b[1]-a[1]).slice(0, 6)
  const statusRows = [['Open', filtered.filter(t => t.status === 'Open').length], ['In Progress', filtered.filter(t => t.status === 'In Progress').length], ['Resolved', resolved]]
  const exportCsv = () => {
    const rows = filtered.map(t => [t.ticket_number, t.title, t.staff, t.department, t.device, t.category, t.priority, t.status, t.created_at, t.resolved_at, t.assigned, t.resolution])
    const csv = [['Ticket','Issue','Reported by','Department','Device','Category','Priority','Status','Created','Resolved','Assigned to','Resolution'], ...rows].map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
    const link = document.createElement('a'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.href = url; link.download = 'it-support-report.csv'; link.click(); URL.revokeObjectURL(url)
  }
  const BarList = ({ title, rows }) => <section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="mb-4 text-xs font-extrabold">{title}</h3>{rows.length ? <div className="space-y-4">{rows.map(([label, value]) => <div key={label}><div className="mb-1.5 flex justify-between text-[10px]"><span className="font-semibold text-slate-600">{label}</span><span className="text-slate-400">{value}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(3, (value / Math.max(1, total)) * 100)}%` }}/></div></div>)}</div> : <p className="text-xs text-slate-400">No data for this period.</p>}</section>
  return <div className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="mb-1 text-[10px] font-extrabold tracking-widest text-blue-600">SERVICE PERFORMANCE</p><h1 className="text-xl font-extrabold">Analytics & reports</h1><p className="mt-1 text-xs text-slate-500">Track complaint volume, priorities and resolution performance.</p></div><div className="flex gap-2"><select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" value={period} onChange={e => setPeriod(e.target.value)}><option value="all">All time</option><option value="30">Last 30 days</option><option value="7">Last 7 days</option></select><button onClick={exportCsv} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white">Export CSV</button></div></div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><StatCard label="Total complaints" value={total} icon={Ticket} color="bg-blue-50 text-blue-600"/><StatCard label="Open" value={statusRows[0][1]} icon={Clock3} color="bg-amber-50 text-amber-600"/><StatCard label="In progress" value={statusRows[1][1]} icon={Activity} color="bg-violet-50 text-violet-600"/><StatCard label="Resolution rate" value={`${resolutionRate}%`} icon={CheckCircle2} color="bg-emerald-50 text-emerald-600"/></div>
    <div className="grid gap-5 lg:grid-cols-2"><BarList title="Complaints by status" rows={statusRows}/><BarList title="Complaints by priority" rows={['Critical','High','Medium','Low'].map(level => [level, filtered.filter(t => t.priority === level).length])}/><BarList title="Top departments" rows={groupCount('department')}/><BarList title="Top issue categories" rows={groupCount('category')}/></div>
    <section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="text-xs font-extrabold">Reporting notes</h3><p className="mt-2 text-[11px] leading-relaxed text-slate-500">Metrics are calculated from the complaints currently available to the IT administrator. Export CSV to review, archive or prepare quarterly appraisal reports in Excel.</p></section>
  </div>
}


createRoot(document.getElementById('root')).render(<App />)
