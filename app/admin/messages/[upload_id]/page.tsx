'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Paperclip } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { sendNotification } from '@/lib/notifications'
import { addSystemMessage } from '@/components/UploadChat'

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

type UploadDetail = {
  id: string
  va_id: string
  va_name: string
  store_name: string | null
  original_filename: string | null
  status: string
  product_row_count: number | null
  uploaded_at: string
  special_instructions: string | null
  pre_check_result: Record<string, unknown> | null
  adjusted_instruction: string | null
  awaiting_admin_response: boolean
  message_count: number
  client_id: string
  client_store_name: string
  client_niche: string | null
  client_market: string | null
}

type Prompt = { id: string; name: string }
type QuickAction = 'none' | 'approve' | 'reject' | 'edit'

type VADetail = {
  name: string
  country: string | null
  email: string | null
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

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  )
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtSize(bytes: number | null | undefined): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function isImageType(mime: string | null | undefined): boolean {
  if (!mime) return false
  return mime.startsWith('image/')
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminThreadPage() {
  const params   = useParams()
  const router   = useRouter()
  const uploadId = params.upload_id as string

  const [upload,        setUpload]        = useState<UploadDetail | null>(null)
  const [vaDetail,      setVaDetail]      = useState<VADetail | null>(null)
  const [messages,      setMessages]      = useState<ChatMessage[]>([])
  const [prompts,       setPrompts]       = useState<Prompt[]>([])
  const [loading,       setLoading]       = useState(true)
  const [text,          setText]          = useState('')
  const [sending,       setSending]       = useState(false)
  const [quickAction,   setQuickAction]   = useState<QuickAction>('none')
  const [selectedPrompt,setSelectedPrompt]= useState<string>('')
  const [editText,      setEditText]      = useState('')
  const [vaTyping,      setVaTyping]      = useState(false)
  const [overlayUrl,    setOverlayUrl]    = useState<string | null>(null)
  const [attachFile,    setAttachFile]    = useState<File | null>(null)

  const bottomRef      = useRef<HTMLDivElement>(null)
  const textareaRef    = useRef<HTMLTextAreaElement>(null)
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Mark as read on mount ────────────────────────────────────────────────
  const markRead = useCallback(async () => {
    await supabase
      .from('upload_messages')
      .update({ is_read: true })
      .eq('upload_id', uploadId)
      .eq('sender_type', 'va')
      .eq('is_read', false)

    await supabase
      .from('uploads')
      .update({ awaiting_admin_response: false })
      .eq('id', uploadId)
  }, [uploadId])

  // ── Load data ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)

    // Load upload + join client data
    const { data: uploadRow } = await supabase
      .from('uploads')
      .select(`
        id, va_id, store_name, original_filename, status,
        product_row_count, uploaded_at, special_instructions,
        pre_check_result, adjusted_instruction, awaiting_admin_response,
        message_count,
        clients!inner(id, store_name, niche, market),
        vas!inner(name)
      `)
      .eq('id', uploadId)
      .maybeSingle()

    if (uploadRow) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = uploadRow as any
      const client = Array.isArray(row.clients) ? row.clients[0] : row.clients
      const va     = Array.isArray(row.vas)     ? row.vas[0]     : row.vas

      const detail: UploadDetail = {
        id:                   row.id,
        va_id:                row.va_id,
        va_name:              va?.name ?? 'Unknown VA',
        store_name:           row.store_name,
        original_filename:    row.original_filename,
        status:               row.status,
        product_row_count:    row.product_row_count,
        uploaded_at:          row.uploaded_at,
        special_instructions: row.special_instructions,
        pre_check_result:     row.pre_check_result,
        adjusted_instruction: row.adjusted_instruction,
        awaiting_admin_response: row.awaiting_admin_response ?? false,
        message_count:        row.message_count ?? 0,
        client_id:            client?.id ?? '',
        client_store_name:    client?.store_name ?? row.store_name ?? '—',
        client_niche:         client?.niche ?? null,
        client_market:        client?.market ?? null,
      }
      setUpload(detail)

      // Pre-fill edit textarea
      setEditText(detail.adjusted_instruction ?? detail.special_instructions ?? '')

      // Load VA detail
      const { data: vaRow } = await supabase
        .from('vas')
        .select('name, country, email')
        .eq('id', row.va_id)
        .maybeSingle()
      if (vaRow) {
        setVaDetail(vaRow as unknown as VADetail)
      }
    }

    // Load messages
    const { data: msgsData } = await supabase
      .from('upload_messages')
      .select('*')
      .eq('upload_id', uploadId)
      .order('created_at', { ascending: true })
    setMessages((msgsData ?? []) as unknown as ChatMessage[])

    // Load prompts
    const { data: promptsData } = await supabase
      .from('prompts')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
    setPrompts((promptsData ?? []) as unknown as Prompt[])
    if (promptsData && promptsData.length > 0) {
      setSelectedPrompt((promptsData[0] as unknown as Prompt).id)
    }

    setLoading(false)
    await markRead()
  }, [uploadId, markRead])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // ── Auto-scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Realtime: new messages ───────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`msg-admin-${uploadId}`)
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
          // Auto-mark VA messages as read
          if (msg.sender_type === 'va') {
            void supabase
              .from('upload_messages')
              .update({ is_read: true })
              .eq('id', msg.id)
          }
        }
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [uploadId])

  // ── Realtime: typing indicator ───────────────────────────────────────────
  useEffect(() => {
    if (!upload) return

    const channel = supabase.channel(`typing-${uploadId}`)

    channel
      .on('broadcast', { event: 'typing' }, (payload: { payload?: { sender?: string } }) => {
        if (payload.payload?.sender === 'va') {
          setVaTyping(true)
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
          typingTimerRef.current = setTimeout(() => setVaTyping(false), 3000)
        }
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    }
  }, [uploadId, upload])

  // ── Broadcast admin typing ───────────────────────────────────────────────
  const broadcastTyping = useCallback(() => {
    void supabase.channel(`typing-${uploadId}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { sender: 'admin' },
    })
  }, [uploadId])

  // ── Auto-resize textarea ─────────────────────────────────────────────────
  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    const maxH = el.style.fontSize ? parseInt(el.style.fontSize) * 1.6 * 5 : 112
    el.style.height = Math.min(el.scrollHeight, maxH) + 'px'
  }

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (msgText: string, attachment?: File) => {
    if (!msgText.trim() && !attachment) return
    if (!upload) return
    setSending(true)

    // Optimistic
    const tempId = `temp-${Date.now()}`
    const optimistic: ChatMessage = {
      id:          tempId,
      upload_id:   uploadId,
      sender_type: 'admin',
      sender_name: 'Admin',
      message:     msgText,
      is_read:     false,
      created_at:  new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimistic])

    // Upload attachment if any
    let attachmentPath: string | null = null
    let attachmentName: string | null = null
    let attachmentType: string | null = null
    let attachmentSize: number | null = null

    if (attachment) {
      const path = `${uploadId}/${Date.now()}-${attachment.name}`
      const { data: storageData } = await supabase.storage
        .from('messages')
        .upload(path, attachment)
      if (storageData) {
        attachmentPath = storageData.path
        attachmentName = attachment.name
        attachmentType = attachment.type
        attachmentSize = attachment.size
      }
    }

    // Insert message
    const { data: inserted } = await supabase
      .from('upload_messages')
      .insert({
        upload_id:       uploadId,
        sender_type:     'admin',
        sender_name:     'Admin',
        message:         msgText,
        is_read:         false,
        attachment_path: attachmentPath,
        attachment_name: attachmentName,
        attachment_type: attachmentType,
        attachment_size: attachmentSize,
      })
      .select()
      .single()

    // Replace optimistic with real
    if (inserted) {
      setMessages(prev => prev.map(m => m.id === tempId ? (inserted as unknown as ChatMessage) : m))
    } else {
      setMessages(prev => prev.filter(m => m.id !== tempId))
    }

    // Update upload
    await supabase.from('uploads').update({
      awaiting_va_response:    true,
      awaiting_admin_response: false,
      has_unread_messages:     true,
      message_count:           (upload.message_count ?? 0) + 1,
      last_message_at:         new Date().toISOString(),
    }).eq('id', uploadId)

    // Mark VA messages as read
    await supabase
      .from('upload_messages')
      .update({ is_read: true })
      .eq('upload_id', uploadId)
      .eq('sender_type', 'va')
      .eq('is_read', false)

    // Notify VA
    await sendNotification({
      va_id:   upload.va_id,
      type:    'upload_clarification',
      title:   `Admin replied — ${upload.client_store_name}`,
      message: msgText.slice(0, 100),
    })

    void logActivity({
      action:    'admin_message_sent',
      upload_id: uploadId,
      va_id:     upload.va_id,
      source:    'admin',
      details:   `Admin replied about ${upload.client_store_name}`,
    })

    setSending(false)
  }, [upload, uploadId])

  // ── Handle key in textarea ───────────────────────────────────────────────
  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!text.trim() && !attachFile) return
      const t = text
      const f = attachFile ?? undefined
      setText('')
      setAttachFile(null)
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
      void sendMessage(t, f)
    }
  }

  // ── Approve flow ─────────────────────────────────────────────────────────
  async function handleApprove() {
    if (!upload) return
    await supabase
      .from('uploads')
      .update({ status: 'queued', held_reason: null })
      .eq('id', uploadId)

    await addSystemMessage(uploadId, 'Upload approved and processing started.')

    await sendNotification({
      va_id:   upload.va_id,
      type:    'upload_clarification',
      title:   `Your upload for ${upload.client_store_name} has been approved`,
      message: 'Your upload is now queued for processing.',
    })

    void logActivity({
      action:    'upload_approved_from_hold',
      upload_id: uploadId,
      va_id:     upload.va_id,
      source:    'admin',
      details:   `Upload approved from on_hold for ${upload.client_store_name}`,
    })

    setQuickAction('none')
    setUpload(prev => prev ? { ...prev, status: 'queued' } : prev)
  }

  // ── Reject flow ──────────────────────────────────────────────────────────
  async function handleReject() {
    if (!upload || !text.trim()) return
    const reason = text.trim()
    setText('')

    await supabase
      .from('uploads')
      .update({ status: 'failed', flag_resolved: true, error_message: reason })
      .eq('id', uploadId)

    await addSystemMessage(uploadId, `Upload rejected: ${reason}`)

    await sendNotification({
      va_id:   upload.va_id,
      type:    'upload_clarification',
      title:   `Your upload for ${upload.client_store_name} was rejected`,
      message: reason.slice(0, 100),
    })

    void logActivity({
      action:    'upload_rejected',
      upload_id: uploadId,
      va_id:     upload.va_id,
      source:    'admin',
      details:   `Upload rejected: ${reason}`,
    })

    setQuickAction('none')
    setUpload(prev => prev ? { ...prev, status: 'failed' } : prev)
  }

  // ── Edit instructions flow ───────────────────────────────────────────────
  async function handleSaveEdit() {
    if (!upload || !editText.trim()) return
    const newText = editText.trim()

    await supabase
      .from('uploads')
      .update({ adjusted_instruction: newText, status: 'queued', held_reason: null })
      .eq('id', uploadId)

    await addSystemMessage(uploadId, 'Instructions updated and upload queued for processing.')

    await sendNotification({
      va_id:   upload.va_id,
      type:    'upload_clarification',
      title:   `Upload instructions updated — ${upload.client_store_name}`,
      message: 'Admin edited your instructions. Your upload is now queued.',
    })

    void logActivity({
      action:    'upload_instructions_edited',
      upload_id: uploadId,
      va_id:     upload.va_id,
      source:    'admin',
      details:   `Instructions updated and re-queued for ${upload.client_store_name}`,
    })

    setQuickAction('none')
    setUpload(prev => prev ? { ...prev, status: 'queued', adjusted_instruction: newText } : prev)
  }

  // ── Attachment image URL ─────────────────────────────────────────────────
  function getAttachmentUrl(path: string): string {
    const { data } = supabase.storage.from('messages').getPublicUrl(path)
    return data.publicUrl
  }

  // ── Group messages ───────────────────────────────────────────────────────
  type MsgGroup = {
    sender_type: 'va' | 'admin' | 'system'
    sender_name: string
    messages: ChatMessage[]
  }

  function groupMessages(msgs: ChatMessage[]): MsgGroup[] {
    const groups: MsgGroup[] = []
    for (const msg of msgs) {
      const last = groups[groups.length - 1]
      if (last && last.sender_type === msg.sender_type && msg.sender_type !== 'system') {
        last.messages.push(msg)
      } else {
        groups.push({ sender_type: msg.sender_type, sender_name: msg.sender_name, messages: [msg] })
      }
    }
    return groups
  }

  const messageGroups = groupMessages(messages)

  // ── Pre-check display ────────────────────────────────────────────────────
  function preCheckText(result: Record<string, unknown> | null): string {
    if (!result) return 'None'
    const parts: string[] = []
    if (result.can_handle !== undefined) parts.push(String(result.can_handle))
    if (result.confidence !== undefined) parts.push(String(result.confidence))
    if (result.reason)                   parts.push(String(result.reason))
    return parts.join(' · ') || JSON.stringify(result)
  }

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ fontSize: 13, color: T.ghost }}>Loading…</div>
      </div>
    )
  }

  if (!upload) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ fontSize: 13, color: T.ghost }}>Upload not found.</div>
      </div>
    )
  }

  const isOnHold = upload.status === 'on_hold'
  const vaName   = upload.va_name

  return (
    <>
      {/* ── Image overlay ── */}
      {overlayUrl && (
        <div
          onClick={() => setOverlayUrl(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={overlayUrl}
            alt="attachment"
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }}
          />
        </div>
      )}

      {/* ── Hidden file input ── */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) setAttachFile(f)
          e.target.value = ''
        }}
      />

      <div style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '48px 24px 140px',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        {/* ── Header ── */}
        <div style={{ marginBottom: 24 }}>
          <Link
            href="/admin/messages"
            style={{ fontSize: 12, color: T.ghost, textDecoration: 'none', display: 'inline-block', marginBottom: 16 }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = T.black }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = T.ghost }}
          >
            ← Back to messages
          </Link>

          <div style={{ fontSize: 18, fontWeight: 500, color: T.black, marginBottom: 6 }}>
            {vaName}
            <span style={{ color: T.ghost, margin: '0 8px' }}>→</span>
            {upload.client_store_name}
          </div>

          <div style={{ fontSize: 12, color: T.ghost, marginBottom: 6 }}>
            {upload.original_filename ?? 'No file'}&nbsp;&nbsp;·&nbsp;&nbsp;
            {upload.product_row_count != null ? `${upload.product_row_count} products` : 'Unknown products'}&nbsp;&nbsp;·&nbsp;&nbsp;
            {relDate(upload.uploaded_at)}
          </div>

          <div style={{ fontSize: 12, color: T.ghost, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 100,
              border: `1px solid ${T.div}`,
              fontSize: 11,
            }}>
              {upload.status.replace(/_/g, ' ')}
            </span>
            <Link
              href="/admin/flagged"
              style={{ fontSize: 12, color: T.ghost, textDecoration: 'none' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = T.black }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = T.ghost }}
            >
              View in flagged →
            </Link>
          </div>
        </div>

        <div style={{ height: 1, background: '#F0F0F0', marginBottom: 16 }} />

        {/* ── Context block ── */}
        <div style={{
          background: T.row,
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, marginBottom: 10 }}>
            Upload Details
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 12, color: T.ter }}>
              VA: {vaDetail?.name ?? vaName}
              {vaDetail?.country ? ` · ${vaDetail.country}` : ''}
              {vaDetail?.email   ? ` · ${vaDetail.email}`   : ''}
            </div>
            <div style={{ fontSize: 12, color: T.ter }}>
              Client: {upload.client_store_name}
              {upload.client_niche  ? ` · ${upload.client_niche}`  : ''}
              {upload.client_market ? ` · ${upload.client_market}` : ''}
            </div>
            <div style={{ fontSize: 12, color: T.ter }}>
              File: {upload.original_filename ?? 'None'}&nbsp;&nbsp;·&nbsp;&nbsp;
              {upload.product_row_count != null ? `${upload.product_row_count} products` : '—'}
            </div>
            <div style={{ fontSize: 12, color: T.ter }}>
              Instructions: {upload.special_instructions ?? 'None'}
            </div>
            <div style={{ fontSize: 12, color: T.ter }}>
              Pre-check: {preCheckText(upload.pre_check_result)}
            </div>
            <div style={{ fontSize: 12, color: T.ter }}>
              Uploaded: {fmtDate(upload.uploaded_at)}
            </div>
            {isOnHold && (
              <div style={{ fontSize: 12, color: T.ter }}>
                On hold since: {relDate(upload.uploaded_at)}
              </div>
            )}
          </div>
        </div>

        {/* ── Messages ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 24 }}>
          {messageGroups.map((group, gi) => {
            if (group.sender_type === 'system') {
              return (
                <div key={gi} style={{ textAlign: 'center' }}>
                  <div style={{ height: 1, background: T.div, marginBottom: 8 }} />
                  {group.messages.map(msg => (
                    <div key={msg.id} style={{
                      fontSize: 12, color: T.ghost, fontStyle: 'italic',
                      padding: '2px 0',
                    }}>
                      {msg.message}
                    </div>
                  ))}
                  <div style={{ height: 1, background: T.div, marginTop: 8 }} />
                </div>
              )
            }

            const isAdmin = group.sender_type === 'admin'
            const label   = isAdmin ? 'Admin' : vaName
            const firstMsg = group.messages[0]

            return (
              <div key={gi} style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: isAdmin ? 'flex-end' : 'flex-start' }}>
                {/* Sender label */}
                <div style={{ fontSize: 11, color: T.ghost }}>
                  {label} · {fmtTime(firstMsg.created_at)}
                </div>

                {/* Bubbles */}
                {group.messages.map(msg => (
                  <div
                    key={msg.id}
                    style={{
                      maxWidth: '85%',
                      background:   isAdmin ? T.row : '#FFFFFF',
                      border:       isAdmin ? 'none' : `1px solid ${T.div}`,
                      borderRadius: 10,
                      padding:      '14px 18px',
                    }}
                  >
                    <div style={{ fontSize: 14, color: T.black, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {msg.message}
                    </div>

                    {/* Attachment */}
                    {msg.attachment_path && (
                      <div style={{ marginTop: 10 }}>
                        {isImageType(msg.attachment_type) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={getAttachmentUrl(msg.attachment_path)}
                            alt={msg.attachment_name ?? 'attachment'}
                            onClick={() => setOverlayUrl(getAttachmentUrl(msg.attachment_path!))}
                            style={{
                              maxWidth: 240, maxHeight: 160,
                              borderRadius: 6,
                              objectFit: 'cover',
                              cursor: 'zoom-in',
                              display: 'block',
                            }}
                          />
                        ) : (
                          <a
                            href={getAttachmentUrl(msg.attachment_path)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 12, color: T.ter, textDecoration: 'underline' }}
                          >
                            {msg.attachment_name ?? 'attachment'}
                            {msg.attachment_size ? ` (${fmtSize(msg.attachment_size)})` : ''}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          })}

          {/* Typing indicator */}
          {vaTyping && (
            <div style={{ fontSize: 12, color: T.ghost, fontStyle: 'italic' }}>
              {vaName} is typing…
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Sticky bottom zone ── */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#FFFFFF',
        borderTop: '1px solid #F0F0F0',
        zIndex: 20,
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 24px' }}>
          {isOnHold ? (
            <>
              {/* Zone 1: Quick actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                {/* Approve & process */}
                <button
                  onClick={() => {
                    if (quickAction === 'approve') {
                      void handleApprove()
                    } else {
                      setQuickAction('approve')
                    }
                  }}
                  style={{
                    fontSize: 12,
                    fontFamily: 'inherit',
                    padding: '6px 14px',
                    borderRadius: 100,
                    border: `1px solid ${T.black}`,
                    background: quickAction === 'approve' ? T.black : 'transparent',
                    color:      quickAction === 'approve' ? '#FFFFFF' : T.black,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    if (quickAction !== 'approve') {
                      (e.currentTarget as HTMLButtonElement).style.background = T.black
                      ;(e.currentTarget as HTMLButtonElement).style.color = '#FFFFFF'
                    }
                  }}
                  onMouseLeave={e => {
                    if (quickAction !== 'approve') {
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                      ;(e.currentTarget as HTMLButtonElement).style.color = T.black
                    }
                  }}
                >
                  {quickAction === 'approve' ? 'Confirm approve' : 'Approve & process'}
                </button>

                {/* Reject */}
                <button
                  onClick={() => setQuickAction(quickAction === 'reject' ? 'none' : 'reject')}
                  style={{
                    fontSize: 12,
                    fontFamily: 'inherit',
                    padding: '6px 14px',
                    borderRadius: 100,
                    border: `1px solid ${T.div}`,
                    background: 'transparent',
                    color: T.ter,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    ;(e.currentTarget as HTMLButtonElement).style.borderColor = T.black
                    ;(e.currentTarget as HTMLButtonElement).style.color       = T.black
                  }}
                  onMouseLeave={e => {
                    ;(e.currentTarget as HTMLButtonElement).style.borderColor = T.div
                    ;(e.currentTarget as HTMLButtonElement).style.color       = T.ter
                  }}
                >
                  Reject
                </button>

                {/* Edit instructions */}
                <button
                  onClick={() => setQuickAction(quickAction === 'edit' ? 'none' : 'edit')}
                  style={{
                    fontSize: 12,
                    fontFamily: 'inherit',
                    background: 'none',
                    border: 'none',
                    color: quickAction === 'edit' ? T.black : T.ghost,
                    cursor: 'pointer',
                    padding: '6px 0',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = T.black }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = quickAction === 'edit' ? T.black : T.ghost }}
                >
                  Edit instructions
                </button>

                {/* Cancel */}
                {quickAction !== 'none' && (
                  <button
                    onClick={() => setQuickAction('none')}
                    style={{
                      fontSize: 12,
                      fontFamily: 'inherit',
                      background: 'none',
                      border: 'none',
                      color: T.ghost,
                      cursor: 'pointer',
                      padding: '6px 0',
                      marginLeft: 'auto',
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>

              {/* Approve prompt selector */}
              {quickAction === 'approve' && prompts.length > 0 && (
                <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: T.ter }}>Prompt template:</span>
                  <select
                    value={selectedPrompt}
                    onChange={e => setSelectedPrompt(e.target.value)}
                    style={{
                      fontSize: 12,
                      fontFamily: 'inherit',
                      color: T.black,
                      border: `1px solid ${T.div}`,
                      borderRadius: 6,
                      padding: '4px 8px',
                      background: '#FFFFFF',
                      cursor: 'pointer',
                    }}
                  >
                    {prompts.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Edit instructions textarea */}
              {quickAction === 'edit' && (
                <div style={{ marginBottom: 12 }}>
                  <textarea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    rows={3}
                    placeholder="Edit instructions..."
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      fontSize: 13,
                      fontFamily: 'inherit',
                      color: T.black,
                      border: `1px solid ${T.div}`,
                      borderRadius: 8,
                      padding: '10px 14px',
                      outline: 'none',
                      resize: 'vertical',
                      lineHeight: 1.6,
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <button
                      onClick={() => void handleSaveEdit()}
                      disabled={!editText.trim()}
                      style={{
                        fontSize: 12,
                        fontFamily: 'inherit',
                        padding: '6px 16px',
                        borderRadius: 100,
                        border: `1px solid ${T.black}`,
                        background: T.black,
                        color: '#FFFFFF',
                        cursor: editText.trim() ? 'pointer' : 'default',
                        opacity: editText.trim() ? 1 : 0.4,
                        transition: 'opacity 0.15s',
                      }}
                    >
                      Save & process
                    </button>
                  </div>
                </div>
              )}

              {/* Zone 2: Message input */}
              <div style={{ position: 'relative' }}>
                {/* Paperclip */}
                <div
                  style={{
                    position: 'absolute', left: 14, bottom: 14,
                    display: 'flex', alignItems: 'center',
                    cursor: 'pointer', color: attachFile ? T.black : T.ghost,
                    transition: 'color 0.15s',
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.color = T.black }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.color = attachFile ? T.black : T.ghost }}
                >
                  <Paperclip size={16} />
                </div>

                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={e => {
                    setText(e.target.value)
                    autoResize(e.target)
                    broadcastTyping()
                  }}
                  onKeyDown={handleKey}
                  rows={1}
                  placeholder={
                    quickAction === 'reject'
                      ? 'Reason for rejection...'
                      : `Reply to ${vaName}...`
                  }
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    fontSize: 14,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    color: T.black,
                    border: `1px solid ${T.div}`,
                    borderRadius: 10,
                    padding: '12px 60px 12px 40px',
                    outline: 'none',
                    resize: 'none',
                    lineHeight: 1.6,
                    maxHeight: 112,
                    overflowY: 'auto',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e  => { e.target.style.borderColor = T.black }}
                  onBlur={e   => { e.target.style.borderColor = T.div   }}
                />

                {/* Send button */}
                <button
                  onClick={() => {
                    if (!text.trim() && !attachFile) return
                    if (quickAction === 'reject') {
                      void handleReject()
                    } else {
                      const t = text
                      const f = attachFile ?? undefined
                      setText('')
                      setAttachFile(null)
                      if (textareaRef.current) textareaRef.current.style.height = 'auto'
                      void sendMessage(t, f)
                    }
                  }}
                  disabled={(!text.trim() && !attachFile) || sending}
                  style={{
                    position: 'absolute', right: 10, bottom: 10,
                    fontSize: 12,
                    fontFamily: 'inherit',
                    fontWeight: 500,
                    padding: '5px 14px',
                    borderRadius: 100,
                    border: 'none',
                    background: T.black,
                    color: '#FFFFFF',
                    cursor: (!text.trim() && !attachFile) || sending ? 'default' : 'pointer',
                    opacity: (!text.trim() && !attachFile) ? 0.35 : 1,
                    transition: 'opacity 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {quickAction === 'reject' ? 'Reject' : 'Send'}
                </button>
              </div>

              {/* Attached file indicator */}
              {attachFile && (
                <div style={{ marginTop: 6, fontSize: 12, color: T.ter, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{attachFile.name}</span>
                  <button
                    onClick={() => setAttachFile(null)}
                    style={{ fontSize: 11, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', fontSize: 13, color: T.ghost }}>
              This conversation is resolved.
            </div>
          )}
        </div>
      </div>
    </>
  )
}
