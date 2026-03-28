'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import UploadChat, { addSystemMessage } from '@/components/UploadChat'

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  black: '#111111', sec: '#555555', ter: '#999999', ghost: '#CCCCCC',
  div: '#EEEEEE', row: '#FAFAFA', bg: '#FFFFFF',
  orange: '#F59E0B', blue: '#3B82F6', red: '#EF4444', green: '#22C55E',
}

// ─── Helper functions ─────────────────────────────────────────────────────────
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
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function timeRemaining(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const hrs = Math.floor(diff / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  return `${hrs}h ${mins}m remaining`
}

function hoursUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 3600000
}

function downloadCSV(filename: string, rows: (string | number | null)[][]): void {
  const content = rows.map(r =>
    r.map(cell => {
      const s = cell === null ? '' : String(cell)
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s
    }).join(',')
  ).join('\n')
  const blob = new Blob([content], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function paymentDetailsSummary(method: string | null, details: Record<string, string> | null): string {
  if (!method || !details) return '—'
  const vals = Object.values(details)
  if (vals.length === 0) return method
  return `${method}: ${vals[0]}`
}

// ─── Types ────────────────────────────────────────────────────────────────────
type MismatchLog = {
  id: string
  upload_id: string | null
  va_id: string | null
  client_id: string | null
  details: string
  metadata: Record<string, unknown> | null
  created_at: string
}
type MismatchItem = MismatchLog & {
  va_name: string; va_status: string; mismatch_count: number
  client_store_name: string
  upload_store_name: string | null; upload_filename: string | null
  upload_variants: number | null; flag_resolved: boolean
}
type OnHoldItem = {
  id: string; store_name: string | null; va_id: string; va_name: string
  original_filename: string | null; product_row_count: number | null
  special_instructions: string | null
  pre_check_result: Record<string, unknown> | null
  held_reason: string | null; adjusted_instruction: string | null
  uploaded_at: string; flag_resolved: boolean
  client_id: string; client_store_name: string
  awaiting_admin_response: boolean
  message_count: number
}
type FailedItem = {
  id: string; store_name: string | null; va_id: string; va_name: string
  original_filename: string | null; product_row_count: number | null
  file_type: string | null; error_message: string | null
  retry_count: number | null; products_optimized: number | null
  unique_product_count: number | null; api_cost_usd: number | null
  api_input_tokens: number | null; api_output_tokens: number | null
  api_calls_count: number | null; processing_started_at: string | null
  processing_completed_at: string | null; batches_total: number | null
  batches_completed: number | null; products_failed: number | null
  output_file_path: string | null; uploaded_at: string; flag_resolved: boolean
  client_id: string; client_store_name: string
}
type ExpiringClient = {
  id: string; store_name: string; va_id: string; va_name: string; va_email: string | null
  niche: string | null; market: string | null; deadline_48h: string
  approved_at: string | null; deadline_expired: boolean; is_active: boolean
}
type OverdueInvoice = {
  id: string; va_id: string; va_name: string | null; va_email: string | null
  va_payment_method: string | null; va_payment_details: Record<string, string> | null
  invoice_number: string | null; month: string; total_amount: number; status: string
  generated_at: string; due_date: string | null; reminded_at: string | null
  paused_at: string | null; blocked_at: string | null
}
type ResolvedItem = {
  id: string; type: 'on_hold' | 'failed'; store_name: string | null
  va_name: string; flag_resolved_at: string | null; flag_resolution: string | null
}
type FilterKey = 'all' | 'mismatches' | 'on_hold' | 'failed' | 'deadlines' | 'overdue' | 'resolved'
type SortKey = 'urgent' | 'newest' | 'oldest' | 'va'

// ─── Unified list item ────────────────────────────────────────────────────────
type UnifiedItem =
  | { kind: 'mismatch'; data: MismatchItem; date: string; urgency: number; vaName: string }
  | { kind: 'on_hold'; data: OnHoldItem; date: string; urgency: number; vaName: string }
  | { kind: 'failed'; data: FailedItem; date: string; urgency: number; vaName: string }
  | { kind: 'expiring'; data: ExpiringClient; date: string; urgency: number; vaName: string }
  | { kind: 'expired'; data: ExpiringClient; date: string; urgency: number; vaName: string }
  | { kind: 'overdue'; data: OverdueInvoice; date: string; urgency: number; vaName: string }

// ─── Urgency scoring ──────────────────────────────────────────────────────────
function urgencyScore(item: UnifiedItem): number {
  if (item.kind === 'expiring') {
    const h = hoursUntil(item.data.deadline_48h)
    if (h < 2) return 1000
    if (h < 6) return 800
    return 500
  }
  if (item.kind === 'overdue') {
    const days = (Date.now() - new Date(item.data.generated_at).getTime()) / 86400000
    if (days >= 11) return 900
    if (days >= 7) return 700
    return 400
  }
  if (item.kind === 'mismatch') {
    return item.data.va_status === 'paused' && item.data.mismatch_count >= 2 ? 600 : 200
  }
  if (item.kind === 'failed') return 500
  if (item.kind === 'on_hold') return 400
  if (item.kind === 'expired') return 300
  return 0
}

// ─── Raw types for Supabase joined queries ────────────────────────────────────
type OnHoldItemRaw = {
  id: string; store_name: string | null; va_id: string
  original_filename: string | null; product_row_count: number | null
  special_instructions: string | null
  pre_check_result: Record<string, unknown> | null
  held_reason: string | null; adjusted_instruction: string | null
  uploaded_at: string; flag_resolved: boolean; client_id: string
  awaiting_admin_response: boolean; message_count: number
  clients: { store_name: string } | null
}
type FailedItemRaw = {
  id: string; store_name: string | null; va_id: string
  original_filename: string | null; product_row_count: number | null
  file_type: string | null; error_message: string | null
  retry_count: number | null; products_optimized: number | null
  unique_product_count: number | null; api_cost_usd: number | null
  api_input_tokens: number | null; api_output_tokens: number | null
  api_calls_count: number | null; processing_started_at: string | null
  processing_completed_at: string | null; batches_total: number | null
  batches_completed: number | null; products_failed: number | null
  output_file_path: string | null; uploaded_at: string; flag_resolved: boolean; client_id: string
  clients: { store_name: string } | null
}
type ExpiringClientRaw = {
  id: string; store_name: string; va_id: string; niche: string | null; market: string | null
  deadline_48h: string; approved_at: string | null; deadline_expired: boolean; is_active: boolean
  vas: { name: string; email: string | null } | null
}
type ResolvedItemRaw = {
  id: string; store_name: string | null; va_id: string
  status: string; flag_resolved_at: string | null; flag_resolution: string | null
}

// ─── Pill component ───────────────────────────────────────────────────────────
function Pill({
  label, active, count, onClick,
}: { label: string; active: boolean; count?: number; onClick: () => void }) {
  const hasCount = count !== undefined
  const isEmpty = hasCount && count === 0
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px', borderRadius: 20, fontSize: 13,
        background: active ? T.black : 'transparent',
        color: active ? '#FFFFFF' : T.ter,
        border: active ? `1px solid ${T.black}` : `1px solid ${T.div}`,
        cursor: 'pointer', transition: 'all 0.15s',
        opacity: isEmpty ? 0.4 : 1,
        fontFamily: 'inherit',
      }}
    >
      {label}{hasCount ? ` (${count})` : ''}
    </button>
  )
}

