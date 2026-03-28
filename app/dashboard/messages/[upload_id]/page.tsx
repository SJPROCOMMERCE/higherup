'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Paperclip } from 'lucide-react'
import { useVA } from '@/context/va-context'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { sendNotification } from '@/lib/notifications'

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  black: '#111111',
  ter: '#999999',
  ghost: '#CCCCCC',
  div: '#EEEEEE',
  row: '#FAFAFA',
}

// ─── Types ────────────────────────────────────────────────────────────────────
type ChatMessage = {
  id: string
  upload_id: string
  sender_type: 'va' | 'admin' | 'system'
  sender_name: string
  message: string
  is_read: boolean
  created_at: string
  attachment_path?: string | null
  attachment_name?: string | null
  attachment_type?: string | null
  attachment_size?: number | null
}

type UploadWithMeta = {
  id: string
  store_name: string | null
  original_filename: string | null
  status: string
  product_row_count: number | null
  uploaded_at: string
  special_instructions: string | null
  awaiting_va_response: boolean
  message_count: number
  clients: { store_name: string } | null
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
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'on_hold':    return 'On Hold'
    case 'done':       return 'Done'
    case 'failed':     return 'Failed'
    case 'processing': return 'Processing'
    case 'queued':     return 'Queued'
    default:           return status
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'on_hold':    return '#B45309'
    case 'done':       return '#16A34A'
    case 'failed':     return '#DC2626'
    case 'processing': return '#2563EB'
    default:           return T.ter
  }
}

function getStatusBg(status: string): string {
  switch (status) {
    case 'on_hold':    return '#FEF3C7'
    case 'done':       return '#DCFCE7'
    case 'failed':     return '#FEE2E2'
    case 'processing': return '#DBEAFE'
    default:           return T.row
  }
}

