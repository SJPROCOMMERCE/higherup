'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { useVA } from '@/context/va-context'
import { supabase } from '@/lib/supabase'
import type { SupportConversation, SupportMessage } from '@/lib/supabase'

const T = {
  black:  '#111111',
  muted:  '#666666',
  ghost:  '#999999',
  border: '#EEEEEE',
  green:  '#2DB87E',
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getCategoryMeta(category: string) {
  const map: Record<string, { label: string; color: string; bg: string; border: string }> = {
    bug:             { label: '🐛 Bug',     color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
    question:        { label: '❓ Question', color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
    feature_request: { label: '💡 Feature', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
    billing:         { label: '💳 Billing', color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  }
  return map[category] ?? { label: category, color: '#666666', bg: '#F5F5F5', border: '#EEEEEE' }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'awaiting_admin': return { label: 'Awaiting reply',  color: '#C2410C' }
    case 'awaiting_va':    return { label: 'Reply received',  color: '#1D4ED8' }
    case 'resolved':       return { label: 'Resolved',        color: '#6B7280' }
    case 'closed':         return { label: 'Closed',          color: '#9CA3AF' }
    default:               return { label: 'Open',            color: '#15803D' }
  }
}

export default function SupportConvPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { currentVA } = useVA()
  const router = useRouter()

  const [conv,      setConv]      = useState<SupportConversation | null>(null)
  const [messages,  setMessages]  = useState<SupportMessage[]>([])
  const [text,      setText]      = useState('')
  const [sending,   setSending]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [attachment, setAttachment] = useState<{ url: string; name: string; type: string } | null>(null)
  const [loading,   setLoading]   = useState(true)

  const bottomRef   = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef     = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!currentVA?.id) return
    void (async () => {
      const res  = await fetch(`/api/support/conversations/${id}`)
      const data = await res.json()
      if (data.conversation) setConv(data.conversation)
      if (data.messages)     setMessages(data.messages)
      setLoading(false)
      // Mark as read
      await fetch(`/api/support/conversations/${id}/read`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'va' }),
      })
    })()
  }, [id, currentVA?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [messages.length])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`support-mobile-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT', schema: 'public',
          table: 'support_messages', filter: `conversation_id=eq.${id}`,
        },
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
        {
          event: 'UPDATE', schema: 'public',
          table: 'support_conversations', filter: `id=eq.${id}`,
        },
        (payload) => { setConv(payload.new as SupportConversation) },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [id])

  async function uploadFile(file: File) {
    if (file.size > 5 * 1024 * 1024) { alert('Max 5MB'); return }
    setUploading(true)
    try {
      const ext  = file.name.split('.').pop()
      const path = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
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
    if (conv?.status === 'closed' || conv?.status === 'resolved') return
    setSending(true)
    try {
      const res = await fetch(`/api/support/conversations/${id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: currentVA!.id, sender_role: 'va',
          message: trimmed || (attachment?.name ?? ''),
          message_type: attachment?.type === 'image' ? 'image' : 'text',
          attachment_url: attachment?.url ?? null,
          attachment_name: attachment?.name ?? null,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setText(''); setAttachment(null)
        setMessages(prev => [...prev, data])
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      } else {
        alert(data.error ?? 'Failed to send')
      }
    } finally { setSending(false) }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
        <span style={{ color: T.ghost, fontSize: 13 }}>Loading...</span>
      </div>
    )
  }

  if (!conv) return null

  const isClosed = conv.status === 'resolved' || conv.status === 'closed'
  const cat = getCategoryMeta(conv.category)
  const sta = getStatusLabel(conv.status)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 52px)',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: `1px solid ${T.border}`,
        background: '#FFFFFF', position: 'sticky', top: 52, zIndex: 10,
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <button
          onClick={() => router.back()}
          style={{ fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', lineHeight: 1 }}
        >
          ←
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.black, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conv.subject}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: cat.bg, color: cat.color, border: `1px solid ${cat.border}` }}>
              {cat.label}
            </span>
            <span style={{ fontSize: 11, fontWeight: 500, color: sta.color }}>
              {sta.label}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', paddingBottom: isClosed ? 16 : 80 }}>
        {messages.map(msg => {
          if (msg.message_type === 'system') {
            return (
              <div key={msg.id} style={{ textAlign: 'center', margin: '10px 0' }}>
                <span style={{ fontSize: 12, color: T.ghost, fontStyle: 'italic' }}>{msg.message}</span>
              </div>
            )
          }
          const isOwn = msg.sender_id === currentVA?.id
          return (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start', margin: '4px 0' }}>
              <div style={{
                maxWidth: '80%', padding: '10px 14px',
                borderRadius: isOwn ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background: isOwn ? `${T.green}18` : '#F5F5F5',
                fontSize: 14, color: T.black, lineHeight: 1.5, wordBreak: 'break-word',
              }}>
                {msg.message}
                {msg.attachment_url && (
                  <div style={{ marginTop: 8 }}>
                    {msg.message_type === 'image'
                      ? <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer">
                          <img src={msg.attachment_url} alt={msg.attachment_name ?? ''} style={{ maxWidth: 200, borderRadius: 8, display: 'block' }} />
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
                {isOwn && msg.read_at && <span style={{ marginLeft: 6, color: T.green }}>✓ Seen</span>}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input — sticky to bottom */}
      {isClosed ? (
        <div style={{ padding: '12px 16px', background: '#FAFAFA', borderTop: `1px solid ${T.border}`, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: T.ghost, margin: 0 }}>
            This conversation has been {conv.status}. Start a new one if you need more help.
          </p>
        </div>
      ) : (
        <div style={{
          position: 'sticky', bottom: 0,
          padding: '10px 12px', borderTop: `1px solid ${T.border}`,
          background: '#FFFFFF',
        }}>
          {attachment && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '6px 10px', background: '#FAFAFA', borderRadius: 6, border: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 12, color: T.muted }}>📎 {attachment.name}</span>
              <button onClick={() => setAttachment(null)} style={{ fontSize: 12, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto' }}>✕</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 10, fontSize: 13,
                border: `1.5px solid ${T.border}`, outline: 'none', color: T.black,
                resize: 'none', lineHeight: 1.5, minHeight: 40, maxHeight: 100,
                boxSizing: 'border-box',
              }}
            />
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void uploadFile(f); e.target.value = '' }} />
            <button onClick={() => fileRef.current?.click()} style={{ width: 38, height: 38, borderRadius: 8, border: `1.5px solid ${T.border}`, background: '#F9FAFB', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              📎
            </button>
            <button onClick={sendMessage} disabled={sending || (!text.trim() && !attachment)} style={{ width: 38, height: 38, borderRadius: 8, background: (sending || (!text.trim() && !attachment)) ? '#D1D5DB' : T.black, color: '#FFFFFF', border: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