// ─── Mismatch card ────────────────────────────────────────────────────────────
function MismatchCard({ item, onReload }: { item: MismatchItem; onReload: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showUnpause, setShowUnpause] = useState(false)
  const [resetCounter, setResetCounter] = useState(false)

  const paused = item.va_status === 'paused' && item.mismatch_count >= 2

  async function dismiss() {
    setLoading(true)
    if (item.upload_id) {
      await supabase.from('uploads').update({ flag_resolved: true, flag_resolution: 'dismissed' }).eq('id', item.upload_id)
    }
    void logActivity({ action: 'mismatch_dismissed', va_id: item.va_id ?? undefined, upload_id: item.upload_id ?? undefined, details: 'Admin dismissed mismatch', source: 'admin' })
    onReload()
  }

  async function updateStoreName() {
    setLoading(true)
    if (item.client_id && item.upload_store_name) {
      await supabase.from('clients').update({ store_name: item.upload_store_name }).eq('id', item.client_id)
    }
    if (item.upload_id) {
      await supabase.from('uploads').update({ flag_resolved: true, flag_resolution: 'store_name_updated' }).eq('id', item.upload_id)
    }
    void logActivity({ action: 'mismatch_store_updated', va_id: item.va_id ?? undefined, client_id: item.client_id ?? undefined, details: `Store name updated to: ${item.upload_store_name}`, source: 'admin' })
    onReload()
  }

  async function contactVA() {
    if (!item.va_id) return
    await supabase.from('notifications').insert({
      va_id: item.va_id,
      type: 'upload_failed',
      title: 'Store name mismatch flagged',
      message: `Your upload was flagged for a store name mismatch. Expected: "${item.client_store_name}", found: "${item.upload_store_name}". Please check and contact support.`,
      is_read: false,
      created_at: new Date().toISOString(),
    })
    void logActivity({ action: 'mismatch_va_contacted', va_id: item.va_id ?? undefined, details: 'VA notified about mismatch', source: 'admin' })
    onReload()
  }

  async function blockUpload() {
    setLoading(true)
    if (item.upload_id) {
      await supabase.from('uploads').update({ status: 'on_hold', held_reason: 'mismatch blocked by admin' }).eq('id', item.upload_id)
    }
    void logActivity({ action: 'mismatch_upload_blocked', va_id: item.va_id ?? undefined, upload_id: item.upload_id ?? undefined, details: 'Upload blocked due to mismatch', source: 'admin' })
    onReload()
  }

  async function unpauseVA() {
    if (!item.va_id) return
    setLoading(true)
    const updates: Record<string, unknown> = { status: 'active' }
    if (resetCounter) updates.mismatch_count = 0
    await supabase.from('vas').update(updates).eq('id', item.va_id)
    await supabase.from('notifications').insert({
      va_id: item.va_id,
      type: 'account_approved',
      title: 'Your account has been unpaused',
      message: 'Admin has reviewed your mismatch and unpaused your account.',
      is_read: false,
      created_at: new Date().toISOString(),
    })
    void logActivity({ action: 'va_unpaused', va_id: item.va_id, details: `VA unpaused by admin. Counter reset: ${resetCounter}`, source: 'admin' })
    setShowUnpause(false)
    onReload()
  }

  return (
    <div style={{ borderBottom: `1px solid ${T.row}`, padding: '16px 0', cursor: 'pointer' }}>
      <div
        style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}
        onClick={() => setOpen(o => !o)}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        {/* Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 110 }}>
          <span style={{ fontSize: 8, fontWeight: 600, color: T.ter, textTransform: 'uppercase', letterSpacing: '0.08em' }}>MISMATCH</span>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.orange, flexShrink: 0 }} />
        </div>
        {/* Center */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: T.black }}>
            {item.client_store_name} <span style={{ fontWeight: 400, color: T.ter }}>· {item.va_name}</span>
          </div>
          <div style={{ fontSize: 13, color: T.ter, marginTop: 2 }}>
            Expected &ldquo;{item.client_store_name}&rdquo;, found &ldquo;{item.upload_store_name ?? '—'}&rdquo;
          </div>
          {paused && (
            <div style={{ fontSize: 12, color: T.black, fontWeight: 500, marginTop: 4 }}>
              ⚠ VA auto-paused (mismatch #{item.mismatch_count})
            </div>
          )}
        </div>
        {/* Right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: T.ghost }}>{relDate(item.created_at)}</span>
          <span style={{ fontSize: 12, color: T.ghost }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 16, marginLeft: 122, fontSize: 13 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '6px 12px', marginBottom: 12 }}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>VA</span>
            <span style={{ color: T.black }}><a href="/admin/vas" style={{ color: T.black, textDecoration: 'underline' }}>{item.va_name}</a></span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>CLIENT</span>
            <span style={{ color: T.black }}><a href="/admin/clients" style={{ color: T.black, textDecoration: 'underline' }}>{item.client_store_name}</a></span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>UPLOAD</span>
            <span style={{ color: T.ter }}>{item.upload_filename ?? '—'} · {item.upload_variants ?? 0} products · {relDate(item.created_at)}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>EXPECTED</span>
            <span style={{ color: T.ter }}>{item.client_store_name}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>FOUND</span>
            <span style={{ color: T.ter }}>{item.upload_store_name ?? '—'}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>MISMATCHES</span>
            <span style={{ color: T.black, fontWeight: item.mismatch_count >= 2 ? 600 : 400 }}>{item.mismatch_count} total for this VA</span>
          </div>

          <div style={{ fontSize: 12, color: T.ter, marginBottom: 12 }}>
            <div style={{ marginBottom: 4, fontWeight: 500, color: T.ghost }}>Possible reasons:</div>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              <li>VA uploaded to the wrong client</li>
              <li>Client changed their store name</li>
              <li>CSV contains a supplier name instead of store name</li>
            </ul>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <button onClick={() => { void dismiss() }} disabled={loading} style={actionLinkStyle(T.ghost, T.black)}>Dismiss — not a problem</button>
            <button onClick={() => { void updateStoreName() }} disabled={loading} style={{ ...actionLinkStyle(T.black, T.black), textDecoration: 'underline' }}>Update client store name</button>
            <button onClick={() => { void contactVA() }} disabled={loading} style={actionLinkStyle(T.ghost, T.black)}>Contact VA</button>
            <button onClick={() => { void blockUpload() }} disabled={loading} style={actionLinkStyle(T.ghost, T.black)}>Block this upload</button>
            {paused && !showUnpause && (
              <button onClick={() => setShowUnpause(true)} style={{ fontSize: 12, color: T.black, background: 'none', border: `1px solid ${T.black}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                Unpause VA
              </button>
            )}
          </div>

          {showUnpause && (
            <div style={{ marginTop: 12, padding: 12, background: T.row, borderRadius: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.black, marginBottom: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={resetCounter} onChange={e => setResetCounter(e.target.checked)} />
                Reset mismatch counter
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { void unpauseVA() }} disabled={loading} style={primaryPill}>Confirm unpause</button>
                <button onClick={() => setShowUnpause(false)} style={secondaryPill}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── On Hold card ─────────────────────────────────────────────────────────────
function OnHoldCard({ item, onReload }: { item: OnHoldItem; onReload: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showApprove, setShowApprove] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [adjustedText, setAdjustedText] = useState(item.adjusted_instruction ?? '')
  const [rejectReason, setRejectReason] = useState('')

  const preCheck = item.pre_check_result as Record<string, unknown> | null

  async function approveAndProcess() {
    setLoading(true)
    await supabase.from('uploads').update({
      adjusted_instruction: adjustedText,
      status: 'queued',
      held_reason: null,
    }).eq('id', item.id)
    if (item.message_count > 0) {
      await addSystemMessage(item.id, 'Upload approved and processing started.')
    }
    void logActivity({ action: 'upload_approved_from_hold', upload_id: item.id, va_id: item.va_id, client_id: item.client_id, details: 'Admin approved upload from on_hold', source: 'admin' })
    setShowApprove(false)
    onReload()
  }

  async function rejectUpload() {
    setLoading(true)
    await supabase.from('uploads').update({
      status: 'failed',
      flag_resolved: true,
      flag_resolution: `rejected by admin: ${rejectReason}`,
    }).eq('id', item.id)
    if (item.message_count > 0) {
      await addSystemMessage(item.id, `Upload rejected: ${rejectReason}`)
    }
    if (item.va_id) {
      await supabase.from('notifications').insert({
        va_id: item.va_id,
        type: 'upload_failed',
        title: 'Upload rejected',
        message: `Your upload for "${item.client_store_name}" was rejected by admin. Reason: ${rejectReason}`,
        is_read: false,
        created_at: new Date().toISOString(),
      })
    }
    void logActivity({ action: 'upload_rejected', upload_id: item.id, va_id: item.va_id, details: `Admin rejected upload: ${rejectReason}`, source: 'admin' })
    setShowReject(false)
    onReload()
  }

  async function dismiss() {
    setLoading(true)
    await supabase.from('uploads').update({ flag_resolved: true, flag_resolution: 'dismissed' }).eq('id', item.id)
    void logActivity({ action: 'on_hold_dismissed', upload_id: item.id, va_id: item.va_id, details: 'Admin dismissed on_hold item', source: 'admin' })
    onReload()
  }

  return (
    <div style={{ borderBottom: `1px solid ${T.row}`, padding: '16px 0' }}>
      <div
        style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 110 }}>
          <span style={{ fontSize: 8, fontWeight: 600, color: T.ter, textTransform: 'uppercase', letterSpacing: '0.08em' }}>ON HOLD</span>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.blue, flexShrink: 0 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: T.black }}>
              {item.client_store_name} <span style={{ fontWeight: 400, color: T.ter }}>· {item.va_name}</span>
            </span>
            {item.awaiting_admin_response && (
              <span style={{ fontSize: 11, fontWeight: 500, color: T.black }}>VA responded</span>
            )}
            {item.message_count > 0 && !item.awaiting_admin_response && (
              <span style={{ fontSize: 11, color: T.ghost }}>{item.message_count} message{item.message_count !== 1 ? 's' : ''}</span>
            )}
          </div>
          <div style={{ fontSize: 13, color: T.ter, marginTop: 2, fontStyle: 'italic' }}>
            {(item.special_instructions ?? '').slice(0, 60)}{(item.special_instructions ?? '').length > 60 ? '…' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: T.ghost }}>{relDate(item.uploaded_at)}</span>
          <span style={{ fontSize: 12, color: T.ghost }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 16, marginLeft: 122, fontSize: 13 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '6px 12px', marginBottom: 12 }}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>VA</span>
            <span style={{ color: T.black }}>{item.va_name}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>CLIENT</span>
            <span style={{ color: T.black }}>{item.client_store_name}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>UPLOAD</span>
            <span style={{ color: T.ter }}>{item.original_filename ?? '—'} · {item.product_row_count ?? 0} products</span>
          </div>

          {item.special_instructions && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em', marginBottom: 6 }}>VA&apos;S INSTRUCTIONS</div>
              <div style={{ fontSize: 13, color: '#666666', lineHeight: 1.5 }}>{item.special_instructions}</div>
            </div>
          )}

          {preCheck && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em', marginBottom: 6 }}>AI PRE-CHECK RESULT</div>
              <div style={{ background: T.row, borderRadius: 8, padding: 12, fontSize: 12 }}>
                {Object.entries(preCheck).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
                    <span style={{ color: T.ter, minWidth: 160 }}>{k}:</span>
                    <span style={{ fontFamily: 'monospace', color: T.black }}>{JSON.stringify(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 12 }}>
            {!showApprove && !showReject && (
              <>
                <button onClick={() => { setShowApprove(true); setShowReject(false); setShowChat(false) }} style={primaryPill}>Approve &amp; process</button>
                <button onClick={() => { setShowReject(true); setShowApprove(false); setShowChat(false) }} style={secondaryPill}>Reject upload</button>
                <button
                  onClick={() => setShowChat(c => !c)}
                  style={actionLinkStyle(item.awaiting_admin_response ? T.black : T.ghost, T.black)}
                >
                  {item.awaiting_admin_response ? '● VA responded — Reply' : showChat ? 'Hide chat' : 'Message VA'}
                </button>
                <button onClick={() => { void dismiss() }} disabled={loading} style={actionLinkStyle(T.ghost, T.black)}>Dismiss</button>
              </>
            )}
          </div>

          {showChat && !showApprove && !showReject && (
            <div style={{ borderTop: `1px solid ${T.div}`, paddingTop: 16, marginBottom: 12 }}>
              <UploadChat
                uploadId={item.id}
                senderType="admin"
                senderName="Admin"
                vaId={item.va_id}
                storeName={item.client_store_name}
                onMessageSent={onReload}
              />
            </div>
          )}

          {showApprove && (
            <div style={{ marginTop: 8, padding: 12, background: T.row, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: T.ghost, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Adjusted instructions</div>
              <textarea
                value={adjustedText}
                onChange={e => setAdjustedText(e.target.value)}
                rows={4}
                style={{ width: '100%', fontSize: 13, padding: 8, borderRadius: 6, border: `1px solid ${T.div}`, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button onClick={() => { void approveAndProcess() }} disabled={loading} style={primaryPill}>Confirm &amp; process</button>
                <button onClick={() => setShowApprove(false)} style={secondaryPill}>Cancel</button>
              </div>
            </div>
          )}

          {showReject && (
            <div style={{ marginTop: 8, padding: 12, background: T.row, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: T.ghost, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Rejection reason</div>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Reason for rejecting this upload..."
                style={{ width: '100%', fontSize: 13, padding: 8, borderRadius: 6, border: `1px solid ${T.div}`, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button onClick={() => { void rejectUpload() }} disabled={loading || !rejectReason.trim()} style={primaryPill}>Confirm reject</button>
                <button onClick={() => setShowReject(false)} style={secondaryPill}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Failed card ──────────────────────────────────────────────────────────────
function FailedCard({ item, onReload }: { item: FailedItem; onReload: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  function likelyCause(err: string | null): string {
    if (!err) return 'Unknown error. Check logs.'
    if (/timeout|timed out/i.test(err)) return 'API timeout. File may be too large.'
    if (/rate.?limit|429/i.test(err)) return 'API rate limit. Wait and retry.'
    if (/json|parse|unparseable/i.test(err)) return 'AI returned unparseable output.'
    if (/storage|upload|file/i.test(err)) return 'File storage error.'
    return 'Unknown error. Check logs.'
  }

  async function retryNow() {
    setLoading(true)
    const { data: orig } = await supabase.from('uploads').select('*').eq('id', item.id).single()
    if (orig) {
      const { data: newUp } = await supabase.from('uploads').insert({
        va_id: orig.va_id, client_id: orig.client_id, store_name: orig.store_name,
        file_type: orig.file_type, original_filename: orig.original_filename,
        product_row_count: orig.product_row_count, column_mapping: orig.column_mapping,
        special_instructions: orig.special_instructions, adjusted_instruction: orig.adjusted_instruction,
        output_columns: orig.output_columns, image_settings: orig.image_settings,
        price_rules: orig.price_rules, status: 'queued',
        retried_from_upload_id: item.id,
        uploaded_at: new Date().toISOString(),
      }).select().single()
      if (newUp) {
        await supabase.from('uploads').update({ flag_resolved: true, flag_resolution: 'retried' }).eq('id', item.id)
        void logActivity({ action: 'upload_retried', upload_id: newUp.id, va_id: item.va_id, details: `Upload retried from failed upload ${item.id}`, source: 'admin' })
      }
    }
    onReload()
  }

  async function retrySmaller() {
    setLoading(true)
    const { data: orig } = await supabase.from('uploads').select('*').eq('id', item.id).single()
    if (orig) {
      const currentInstr = (orig.special_instructions ?? '') as string
      const note = '[Admin: retry with smaller batches]'
      await supabase.from('uploads').insert({
        va_id: orig.va_id, client_id: orig.client_id, store_name: orig.store_name,
        file_type: orig.file_type, original_filename: orig.original_filename,
        product_row_count: orig.product_row_count, column_mapping: orig.column_mapping,
        special_instructions: note + (currentInstr ? ' ' + currentInstr : ''),
        adjusted_instruction: orig.adjusted_instruction,
        output_columns: orig.output_columns, image_settings: orig.image_settings,
        price_rules: orig.price_rules, status: 'queued',
        retried_from_upload_id: item.id,
        uploaded_at: new Date().toISOString(),
      })
      await supabase.from('uploads').update({ flag_resolved: true, flag_resolution: 'retried_smaller_batches' }).eq('id', item.id)
      void logActivity({ action: 'upload_retried', upload_id: item.id, va_id: item.va_id, details: 'Upload retried with smaller batch hint', source: 'admin' })
    }
    onReload()
  }

  async function downloadPartial() {
    if (!item.output_file_path) return
    const { data } = await supabase.storage.from('outputs').createSignedUrl(item.output_file_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function dismiss() {
    setLoading(true)
    await supabase.from('uploads').update({ flag_resolved: true, flag_resolution: 'dismissed' }).eq('id', item.id)
    void logActivity({ action: 'failed_dismissed', upload_id: item.id, va_id: item.va_id, details: 'Admin dismissed failed upload', source: 'admin' })
    onReload()
  }

  async function contactVA() {
    if (!item.va_id) return
    await supabase.from('notifications').insert({
      va_id: item.va_id,
      type: 'upload_failed',
      title: 'Your upload failed',
      message: `Your upload "${item.original_filename ?? 'file'}" for "${item.client_store_name}" failed. Error: ${item.error_message ?? 'Unknown error'}. Please try again or contact support.`,
      is_read: false,
      created_at: new Date().toISOString(),
    })
    void logActivity({ action: 'failed_va_contacted', upload_id: item.id, va_id: item.va_id, details: 'VA notified about failed upload', source: 'admin' })
  }

  const durationSec = item.processing_started_at && item.processing_completed_at
    ? Math.round((new Date(item.processing_completed_at).getTime() - new Date(item.processing_started_at).getTime()) / 1000)
    : null

  return (
    <div style={{ borderBottom: `1px solid ${T.row}`, padding: '16px 0' }}>
      <div
        style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 110 }}>
          <span style={{ fontSize: 8, fontWeight: 600, color: T.ter, textTransform: 'uppercase', letterSpacing: '0.08em' }}>FAILED</span>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.red, flexShrink: 0 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: T.black }}>
            {item.client_store_name} <span style={{ fontWeight: 400, color: T.ter }}>· {item.va_name}</span>
          </div>
          <div style={{ fontSize: 13, color: T.ter, marginTop: 2 }}>
            {(item.error_message ?? '').slice(0, 40)}{(item.error_message ?? '').length > 40 ? '…' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: T.ghost }}>{relDate(item.uploaded_at)}</span>
          <span style={{ fontSize: 12, color: T.ghost }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 16, marginLeft: 122, fontSize: 13 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '6px 12px', marginBottom: 12 }}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>VA</span>
            <span>{item.va_name}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>CLIENT</span>
            <span>{item.client_store_name}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>UPLOAD</span>
            <span style={{ color: T.ter }}>{item.original_filename ?? '—'} · {item.product_row_count ?? 0} products</span>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em', marginBottom: 6 }}>ERROR</div>
            <div style={{ background: T.row, borderRadius: 8, padding: 12, fontSize: 13, color: T.ter, wordBreak: 'break-word' }}>
              {item.error_message ?? '—'}
            </div>
          </div>

          <div style={{ fontSize: 13, color: T.ter, marginBottom: 12 }}>
            <strong style={{ color: T.black }}>RETRY COUNT:</strong> {item.retry_count ?? 0} attempts
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em', marginBottom: 8 }}>PROCESSING DETAILS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', fontSize: 12, color: T.ter }}>
              <span>Started: {relDate(item.processing_started_at)}</span>
              <span>Duration: {durationSec !== null ? `${durationSec}s` : '—'}</span>
              <span>Batches: {item.batches_completed ?? 0}/{item.batches_total ?? 0}</span>
              <span>Optimized: {item.products_optimized ?? 0}/{item.unique_product_count ?? 0}</span>
              <span>API calls: {item.api_calls_count ?? 0}</span>
              <span>Tokens: {((item.api_input_tokens ?? 0) + (item.api_output_tokens ?? 0)).toLocaleString()}</span>
              <span>Cost: ${(item.api_cost_usd ?? 0).toFixed(4)}</span>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em', marginBottom: 4 }}>LIKELY CAUSE</div>
            <div style={{ fontSize: 12, color: T.ter }}>{likelyCause(item.error_message)}</div>
          </div>

          {item.output_file_path && (
            <div style={{ fontSize: 12, color: T.black, marginBottom: 12 }}>
              PARTIAL OUTPUT AVAILABLE —{' '}
              <button onClick={() => { void downloadPartial() }} style={{ fontSize: 12, color: T.blue, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'inherit' }}>
                Download
              </button>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <button onClick={() => { void retryNow() }} disabled={loading} style={primaryPill}>Retry now</button>
            <button onClick={() => { void retrySmaller() }} disabled={loading} style={{ ...actionLinkStyle(T.black, T.black), textDecoration: 'underline' }}>Retry with smaller batches</button>
            {item.output_file_path && (
              <button onClick={() => { void downloadPartial() }} style={actionLinkStyle(T.black, T.black)}>Download partial output</button>
            )}
            <button onClick={() => { void dismiss() }} disabled={loading} style={actionLinkStyle(T.ghost, T.black)}>Dismiss</button>
            <button onClick={() => { void contactVA() }} style={actionLinkStyle(T.ghost, T.black)}>Contact VA</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Expiring / Expired card ──────────────────────────────────────────────────
function ExpiringCard({ item, onReload }: { item: ExpiringClient; onReload: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [remaining, setRemaining] = useState(timeRemaining(item.deadline_48h))
  const expired = item.deadline_expired || !item.is_active

  useEffect(() => {
    if (expired) return
    const iv = setInterval(() => setRemaining(timeRemaining(item.deadline_48h)), 60000)
    return () => clearInterval(iv)
  }, [item.deadline_48h, expired])

  async function extend(hours: number) {
    setLoading(true)
    const newDeadline = new Date(new Date(item.deadline_48h).getTime() + hours * 3600000).toISOString()
    await supabase.from('clients').update({ deadline_48h: newDeadline }).eq('id', item.id)
    void logActivity({ action: 'deadline_extended', client_id: item.id, va_id: item.va_id, details: `Deadline extended by ${hours}h`, source: 'admin' })
    onReload()
  }

  async function cancelDeadline() {
    setLoading(true)
    await supabase.from('clients').update({ deadline_48h: null, deadline_expired: false }).eq('id', item.id)
    void logActivity({ action: 'deadline_cancelled', client_id: item.id, va_id: item.va_id, details: 'Deadline cancelled by admin', source: 'admin' })
    onReload()
  }

  async function deactivateNow() {
    setLoading(true)
    await supabase.from('clients').update({ is_active: false, deactivated_at: new Date().toISOString(), deadline_expired: true }).eq('id', item.id)
    void logActivity({ action: 'client_deactivated', client_id: item.id, va_id: item.va_id, details: 'Client deactivated by admin (deadline)', source: 'admin' })
    onReload()
  }

  async function reactivate() {
    setLoading(true)
    const newDeadline = new Date(Date.now() + 48 * 3600000).toISOString()
    await supabase.from('clients').update({ is_active: true, deadline_48h: newDeadline, deadline_expired: false }).eq('id', item.id)
    void logActivity({ action: 'client_reactivated', client_id: item.id, va_id: item.va_id, details: 'Expired client reactivated with new 48h deadline', source: 'admin' })
    onReload()
  }

  async function deleteClient() {
    if (!confirm(`Delete client "${item.store_name}"? This cannot be undone.`)) return
    setLoading(true)
    await supabase.from('clients').delete().eq('id', item.id)
    void logActivity({ action: 'client_deleted', client_id: item.id, va_id: item.va_id, details: 'Client deleted by admin after deadline expiry', source: 'admin' })
    onReload()
  }

  return (
    <div style={{ borderBottom: `1px solid ${T.row}`, padding: '16px 0', opacity: expired ? 0.5 : 1 }}>
      <div
        style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}
        onMouseEnter={e => (e.currentTarget.style.opacity = expired ? '0.35' : '0.7')}
        onMouseLeave={e => (e.currentTarget.style.opacity = expired ? '0.5' : '1')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 110 }}>
          <span style={{ fontSize: 8, fontWeight: 600, color: T.ter, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {expired ? 'EXPIRED' : 'EXPIRING'}
          </span>
          <div style={{
            width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
            background: expired ? T.red : T.orange,
            animation: expired ? 'none' : 'pulse 1.5s ease-in-out infinite',
          }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: T.black }}>
            {item.store_name} <span style={{ fontWeight: 400, color: T.ter }}>· {item.va_name}</span>
          </div>
          <div style={{ fontSize: 13, color: expired ? T.ter : T.black, fontWeight: expired ? 400 : 500, marginTop: 2 }}>
            {expired
              ? `Expired ${relDate(item.deadline_48h)}`
              : <>{remaining} <span style={{ fontSize: 12, color: T.ghost, fontWeight: 400 }}>· Approved {relDate(item.approved_at)}</span></>
            }
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: T.ghost }}>{relDate(item.deadline_48h)}</span>
          <span style={{ fontSize: 12, color: T.ghost }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 16, marginLeft: 122, fontSize: 13 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '6px 12px', marginBottom: 12 }}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>CLIENT</span>
            <span>{item.store_name}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>NICHE</span>
            <span style={{ color: T.ter }}>{item.niche ?? '—'} · {item.market ?? '—'}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>VA</span>
            <span>{item.va_name} · <span style={{ color: T.ter }}>{item.va_email ?? '—'}</span></span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>APPROVED</span>
            <span style={{ color: T.ter }}>{fmtDate(item.approved_at)}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>DEADLINE</span>
            <span style={{ color: T.ter }}>{fmtDate(item.deadline_48h)}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>REMAINING</span>
            <span style={{ color: expired ? T.red : T.black }}>{expired ? 'Expired' : remaining}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            {!expired ? (
              <>
                <button onClick={() => { void extend(24) }} disabled={loading} style={primaryPill}>Extend 24h</button>
                <button onClick={() => { void extend(48) }} disabled={loading} style={actionLinkStyle(T.ghost, T.black)}>Extend 48h</button>
                <button onClick={() => { void cancelDeadline() }} disabled={loading} style={actionLinkStyle(T.ghost, T.black)}>Cancel deadline</button>
                <button onClick={() => { void deactivateNow() }} disabled={loading} style={actionLinkStyle(T.ghost, T.black)}>Deactivate now</button>
              </>
            ) : (
              <>
                <button onClick={() => { void reactivate() }} disabled={loading} style={primaryPill}>Reactivate with new deadline</button>
                <button onClick={() => { void deleteClient() }} disabled={loading} style={{ ...actionLinkStyle('#DDDDDD', T.black) }}>Delete client</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Overdue invoice card ──────────────────────────────────────────────────────
function OverdueCard({ item, onReload }: { item: OverdueInvoice; onReload: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPay, setShowPay] = useState(false)
  const [payMethod, setPayMethod] = useState(item.va_payment_method ?? '')
  const [payRef, setPayRef] = useState('')
  const [payAmount, setPayAmount] = useState(String(item.total_amount))

  const generatedAt = new Date(item.generated_at)
  const daysElapsed = (Date.now() - generatedAt.getTime()) / 86400000
  const deletionDate = new Date(generatedAt.getTime() + 14 * 86400000)
  const daysUntilDeletion = Math.max(0, Math.ceil((deletionDate.getTime() - Date.now()) / 86400000))
  const fillPct = Math.min((daysElapsed / 14) * 100, 100)

  const overdueHours = item.due_date
    ? Math.floor((Date.now() - new Date(item.due_date).getTime()) / 3600000)
    : Math.floor(daysElapsed * 24)
  const overdueStr = overdueHours >= 48
    ? `${Math.floor(overdueHours / 24)}d overdue`
    : `${overdueHours}h overdue`

  async function markPaid() {
    setLoading(true)
    await supabase.from('billing').update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      payment_method_used: payMethod,
      payment_reference: payRef,
      payment_amount_received: parseFloat(payAmount) || item.total_amount,
    }).eq('id', item.id)
    if (item.va_id) {
      await supabase.from('vas').update({ payment_status: 'paid' }).eq('id', item.va_id)
    }
    void logActivity({ action: 'invoice_marked_paid', billing_id: item.id, va_id: item.va_id, details: `Invoice marked paid. Ref: ${payRef}`, source: 'admin' })
    setShowPay(false)
    onReload()
  }

  async function sendReminder() {
    if (!item.va_id) return
    await supabase.from('billing').update({ reminded_at: new Date().toISOString() }).eq('id', item.id)
    await supabase.from('notifications').insert({
      va_id: item.va_id,
      type: 'invoice_overdue',
      title: `Invoice overdue: ${item.invoice_number ?? item.month}`,
      message: `Your invoice of $${item.total_amount} for ${formatMonth(item.month)} is overdue. Please pay immediately to avoid account deletion.`,
      is_read: false,
      created_at: new Date().toISOString(),
    })
    void logActivity({ action: 'invoice_reminder_sent', billing_id: item.id, va_id: item.va_id, details: 'Overdue reminder sent to VA', source: 'admin' })
    onReload()
  }

  async function cancelDeletion() {
    setLoading(true)
    const notes = `deletion_cancelled_at: ${new Date().toISOString()}`
    await supabase.from('billing').update({ blocked_at: null, notes }).eq('id', item.id)
    void logActivity({ action: 'invoice_deletion_cancelled', billing_id: item.id, va_id: item.va_id, details: 'Auto-deletion cancelled by admin', source: 'admin' })
    onReload()
  }

  async function waiveInvoice() {
    setLoading(true)
    await supabase.from('billing').update({ status: 'waived' }).eq('id', item.id)
    if (item.va_id) {
      await supabase.from('vas').update({ payment_status: 'paid' }).eq('id', item.va_id)
    }
    void logActivity({ action: 'invoice_waived', billing_id: item.id, va_id: item.va_id, details: 'Invoice waived by admin', source: 'admin' })
    onReload()
  }

  async function deleteVA() {
    if (!confirm(`Delete VA "${item.va_name}"? This is irreversible.`)) return
    setLoading(true)
    if (item.va_id) {
      await supabase.from('vas').update({ status: 'blocked' }).eq('id', item.va_id)
    }
    void logActivity({ action: 'va_soft_deleted', va_id: item.va_id, billing_id: item.id, details: 'VA deleted by admin due to overdue invoice', source: 'admin', severity: 'critical' })
    onReload()
  }

  return (
    <div style={{ borderBottom: `1px solid ${T.row}`, padding: '16px 0' }}>
      <div
        style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 110 }}>
          <span style={{ fontSize: 8, fontWeight: 600, color: T.ter, textTransform: 'uppercase', letterSpacing: '0.08em' }}>OVERDUE</span>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.red, flexShrink: 0 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: T.black }}>
            {item.va_name ?? 'Unknown VA'} <span style={{ fontWeight: 400, color: T.ter }}>· {formatMonth(item.month)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: T.black }}>${item.total_amount} · {overdueStr}</span>
            {item.paused_at && <span style={{ fontSize: 11, color: T.ter }}>Paused</span>}
            {daysUntilDeletion > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700, color: T.black,
                opacity: daysUntilDeletion < 3 ? 1 : 0.7,
              }}>
                [DELETION IN {daysUntilDeletion} DAYS]
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: T.ghost }}>{relDate(item.generated_at)}</span>
          <span style={{ fontSize: 12, color: T.ghost }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 16, marginLeft: 122, fontSize: 13 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 12px', marginBottom: 12 }}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>INVOICE</span>
            <span>{item.invoice_number ?? '—'} · {formatMonth(item.month)}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>VA</span>
            <span>{item.va_name ?? '—'} · <span style={{ color: T.ter }}>{item.va_email ?? '—'}</span></span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>PAYMENT</span>
            <span style={{ color: T.ter }}>{paymentDetailsSummary(item.va_payment_method, item.va_payment_details)}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>AMOUNT</span>
            <span style={{ fontWeight: 500 }}>${item.total_amount}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>GENERATED</span>
            <span style={{ color: T.ter }}>{fmtDate(item.generated_at)}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>DUE DATE</span>
            <span style={{ color: T.ter }}>{fmtDate(item.due_date ?? new Date(generatedAt.getTime() + 48 * 3600000).toISOString())}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>OVERDUE SINCE</span>
            <span style={{ color: T.red }}>{overdueStr}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>VA STATUS</span>
            <span style={{ color: T.ter }}>Paused</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>AUTO-DELETION</span>
            <span style={{ color: T.black }}>{fmtDate(deletionDate.toISOString())} · {daysUntilDeletion} days remaining</span>
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ height: 4, background: '#F0F0F0', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${fillPct}%`, background: T.black, borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: 11, color: T.ter, marginTop: 4 }}>{Math.round(fillPct)}% to auto-deletion</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginBottom: showPay ? 12 : 0 }}>
            {!showPay && (
              <>
                <button onClick={() => setShowPay(true)} style={primaryPill}>Mark paid</button>
                <button onClick={() => { void sendReminder() }} style={{ ...actionLinkStyle(T.black, T.black), textDecoration: 'underline' }}>Send reminder</button>
                <button onClick={() => { void cancelDeletion() }} disabled={loading} style={actionLinkStyle(T.ghost, T.black)}>Cancel deletion</button>
                <button onClick={() => { void waiveInvoice() }} disabled={loading} style={actionLinkStyle(T.ghost, T.black)}>Waive invoice</button>
                <button onClick={() => { void deleteVA() }} disabled={loading} style={actionLinkStyle('#DDDDDD', T.black)}>Delete now</button>
                <a href="/admin/vas" style={{ fontSize: 12, color: T.black, textDecoration: 'none' }}>View VA profile →</a>
              </>
            )}
          </div>

          {showPay && (
            <div style={{ padding: 12, background: T.row, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: T.ghost, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Confirm payment</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: T.ter, marginBottom: 4 }}>Payment method</div>
                  <select
                    value={payMethod}
                    onChange={e => setPayMethod(e.target.value)}
                    style={{ width: '100%', fontSize: 13, padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.div}`, fontFamily: 'inherit' }}
                  >
                    {['wise', 'paypal', 'gcash', 'maya', 'upi', 'jazzcash', 'easypaisa', 'bkash', 'bank_transfer'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: T.ter, marginBottom: 4 }}>Reference</div>
                  <input
                    value={payRef}
                    onChange={e => setPayRef(e.target.value)}
                    placeholder="Payment reference"
                    style={{ width: '100%', fontSize: 13, padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.div}`, fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: T.ter, marginBottom: 4 }}>Amount ($)</div>
                  <input
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    type="number"
                    step="0.01"
                    style={{ width: '100%', fontSize: 13, padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.div}`, fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { void markPaid() }} disabled={loading} style={primaryPill}>Confirm payment</button>
                <button onClick={() => setShowPay(false)} style={secondaryPill}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Resolved item row ────────────────────────────────────────────────────────
function ResolvedRow({ item }: { item: ResolvedItem }) {
  const badgeColor = item.type === 'on_hold' ? T.blue : T.red
  const badgeLabel = item.type === 'on_hold' ? 'ON HOLD' : 'FAILED'
  return (
    <div style={{ borderBottom: `1px solid ${T.row}`, padding: '12px 0', opacity: 0.4, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 110 }}>
        <span style={{ fontSize: 7, fontWeight: 600, color: T.ter, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{badgeLabel}</span>
        <div style={{ width: 4, height: 4, borderRadius: '50%', background: badgeColor }} />
      </div>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 13, color: T.black }}>{item.store_name ?? '—'}</span>
        <span style={{ fontSize: 12, color: T.ter }}> · {item.va_name}</span>
      </div>
      <div style={{ fontSize: 12, color: T.ghost }}>
        Resolved {relDate(item.flag_resolved_at)} · {item.flag_resolution ?? '—'}
      </div>
    </div>
  )
}

// ─── Shared button styles ──────────────────────────────────────────────────────
const primaryPill: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, color: '#FFFFFF', background: T.black,
  border: `1px solid ${T.black}`, borderRadius: 6, padding: '6px 14px',
  cursor: 'pointer', fontFamily: 'inherit',
}
const secondaryPill: React.CSSProperties = {
  fontSize: 12, color: T.black, background: 'transparent',
  border: `1px solid ${T.div}`, borderRadius: 6, padding: '6px 14px',
  cursor: 'pointer', fontFamily: 'inherit',
}
function actionLinkStyle(color: string, hover: string): React.CSSProperties {
  return {
    fontSize: 12, color, background: 'none', border: 'none',
    cursor: 'pointer', padding: 0, fontFamily: 'inherit',
    transition: 'color 0.15s',
    // hover handled via onMouseEnter/onMouseLeave on element
  }
}


// ─── Main page ────────────────────────────────────────────────────────────────
export default function FlaggedPage() {
  const [mismatches, setMismatches] = useState<MismatchItem[]>([])
  const [onHold, setOnHold] = useState<OnHoldItem[]>([])
  const [failed, setFailed] = useState<FailedItem[]>([])
  const [expiring, setExpiring] = useState<ExpiringClient[]>([])
  const [expired, setExpired] = useState<ExpiringClient[]>([])
  const [overdue, setOverdue] = useState<OverdueInvoice[]>([])
  const [resolved, setResolved] = useState<ResolvedItem[]>([])
  const [filter, setFilter] = useState<FilterKey>('all')
  const [sort, setSort] = useState<SortKey>('urgent')
  const [loading, setLoading] = useState(true)
  const [vaNames, setVaNames] = useState<Record<string, string>>({})

  const reload = useCallback(async () => {
    setLoading(true)

    const in12h = new Date(Date.now() + 12 * 3600_000).toISOString()
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString()

    const [
      { data: mismatchLogs },
      { data: onHoldRaw },
      { data: failedRaw },
      { data: expiringRaw },
      { data: overdueRaw },
      { data: resolvedRaw },
    ] = await Promise.all([
      supabase
        .from('activity_log')
        .select('id, upload_id, va_id, client_id, details, metadata, created_at')
        .eq('action', 'store_mismatch')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('uploads')
        .select('id, store_name, va_id, original_filename, product_row_count, special_instructions, pre_check_result, held_reason, adjusted_instruction, uploaded_at, flag_resolved, awaiting_admin_response, message_count, client_id, clients(store_name)')
        .eq('status', 'on_hold')
        .eq('flag_resolved', false)
        .order('uploaded_at', { ascending: false }),
      supabase
        .from('uploads')
        .select('id, store_name, va_id, original_filename, product_row_count, file_type, error_message, retry_count, products_optimized, unique_product_count, api_cost_usd, api_input_tokens, api_output_tokens, api_calls_count, processing_started_at, processing_completed_at, batches_total, batches_completed, products_failed, output_file_path, uploaded_at, flag_resolved, client_id, clients(store_name)')
        .eq('status', 'failed')
        .eq('flag_resolved', false)
        .order('uploaded_at', { ascending: false }),
      supabase
        .from('clients')
        .select('id, store_name, va_id, niche, market, deadline_48h, approved_at, deadline_expired, is_active, vas(name, email)')
        .or(`and(deadline_48h.lte.${in12h},deadline_expired.eq.false,is_active.eq.true),and(deadline_expired.eq.true,is_active.eq.false)`)
        .not('deadline_48h', 'is', null),
      supabase
        .from('billing')
        .select('id, va_id, va_name, va_email, va_payment_method, va_payment_details, invoice_number, month, total_amount, status, generated_at, due_date, reminded_at, paused_at, blocked_at')
        .eq('status', 'overdue')
        .order('generated_at', { ascending: true }),
      supabase
        .from('uploads')
        .select('id, store_name, va_id, status, flag_resolved_at, flag_resolution')
        .eq('flag_resolved', true)
        .gte('flag_resolved_at', sevenDaysAgo)
        .in('status', ['on_hold', 'failed', 'done'])
        .order('flag_resolved_at', { ascending: false })
        .limit(50),
    ])

    // ── Mismatches ──────────────────────────────────────────────────────────────
    const uploadIds = (mismatchLogs ?? []).map(l => l.upload_id).filter((x): x is string => !!x)
    const vaIds = [...new Set((mismatchLogs ?? []).map(l => l.va_id).filter((x): x is string => !!x))]
    const clientIds = [...new Set((mismatchLogs ?? []).map(l => l.client_id).filter((x): x is string => !!x))]

    const [
      { data: mVAs },
      { data: mClients },
      { data: mUploads },
    ] = await Promise.all([
      vaIds.length ? supabase.from('vas').select('id, name, status, mismatch_count').in('id', vaIds) : Promise.resolve({ data: [] }),
      clientIds.length ? supabase.from('clients').select('id, store_name').in('id', clientIds) : Promise.resolve({ data: [] }),
      uploadIds.length ? supabase.from('uploads').select('id, store_name, original_filename, product_row_count, flag_resolved').in('id', uploadIds) : Promise.resolve({ data: [] }),
    ])

    const mismatchItems: MismatchItem[] = (mismatchLogs ?? []).map(log => {
      const va = (mVAs ?? []).find((v: { id: string }) => v.id === log.va_id)
      const client = (mClients ?? []).find((c: { id: string }) => c.id === log.client_id)
      const upload = (mUploads ?? []).find((u: { id: string }) => u.id === log.upload_id)
      return {
        ...log,
        va_name: (va as Record<string, unknown>)?.name as string ?? 'Unknown',
        va_status: (va as Record<string, unknown>)?.status as string ?? 'unknown',
        mismatch_count: (va as Record<string, unknown>)?.mismatch_count as number ?? 1,
        client_store_name: (client as Record<string, unknown>)?.store_name as string ?? 'Unknown',
        upload_store_name: (upload as Record<string, unknown>)?.store_name as string | null ?? null,
        upload_filename: (upload as Record<string, unknown>)?.original_filename as string | null ?? null,
        upload_variants: (upload as Record<string, unknown>)?.product_row_count as number | null ?? null,
        flag_resolved: (upload as Record<string, unknown>)?.flag_resolved as boolean ?? false,
      }
    }).filter(m => !m.flag_resolved)

    // ── On hold ─────────────────────────────────────────────────────────────────
    const onHoldTyped = (onHoldRaw ?? []) as unknown as OnHoldItemRaw[]

    // collect all va_ids to resolve names
    const allVaIds = new Set<string>()
    onHoldTyped.forEach(r => { if (r.va_id) allVaIds.add(r.va_id) });
    (failedRaw ?? []).forEach((r: Record<string, unknown>) => { if (typeof r.va_id === 'string') allVaIds.add(r.va_id) });
    (resolvedRaw ?? []).forEach((r: Record<string, unknown>) => { if (typeof r.va_id === 'string') allVaIds.add(r.va_id) })

    let vaNameMap: Record<string, string> = {}
    if (allVaIds.size > 0) {
      const { data: vaData } = await supabase.from('vas').select('id, name').in('id', [...allVaIds])
      vaNameMap = Object.fromEntries((vaData ?? []).map((v: { id: string; name: string }) => [v.id, v.name]))
    }
    setVaNames(vaNameMap)

    const onHoldItems: OnHoldItem[] = onHoldTyped.map(r => ({
      id: r.id,
      store_name: r.store_name,
      va_id: r.va_id,
      va_name: vaNameMap[r.va_id] ?? 'Unknown',
      original_filename: r.original_filename,
      product_row_count: r.product_row_count,
      special_instructions: r.special_instructions,
      pre_check_result: r.pre_check_result,
      held_reason: r.held_reason,
      adjusted_instruction: r.adjusted_instruction,
      uploaded_at: r.uploaded_at,
      flag_resolved: r.flag_resolved,
      client_id: r.client_id,
      client_store_name: r.clients?.store_name ?? 'Unknown',
      awaiting_admin_response: r.awaiting_admin_response ?? false,
      message_count: r.message_count ?? 0,
    }))

    // ── Failed ──────────────────────────────────────────────────────────────────
    const failedTyped = (failedRaw ?? []) as unknown as FailedItemRaw[]
    const failedItems: FailedItem[] = failedTyped.map(r => ({
      id: r.id,
      store_name: r.store_name,
      va_id: r.va_id,
      va_name: vaNameMap[r.va_id] ?? 'Unknown',
      original_filename: r.original_filename,
      product_row_count: r.product_row_count,
      file_type: r.file_type,
      error_message: r.error_message,
      retry_count: r.retry_count,
      products_optimized: r.products_optimized,
      unique_product_count: r.unique_product_count,
      api_cost_usd: r.api_cost_usd,
      api_input_tokens: r.api_input_tokens,
      api_output_tokens: r.api_output_tokens,
      api_calls_count: r.api_calls_count,
      processing_started_at: r.processing_started_at,
      processing_completed_at: r.processing_completed_at,
      batches_total: r.batches_total,
      batches_completed: r.batches_completed,
      products_failed: r.products_failed,
      output_file_path: r.output_file_path,
      uploaded_at: r.uploaded_at,
      flag_resolved: r.flag_resolved,
      client_id: r.client_id,
      client_store_name: r.clients?.store_name ?? 'Unknown',
    }))

    // ── Expiring / Expired ──────────────────────────────────────────────────────
    const expiringTyped = (expiringRaw ?? []) as unknown as ExpiringClientRaw[]
    const expiringItems: ExpiringClient[] = []
    const expiredItems: ExpiringClient[] = []
    expiringTyped.forEach(r => {
      const item: ExpiringClient = {
        id: r.id,
        store_name: r.store_name,
        va_id: r.va_id,
        va_name: r.vas?.name ?? 'Unknown',
        va_email: r.vas?.email ?? null,
        niche: r.niche,
        market: r.market,
        deadline_48h: r.deadline_48h,
        approved_at: r.approved_at,
        deadline_expired: r.deadline_expired,
        is_active: r.is_active,
      }
      if (r.deadline_expired || !r.is_active) {
        expiredItems.push(item)
      } else {
        expiringItems.push(item)
      }
    })

    // ── Resolved ─────────────────────────────────────────────────────────────────
    const resolvedTyped = (resolvedRaw ?? []) as unknown as ResolvedItemRaw[]
    const resolvedItems: ResolvedItem[] = resolvedTyped.map(r => ({
      id: r.id,
      type: (r.status === 'on_hold' ? 'on_hold' : 'failed') as 'on_hold' | 'failed',
      store_name: r.store_name,
      va_name: vaNameMap[r.va_id] ?? 'Unknown',
      flag_resolved_at: r.flag_resolved_at,
      flag_resolution: r.flag_resolution,
    }))

    setMismatches(mismatchItems)
    setOnHold(onHoldItems)
    setFailed(failedItems)
    setExpiring(expiringItems)
    setExpired(expiredItems)
    setOverdue((overdueRaw ?? []) as OverdueInvoice[])
    setResolved(resolvedItems)
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // Real-time
  useEffect(() => {
    const channel = supabase.channel('flagged-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'uploads', filter: 'status=eq.on_hold' }, () => { void reload() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'uploads', filter: 'status=eq.failed' }, () => { void reload() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clients' }, () => { void reload() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'billing', filter: 'status=eq.overdue' }, () => { void reload() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [reload])

  // Build unified list
  const allItems = useMemo((): UnifiedItem[] => {
    const items: UnifiedItem[] = []
    mismatches.forEach(d => items.push({ kind: 'mismatch', data: d, date: d.created_at, urgency: 0, vaName: d.va_name }))
    onHold.forEach(d => items.push({ kind: 'on_hold', data: d, date: d.uploaded_at, urgency: 0, vaName: d.va_name }))
    failed.forEach(d => items.push({ kind: 'failed', data: d, date: d.uploaded_at, urgency: 0, vaName: d.va_name }))
    expiring.forEach(d => items.push({ kind: 'expiring', data: d, date: d.deadline_48h, urgency: 0, vaName: d.va_name }))
    expired.forEach(d => items.push({ kind: 'expired', data: d, date: d.deadline_48h, urgency: 0, vaName: d.va_name }))
    overdue.forEach(d => items.push({ kind: 'overdue', data: d, date: d.generated_at, urgency: 0, vaName: d.va_name ?? '' }))
    return items.map(i => ({ ...i, urgency: urgencyScore(i) }))
  }, [mismatches, onHold, failed, expiring, expired, overdue])

  const filteredSorted = useMemo(() => {
    let list = allItems
    if (filter === 'mismatches') list = list.filter(i => i.kind === 'mismatch')
    else if (filter === 'on_hold') list = list.filter(i => i.kind === 'on_hold')
    else if (filter === 'failed') list = list.filter(i => i.kind === 'failed')
    else if (filter === 'deadlines') list = list.filter(i => i.kind === 'expiring' || i.kind === 'expired')
    else if (filter === 'overdue') list = list.filter(i => i.kind === 'overdue')

    if (sort === 'urgent') return [...list].sort((a, b) => b.urgency - a.urgency)
    if (sort === 'newest') return [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    if (sort === 'oldest') return [...list].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    if (sort === 'va') return [...list].sort((a, b) => a.vaName.localeCompare(b.vaName))
    return list
  }, [allItems, filter, sort])

  const totalUnresolved = mismatches.length + onHold.length + failed.length + expiring.length + expired.length + overdue.length
  const deadlineCount = expiring.length + expired.length

  // Suppress unused warning
  void vaNames
  void downloadCSV

  return (
    <>
      {/* Pulse keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '48px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 300, color: T.black, margin: 0 }}>Flagged items</h1>
          <span style={{ fontSize: 13, color: T.ghost }}>
            {totalUnresolved > 0
              ? `${totalUnresolved} items need attention`
              : 'All clear. Nothing flagged.'
            }
          </span>
        </div>

        {/* Filter pills + sort */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Pill label="All" count={totalUnresolved} active={filter === 'all'} onClick={() => setFilter('all')} />
            <Pill label="Mismatches" count={mismatches.length} active={filter === 'mismatches'} onClick={() => setFilter('mismatches')} />
            <Pill label="On Hold" count={onHold.length} active={filter === 'on_hold'} onClick={() => setFilter('on_hold')} />
            <Pill label="Failed" count={failed.length} active={filter === 'failed'} onClick={() => setFilter('failed')} />
            <Pill label="48h Violations" count={deadlineCount} active={filter === 'deadlines'} onClick={() => setFilter('deadlines')} />
            <Pill label="Overdue" count={overdue.length} active={filter === 'overdue'} onClick={() => setFilter('overdue')} />
            <Pill label="Resolved" active={filter === 'resolved'} onClick={() => setFilter('resolved')} />
          </div>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            style={{ fontSize: 13, color: T.ter, border: `1px solid ${T.div}`, borderRadius: 8, padding: '6px 12px', background: T.bg, fontFamily: 'inherit', cursor: 'pointer' }}
          >
            <option value="urgent">Most urgent first</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="va">VA name A-Z</option>
          </select>
        </div>

        {/* List */}
        {loading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: T.ghost }}>Loading…</div>
        ) : filter === 'resolved' ? (
          resolved.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: T.ghost }}>No resolved items in the last 7 days.</div>
          ) : (
            resolved.map(r => <ResolvedRow key={r.id} item={r} />)
          )
        ) : filteredSorted.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: T.ghost }}>
            {totalUnresolved === 0 ? 'Nothing flagged. All clear.' : 'No items in this category.'}
          </div>
        ) : (
          filteredSorted.map(item => {
            if (item.kind === 'mismatch') return <MismatchCard key={`m-${item.data.id}`} item={item.data} onReload={() => { void reload() }} />
            if (item.kind === 'on_hold') return <OnHoldCard key={`h-${item.data.id}`} item={item.data} onReload={() => { void reload() }} />
            if (item.kind === 'failed') return <FailedCard key={`f-${item.data.id}`} item={item.data} onReload={() => { void reload() }} />
            if (item.kind === 'expiring') return <ExpiringCard key={`e-${item.data.id}`} item={item.data} onReload={() => { void reload() }} />
            if (item.kind === 'expired') return <ExpiringCard key={`x-${item.data.id}`} item={item.data} onReload={() => { void reload() }} />
            if (item.kind === 'overdue') return <OverdueCard key={`o-${item.data.id}`} item={item.data} onReload={() => { void reload() }} />
            return null
          })
        )}
      </div>
    </>
  )
}
