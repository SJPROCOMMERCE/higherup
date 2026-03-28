'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useVA } from '@/context/va-context'
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
  store_name: string
  original_filename: string | null
  status: string
  last_message: string
  last_message_sender: 'va' | 'admin' | 'system'
  last_message_at: string
  unread: boolean
  awaiting_admin: boolean
  message_count: number
  is_closed: boolean
}

type FilterKey = 'all' | 'unread' | 'awaiting' | 'resolved'

// ─── Upload row from DB ────────────────────────────────────────────────────────
type UploadRow = {
  id: string
  store_name: string | null
  original_filename: string | null
  status: string
  message_count: number | null
  has_unread_messages: boolean | null
  awaiting_va_response: boolean | null
  awaiting_admin_response: boolean | null
  last_message_at: string | null
}

type MessageRow = {
  upload_id: string
  message: string
  sender_type: 'va' | 'admin' | 'system'
  created_at: string
  is_read: boolean | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function relDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max) + '…'
}

// ─── MessagesPage ─────────────────────────────────────────────────────────────
export default function MessagesPage() {
  const { currentVA: va } = useVA()
  const router = useRouter()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('all')

  const load = useCallback(async () => {
    if (!va?.id) return
    setLoading(true)

    // 1. Fetch uploads with message_count > 0
    const { data: uploads, error: uploadsErr } = await supabase
      .from('uploads')
      .select('id, store_name, original_filename, status, message_count, has_unread_messages, awaiting_va_response, awaiting_admin_response, last_message_at')
      .eq('va_id', va.id)
      .gt('message_count', 0)
      .order('last_message_at', { ascending: false })

    if (uploadsErr || !uploads || uploads.length === 0) {
      setConversations([])
      setLoading(false)
      return
    }

    const uploadRows = uploads as UploadRow[]
    const uploadIds = uploadRows.map(u => u.id)

    // 2. Fetch all messages for these uploads in one query
    const { data: msgs } = await supabase
      .from('upload_messages')
      .select('upload_id, message, sender_type, created_at, is_read')
      .in('upload_id', uploadIds)
      .order('created_at', { ascending: false })

    const messageRows = (msgs ?? []) as MessageRow[]

    // 3. Aggregate per upload_id client-side
    const msgMap = new Map<string, MessageRow[]>()
    for (const m of messageRows) {
      const existing = msgMap.get(m.upload_id) ?? []
      existing.push(m)
      msgMap.set(m.upload_id, existing)
    }

    const convs: Conversation[] = uploadRows.map(upload => {
      const uploadMsgs = msgMap.get(upload.id) ?? []
      // Already ordered desc, first = latest
      const latest = uploadMsgs[0]

      const unread = uploadMsgs.some(
        m => m.sender_type === 'admin' && m.is_read === false
      )

      const lastMessageSender: 'va' | 'admin' | 'system' =
        latest?.sender_type ?? 'system'

      const isClosed = upload.status !== 'on_hold'

      return {
        upload_id: upload.id,
        store_name: upload.store_name ?? 'Unknown store',
        original_filename: upload.original_filename,
        status: upload.status,
        last_message: latest?.message ?? '',
        last_message_sender: lastMessageSender,
        last_message_at: latest?.created_at ?? upload.last_message_at ?? '',
        unread,
        awaiting_admin: (upload.awaiting_admin_response ?? false) && !unread,
        message_count: upload.message_count ?? 0,
        is_closed: isClosed,
      }
    })

    // Sort: unread first, then by last_message_at desc
    convs.sort((a, b) => {
      if (a.unread && !b.unread) return -1
      if (!a.unread && b.unread) return 1
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    })

    setConversations(convs)
    setLoading(false)
  }, [va?.id])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo((): Conversation[] => {
    switch (filter) {
      case 'unread':   return conversations.filter(c => c.unread)
      case 'awaiting': return conversations.filter(c => c.awaiting_admin && !c.unread)
      case 'resolved': return conversations.filter(c => c.is_closed)
      default:         return conversations
    }
  }, [conversations, filter])

  const unreadCount = useMemo(
    () => conversations.filter(c => c.unread).length,
    [conversations]
  )

  if (!va) return null

  // ─── Filter pills ────────────────────────────────────────────────────────────
  const pills: { key: FilterKey; label: string }[] = [
    { key: 'all',      label: 'All' },
    { key: 'unread',   label: `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
    { key: 'awaiting', label: 'Awaiting reply' },
    { key: 'resolved', label: 'Resolved' },
  ]

  return (
    <div
      style={{
        maxWidth: 600,
        margin: '0 auto',
        padding: '48px 24px 80px',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Title */}
      <h1
        style={{
          fontSize: 28,
          fontWeight: 300,
          color: T.black,
          textAlign: 'center',
          margin: 0,
          letterSpacing: '-0.02em',
        }}
      >
        Messages
      </h1>

      {/* Subtitle */}
      {!loading && (
        <p
          style={{
            fontSize: 13,
            color: T.ghost,
            textAlign: 'center',
            margin: '12px 0 48px',
          }}
        >
          {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
          {unreadCount > 0 && ` · ${unreadCount} unread`}
        </p>
      )}

      {loading && (
        <p style={{ fontSize: 13, color: T.ghost, textAlign: 'center', margin: '12px 0 48px' }}>
          Loading…
        </p>
      )}

      {/* Filter pills */}
      {!loading && conversations.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 32,
          }}
        >
          {pills.map(pill => {
            const active = filter === pill.key
            return (
              <button
                key={pill.key}
                onClick={() => setFilter(pill.key)}
                style={{
                  fontSize: 12,
                  fontFamily: 'inherit',
                  padding: '6px 14px',
                  borderRadius: 100,
                  border: `1px solid ${active ? T.black : T.div}`,
                  background: active ? T.black : 'transparent',
                  color: active ? '#FFFFFF' : T.ter,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {pill.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && conversations.length === 0 && (
        <p style={{ fontSize: 13, color: T.ghost, textAlign: 'center', marginTop: 64 }}>
          No conversations yet.
        </p>
      )}

      {/* No results for current filter */}
      {!loading && conversations.length > 0 && filtered.length === 0 && (
        <p style={{ fontSize: 13, color: T.ghost, textAlign: 'center', marginTop: 32 }}>
          No conversations match this filter.
        </p>
      )}

      {/* Conversation list */}
      {!loading && filtered.length > 0 && (
        <div>
          {filtered.map(conv => (
            <ConversationRow
              key={conv.upload_id}
              conv={conv}
              onClick={() => router.push(`/dashboard/messages/${conv.upload_id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── ConversationRow ──────────────────────────────────────────────────────────
function ConversationRow({
  conv,
  onClick,
}: {
  conv: Conversation
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  const senderLabel =
    conv.last_message_sender === 'admin'
      ? 'Admin'
      : conv.last_message_sender === 'va'
      ? 'You'
      : null

  const preview = conv.last_message
    ? (senderLabel ? `${senderLabel}: ` : '') + truncate(conv.last_message, 50)
    : '—'

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '18px 0',
        borderBottom: `1px solid ${T.row}`,
        cursor: 'pointer',
        opacity: hovered ? 0.6 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      {/* Unread dot */}
      <div style={{ width: 16, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        {conv.unread && (
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: T.black,
            }}
          />
        )}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Store name + status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: conv.unread ? 600 : 400,
              color: T.black,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {conv.store_name}
          </span>

          {/* Status badge */}
          {conv.awaiting_admin && !conv.unread && (
            <span
              style={{
                fontSize: 11,
                color: T.ghost,
                fontStyle: 'italic',
                flexShrink: 0,
              }}
            >
              Waiting
            </span>
          )}
          {conv.is_closed && !conv.unread && !conv.awaiting_admin && (
            <span
              style={{
                fontSize: 11,
                color: T.ghost,
                flexShrink: 0,
              }}
            >
              Resolved
            </span>
          )}
        </div>

        {/* Message preview */}
        <div
          style={{
            fontSize: 13,
            color: T.ter,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {preview}
        </div>
      </div>

      {/* Date */}
      {conv.last_message_at && (
        <div
          style={{
            fontSize: 12,
            color: T.ghost,
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {relDate(conv.last_message_at)}
        </div>
      )}
    </div>
  )
}
