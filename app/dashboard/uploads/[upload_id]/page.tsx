'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useVA } from '@/context/va-context'
import { supabase } from '@/lib/supabase'
import type { Upload } from '@/lib/supabase'
import UploadChat from '@/components/UploadChat'

const T = {
  black: '#111111', ter: '#999999', ghost: '#CCCCCC',
  div: '#EEEEEE', row: '#FAFAFA',
}

function relDate(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

type UploadWithMessages = Upload & {
  awaiting_va_response?: boolean
  message_count?: number
  has_unread_messages?: boolean
  clients?: { store_name: string } | null
}

export default function VAUploadDetailPage() {
  const { upload_id } = useParams<{ upload_id: string }>()
  const { currentVA: va } = useVA()
  const router = useRouter()

  const [upload, setUpload]   = useState<UploadWithMessages | null>(null)
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!va?.id || !upload_id) return
    void load()
  }, [va?.id, upload_id])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('uploads')
      .select('*, clients(store_name)')
      .eq('id', upload_id)
      .eq('va_id', va!.id)
      .maybeSingle()

    if (!data) {
      router.push('/dashboard/uploads')
      return
    }
    setUpload(data as unknown as UploadWithMessages)
    setLoading(false)
  }

  async function dismiss() {
    // Mark admin messages as read, clear awaiting_va_response
    await supabase
      .from('upload_messages')
      .update({ is_read: true })
      .eq('upload_id', upload_id)
      .eq('sender_type', 'admin')
    await supabase
      .from('uploads')
      .update({ awaiting_va_response: false, has_unread_messages: false })
      .eq('id', upload_id)
    setDismissed(true)
  }

  if (!va) return null

  if (loading) {
    return (
      <div style={{ padding: '48px 48px', maxWidth: 680, margin: '0 auto' }}>
        <div style={{ fontSize: 13, color: T.ghost }}>Loading…</div>
      </div>
    )
  }

  if (!upload) return null

  const storeName = (upload.clients as { store_name: string } | null)?.store_name
    ?? upload.store_name
    ?? 'Upload'

  const isClosed = upload.status !== 'on_hold'
  const hasUnread = upload.awaiting_va_response && !dismissed

  return (
    <div style={{
      padding: '48px 48px 80px',
      maxWidth: 680,
      margin: '0 auto',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>

      {/* Back link */}
      <Link
        href="/dashboard/uploads"
        style={{ fontSize: 13, color: T.ghost, textDecoration: 'none', display: 'block', marginBottom: 32 }}
        onMouseEnter={e => e.currentTarget.style.color = T.black}
        onMouseLeave={e => e.currentTarget.style.color = T.ghost}
      >
        ← Upload history
      </Link>

      {/* Unread banner */}
      {hasUnread && (
        <div style={{
          background: T.row, border: `1px solid ${T.div}`, borderRadius: 12,
          padding: '16px 20px', marginBottom: 32,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ter, marginBottom: 4 }}>
              Action needed
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, color: T.black }}>
              Admin has a question about this upload
            </div>
            <div style={{ fontSize: 13, color: T.ter, marginTop: 4 }}>
              Reply in the conversation below.
            </div>
          </div>
          <button
            onClick={() => void dismiss()}
            style={{
              fontSize: 12, color: T.ghost, background: 'none', border: 'none',
              cursor: 'pointer', padding: 0, flexShrink: 0, fontFamily: 'inherit',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = T.black}
            onMouseLeave={e => e.currentTarget.style.color = T.ghost}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Upload info */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 22, fontWeight: 400, color: T.black, marginBottom: 8 }}>
          {storeName}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 0', fontSize: 13 }}>
          <span style={{ color: T.ghost }}>File</span>
          <span style={{ color: T.black }}>{upload.original_filename ?? '—'}</span>
          <span style={{ color: T.ghost }}>Products</span>
          <span style={{ color: T.black }}>{upload.product_row_count ?? 0}</span>
          <span style={{ color: T.ghost }}>Uploaded</span>
          <span style={{ color: T.black }}>{relDate(upload.uploaded_at)}</span>
          <span style={{ color: T.ghost }}>Status</span>
          <span style={{ color: T.black, fontWeight: 500 }}>
            {upload.status === 'on_hold'
              ? 'On Hold — Admin needs clarification'
              : upload.status === 'done'
              ? 'Done'
              : upload.status === 'failed'
              ? 'Failed'
              : upload.status === 'processing'
              ? 'Processing'
              : 'Queued'}
          </span>
          {upload.special_instructions && (
            <>
              <span style={{ color: T.ghost }}>Your instructions</span>
              <span style={{ color: T.ter, fontStyle: 'italic' }}>{upload.special_instructions}</span>
            </>
          )}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${T.div}`, paddingTop: 32 }}>
        <UploadChat
          uploadId={upload_id}
          senderType="va"
          senderName={va.name}
          vaId={va.id}
          storeName={storeName}
          onMessageSent={load}
          closed={isClosed && (upload.message_count ?? 0) > 0}
        />
      </div>
    </div>
  )
}
