'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useVA } from '@/context/va-context'
import { supabase } from '@/lib/supabase'
import type { SupportConversation, SupportMessage } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

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
  if (days < 7)  return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'bug',             label: '🐛 Bug report',    priority: 'high',   color: '#B91C1C',  bg: '#FEF2F2',  border: '#FECACA' },
  { value: 'question',        label: '❓ Question',      priority: 'normal', color: '#1D4ED8',  bg: '#EFF6FF',  border: '#BFDBFE' },
  { value: 'feature_request', label: '💡 Feature idea',  priority: 'low',    color: '#7C3AED',  bg: '#F5F3FF',  border: '#DDD6FE' },
  { value: 'billing',         label: '💳 Billing',       priority: 'normal', color: '#B45309',  bg: '#FFFBEB',  border: '#FDE68A' },
] as const

type CategoryValue = 'bug' | 'question' | 'feature_request' | 'billing'

function getCategoryMeta(category: string) {
  return CATEGORIES.find(c => c.value === category) ?? {
    value: category, label: category, color: '#666666', bg: '#F5F5F5', border: '#EEEEEE',
  }
}

function getStatusLabel(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case 'open':           return { label: 'Open',            color: '#15803D', bg: '#F0FDF4' }
    case 'awaiting_admin': return { label: 'Awaiting reply',  color: '#C2410C', bg: '#FFF7ED' }
    case 'awaiting_va':    return { label: 'Reply received',  color: '#1D4ED8', bg: '#EFF6FF' }
    case 'resolved':       return { label: 'Resolved',        color: '#6B7280', bg: '#F9FAFB' }
    case 'closed':         return { label: 'Closed',          color: '#9CA3AF', bg: '#F9FAFB' }
    default:               return { label: status,            color: '#6B7280', bg: '#F9FAFB' }
  }
}

// ─── CategoryBadge ────────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: string }) {
  const m = getCategoryMeta(category)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20,
      background: m.bg, color: m.color, border: `1px solid ${m.border}`,
    }}>
      {m.label}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const s = getStatusLabel(status)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20,
      background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  )
}

// ─── New Conversation Modal ────────────────────────────────────────────────────

function NewConvModal({ vaId, onClose, onCreated }: {
  vaId: string
  onClose: () => void
  onCreated: (conv: SupportConversation) => void
}) {
  const [category,  setCategory]  = useState<CategoryValue | null>(null)
  const [subject,   setSubject]   = useState('')
  const [message,   setMessage]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  async function submit() {
    if (!category)         return setError('Please select a category')
    if (subject.length < 5)  return setError('Subject must be at least 5 characters')
    if (message.length < 10) return setError('Message must be at least 10 characters')

    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/support/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ va_id: vaId, subject, category, message }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to send'); return }
      onCreated(data)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 50, padding: 16,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#FFFFFF', borderRadius: 16, padding: 32,
        width: '100%', maxWidth: 520,
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: T.black, margin: '0 0 6px' }}>
          New support message
        </h2>
        <p style={{ fontSize: 13, color: T.muted, margin: '0 0 24px' }}>
          What do you need help with?
        </p>

        {/* Category selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {CATEGORIES.map(c => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              style={{
                padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 500,
                cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                background: category === c.value ? c.bg : '#F9FAFB',
                color:      category === c.value ? c.color : T.muted,
                border:     `1.5px solid ${category === c.value ? c.border : T.border}`,
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Subject */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: T.muted, marginBottom: 6 }}>
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Brief description of your issue..."
            maxLength={100}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 13,
              border: `1.5px solid ${T.border}`, outline: 'none', color: T.black,
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Message */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: T.muted, marginBottom: 6 }}>
            Message
          </label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Describe what happened, what you expected, and what you see instead."
            maxLength={2000}
            rows={4}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 13,
              border: `1.5px solid ${T.border}`, outline: 'none', color: T.black,
              resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5,
            }}
          />
          <div style={{ textAlign: 'right', fontSize: 11, color: T.ghost, marginTop: 4 }}>
            {message.length}/2000
          </div>
        </div>

        {/* Disclaimer */}
        <div style={{
          background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8,
          padding: '10px 12px', marginBottom: 20,
          fontSize: 12, color: '#92400E', lineHeight: 1.5,
        }}>
          ⚠️ This chat is for <strong>app-related questions only</strong>. For client questions, please contact your client directly.
        </div>

        {error && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
            padding: '10px 12px', marginBottom: 16, fontSize: 13, color: '#B91C1C',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500,
              border: `1.5px solid ${T.border}`, background: 'none',
              color: T.muted, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            style={{
              padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500,
              background: loading ? '#999999' : T.black, color: '#FFFFFF',
              border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Sending...' : 'Send message →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, isOwn }: { msg: SupportMessage; isOwn: boolean }) {
  if (msg.message_type === 'system') {
    return (
      <div style={{ textAlign: 'center', margin: '12px 0' }}>
        <span style={{ fontSize: 12, color: T.ghost, fontStyle: 'italic' }}>
          {msg.message}
        </span>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: isOwn ? 'flex-end' : 'flex-start',
      margin: '4px 0',
    }}>
      <div style={{
        maxWidth: '75%', padding: '10px 14px',
        borderRadius: isOwn ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: isOwn ? `${T.green}18` : '#F5F5F5',
        color: T.black, fontSize: 14, lineHeight: 1.5,
        wordBreak: 'break-word',
      }}>
        {msg.message}
        {msg.attachment_url && (
          <div style={{ marginTop: 8 }}>
            {msg.message_type === 'image' ? (
              <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer">
                <img
                  src={msg.attachment_url}
                  alt={msg.attachment_name ?? 'attachment'}
                  style={{ maxWidth: 240, maxHeight: 160, borderRadius: 8, display: 'block', cursor: 'pointer' }}
                />
              </a>
            ) : (
              <a
                href={msg.attachment_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, color: T.green, textDecoration: 'underline' }}
              >
                📎 {msg.attachment_name ?? 'attachment'}
              </a>
            )}
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: T.ghost, marginTop: 3, padding: '0 4px' }}>
        {formatTime(msg.created_at)}
        {isOwn && msg.read_at && (
          <span style={{ marginLeft: 6, color: T.green }}>✓ Seen</span>
        )}
      </div>
    </div>
  )
}

