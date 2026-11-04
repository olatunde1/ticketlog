import { useEffect, useRef, useState } from 'react'
import { Bell, MessageCircle, Send, X } from 'lucide-react'
import { supabase } from './lib/supabase'

const maxMessageLength = 2000

function isChatMessage(value) {
  return value &&
    typeof value.id === 'string' &&
    typeof value.senderId === 'string' &&
    typeof value.text === 'string' &&
    typeof value.createdAt === 'string' &&
    value.text.length <= maxMessageLength
}

function isChatRequest(value) {
  return value &&
    typeof value.senderId === 'string' &&
    typeof value.senderName === 'string' &&
    typeof value.createdAt === 'string'
}

export default function ChatWidget({ profile, people }) {
  const [open, setOpen] = useState(false)
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [connection, setConnection] = useState('closed')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [chatRequests, setChatRequests] = useState({})
  const [requestError, setRequestError] = useState('')
  const channelRef = useRef(null)
  const requestChannelRef = useRef(null)
  const bottomRef = useRef(null)
  const viewingStaffIdRef = useRef('')
  const isAdmin = profile.role === 'it_admin'
  const currentUserId = profile.id
  const staff = isAdmin
    ? people.filter(person => person.role === 'staff' && person.is_active !== false && !person.is_pending)
    : []
  const conversationId = isAdmin ? selectedStaffId : currentUserId
  const selectedStaff = staff.find(person => person.id === selectedStaffId)
  viewingStaffIdRef.current = open ? conversationId : ''

  useEffect(() => {
    if (!isAdmin) return

    let active = true
    const channel = supabase.channel('support-chat-requests', {
      config: { private: true, broadcast: { self: false } }
    })
      .on('broadcast', { event: 'chat-request' }, ({ payload }) => {
        const requester = people.find(person => person.id === payload?.senderId && person.role === 'staff' && person.is_active !== false && !person.is_pending)
        if (active && requester && isChatRequest(payload)) {
          setChatRequests(current => ({ ...current, [requester.id]: { staffId: requester.id, staffName: requester.full_name || requester.email, createdAt: payload.createdAt } }))
        }
      })
      .subscribe(status => {
        if (!active) return
        if (status === 'SUBSCRIBED') setRequestError('')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRequestError('Chat request notifications could not connect.')
      })

    requestChannelRef.current = channel
    return () => {
      active = false
      if (requestChannelRef.current === channel) requestChannelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [isAdmin, people])

  useEffect(() => {
    if (!isAdmin) return

    let active = true
    const activeStaff = people.filter(person => person.role === 'staff' && person.is_active !== false && !person.is_pending)
    const channels = activeStaff.map(person => supabase.channel(`support-chat-${person.id}`, {
      config: { private: true, broadcast: { self: false } }
    })
      .on('broadcast', { event: 'chat-message' }, ({ payload }) => {
        if (!active || !isChatMessage(payload) || payload.senderId !== person.id) return
        if (viewingStaffIdRef.current === person.id) return
        setChatRequests(current => ({
          ...current,
          [person.id]: {
            staffId: person.id,
            staffName: person.full_name || person.email,
            createdAt: payload.createdAt
          }
        }))
      })
      .subscribe(status => {
        if (!active) return
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRequestError('Chat message notifications could not connect.')
        }
      }))

    return () => {
      active = false
      channels.forEach(channel => { void supabase.removeChannel(channel) })
    }
  }, [isAdmin, people])

  useEffect(() => {
    if (isAdmin) return

    let active = true
    const channel = supabase.channel(`support-chat-${currentUserId}`, {
      config: { private: true, broadcast: { self: false } }
    })
      .on('broadcast', { event: 'chat-message' }, ({ payload }) => {
        if (!active || !isChatMessage(payload) || payload.senderId === currentUserId) return
        if (viewingStaffIdRef.current === currentUserId) return
        setChatRequests(current => ({
          ...current,
          [currentUserId]: {
            staffId: currentUserId,
            staffName: 'IT support',
            createdAt: payload.createdAt
          }
        }))
      })
      .subscribe(status => {
        if (!active) return
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRequestError('Chat message notifications could not connect.')
        }
      })

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [isAdmin, currentUserId])

  useEffect(() => {
    if (isAdmin || !open) return

    let active = true
    const channel = supabase.channel('support-chat-requests', {
      config: { private: true, broadcast: { self: false } }
    }).subscribe(status => {
      if (!active || status !== 'SUBSCRIBED') return
      void channel.send({
        type: 'broadcast',
        event: 'chat-request',
        payload: {
          senderId: currentUserId,
          senderName: profile.full_name || profile.email || 'Staff member',
          createdAt: new Date().toISOString()
        }
      }).then(result => {
        if (active && result !== 'ok') setRequestError('Your chat request could not be sent. Please close and reopen chat to try again.')
      }).catch(() => {
        if (active) setRequestError('Your chat request could not be sent. Please close and reopen chat to try again.')
      })
    })

    requestChannelRef.current = channel
    return () => {
      active = false
      if (requestChannelRef.current === channel) requestChannelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [isAdmin, open, currentUserId, profile.email, profile.full_name])

  useEffect(() => {
    setMessages([])
    setError('')
  }, [conversationId])

  useEffect(() => {
    if (!open || !conversationId) {
      setConnection('closed')
      return
    }

    let active = true
    setError('')
    setConnection('connecting')
    const channel = supabase.channel(`support-chat-${conversationId}`, {
      config: { private: true, broadcast: { self: false } }
    })
      .on('broadcast', { event: 'chat-message' }, ({ payload }) => {
        if (active && isChatMessage(payload)) {
          setMessages(current => [...current, payload])
        }
      })
      .subscribe(status => {
        if (!active) return
        if (status === 'SUBSCRIBED') {
          setConnection('connected')
          setError('')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnection('error')
          setError('Chat could not connect. Check your connection and reopen the chat.')
        } else if (status === 'CLOSED') {
          setConnection('closed')
        }
      })

    channelRef.current = channel
    return () => {
      active = false
      if (channelRef.current === channel) channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [open, conversationId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(event) {
    event.preventDefault()
    const text = draft.trim()
    const channel = channelRef.current
    if (!text || !channel || connection !== 'connected' || sending) return

    setSending(true)
    setError('')
    const message = {
      id: crypto.randomUUID(),
      senderId: currentUserId,
      senderName: profile.full_name || profile.email || 'User',
      text: text.slice(0, maxMessageLength),
      createdAt: new Date().toISOString()
    }
    try {
      const status = await channel.send({ type: 'broadcast', event: 'chat-message', payload: message })
      if (status !== 'ok') throw new Error('Message was not delivered. Please try again.')
      setMessages(current => [...current, message])
      setDraft('')
    } catch (sendError) {
      setError(sendError?.message || 'Message was not delivered. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return <>
    <button
      type="button"
      onClick={() => {
        if (!open && !isAdmin) {
          setChatRequests(current => {
            const next = { ...current }
            delete next[currentUserId]
            return next
          })
        }
        setOpen(value => !value)
      }}
      aria-label={open ? 'Close support chat' : 'Open support chat'}
      aria-expanded={open}
      className="action-button fixed bottom-5 right-5 z-40 inline-flex min-h-12 items-center gap-2 rounded-full px-5 py-3 text-sm font-bold shadow-lg"
    >
      {open ? <X size={18}/> : Object.keys(chatRequests).length ? <Bell size={18}/> : <MessageCircle size={18}/>}
      {open ? 'Close chat' : 'Chat with IT'}
      {!open && Object.keys(chatRequests).length > 0 && <span className="grid size-5 place-items-center rounded-full bg-white text-[10px] font-extrabold text-[#16314f]">{Object.keys(chatRequests).length}</span>}
    </button>

    {open && <section aria-label="IT support chat" className="fixed bottom-20 right-4 z-50 flex h-[min(70vh,520px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-center justify-between bg-[#16314f] px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <b className="block truncate text-sm">{isAdmin ? selectedStaff ? selectedStaff.full_name || selectedStaff.email : 'IT support chats' : 'Chat with IT support'}</b>
          {isAdmin
            ? <>
              <select aria-label="Choose a staff member" className="mt-1 max-w-full rounded border border-white/30 bg-transparent px-2 py-1 text-xs text-white" value={selectedStaffId} onChange={event => {
                const staffId = event.target.value
                setSelectedStaffId(staffId)
                setChatRequests(current => {
                  const next = { ...current }
                  delete next[staffId]
                  return next
                })
              }}>
              <option className="text-slate-900" value="">Choose a staff member</option>
              {staff.map(person => <option className="text-slate-900" key={person.id} value={person.id}>{person.full_name || person.email}</option>)}
              </select>
              {selectedStaffId && <span className="mt-1 block text-[10px] text-white/75">{connection === 'connected' ? 'Connected' : connection === 'connecting' ? 'Connecting…' : connection === 'error' ? 'Connection issue' : 'Offline'}</span>}
            </>
            : <span className="mt-1 block text-[10px] text-white/75">{connection === 'connected' ? 'Connected' : connection === 'connecting' ? 'Connecting…' : connection === 'error' ? 'Connection issue' : 'Offline'}</span>}
        </div>
        <button type="button" aria-label="Close chat" onClick={() => setOpen(false)} className="ml-3 rounded p-1 text-white/80 hover:bg-white/10">
          <X size={18}/>
        </button>
      </header>

      {isAdmin && Object.keys(chatRequests).length > 0 && <div className="space-y-2 border-b border-amber-100 bg-amber-50 p-3">
        <p className="flex items-center gap-2 text-[11px] font-bold text-amber-900"><Bell size={14}/>{Object.keys(chatRequests).length} new chat request{Object.keys(chatRequests).length === 1 ? '' : 's'}</p>
        <div className="flex flex-wrap gap-2">
          {Object.values(chatRequests).map(request => <button key={request.staffId} type="button" onClick={() => {
            setSelectedStaffId(request.staffId)
            setChatRequests(current => {
              const next = { ...current }
              delete next[request.staffId]
              return next
            })
          }} className="action-button rounded-lg px-3 py-1.5 text-[10px] font-semibold">
            Chat with {request.staffName}
          </button>)}
        </div>
      </div>}

      {requestError && <p role="status" className="border-b border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">{requestError}</p>}

      {isAdmin && !selectedStaffId
        ? <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          {staff.length
            ? <p className="text-xs text-slate-500">{Object.keys(chatRequests).length ? 'Select a request above or choose a staff member to start a chat.' : 'Choose a staff member above to start a live chat.'}</p>
            : <p className="text-xs text-slate-500">There are no active staff accounts to chat with.</p>}
        </div>
        : <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4" aria-live="polite">
            {!messages.length && <p className="pt-6 text-center text-xs leading-relaxed text-slate-400">Start a conversation. Messages are temporary and are not saved.</p>}
            {messages.map(message => {
              const isMine = message.senderId === currentUserId
              return <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${isMine ? 'bg-[#16314f] text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>
                  <p className="whitespace-pre-wrap break-words text-xs">{message.text}</p>
                  <time className={`mt-1 block text-right text-[9px] ${isMine ? 'text-white/60' : 'text-slate-400'}`} dateTime={message.createdAt}>
                    {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </time>
                </div>
              </div>
            })}
            <div ref={bottomRef}/>
          </div>
          {error && <p role="alert" className="border-t border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">{error}</p>}
          <form onSubmit={sendMessage} className="flex items-end gap-2 border-t border-slate-100 p-3">
            <textarea
              aria-label="Write a message"
              className="max-h-24 min-h-10 flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 outline-none focus:border-slate-400"
              maxLength={maxMessageLength}
              placeholder="Write a message…"
              rows={1}
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  event.currentTarget.form.requestSubmit()
                }
              }}
            />
            <button type="submit" className="action-button inline-flex size-10 shrink-0 items-center justify-center rounded-lg disabled:cursor-not-allowed disabled:opacity-50" disabled={sending || connection !== 'connected' || !draft.trim()} aria-label="Send message">
              <Send size={16}/>
            </button>
          </form>
          <p className="px-3 pb-2 text-center text-[9px] text-slate-400">
            Live chat only. Messages sent while the other person is offline are not retained.
          </p>
        </div>}
    </section>}
  </>
}
