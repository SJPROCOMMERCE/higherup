'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'

// ─── Types ────────────────────────────────────────────────────────────────────
export type ChatMessage = {
  id: string
  upload_id: string
  sender_type: 'va' | 'admin' | 'system'
  sender_name: string
  message: string
  is_read: boolean
  created_at: string
}

type Props = {
  uploadId: string
  senderType: 'va' | 'admin'
  senderName: string
  vaId: string | null          // needed to send notifications
  storeName: string            // used in notification titles
  onMessageSent?: () => void   // callback to refresh parent
  closed?: boolean             // thread is closed (upload no longer on_hold)
}

const T = {
  black: '#111111', ter: '#999999', ghost: '#CCCCCC',
  div: '#EEEEEE', row: '#FAFAFA',
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── UploadChat ───────────────────────────────────────────────────────────────
export default function UploadChat({
  uploadId, senderType, senderName, vaId, storeName, onMessageSent, closed = false,
}: Props) {
  const [messages, setMessages]   = useState<ChatMessage[]>([])
  const [loading, setLoading]     = useState(true)
  const [text, setText]           = useState('')
  const [sending, setSending]     = useState(false)
  const bottomRef                 = useRef<HTMLDivElement>(null)

  // Load messages + mark own-side messages as read
  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data } = await supabase
        .from('upload_messages')
        .select('*')
        .eq('upload_id', uploadId)
        .order('created_at', { ascending: true })

      if (cancelled) return
      setMessages((data ?? []) as ChatMessage[])
      setLoading(false)

      // Mark messages from the other side as read
      const otherSide = senderType === 'admin' ? 'va' : 'admin'
      await supabase
        .from('upload_messages')
        .update({ is_read: true })
        .eq('upload_id', uploadId)
        .eq('sender_type', otherSide)
        .eq('is_read', false)

      // Clear unread flag on the upload if this is the reader
      if (senderType === 'va') {
        await supabase.from('uploads').update({ awaiting_va_response: false }).eq('id', uploadId)
      } else {
        await supabase.from('uploads').update({ awaiting_admin_response: false }).eq('id', uploadId)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [uploadId, senderType])

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`upload-chat-${uploadId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'upload_messages',
        filter: `upload_id=eq.${uploadId}`,
      }, payload => {
        const msg = payload.new as ChatMessage
        setMessages(prev => {
          if (prev.find(m => m.id === msg.id)) return prev
          return [...prev, msg]
        })
        // Auto-mark as read if it's from the other side
        const otherSide = senderType === 'admin' ? 'va' : 'admin'
        if (msg.sender_type === otherSide) {
          void supabase.from('upload_messages').update({ is_read: true }).eq('id', msg.id)
        }
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [uploadId, senderType])

  async function send() {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setText('')

    // Insert message
    const { data: inserted } = await supabase.from('upload_messages').insert({
      upload_id:   uploadId,
      sender_type: senderType,
      sender_name: senderName,
      message:     trimmed,
      is_read:     false,
    }).select().single()

    if (inserted) {
      setMessages(prev => [...prev, inserted as ChatMessage])
    }

    // Update upload tracking
    const awaitField = senderType === 'admin'
      ? { awaiting_va_response: true, awaiting_admin_response: false }
      : { awaiting_admin_response: true, awaiting_va_response: false }

    await supabase.from('uploads').update({
      has_unread_messages: true,
      message_count: messages.length + 1,
      last_message_at: new Date().toISOString(),
      ...awaitField,
    }).eq('id', uploadId)

    // Send notification to the other party
    if (senderType === 'admin' && vaId) {
      await supabase.from('notifications').insert({
        va_id:    vaId,
        type:     'upload_clarification' as const,
        title:    `Admin has a question about your upload for ${storeName}`,
        message:  trimmed.slice(0, 100),
        is_read:  false,
        created_at: new Date().toISOString(),
      })
      void logActivity({ action: 'admin_message_sent', upload_id: uploadId, va_id: vaId, source: 'admin', details: `Admin sent message about ${storeName}` })
    } else if (senderType === 'va' && vaId) {
      // Notify admin via activity log (admins check flagged page)
      void logActivity({ action: 'va_message_sent', upload_id: uploadId, va_id: vaId, source: 'va', details: `VA replied about ${storeName}: ${trimmed.slice(0, 80)}` })
    }

    setSending(false)
    onMessageSent?.()
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  if (loading) {
    return <div style={{ fontSize: 12, color: T.ghost, padding: '12px 0' }}>Loading messages…</div>
  }

  return (
    <div style={{ marginTop: 16 }}>
      {/* Label */}
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, marginBottom: 12 }}>
        {senderType === 'admin' ? 'MESSAGE TO VA' : 'CONVERSATION WITH ADMIN'}
      </div>

      {/* Messages */}
      {messages.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.map(msg => {
            const isSystem = msg.sender_type === 'system'
            const isOther  = msg.sender_type !== senderType && !isSystem

            if (isSystem) {
              return (
                <div key={msg.id} style={{
                  textAlign: 'center', fontSize: 12, color: T.ghost,
                  fontStyle: 'italic', padding: '4px 0',
                  borderTop: `1px solid ${T.div}`, borderBottom: `1px solid ${T.div}`,
                }}>
                  {msg.message}
                </div>
              )
            }

            return (
              <div
                key={msg.id}
                style={{
                  paddingLeft:   isOther ? 16 : 0,
                  borderLeft:    isOther ? `2px solid ${T.div}` : 'none',
                  borderBottom:  `1px solid ${T.row}`,
                  paddingBottom: 10,
                }}
              >
                <div style={{ fontSize: 11, color: T.ghost, marginBottom: 4 }}>
                  {msg.sender_name} · {relTime(msg.created_at)}
                  {!msg.is_read && msg.sender_type !== senderType && (
                    <span style={{ marginLeft: 6, fontSize: 10, color: T.black, fontWeight: 600 }}>NEW</span>
                  )}
                </div>
                <div style={{
                  fontSize: 13,
                  color: msg.sender_type === 'admin' ? T.black : '#666666',
                  lineHeight: 1.5,
                }}>
                  {msg.message}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {messages.length === 0 && (
        <div style={{ fontSize: 13, color: T.ghost, marginBottom: 16, fontStyle: 'italic' }}>
          No messages yet.
        </div>
      )}

      {/* Input */}
      {!closed ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKey}
            rows={2}
            placeholder={senderType === 'admin' ? 'Ask the VA for more details…' : 'Reply to admin…'}
            style={{
              flex: 1, fontSize: 14, fontFamily: 'inherit', color: T.black,
              background: 'none', border: 'none', borderBottom: `1.5px solid ${T.div}`,
              outline: 'none', resize: 'none', padding: '4px 0', lineHeight: 1.5,
              transition: 'border-color 0.15s',
            }}
            onFocus={e => { e.target.style.borderBottomColor = T.black }}
            onBlur={e =>  { e.target.style.borderBottomColor = T.div }}
          />
          <button
            onClick={() => void send()}
            disabled={!text.trim() || sending}
            style={{
              fontSize: 12, fontFamily: 'inherit', fontWeight: 500,
              color: '#FFFFFF', background: T.black, border: 'none',
              borderRadius: 100, padding: '6px 16px', cursor: !text.trim() || sending ? 'default' : 'pointer',
              opacity: !text.trim() ? 0.4 : 1, transition: 'opacity 0.15s', whiteSpace: 'nowrap',
            }}
          >
            {senderType === 'admin' ? 'Send' : 'Send reply'}
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: T.ghost, fontStyle: 'italic' }}>
          This conversation is closed.
        </div>
      )}
    </div>
  )
}

// ─── System message helper (call after admin approve/reject) ──────────────────
export async function addSystemMessage(uploadId: string, message: string): Promise<void> {
  await supabase.from('upload_messages').insert({
    upload_id:   uploadId,
    sender_type: 'system',
    sender_name: 'System',
    message,
    is_read:     true,
  })
  await supabase.from('uploads').update({
    awaiting_va_response:    false,
    awaiting_admin_response: false,
  }).eq('id', uploadId)
}