// ─── Conversation List Item ────────────────────────────────────────────────────

function ConvListItem({
  conv, selected, onClick,
}: { conv: SupportConversation; selected: boolean; onClick: () => void }) {
  const cat = getCategoryMeta(conv.category)
  const hasUnread = conv.unread_va > 0

  return (
    <div
      onClick={onClick}
      style={{
        padding: '14px 16px', cursor: 'pointer', borderBottom: `1px solid ${T.border}`,
        background: selected ? '#F0FDF4' : hasUnread ? '#FAFFF9' : '#FFFFFF',
        transition: 'background 0.1s',
        borderLeft: selected ? `3px solid ${T.green}` : '3px solid transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {/* Status dot */}
          {conv.status === 'awaiting_va' && (
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.green, flexShrink: 0 }} />
          )}
          {conv.status === 'awaiting_admin' && (
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F97316', flexShrink: 0 }} />
          )}
          {(conv.status === 'resolved' || conv.status === 'closed') && (
            <span style={{ fontSize: 11, color: T.ghost, flexShrink: 0 }}>✓</span>
          )}
          <span style={{
            fontSize: 13, fontWeight: hasUnread ? 600 : 400,
            color: T.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {conv.subject}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {hasUnread && (
            <span style={{
              background: '#EF4444', color: '#FFFFFF', fontSize: 10, fontWeight: 700,
              borderRadius: '50%', width: 18, height: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {conv.unread_va > 9 ? '9+' : conv.unread_va}
            </span>
          )}
          <span style={{ fontSize: 11, color: T.ghost }}>
            {relativeTime(conv.last_message_at ?? conv.created_at)}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <CategoryBadge category={conv.category} />
        {conv.last_message_preview && (
          <span style={{
            fontSize: 12, color: T.ghost,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1,
          }}>
            {conv.last_message_preview}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Chat Area ────────────────────────────────────────────────────────────────

function ChatArea({
  conv, messages, vaId, onMarkResolved, onSent, onRead,
}: {
  conv: SupportConversation
  messages: SupportMessage[]
  vaId: string
  onMarkResolved: () => void
  onSent: (msg: SupportMessage) => void
  onRead: () => void
}) {
  const [text,         setText]         = useState('')
  const [sending,      setSending]      = useState(false)
  const [uploading,    setUploading]    = useState(false)
  const [attachment,   setAttachment]   = useState<{ url: string; name: string; type: string } | null>(null)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef    = useRef<HTMLInputElement>(null)
  const isClosed   = conv.status === 'resolved' || conv.status === 'closed'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  useEffect(() => {
    onRead()
  }, [conv.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      alert('File too large. Maximum 5MB.')
      return
    }
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${conv.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error } = await supabase.storage.from('support-attachments').upload(path, file)
      if (error) { alert('Upload failed: ' + error.message); return }
      const { data: urlData } = await supabase.storage
        .from('support-attachments')
        .createSignedUrl(path, 60 * 60 * 24 * 7)
      setAttachment({
        url: urlData?.signedUrl ?? '',
        name: file.name,
        type: file.type.startsWith('image/') ? 'image' : 'file',
      })
    } finally {
      setUploading(false)
    }
  }

  async function sendMessage() {
    const trimmed = text.trim()
    if (!trimmed && !attachment) return
    if (isClosed) return
    setSending(true)
    try {
      const res = await fetch(`/api/support/conversations/${conv.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id:       vaId,
          sender_role:     'va',
          message:         trimmed || (attachment?.name ?? ''),
          message_type:    attachment?.type === 'image' ? 'image' : 'text',
          attachment_url:  attachment?.url ?? null,
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
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  function autoResize() {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }

  const cat = getCategoryMeta(conv.category)
  const sta = getStatusLabel(conv.status)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header */}
      <div style={{
        padding: '16px 24px', borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: T.black, margin: 0 }}>
              {conv.subject}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <CategoryBadge category={conv.category} />
            <StatusBadge   status={conv.status} />
          </div>
        </div>
        {!isClosed && (
          <button
            onClick={onMarkResolved}
            style={{
              fontSize: 12, fontWeight: 500, color: T.green,
              border: `1px solid ${T.green}`, background: 'none',
              padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            Mark resolved
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column',
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: T.ghost, fontSize: 13, marginTop: 40 }}>
            No messages yet
          </div>
        )}
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} isOwn={msg.sender_id === vaId} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {isClosed ? (
        <div style={{
          padding: '16px 24px', borderTop: `1px solid ${T.border}`,
          background: T.bg, flexShrink: 0,
        }}>
          <p style={{ fontSize: 13, color: T.ghost, textAlign: 'center', margin: 0 }}>
            This conversation has been {conv.status}. Start a new one if you need more help.
          </p>
        </div>
      ) : (
        <div style={{
          padding: '12px 16px', borderTop: `1px solid ${T.border}`,
          background: '#FFFFFF', flexShrink: 0,
        }}>
          {attachment && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
              padding: '6px 10px', background: T.bg, borderRadius: 6,
              border: `1px solid ${T.border}`,
            }}>
              <span style={{ fontSize: 12, color: T.muted }}>
                📎 {attachment.name}
              </span>
              <button
                onClick={() => setAttachment(null)}
                style={{ fontSize: 12, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto' }}
              >
                ✕
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => { setText(e.target.value); autoResize() }}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 10, fontSize: 13,
                border: `1.5px solid ${T.border}`, outline: 'none', color: T.black,
                resize: 'none', lineHeight: 1.5, minHeight: 40, maxHeight: 120,
                overflowY: 'auto', boxSizing: 'border-box',
              }}
              rows={1}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) void uploadFile(f); e.target.value = '' }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              title="Attach image or PDF"
              style={{
                width: 40, height: 40, borderRadius: 10, fontSize: 18,
                border: `1.5px solid ${T.border}`, background: '#F9FAFB',
                cursor: uploading ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {uploading ? '⏳' : '📎'}
            </button>
            <button
              onClick={sendMessage}
              disabled={sending || (!text.trim() && !attachment)}
              style={{
                width: 40, height: 40, borderRadius: 10, fontSize: 18,
                background: (sending || (!text.trim() && !attachment)) ? '#D1D5DB' : T.black,
                color: '#FFFFFF', border: 'none',
                cursor: (sending || (!text.trim() && !attachment)) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'background 0.15s',
              }}
            >
              {sending ? '⏳' : '→'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>💬</div>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: T.black, margin: '0 0 8px' }}>No conversations yet</h3>
      <p style={{ fontSize: 13, color: T.muted, textAlign: 'center', margin: '0 0 24px', maxWidth: 280 }}>
        Have a question or found a bug? Start a conversation and our team will help you.
      </p>
      <button
        onClick={onNew}
        style={{
          padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500,
          background: T.black, color: '#FFFFFF', border: 'none', cursor: 'pointer',
        }}
      >
        + New message
      </button>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SupportPage() {
  const { currentVA } = useVA()
  const router = useRouter()

  const [conversations,     setConversations]     = useState<SupportConversation[]>([])
  const [selectedId,        setSelectedId]        = useState<string | null>(null)
  const [messages,          setMessages]          = useState<SupportMessage[]>([])
  const [loading,           setLoading]           = useState(true)
  const [showModal,         setShowModal]         = useState(false)
  const [isMobile,          setIsMobile]          = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const selectedConv = conversations.find(c => c.id === selectedId) ?? null

  // ── Load conversations ──────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!currentVA?.id) return
    const res  = await fetch(`/api/support/conversations?va_id=${currentVA.id}`)
    const data = await res.json()
    if (Array.isArray(data)) setConversations(data)
    setLoading(false)
  }, [currentVA?.id])

  useEffect(() => { void loadConversations() }, [loadConversations])

  // ── Load messages for selected conversation ─────────────────────────
  async function loadMessages(convId: string) {
    const res  = await fetch(`/api/support/conversations/${convId}`)
    const data = await res.json()
    if (data.messages) setMessages(data.messages)
  }

  function selectConversation(convId: string) {
    if (isMobile) {
      router.push(`/dashboard/support/${convId}`)
      return
    }
    setSelectedId(convId)
    void loadMessages(convId)
  }

  // ── Realtime: new message in selected conversation ──────────────────
  useEffect(() => {
    if (!selectedId) return
    const channel = supabase
      .channel(`support-va-${selectedId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'support_messages',
          filter: `conversation_id=eq.${selectedId}`,
        },
        (payload) => {
          const msg = payload.new as SupportMessage
          setMessages(prev => {
            if (prev.find(m => m.id === msg.id)) return prev
            return [...prev, msg]
          })
          // Mark as read if admin sent
          if (msg.sender_role === 'admin') {
            void fetch(`/api/support/conversations/${selectedId}/read`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ role: 'va' }),
            })
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'support_conversations',
          filter: `id=eq.${selectedId}`,
        },
        (payload) => {
          const conv = payload.new as SupportConversation
          setConversations(prev => prev.map(c => c.id === selectedId ? conv : c))
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [selectedId])

  // ── Realtime: conversation list updates (new convos, unread) ─────────
  useEffect(() => {
    if (!currentVA?.id) return
    const channel = supabase
      .channel(`support-va-list-${currentVA.id}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'support_conversations',
        },
        () => { void loadConversations() },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [currentVA?.id, loadConversations])

  // ── Mark as read ─────────────────────────────────────────────────────
  async function markAsRead(convId: string) {
    await fetch(`/api/support/conversations/${convId}/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'va' }),
    })
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread_va: 0 } : c))
  }

  // ── Mark as resolved ─────────────────────────────────────────────────
  async function markResolved() {
    if (!selectedConv || !currentVA?.id) return
    await fetch(`/api/support/conversations/${selectedConv.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resolved', _admin_uid: currentVA.id }),
    })
    void loadConversations()
    void loadMessages(selectedConv.id)
  }

  if (!currentVA) return null

  return (
    <div style={{
      minHeight: 'calc(100vh - 52px)', background: '#FFFFFF',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{
        maxWidth: 1100, margin: '0 auto',
        display: 'flex', height: 'calc(100vh - 52px)',
      }}>

        {/* ── Conversation list (left panel) ─────────────────────────────── */}
        <div style={{
          width: isMobile ? '100%' : 320, flexShrink: 0,
          borderRight: isMobile ? 'none' : `1px solid ${T.border}`,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '20px 16px 14px', borderBottom: `1px solid ${T.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <h1 style={{ fontSize: 16, fontWeight: 600, color: T.black, margin: 0 }}>
              Support
            </h1>
            <button
              onClick={() => setShowModal(true)}
              style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                background: T.black, color: '#FFFFFF', border: 'none', cursor: 'pointer',
              }}
            >
              + New
            </button>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: T.ghost, fontSize: 13 }}>
                Loading...
              </div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: 24 }}>
                <EmptyState onNew={() => setShowModal(true)} />
              </div>
            ) : (
              conversations.map(conv => (
                <ConvListItem
                  key={conv.id}
                  conv={conv}
                  selected={conv.id === selectedId}
                  onClick={() => selectConversation(conv.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Chat area (right panel, desktop only) ──────────────────────── */}
        {!isMobile && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {selectedConv ? (
              <ChatArea
                conv={selectedConv}
                messages={messages}
                vaId={currentVA.id}
                onMarkResolved={markResolved}
                onRead={() => void markAsRead(selectedConv.id)}
                onSent={msg => {
                  setMessages(prev => [...prev, msg])
                  void loadConversations()
                }}
              />
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: T.ghost }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>👈</div>
                  <p style={{ fontSize: 13 }}>Select a conversation to view messages</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── New conversation modal ────────────────────────────────────────── */}
      {showModal && (
        <NewConvModal
          vaId={currentVA.id}
          onClose={() => setShowModal(false)}
          onCreated={conv => {
            setShowModal(false)
            setConversations(prev => [conv, ...prev])
            if (!isMobile) {
              setSelectedId(conv.id)
              setMessages([])
              // Messages will arrive via realtime after creation
            } else {
              router.push(`/dashboard/support/${conv.id}`)
            }
          }}
        />
      )}
    </div>
  )
}