// ─── MessageThread ────────────────────────────────────────────────────────────
export default function MessageThreadPage() {
  const { upload_id: uploadId } = useParams<{ upload_id: string }>()
  const { currentVA: va } = useVA()
  const router = useRouter()

  const [upload, setUpload] = useState<UploadWithMeta | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [adminTyping, setAdminTyping] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lastTypingSentRef = useRef<number>(0)

  // ── Load upload + messages ─────────────────────────────────────────────────
  const loadUpload = useCallback(async () => {
    if (!va?.id || !uploadId) return

    const { data } = await supabase
      .from('uploads')
      .select('id, store_name, original_filename, status, product_row_count, uploaded_at, special_instructions, awaiting_va_response, message_count, clients(store_name)')
      .eq('id', uploadId)
      .eq('va_id', va.id)
      .maybeSingle()

    if (!data) {
      router.push('/dashboard/messages')
      return
    }
    setUpload(data as unknown as UploadWithMeta)
  }, [va?.id, uploadId, router])

  const loadMessages = useCallback(async () => {
    if (!uploadId) return

    const { data } = await supabase
      .from('upload_messages')
      .select('id, upload_id, sender_type, sender_name, message, is_read, created_at, attachment_path, attachment_name, attachment_type, attachment_size')
      .eq('upload_id', uploadId)
      .order('created_at', { ascending: true })

    setMessages((data ?? []) as ChatMessage[])
  }, [uploadId])

  useEffect(() => {
    async function init() {
      setLoading(true)
      await Promise.all([loadUpload(), loadMessages()])
      setLoading(false)

      // Mark all admin messages as read on mount
      if (uploadId) {
        await supabase
          .from('upload_messages')
          .update({ is_read: true })
          .eq('upload_id', uploadId)
          .eq('sender_type', 'admin')
          .eq('is_read', false)

        await supabase
          .from('uploads')
          .update({ awaiting_va_response: false })
          .eq('id', uploadId)
      }
    }
    void init()
  }, [loadUpload, loadMessages, uploadId])

  // ── Scroll to bottom when messages change ──────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Realtime: new messages ─────────────────────────────────────────────────
  useEffect(() => {
    if (!uploadId) return

    const channel = supabase
      .channel(`msg-va-${uploadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'upload_messages',
          filter: `upload_id=eq.${uploadId}`,
        },
        payload => {
          const msg = payload.new as ChatMessage
          setMessages(prev => {
            if (prev.find(m => m.id === msg.id)) return prev
            return [...prev, msg]
          })
          // Auto-mark admin messages as read immediately
          if (msg.sender_type === 'admin') {
            void supabase
              .from('upload_messages')
              .update({ is_read: true })
              .eq('id', msg.id)
          }
          // Scroll to bottom handled by the messages useEffect
        }
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [uploadId])

  // ── Typing indicator ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!uploadId) return

    const ch = supabase.channel(`typing-${uploadId}`)
    typingChannelRef.current = ch

    ch.on('broadcast', { event: 'typing' }, payload => {
      const p = payload.payload as { sender?: string }
      if (p.sender === 'admin') {
        setAdminTyping(true)
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
        typingTimerRef.current = setTimeout(() => setAdminTyping(false), 3000)
      }
    }).subscribe()

    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      void supabase.removeChannel(ch)
    }
  }, [uploadId])

  // ── Auto-resize textarea ───────────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const lineHeight = 22
    const maxHeight = lineHeight * 5 + 24
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px'
  }, [text])

  // ── Broadcast typing ───────────────────────────────────────────────────────
  function broadcastTyping() {
    const now = Date.now()
    if (now - lastTypingSentRef.current < 1000) return
    lastTypingSentRef.current = now
    void typingChannelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { sender: 'va' },
    })
  }

  // ── Send message ───────────────────────────────────────────────────────────
  async function sendMessage(msgText: string, attachment?: File) {
    if (!va || !uploadId) return

    const trimmed = msgText.trim()
    if (!trimmed && !attachment) return

    setSending(true)
    setText('')
    setPendingFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''

    // Optimistic update
    const tempId = `temp-${Date.now()}`
    const optimistic: ChatMessage = {
      id: tempId,
      upload_id: uploadId,
      sender_type: 'va',
      sender_name: va.name,
      message: trimmed,
      is_read: false,
      created_at: new Date().toISOString(),
      attachment_path: null,
      attachment_name: attachment?.name ?? null,
      attachment_type: attachment?.type ?? null,
      attachment_size: attachment?.size ?? null,
    }
    setMessages(prev => [...prev, optimistic])

    // Upload attachment if provided
    let attachmentPath: string | null = null
    let attachmentUrl: string | null = null

    if (attachment) {
      const ts = Date.now()
      const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      attachmentPath = `messages/${uploadId}/${ts}-${safeName}`

      const { error: storageErr } = await supabase.storage
        .from('uploads')
        .upload(attachmentPath, attachment, { contentType: attachment.type, upsert: false })

      if (storageErr) {
        console.error('[messages] Attachment upload failed:', storageErr)
        attachmentPath = null
      } else {
        const { data: urlData } = supabase.storage
          .from('uploads')
          .getPublicUrl(attachmentPath)
        attachmentUrl = urlData.publicUrl
      }
    }

    // Insert message into DB
    const { data: inserted } = await supabase
      .from('upload_messages')
      .insert({
        upload_id: uploadId,
        sender_type: 'va',
        sender_name: va.name,
        message: trimmed,
        is_read: false,
        attachment_path: attachmentPath,
        attachment_name: attachment?.name ?? null,
        attachment_type: attachment?.type ?? null,
        attachment_size: attachment?.size ?? null,
      })
      .select()
      .single()

    // Replace optimistic with real message
    if (inserted) {
      const real = inserted as ChatMessage
      if (attachmentUrl && attachmentPath) {
        real.attachment_path = attachmentPath
      }
      setMessages(prev =>
        prev.map(m => (m.id === tempId ? real : m))
      )
    }

    // Update upload tracking
    await supabase
      .from('uploads')
      .update({
        awaiting_admin_response: true,
        awaiting_va_response: false,
        has_unread_messages: true,
        message_count: (messages.length + 1),
        last_message_at: new Date().toISOString(),
      })
      .eq('id', uploadId)

    // Mark all admin messages as read
    await supabase
      .from('upload_messages')
      .update({ is_read: true })
      .eq('upload_id', uploadId)
      .eq('sender_type', 'admin')
      .eq('is_read', false)

    // Fire-and-forget activity log
    void logActivity({
      action: 'va_message_sent',
      upload_id: uploadId,
      va_id: va.id,
      source: 'va',
      details: `VA sent message: ${trimmed.slice(0, 80)}`,
    })

    // Notify admin (via sendNotification placeholder) — no-op on admin side but keeps pattern
    void sendNotification({
      va_id: va.id,
      type: 'va_response',
      title: `VA replied on upload for ${resolvedStoreName}`,
      message: trimmed.slice(0, 100),
      send_email: false,
    })

    setSending(false)
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!sending && (text.trim() || pendingFile)) {
        void sendMessage(text, pendingFile ?? undefined)
      }
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate: images + CSV/XLSX, max 5 MB
    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'text/csv', 'application/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ]
    if (!allowed.includes(file.type)) {
      alert('Only images and CSV/XLSX files are allowed.')
      e.target.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('File must be under 5 MB.')
      e.target.value = ''
      return
    }
    setPendingFile(file)
  }

  function getAttachmentPublicUrl(path: string | null | undefined): string | null {
    if (!path) return null
    const { data } = supabase.storage.from('uploads').getPublicUrl(path)
    return data.publicUrl
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const resolvedStoreName =
    (upload?.clients as { store_name: string } | null)?.store_name ??
    upload?.store_name ??
    'Upload'

  const isOnHold = upload?.status === 'on_hold'
  const fileExt = upload?.original_filename?.split('.').pop()?.toUpperCase() ?? ''

  // ── Group messages by consecutive sender ───────────────────────────────────
  type MessageGroup = {
    sender_type: 'va' | 'admin' | 'system'
    sender_name: string
    firstAt: string
    items: ChatMessage[]
  }

  const groups = messages.reduce<MessageGroup[]>((acc, msg) => {
    const prev = acc[acc.length - 1]
    if (prev && prev.sender_type === msg.sender_type && msg.sender_type !== 'system') {
      prev.items.push(msg)
    } else {
      acc.push({
        sender_type: msg.sender_type,
        sender_name: msg.sender_name,
        firstAt: msg.created_at,
        items: [msg],
      })
    }
    return acc
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────────
  if (!va) return null

  if (loading) {
    return (
      <div
        style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '48px 24px',
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <div style={{ fontSize: 13, color: T.ghost }}>Loading…</div>
      </div>
    )
  }

  if (!upload) return null

  return (
    <>
      {/* Image overlay */}
      {overlayUrl && (
        <div
          onClick={() => setOverlayUrl(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={overlayUrl}
            alt="Attachment"
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: 8,
            }}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      <div
        style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '48px 24px 120px',
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        {/* Back link */}
        <BackLink />

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1
            style={{
              fontSize: 18,
              fontWeight: 500,
              color: T.black,
              margin: '0 0 6px',
              letterSpacing: '-0.01em',
            }}
          >
            {resolvedStoreName}
          </h1>

          <div style={{ fontSize: 12, color: T.ghost, marginBottom: 10 }}>
            {upload.original_filename && `${upload.original_filename} · `}
            {upload.product_row_count !== null && `${upload.product_row_count} products · `}
            {relDate(upload.uploaded_at)}
          </div>

          {/* Status chip */}
          <div style={{ display: 'inline-flex', alignItems: 'center' }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: getStatusColor(upload.status),
                background: getStatusBg(upload.status),
                borderRadius: 100,
                padding: '3px 10px',
              }}
            >
              {getStatusLabel(upload.status)}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: `1px solid #F0F0F0`, marginBottom: 16 }} />

        {/* Context block */}
        <div
          style={{
            background: T.row,
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 9,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: '#DDDDDD',
              marginBottom: 10,
              fontWeight: 600,
            }}
          >
            Upload Details
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 12, color: T.ter }}>
              Client: {resolvedStoreName}
            </div>
            {upload.original_filename && (
              <div style={{ fontSize: 12, color: T.ter }}>
                File: {upload.original_filename}
                {fileExt ? ` · ${fileExt}` : ''}
              </div>
            )}
            <div style={{ fontSize: 12, color: T.ter }}>
              Products: {upload.product_row_count ?? 0}
            </div>
            <div style={{ fontSize: 12, color: T.ter }}>
              Instructions: {upload.special_instructions ?? 'None'}
            </div>
            {isOnHold && (
              <div style={{ fontSize: 12, color: T.black, fontWeight: 500, marginTop: 4 }}>
                Status: On Hold — waiting for your response
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {groups.map((group, gi) => {
            if (group.sender_type === 'system') {
              return (
                <div key={gi} style={{ marginTop: 24, marginBottom: 24 }}>
                  {group.items.map(msg => (
                    <div
                      key={msg.id}
                      style={{
                        textAlign: 'center',
                        fontSize: 12,
                        color: T.ghost,
                        fontStyle: 'italic',
                        padding: '6px 0',
                        borderTop: `1px solid ${T.div}`,
                        borderBottom: `1px solid ${T.div}`,
                      }}
                    >
                      {msg.message}
                    </div>
                  ))}
                </div>
              )
            }

            const isVA = group.sender_type === 'va'

            return (
              <div key={gi} style={{ marginBottom: 24 }}>
                {/* Group header */}
                <div
                  style={{
                    fontSize: 11,
                    color: T.ghost,
                    marginBottom: 6,
                    textAlign: isVA ? 'right' : 'left',
                  }}
                >
                  {isVA ? 'You' : group.sender_name} · {relDate(group.firstAt)}
                </div>

                {/* Bubbles */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {group.items.map(msg => (
                    <MessageBubble
                      key={msg.id}
                      msg={msg}
                      isVA={isVA}
                      onImageClick={url => setOverlayUrl(url)}
                      getPublicUrl={getAttachmentPublicUrl}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {/* Typing indicator */}
          {adminTyping && (
            <div
              style={{
                fontSize: 12,
                color: T.ghost,
                fontStyle: 'italic',
                marginBottom: 12,
              }}
            >
              Admin is typing…
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Empty state */}
        {messages.length === 0 && (
          <div
            style={{
              fontSize: 13,
              color: T.ghost,
              textAlign: 'center',
              padding: '32px 0',
            }}
          >
            No messages yet.
          </div>
        )}
      </div>

      {/* Sticky input */}
      <StickyInput
        isOnHold={isOnHold}
        text={text}
        setText={setText}
        sending={sending}
        pendingFile={pendingFile}
        setPendingFile={setPendingFile}
        textareaRef={textareaRef}
        fileInputRef={fileInputRef}
        onSend={() => void sendMessage(text, pendingFile ?? undefined)}
        onKey={handleKey}
        onFileChange={handleFileChange}
        onTyping={broadcastTyping}
      />
    </>
  )
}

// ─── BackLink ─────────────────────────────────────────────────────────────────
function BackLink() {
  const [hovered, setHovered] = useState(false)
  return (
    <Link
      href="/dashboard/messages"
      style={{
        fontSize: 12,
        color: hovered ? T.black : T.ghost,
        textDecoration: 'none',
        display: 'block',
        marginBottom: 24,
        transition: 'color 0.15s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      ← Back to messages
    </Link>
  )
}

// ─── MessageBubble ────────────────────────────────────────────────────────────
function MessageBubble({
  msg,
  isVA,
  onImageClick,
  getPublicUrl,
}: {
  msg: ChatMessage
  isVA: boolean
  onImageClick: (url: string) => void
  getPublicUrl: (path: string | null | undefined) => string | null
}) {
  const attachmentUrl = getPublicUrl(msg.attachment_path)
  const isImage =
    msg.attachment_type?.startsWith('image/') && attachmentUrl !== null

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isVA ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          background: isVA ? '#FFFFFF' : T.row,
          border: isVA ? `1px solid ${T.div}` : 'none',
          borderRadius: 10,
          padding: '14px 18px',
          marginLeft: isVA ? 'auto' : undefined,
        }}
      >
        {/* Text */}
        {msg.message && (
          <div
            style={{
              fontSize: 14,
              color: T.black,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {msg.message}
          </div>
        )}

        {/* Attachment */}
        {attachmentUrl && (
          <div style={{ marginTop: msg.message ? 10 : 0 }}>
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={attachmentUrl}
                alt={msg.attachment_name ?? 'Attachment'}
                style={{
                  maxWidth: 280,
                  borderRadius: 8,
                  display: 'block',
                  cursor: 'zoom-in',
                }}
                onClick={() => onImageClick(attachmentUrl)}
              />
            ) : (
              <a
                href={attachmentUrl}
                download={msg.attachment_name ?? 'file'}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  color: T.black,
                  textDecoration: 'none',
                  background: T.div,
                  borderRadius: 6,
                  padding: '6px 10px',
                }}
              >
                <span>📎</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                  {msg.attachment_name ?? 'Download file'}
                </span>
                {msg.attachment_size ? (
                  <span style={{ color: T.ghost, flexShrink: 0 }}>
                    {formatBytes(msg.attachment_size)}
                  </span>
                ) : null}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── StickyInput ──────────────────────────────────────────────────────────────
function StickyInput({
  isOnHold,
  text,
  setText,
  sending,
  pendingFile,
  setPendingFile,
  textareaRef,
  fileInputRef,
  onSend,
  onKey,
  onFileChange,
  onTyping,
}: {
  isOnHold: boolean
  text: string
  setText: (v: string) => void
  sending: boolean
  pendingFile: File | null
  setPendingFile: (f: File | null) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onSend: () => void
  onKey: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onTyping: () => void
}) {
  const [focused, setFocused] = useState(false)
  const canSend = (text.trim().length > 0 || pendingFile !== null) && !sending

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#FFFFFF',
        borderTop: '1px solid #F0F0F0',
        padding: '16px 24px',
        zIndex: 100,
      }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        {isOnHold ? (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            {/* Paperclip button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0 0 10px',
                color: T.ghost,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = T.black}
              onMouseLeave={e => e.currentTarget.style.color = T.ghost}
              title="Attach file"
            >
              <Paperclip size={16} />
            </button>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={onFileChange}
            />

            {/* Textarea wrapper */}
            <div style={{ flex: 1, position: 'relative' }}>
              {/* Pending file chip */}
              {pendingFile && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: T.row,
                    borderRadius: 6,
                    padding: '3px 8px',
                    fontSize: 11,
                    color: T.ter,
                    marginBottom: 6,
                    maxWidth: '100%',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                    {pendingFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingFile(null)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      color: T.ghost,
                      fontSize: 14,
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                    title="Remove file"
                  >
                    ×
                  </button>
                </div>
              )}

              <div style={{ position: 'relative' }}>
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={e => {
                    setText(e.target.value)
                    onTyping()
                  }}
                  onKeyDown={onKey}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  rows={1}
                  placeholder="Type your reply..."
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    fontSize: 14,
                    fontFamily: "'Inter', system-ui, sans-serif",
                    color: T.black,
                    background: '#FFFFFF',
                    border: `1px solid ${focused ? T.black : T.div}`,
                    borderRadius: 10,
                    padding: '12px 60px 12px 16px',
                    outline: 'none',
                    resize: 'none',
                    lineHeight: '22px',
                    transition: 'border-color 0.15s',
                    overflowY: 'hidden',
                  }}
                />

                {/* Send text inside field */}
                <button
                  type="button"
                  onClick={onSend}
                  disabled={!canSend}
                  style={{
                    position: 'absolute',
                    right: 12,
                    bottom: 12,
                    background: 'none',
                    border: 'none',
                    cursor: canSend ? 'pointer' : 'default',
                    fontSize: 13,
                    fontFamily: "'Inter', system-ui, sans-serif",
                    color: canSend ? T.black : T.ghost,
                    padding: 0,
                    transition: 'color 0.15s',
                    fontWeight: canSend ? 500 : 400,
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p
            style={{
              fontSize: 13,
              color: T.ghost,
              textAlign: 'center',
              margin: 0,
            }}
          >
            This conversation has been resolved.
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Suppress unused import warning for sendNotification ─────────────────────
// sendNotification is used inside sendMessage() above
void (sendNotification as unknown)
