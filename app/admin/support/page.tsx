'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { SupportConversation, SupportMessage, SupportCannedResponse } from '@/lib/supabase'

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  black:  '#111111',
  muted:  '#666666',
  ghost:  '#999999',
  border: '#EEEEEE',
  bg:     '#FAFAFA',
  green:  '#2DB87E',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  return new Date(iso).toLocaleDateString()
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getCategoryMeta(cat: string) {
  const map: Record<string, { label: string; color: string; bg: string; border: string }> = {
    bug:             { label: '🐛 Bug',     color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
    question:        { label: '❓ Question', color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
    feature_request: { label: '💡 Feature', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
    billing:         { label: '💳 Billing', color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
    general:         { label: 'General',   color: '#374151', bg: '#F9FAFB', border: '#E5E7EB' },
  }
  return map[cat] ?? { label: cat, color: '#666', bg: '#F5F5F5', border: '#EEEEEE' }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'open':           return { label: 'Open',            color: '#15803D', bg: '#F0FDF4' }
    case 'awaiting_admin': return { label: 'Awaiting admin',  color: '#C2410C', bg: '#FFF7ED' }
    case 'awaiting_va':    return { label: 'Awaiting VA',     color: '#1D4ED8', bg: '#EFF6FF' }
    case 'resolved':       return { label: 'Resolved',        color: '#6B7280', bg: '#F9FAFB' }
    case 'closed':         return { label: 'Closed',          color: '#9CA3AF', bg: '#F9FAFB' }
    default:               return { label: status,            color: '#6B7280', bg: '#F9FAFB' }
  }
}

function getPriorityDot(priority: string) {
  if (priority === 'high')   return { color: '#EF4444', title: 'High priority' }
  if (priority === 'low')    return { color: '#9CA3AF', title: 'Low priority' }
  return null
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ConvWithVA = SupportConversation & { va_name?: string }

// ─── Canned responses dropdown ────────────────────────────────────────────────

function CannedDropdown({ onSelect, onClose }: {
  onSelect: (text: string, id: string) => void
  onClose: () => void
}) {
  const [canned, setCanned] = useState<SupportCannedResponse[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/support/canned').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setCanned(d)
    })
  }, [])

  const filtered = canned.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.message.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div style={{
      position: 'absolute', bottom: '100%', left: 0, right: 0,
      background: '#FFFFFF', border: `1px solid ${T.border}`, borderRadius: 10,
      boxShadow: '0 -4px 20px rgba(0,0,0,0.1)', marginBottom: 4,
      maxHeight: 300, display: 'flex', flexDirection: 'column', zIndex: 20,
    }}>
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${T.border}` }}>
        <input
          autoFocus
          type="text"
          placeholder="Search responses..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '6px 10px', borderRadius: 6, fontSize: 12,
            border: `1px solid ${T.border}`, outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: T.ghost, fontSize: 12 }}>
            No responses found
          </div>
        ) : filtered.map(c => (
          <div
            key={c.id}
            onClick={() => { onSelect(c.message, c.id); onClose() }}
            style={{
              padding: '10px 14px', cursor: 'pointer', borderBottom: `1px solid ${T.border}`,
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = T.bg}
            onMouseLeave={e => e.currentTarget.style.background = '#FFFFFF'}
          >
            <div style={{ fontSize: 12, fontWeight: 500, color: T.black, marginBottom: 3 }}>
              {c.title}
            </div>
            <div style={{ fontSize: 11, color: T.ghost, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.message}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '8px 14px', borderTop: `1px solid ${T.border}` }}>
        <a href="/admin/support/canned" style={{ fontSize: 11, color: T.green, textDecoration: 'none' }}>
          Manage canned responses →
        </a>
        <button onClick={onClose} style={{ float: 'right', fontSize: 11, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer' }}>
          Close
        </button>
      </div>
    </div>
  )
}

// ─── Admin Chat Area ──────────────────────────────────────────────────────────

function AdminChatArea({
  conv, messages, adminId, onAction, onSent,
}: {
  conv: ConvWithVA
  messages: SupportMessage[]
  adminId: string | null
  onAction: (action: string, value?: string) => void
  onSent: (msg: SupportMessage) => void
}) {
  const [text,         setText]         = useState('')
  const [sending,      setSending]      = useState(false)
  const [uploading,    setUploading]    = useState(false)
  const [attachment,   setAttachment]   = useState<{ url: string; name: string; type: string } | null>(null)
  const [showCanned,   setShowCanned]   = useState(false)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef    = useRef<HTMLInputElement>(null)
  const isClosed   = conv.status === 'closed'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function uploadFile(file: File) {
    if (file.size > 5 * 1024 * 1024) { alert('Max 5MB'); return }
    setUploading(true)
    try {
      const ext  = file.name.split('.').pop()
      const path = `${conv.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error } = await supabase.storage.from('support-attachments').upload(path, file)
      if (error) { alert('Upload failed'); return }
      const { data: urlData } = await supabase.storage
        .from('support-attachments').createSignedUrl(path, 60 * 60 * 24 * 7)
      setAttachment({ url: urlData?.signedUrl ?? '', name: file.name, type: file.type.startsWith('image/') ? 'image' : 'file' })
    } finally { setUploading(false) }
  }

  async function sendMessage() {
    const trimmed = text.trim()
    if (!trimmed && !attachment) return
    if (isClosed || !adminId) return
    setSending(true)
    try {
      const res = await fetch(`/api/support/conversations/${conv.id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: adminId, sender_role: 'admin',
          message: trimmed || (attachment?.name ?? ''),
          message_type: attachment?.type === 'image' ? 'image' : 'text',
          attachment_url: attachment?.url ?? null,
          attachment_name: attachment?.name ?? null,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setText('')
        setAttachment(null)
        onSent(data)
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      } else {
        alert(data.error ?? 'Failed to send')
      }
    } finally { setSending(false) }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() }
  }

  function autoResize() {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }

  const cat = getCategoryMeta(conv.category)
  const sta = getStatusLabel(conv.status)
  const dot = getPriorityDot(conv.priority)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px', borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        flexShrink: 0, gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            {dot && (
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot.color, flexShrink: 0 }} title={dot.title} />
            )}
            <h2 style={{ fontSize: 14, fontWeight: 600, color: T.black, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {conv.subject}
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: cat.bg, color: cat.color, border: `1px solid ${cat.border}` }}>
              {cat.label}
            </span>
            <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: sta.bg, color: sta.color }}>
              {sta.label}
            </span>
            {conv.va_name && (
              <span style={{ fontSize: 11, color: T.ghost }}>VA: {conv.va_name}</span>
            )}
          </div>
        </div>

        {/* Admin action buttons */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {!conv.admin_id && adminId && (
            <button
              onClick={() => onAction('assign')}
              style={{ fontSize: 11, fontWeight: 500, padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#F9FAFB', color: T.black, cursor: 'pointer' }}
            >
              Assign to me
            </button>
          )}
          {conv.status !== 'resolved' && conv.status !== 'closed' && (
            <>
              <button
                onClick={() => onAction('resolve')}
                style={{ fontSize: 11, fontWeight: 500, padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.green}`, background: 'none', color: T.green, cursor: 'pointer' }}
              >
                Resolve
              </button>
              <button
                onClick={() => onAction('close')}
                style={{ fontSize: 11, fontWeight: 500, padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#F9FAFB', color: T.muted, cursor: 'pointer' }}
              >
                Close
              </button>
            </>
          )}
          {/* Priority selector */}
          <select
            value={conv.priority}
            onChange={e => onAction('priority', e.target.value)}
            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: `1px solid ${T.border}`, color: T.muted, background: '#F9FAFB', cursor: 'pointer' }}
          >
            <option value="high">⬆ High</option>
            <option value="normal">Normal</option>
            <option value="low">⬇ Low</option>
          </select>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column' }}>
        {messages.map(msg => {
          if (msg.message_type === 'system') {
            return (
              <div key={msg.id} style={{ textAlign: 'center', margin: '10px 0' }}>
                <span style={{ fontSize: 12, color: T.ghost, fontStyle: 'italic' }}>{msg.message}</span>
              </div>
            )
          }
          const isAdmin = msg.sender_role === 'admin'
          return (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isAdmin ? 'flex-end' : 'flex-start', margin: '4px 0' }}>
              <div style={{
                maxWidth: '72%', padding: '10px 14px',
                borderRadius: isAdmin ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background: isAdmin ? `${T.green}18` : '#F5F5F5',
                fontSize: 13, color: T.black, lineHeight: 1.5, wordBreak: 'break-word',
              }}>
                {!isAdmin && <div style={{ fontSize: 11, fontWeight: 600, color: T.green, marginBottom: 4 }}>VA</div>}
                {msg.message}
                {msg.attachment_url && (
                  <div style={{ marginTop: 6 }}>
                    {msg.message_type === 'image'
                      ? <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer">
                          <img src={msg.attachment_url} alt={msg.attachment_name ?? ''} style={{ maxWidth: 200, borderRadius: 6, display: 'block' }} />
                        </a>
                      : <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: T.green }}>
                          📎 {msg.attachment_name}
                        </a>
                    }
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: T.ghost, marginTop: 2, padding: '0 4px' }}>
                {formatTime(msg.created_at)}
                {isAdmin && msg.read_at && <span style={{ marginLeft: 5, color: T.green }}>✓ Seen by VA</span>}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {isClosed ? (
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${T.border}`, background: T.bg, flexShrink: 0 }}>
          <p style={{ fontSize: 12, color: T.ghost, textAlign: 'center', margin: 0 }}>Conversation is closed.</p>
        </div>
      ) : (
        <div style={{ padding: '10px 14px', borderTop: `1px solid ${T.border}`, background: '#FFFFFF', flexShrink: 0, position: 'relative' }}>
          {showCanned && (
            <CannedDropdown
              onSelect={(msg, cannedId) => {
                setText(msg)
                // Increment usage count
                void fetch(`/api/support/canned/${cannedId}`, {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ increment_usage: true }),
                })
              }}
              onClose={() => setShowCanned(false)}
            />
          )}
          {attachment && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '5px 10px', background: T.bg, borderRadius: 6, border: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 12, color: T.muted }}>📎 {attachment.name}</span>
              <button onClick={() => setAttachment(null)} style={{ fontSize: 12, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto' }}>✕</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <button
              onClick={() => setShowCanned(v => !v)}
              title="Canned responses"
              style={{ width: 38, height: 38, borderRadius: 8, border: `1.5px solid ${T.border}`, background: showCanned ? T.bg : '#F9FAFB', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              📋
            </button>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => { setText(e.target.value); autoResize() }}
              onKeyDown={handleKeyDown}
              placeholder="Type a reply... (Enter to send, Shift+Enter for new line)"
              rows={1}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 8, fontSize: 13,
                border: `1.5px solid ${T.border}`, outline: 'none', color: T.black,
                resize: 'none', lineHeight: 1.5, minHeight: 38, maxHeight: 120,
                overflowY: 'auto', boxSizing: 'border-box',
              }}
            />
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void uploadFile(f); e.target.value = '' }} />
            <button onClick={() => fileRef.current?.click()} style={{ width: 38, height: 38, borderRadius: 8, border: `1.5px solid ${T.border}`, background: '#F9FAFB', cursor: 'pointer', fontSize: 15, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              📎
            </button>
            <button onClick={sendMessage} disabled={sending || (!text.trim() && !attachment)} style={{ width: 38, height: 38, borderRadius: 8, background: (sending || (!text.trim() && !attachment)) ? '#D1D5DB' : T.black, color: '#FFFFFF', border: 'none', cursor: 'pointer', fontSize: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────

export default function AdminSupportPage() {
  const [conversations,  setConversations]  = useState<ConvWithVA[]>([])
  const [selectedId,     setSelectedId]     = useState<string | null>(null)
  const [messages,       setMessages]       = useState<SupportMessage[]>([])
  const [loading,        setLoading]        = useState(true)
  const [adminId,        setAdminId]        = useState<string | null>(null)

  // Filters
  const [filterStatus,   setFilterStatus]   = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [filterAssigned, setFilterAssigned] = useState<string>('all')
  const [search,         setSearch]         = useState('')

  const selectedConv = conversations.find(c => c.id === selectedId) ?? null

  // Get admin session
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setAdminId(data.user.id)
    })
  }, [])

  // ── Load conversations ──────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    const params = new URLSearchParams({ admin: '1' })
    if (filterStatus   !== 'all') params.set('status',   filterStatus)
    if (filterCategory !== 'all') params.set('category', filterCategory)
    if (filterPriority !== 'all') params.set('priority', filterPriority)
    if (filterAssigned === 'mine' && adminId) params.set('assigned_to', adminId)

    const res  = await fetch(`/api/support/conversations?${params}`)
    const data = await res.json()
    if (!Array.isArray(data)) { setLoading(false); return }

    // Enrich with VA names
    const vaIds = [...new Set(data.map((c: SupportConversation) => c.va_id))]
    let vaNames: Record<string, string> = {}
    if (vaIds.length > 0) {
      const { data: vas } = await supabase.from('vas').select('id, name').in('id', vaIds)
      if (vas) vaNames = Object.fromEntries(vas.map((v: { id: string; name: string }) => [v.id, v.name]))
    }
    setConversations(data.map((c: SupportConversation) => ({ ...c, va_name: vaNames[c.va_id] ?? 'Unknown VA' })))
    setLoading(false)
  }, [filterStatus, filterCategory, filterPriority, filterAssigned, adminId])

  useEffect(() => { void loadConversations() }, [loadConversations])

  // ── Load messages for selected conversation ─────────────────────────
  async function loadMessages(convId: string) {
    const res  = await fetch(`/api/support/conversations/${convId}`)
    const data = await res.json()
    if (data.messages) setMessages(data.messages)
    // Mark as read for admin
    await fetch(`/api/support/conversations/${convId}/read`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    })
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread_admin: 0 } : c))
  }

  function selectConversation(convId: string) {
    setSelectedId(convId)
    void loadMessages(convId)
  }

  // ── Realtime: messages in selected conversation ─────────────────────
  useEffect(() => {
    if (!selectedId) return
    const channel = supabase
      .channel(`admin-support-${selectedId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `conversation_id=eq.${selectedId}` },
        (payload) => {
          const msg = payload.new as SupportMessage
          setMessages(prev => {
            if (prev.find(m => m.id === msg.id)) return prev
            return [...prev, msg]
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'support_conversations', filter: `id=eq.${selectedId}` },
        (payload) => {
          const updated = payload.new as ConvWithVA
          setConversations(prev => prev.map(c => c.id === selectedId ? { ...c, ...updated } : c))
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [selectedId])

  // ── Realtime: conversation list ─────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('admin-support-list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_conversations' },
        () => { void loadConversations() },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [loadConversations])

  // ── Admin actions ────────────────────────────────────────────────────
  async function handleAction(action: string, value?: string) {
    if (!selectedId || !adminId) return
    const updates: Record<string, unknown> = { _admin_uid: adminId }

    switch (action) {
      case 'assign':   updates.admin_id = adminId; break
      case 'resolve':  updates.status   = 'resolved'; updates.admin_id = adminId; break
      case 'close':    updates.status   = 'closed'; break
      case 'priority': updates.priority = value; break
    }

    await fetch(`/api/support/conversations/${selectedId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    void loadConversations()
    void loadMessages(selectedId)
  }

  // ── Filtered list ────────────────────────────────────────────────────
  const filtered = conversations.filter(c => {
    if (search) {
      const q = search.toLowerCase()
      if (!c.subject.toLowerCase().includes(q) && !(c.va_name ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const openCount      = conversations.filter(c => ['open', 'awaiting_admin', 'awaiting_va'].includes(c.status)).length
  const awaitingCount  = conversations.filter(c => c.status === 'awaiting_admin').length

  return (
    <div style={{ minHeight: 'calc(100vh - 52px)', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Page header */}
      <div style={{ borderBottom: `1px solid ${T.border}`, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: T.black, margin: 0 }}>Support Inbox</h1>
          <span style={{ fontSize: 12, color: T.muted }}>
            {openCount} open · {awaitingCount} awaiting reply
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, fontSize: 12, border: `1px solid ${T.border}`, outline: 'none', width: 160 }}
          />
          <a href="/admin/support/canned" style={{ fontSize: 12, color: T.green, textDecoration: 'none', padding: '6px 10px' }}>
            Canned responses
          </a>
        </div>
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 52px - 57px)' }}>

        {/* ── Sidebar filters ──────────────────────────────────────────────── */}
        <div style={{
          width: 180, flexShrink: 0, borderRight: `1px solid ${T.border}`,
          padding: '16px 14px', overflowY: 'auto',
        }}>
          {/* Status filter */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.ghost, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Status</div>
            {['all', 'open', 'awaiting_admin', 'awaiting_va', 'resolved', 'closed'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '5px 8px', borderRadius: 5, fontSize: 12,
                background: filterStatus === s ? '#F0FDF4' : 'none',
                color: filterStatus === s ? T.green : T.muted,
                fontWeight: filterStatus === s ? 500 : 400,
                border: 'none', cursor: 'pointer', marginBottom: 2,
              }}>
                {s === 'all' ? 'All' : getStatusLabel(s).label}
              </button>
            ))}
          </div>

          {/* Category filter */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.ghost, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Category</div>
            {['all', 'bug', 'question', 'feature_request', 'billing', 'general'].map(c => (
              <button key={c} onClick={() => setFilterCategory(c)} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '5px 8px', borderRadius: 5, fontSize: 12,
                background: filterCategory === c ? '#F0FDF4' : 'none',
                color: filterCategory === c ? T.green : T.muted,
                fontWeight: filterCategory === c ? 500 : 400,
                border: 'none', cursor: 'pointer', marginBottom: 2,
              }}>
                {c === 'all' ? 'All' : getCategoryMeta(c).label}
              </button>
            ))}
          </div>

          {/* Priority filter */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.ghost, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Priority</div>
            {['all', 'high', 'normal', 'low'].map(p => (
              <button key={p} onClick={() => setFilterPriority(p)} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '5px 8px', borderRadius: 5, fontSize: 12,
                background: filterPriority === p ? '#F0FDF4' : 'none',
                color: filterPriority === p ? T.green : T.muted,
                fontWeight: filterPriority === p ? 500 : 400,
                border: 'none', cursor: 'pointer', marginBottom: 2,
              }}>
                {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          {/* Assigned filter */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.ghost, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Assigned</div>
            {['all', 'mine', 'unassigned'].map(a => (
              <button key={a} onClick={() => setFilterAssigned(a)} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '5px 8px', borderRadius: 5, fontSize: 12,
                background: filterAssigned === a ? '#F0FDF4' : 'none',
                color: filterAssigned === a ? T.green : T.muted,
                fontWeight: filterAssigned === a ? 500 : 400,
                border: 'none', cursor: 'pointer', marginBottom: 2,
              }}>
                {a === 'all' ? 'All' : a === 'mine' ? 'Assigned to me' : 'Unassigned'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Conversation list ─────────────────────────────────────────────── */}
        <div style={{ width: 300, flexShrink: 0, borderRight: `1px solid ${T.border}`, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: T.ghost, fontSize: 13 }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: T.ghost, fontSize: 13 }}>No conversations</div>
          ) : filtered.map(conv => {
            const cat    = getCategoryMeta(conv.category)
            const hasUnread = conv.unread_admin > 0
            const dot    = getPriorityDot(conv.priority)
            const isUnassigned = !conv.admin_id
            const selected = conv.id === selectedId

            return (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                style={{
                  padding: '12px 14px', cursor: 'pointer',
                  borderBottom: `1px solid ${T.border}`,
                  background: selected ? '#F0FDF4' : isUnassigned && hasUnread ? '#FFFBEB' : '#FFFFFF',
                  borderLeft: selected ? `3px solid ${T.green}` : isUnassigned ? '3px solid #FCD34D' : '3px solid transparent',
                  transition: 'background 0.1s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                    {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot.color, flexShrink: 0 }} />}
                    <span style={{ fontSize: 12, fontWeight: hasUnread ? 600 : 400, color: T.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conv.subject}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    {hasUnread && (
                      <span style={{ background: '#EF4444', color: '#FFF', fontSize: 9, fontWeight: 700, borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {conv.unread_admin > 9 ? '9+' : conv.unread_admin}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: T.ghost }}>{relativeTime(conv.last_message_at ?? conv.created_at)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 20, background: cat.bg, color: cat.color, border: `1px solid ${cat.border}` }}>
                    {cat.label}
                  </span>
                  <span style={{ fontSize: 10, color: T.ghost }}>{conv.va_name}</span>
                  {!conv.admin_id && (
                    <span style={{ fontSize: 10, color: '#D97706', fontWeight: 500 }}>Unassigned</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Chat area ─────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {selectedConv ? (
            <AdminChatArea
              conv={selectedConv}
              messages={messages}
              adminId={adminId}
              onAction={handleAction}
              onSent={msg => {
                setMessages(prev => [...prev, msg])
                void loadConversations()
              }}
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.ghost }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📥</div>
                <p style={{ fontSize: 13 }}>Select a conversation to view</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
