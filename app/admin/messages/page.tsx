'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  black: '#111111',
  ter: '#999999',
  ghost: '#CCCCCC',
  div: '#EEEEEE',
  row: '#FAFAFA',
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Conversation = {
  upload_id: string
  va_id: string
  va_name: string
  store_name: string
  original_filename: string | null
  upload_status: string
  last_message: string
  last_message_sender: 'va' | 'admin' | 'system'
  last_message_at: string
  unread: boolean
  awaiting_va: boolean
  message_count: number
  is_closed: boolean
}

type FilterKey = 'all' | 'unread' | 'awaiting_me' | 'awaiting_va' | 'resolved'

// ─── Raw DB row types ─────────────────────────────────────────────────────────
type UploadRow = {
  id: string
  va_id: string
  store_name: string | null
  original_filename: string | null
  status: string
  message_count: number
  has_unread_messages: boolean | null
  awaiting_va_response: boolean | null
  awaiting_admin_response: boolean | null
  last_message_at: string | null
}

type VARow = {
  id: string
  name: string
}

type MessageRow = {
  upload_id: string
  message: string
  sender_type: string
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function relDate(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

function fmtStatus(s: string): string {
  return s.replace(/_/g, ' ')
}

// ─── Sort conversations ───────────────────────────────────────────────────────
function sortConversations(convs: Conversation[]): Conversation[] {
  function group(c: Conversation): number {
    if (c.is_closed) return 3
    if (c.unread) return 0
    if (c.awaiting_va) return 1
    return 2
  }
  return [...convs].sort((a, b) => {
    const gd = group(a) - group(b)
    if (gd !== 0) return gd
    return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminMessagesPage() {
  const router = useRouter()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')

  const loadConversations = useCallback(async () => {
    setLoading(true)

    // 1. Load uploads with messages
    const { data: uploadsData } = await supabase
      .from('uploads')
      .select('id, va_id, store_name, original_filename, status, message_count, has_unread_messages, awaiting_va_response, awaiting_admin_response, last_message_at')
      .gt('message_count', 0)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    const uploads = (uploadsData ?? []) as unknown as UploadRow[]

    if (uploads.length === 0) {
      setConversations([])
      setLoading(false)
      return
    }

    // 2. Load VA names
    const vaIds = [...new Set(uploads.map(u => u.va_id))]
    const { data: vasData } = await supabase
      .from('vas')
      .select('id, name')
      .in('id', vaIds)
    const vas = (vasData ?? []) as unknown as VARow[]
    const vaMap = new Map(vas.map(v => [v.id, v.name]))

    // 3. Load last messages per upload
    const uploadIds = uploads.map(u => u.id)
    const { data: msgsData } = await supabase
      .from('upload_messages')
      .select('upload_id, message, sender_type, created_at')
      .in('upload_id', uploadIds)
      .order('created_at', { ascending: false })
    const msgs = (msgsData ?? []) as unknown as MessageRow[]

    // For each upload_id, take the first (most recent) message
    const lastMsgMap = new Map<string, MessageRow>()
    for (const m of msgs) {
      if (!lastMsgMap.has(m.upload_id)) {
        lastMsgMap.set(m.upload_id, m)
      }
    }

    // 4. Build conversations
    const convs: Conversation[] = uploads.map(u => {
      const lastMsg = lastMsgMap.get(u.id)
      const closedStatuses = ['done', 'failed', 'processing']
      return {
        upload_id: u.id,
        va_id: u.va_id,
        va_name: vaMap.get(u.va_id) ?? 'Unknown VA',
        store_name: u.store_name ?? '—',
        original_filename: u.original_filename,
        upload_status: u.status,
        last_message: lastMsg?.message ?? '',
        last_message_sender: (lastMsg?.sender_type ?? 'system') as 'va' | 'admin' | 'system',
        last_message_at: u.last_message_at ?? '',
        unread: u.awaiting_admin_response === true,
        awaiting_va: u.awaiting_va_response === true,
        message_count: u.message_count ?? 0,
        is_closed: closedStatuses.includes(u.status),
      }
    })

    setConversations(sortConversations(convs))
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  // ── Counts for filter pills ──────────────────────────────────────────────
  const unreadCount     = useMemo(() => conversations.filter(c => c.unread).length, [conversations])
  const awaitingMeCount = useMemo(() => conversations.filter(c => c.unread).length, [conversations])
  const awaitingVACount = useMemo(() => conversations.filter(c => c.awaiting_va && !c.unread).length, [conversations])
  const totalCount      = conversations.length

  // ── Filtering ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = conversations

    // Filter tab
    if (filter === 'unread')      list = list.filter(c => c.unread)
    if (filter === 'awaiting_me') list = list.filter(c => c.unread)
    if (filter === 'awaiting_va') list = list.filter(c => c.awaiting_va && !c.unread)
    if (filter === 'resolved')    list = list.filter(c => c.is_closed)

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c =>
        c.va_name.toLowerCase().includes(q) ||
        c.store_name.toLowerCase().includes(q) ||
        c.last_message.toLowerCase().includes(q)
      )
    }

    return list
  }, [conversations, filter, search])

  // ── Filter pills config ──────────────────────────────────────────────────
  const pills: { key: FilterKey; label: string; count?: number }[] = [
    { key: 'all',         label: 'All' },
    { key: 'unread',      label: 'Unread',           count: unreadCount },
    { key: 'awaiting_me', label: 'Awaiting my reply', count: awaitingMeCount },
    { key: 'awaiting_va', label: 'Awaiting VA',       count: awaitingVACount },
    { key: 'resolved',    label: 'Resolved' },
  ]

  // ── Preview helper ───────────────────────────────────────────────────────
  function previewLabel(conv: Conversation): string {
    const prefix = conv.last_message_sender === 'admin' ? 'You' : conv.va_name
    const snippet = conv.last_message.slice(0, 50)
    return `${prefix}: ${snippet}`
  }

  return (
    <div style={{
      maxWidth: 800,
      margin: '0 auto',
      padding: '48px 24px',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 300, color: T.black, margin: 0 }}>Messages</h1>
        <span style={{ fontSize: 13, color: T.ghost }}>
          {totalCount} conversation{totalCount !== 1 ? 's' : ''}&nbsp;&nbsp;·&nbsp;&nbsp;
          {unreadCount} unread&nbsp;&nbsp;·&nbsp;&nbsp;
          {awaitingMeCount} awaiting your reply
        </span>
      </div>

      {/* ── Search ── */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search conversations..."
        style={{
          width: '100%',
          boxSizing: 'border-box',
          fontSize: 13,
          color: T.black,
          background: 'none',
          border: 'none',
          borderBottom: `1.5px solid ${T.div}`,
          outline: 'none',
          padding: '8px 0',
          fontFamily: 'inherit',
        }}
      />

      {/* ── Filter pills ── */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        {pills.map(p => {
          const active = filter === p.key
          return (
            <button
              key={p.key}
              onClick={() => setFilter(p.key)}
              style={{
                fontSize: 12,
                fontFamily: 'inherit',
                padding: '4px 12px',
                borderRadius: 100,
                border: `1px solid ${active ? T.black : T.div}`,
                background: active ? T.black : 'transparent',
                color: active ? '#FFFFFF' : T.ter,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {p.label}{p.count !== undefined && p.count > 0 ? ` (${p.count})` : ''}
            </button>
          )
        })}
      </div>

      {/* ── Conversation list ── */}
      {loading ? (
        <div style={{ fontSize: 13, color: T.ghost, padding: '24px 0' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ fontSize: 13, color: T.ghost, padding: '24px 0' }}>No conversations found.</div>
      ) : (
        <div>
          {filtered.map(conv => (
            <div
              key={conv.upload_id}
              onClick={() => router.push(`/admin/messages/${conv.upload_id}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '18px 0',
                borderBottom: `1px solid ${T.row}`,
                cursor: 'pointer',
                transition: 'opacity 0.15s',
                gap: 16,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = '0.6' }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = '1' }}
            >
              {/* Left: VA → Store */}
              <div style={{ minWidth: 180, flexShrink: 0 }}>
                <span style={{
                  fontSize: 13,
                  fontWeight: conv.unread ? 600 : 400,
                  color: T.black,
                }}>
                  {conv.va_name}
                </span>
                <span style={{ fontSize: 13, color: T.ghost, margin: '0 6px' }}>→</span>
                <span style={{ fontSize: 13, color: T.ter }}>{conv.store_name}</span>
              </div>

              {/* Middle: last message preview */}
              <div style={{ flex: 1, fontSize: 13, color: T.ter, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {previewLabel(conv)}
              </div>

              {/* Right: date, status, unread dot */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: T.ghost }}>{relDate(conv.last_message_at)}</span>
                <span style={{ fontSize: 11, color: T.ghost }}>{fmtStatus(conv.upload_status)}</span>
                {conv.unread && (
                  <div style={{
                    width: 6, height: 6,
                    borderRadius: '50%',
                    background: T.black,
                    flexShrink: 0,
                  }} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
