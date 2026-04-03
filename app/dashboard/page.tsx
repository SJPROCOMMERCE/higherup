'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Upload as UploadIcon } from 'lucide-react'
import { useVA } from '@/context/va-context'
import { supabase, type Client, type Upload, type Billing, type Affiliate, type Notification } from '@/lib/supabase'
import { FREE_PRODUCTS_PER_MONTH, PRICE_PER_PRODUCT } from '@/lib/usage-tracker'
import { timeAgo, getMonthStart, formatMonthLabel, getMarketFlag } from '@/lib/utils'
import { downloadOutput } from '@/lib/download'
import { PageVideo } from '@/components/dashboard/PageVideo'
import { Leaderboard } from '@/components/dashboard/Leaderboard'

// ─── Design tokens (inline) ───────────────────────────────────────────────────

const T = {
  black:   '#111111',
  sec:     '#999999',
  ter:     '#CCCCCC',
  ghost:   '#DDDDDD',
  div:     '#F0F0F0',
  rowDiv:  '#FAFAFA',
  green:   '#10B981',
  bg:      '#FFFFFF',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
}

function getDateLabel(): string {
  const now = new Date()
  return now.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).toUpperCase()
}

const NICHE_COLORS: Record<string, string> = {
  fashion:     '#111111',
  electronics: '#AAAAAA',
  beauty:      '#DDDDDD',
  home_garden: '#888888',
  health:      '#EEEEEE',
  sports:      '#666666',
  other:       '#F0F0F0',
}

const NICHE_LABELS: Record<string, string> = {
  fashion: 'Fashion', electronics: 'Electronics', beauty: 'Beauty',
  home_garden: 'Home & Garden', health: 'Health', sports: 'Sports', other: 'Other',
}

function nicheColor(niche: string | null) { return NICHE_COLORS[niche ?? 'other'] ?? '#F0F0F0' }
function nicheLabel(niche: string | null) { return NICHE_LABELS[niche ?? 'other'] ?? 'Other' }

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Bone({ w, h = 10, style }: { w: number | string; h?: number; style?: React.CSSProperties }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 4,
      background: '#F0F0F0', animation: 'pulse 1.8s ease infinite',
      ...style,
    }} />
  )
}

// ─── Alert ────────────────────────────────────────────────────────────────────

type AlertKind = 'positive' | 'neutral'
type AlertItem = { id: string; kind: AlertKind; message: string; notificationId?: string }

function AlertRow({
  alert, onDismiss,
}: {
  alert: AlertItem
  onDismiss: (id: string, notificationId?: string) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
      {alert.kind === 'positive' && (
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.green, flexShrink: 0 }} />
      )}
      <span style={{
        fontSize: 13,
        color: alert.kind === 'positive' ? T.green : T.sec,
      }}>
        {alert.message}
      </span>
      <button
        onClick={() => onDismiss(alert.id, alert.notificationId)}
        style={{ fontSize: 14, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: 0, transition: 'color 0.15s', flexShrink: 0 }}
        onMouseEnter={e => e.currentTarget.style.color = T.black}
        onMouseLeave={e => e.currentTarget.style.color = T.ghost}
      >×</button>
    </div>
  )
}

// ─── Status Dot ───────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: Upload['status'] }) {
  const isDone   = status === 'done' || status === 'failed'
  const isActive = status === 'processing'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span
        className={isActive ? 'pulse-dot' : undefined}
        style={{
          width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
          background: isDone ? T.black : '#AAAAAA',
        }}
      />
      <span style={{ fontSize: 13, color: isDone ? T.black : T.ter }}>
        {status === 'done'       ? 'Done'
          : status === 'processing' ? 'Processing'
          : status === 'failed'     ? 'Failed'
          : status === 'on_hold'    ? 'On Hold'
          : 'Queued'}
      </span>
    </div>
  )
}

// ─── Profile Change Modal ─────────────────────────────────────────────────────

function ProfileChangeModal({
  client, vaId, onClose, onSuccess,
}: {
  client: Client; vaId: string; onClose: () => void; onSuccess: () => void
}) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { areaRef.current?.focus() }, [])

  async function handleSubmit() {
    if (!text.trim() || submitting) return
    setSubmitting(true)
    await supabase.from('profile_change_requests').insert({
      va_id: vaId, client_id: client.id,
      request_text: text.trim(), status: 'pending',
    })
    setSubmitting(false)
    onClose()
    onSuccess()
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(255,255,255,0.90)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 24px',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 440,
        background: '#FFFFFF',
        border: '1px solid #EEEEEE',
        borderRadius: 0,
        padding: 40,
      }}>
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: T.black }}>Request change</div>
          <div style={{ fontSize: 13, color: T.ter, marginTop: 2 }}>for {client.store_name}</div>
        </div>
        <div style={{ marginTop: 20 }}>
          <textarea
            ref={areaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="What should change?"
            rows={4}
            style={{
              width: '100%', fontSize: 14, color: T.black,
              background: 'none', border: 'none', outline: 'none',
              borderBottom: '1.5px solid #EEEEEE',
              resize: 'none', padding: '0 0 8px 0',
              fontFamily: 'inherit',
              transition: 'border-color 0.15s',
              minHeight: 80,
            }}
            onFocus={e => e.currentTarget.style.borderBottomColor = T.black}
            onBlur={e => e.currentTarget.style.borderBottomColor = '#EEEEEE'}
          />
        </div>
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={onClose}
            style={{ fontSize: 12, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = T.black}
            onMouseLeave={e => e.currentTarget.style.color = T.ter}
          >cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || submitting}
            style={{
              fontSize: 12, fontWeight: 600, color: T.black,
              background: 'none', border: 'none', cursor: text.trim() ? 'pointer' : 'default',
              padding: 0, opacity: (!text.trim() || submitting) ? 0.3 : 1,
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { if (text.trim()) e.currentTarget.style.opacity = '0.6' }}
            onMouseLeave={e => e.currentTarget.style.opacity = (!text.trim() || submitting) ? '0.3' : '1'}
          >submit</button>
        </div>
      </div>
    </div>
  )
}

// ─── Client Row ───────────────────────────────────────────────────────────────

function ClientRow({
  client, uploads, vaId, expanded, onToggle, onRequestChange,
}: {
  client: Client
  uploads: Upload[]
  vaId: string
  expanded: boolean
  onToggle: () => void
  onRequestChange: (client: Client) => void
}) {
  const clientUploads = uploads.filter(u => u.client_id === client.id)
  // Use pre-calculated tracking fields from DB (auto-updated by trigger)
  const monthVariants = client.current_month_variants ?? 0
  const latestDone = clientUploads
    .filter(u => u.status === 'done')
    .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())[0]

  const isApproved  = client.approval_status === 'approved' && client.is_active
  const isPending   = client.approval_status === 'pending'
  const isRejected  = client.approval_status === 'rejected'
  const isInactive  = !isApproved && !isPending && !isRejected

  const rowOpacity = isPending ? 0.4 : isRejected ? 0.2 : isInactive ? 0.15 : 1
  const clickable  = isApproved

  return (
    <div>
      {/* Main row */}
      <div
        onClick={clickable ? onToggle : undefined}
        title={isRejected && client.rejection_reason ? client.rejection_reason : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 0,
          padding: '20px 0',
          borderBottom: `1px solid ${T.rowDiv}`,
          opacity: rowOpacity,
          cursor: clickable ? 'pointer' : 'default',
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => { if (clickable) e.currentTarget.style.opacity = String(rowOpacity * 0.6) }}
        onMouseLeave={e => { e.currentTarget.style.opacity = String(rowOpacity) }}
      >
        {/* Niche dot */}
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: nicheColor(client.niche),
          flexShrink: 0,
          border: client.niche === 'health' || client.niche === 'beauty' ? '1px solid #DDDDDD' : 'none',
        }} />

        {/* Client info */}
        <div style={{ marginLeft: 16, flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 15, fontWeight: 500, color: T.black,
            textDecoration: (isRejected || isInactive) ? 'line-through' : 'none',
            textDecorationColor: T.ter,
          }}>
            {client.store_name}
          </div>
          <div style={{ fontSize: 11.5, color: '#BBBBBB', marginTop: 2 }}>
            {nicheLabel(client.niche)}
            {client.market ? ` · ${client.market}` : ''}
            {client.language ? ` · ${client.language}` : ''}
          </div>
        </div>

        {/* Data blocks */}
        {isApproved && (
          <div style={{ display: 'flex', gap: 40, flexShrink: 0, marginRight: 32 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#DDDDDD', marginBottom: 3 }}>Products</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: T.black }}>{monthVariants}</div>
            </div>
          </div>
        )}

        {!isApproved && (
          <div style={{ display: 'flex', gap: 40, flexShrink: 0, marginRight: 32 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#DDDDDD', marginBottom: 3 }}>Products</div>
              <div style={{ fontSize: 13, color: T.ter }}>—</div>
            </div>
          </div>
        )}

        {/* Status */}
        <div style={{ fontSize: 11, minWidth: 56, textAlign: 'right', flexShrink: 0 }}>
          {isApproved  && <span style={{ color: T.black }}>Active</span>}
          {isPending   && <span style={{ color: T.ter, fontStyle: 'italic' }}>Pending</span>}
          {isRejected  && <span style={{ color: T.ter }}>Rejected</span>}
          {isInactive  && <span style={{ color: '#DDDDDD' }}>Inactive</span>}
        </div>
      </div>

      {/* Expanded content */}
      <div style={{
        maxHeight: expanded ? 160 : 0,
        overflow: 'hidden',
        opacity: expanded ? 1 : 0,
        transition: 'max-height 0.3s ease, opacity 0.25s ease',
      }}>
        <div style={{ paddingLeft: 24, paddingTop: 12, paddingBottom: 16 }}>
          <div style={{ fontSize: 12, color: T.sec, display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
            {client.market   && <span>Market: {getMarketFlag(client.market)} {client.market}</span>}
            {client.language && <span>Language: {client.language}</span>}
            {latestDone      && <span>Last upload: {timeAgo(latestDone.uploaded_at)}</span>}
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 11, alignItems: 'center' }}>
            <Link
              href={`/dashboard/upload?client=${client.id}`}
              style={{ color: T.black, textDecoration: 'none', borderBottom: '1px solid transparent', transition: 'border-color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.borderBottomColor = T.black}
              onMouseLeave={e => e.currentTarget.style.borderBottomColor = 'transparent'}
            >
              Upload CSV
            </Link>
            <span style={{ color: '#EEEEEE' }}>·</span>
            <button
              onClick={e => { e.stopPropagation(); onRequestChange(client) }}
              style={{ fontSize: 11, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = T.black}
              onMouseLeave={e => e.currentTarget.style.color = T.ter}
            >Request change</button>
            {latestDone?.output_file_path && (
              <>
                <span style={{ color: '#EEEEEE' }}>·</span>
                <button
                  onClick={e => { e.stopPropagation(); downloadOutput(latestDone) }}
                  style={{ fontSize: 11, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.color = T.black}
                  onMouseLeave={e => e.currentTarget.style.color = T.ter}
                >Download latest</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { currentVA } = useVA()

  const [loading,    setLoading]    = useState(true)
  const [clients,    setClients]    = useState<Client[]>([])
  const [uploads,    setUploads]    = useState<Upload[]>([])
  const [billing,    setBilling]    = useState<Billing[]>([])
  const [affiliates, setAffiliates] = useState<Affiliate[]>([])
  const [alerts,        setAlerts]        = useState<AlertItem[]>([])
  const [dismissed,     setDismissed]     = useState<Set<string>>(new Set())
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [fetchError, setFetchError] = useState(false)

  const [expandedId,    setExpandedId]    = useState<string | null>(null)
  const [modalClient,   setModalClient]   = useState<Client | null>(null)
  const [successMsg,    setSuccessMsg]    = useState(false)

  const fetchData = useCallback(async () => {
    if (!currentVA) return
    setLoading(true); setFetchError(false)
    try {
      const [{ data: c, error: e1 }, { data: u, error: e2 }, { data: b }, { data: a }, { data: notifs }] = await Promise.all([
        supabase.from('clients').select('*').eq('va_id', currentVA.id).order('registered_at', { ascending: false }),
        supabase.from('uploads').select('*').eq('va_id', currentVA.id).order('uploaded_at', { ascending: false }),
        supabase.from('billing').select('*').eq('va_id', currentVA.id),
        supabase.from('affiliates').select('*').eq('referrer_va_id', currentVA.id),
        supabase.from('notifications').select('*').eq('va_id', currentVA.id).eq('is_read', false).order('created_at', { ascending: false }),
      ])
      if (e1 || e2) { setFetchError(true); setLoading(false); return }

      const clients_    = c ?? []
      const uploads_    = u ?? []
      const billing_    = b ?? []
      const affiliates_ = a ?? []
      const notifs_     = (notifs ?? []) as Notification[]

      setClients(clients_); setUploads(uploads_); setBilling(billing_); setAffiliates(affiliates_)
      setNotifications(notifs_)

      // Build alerts — notifications first, then computed
      const now = new Date()
      const ago7  = new Date(now.getTime() - 7  * 86400000)
      const ago48 = new Date(now.getTime() - 48 * 3600000)
      const built: AlertItem[] = []

      // ── DB notifications ─────────────────────────────────────────────────────
      notifs_.forEach(n => built.push({
        id:             `notif-${n.id}`,
        kind:           (n.type === 'client_approved' || n.type === 'request_approved') ? 'positive' : 'neutral',
        message:        n.title,
        notificationId: n.id,
      }))

      // ── Computed alerts ──────────────────────────────────────────────────────
      clients_.filter(cl => cl.approval_status === 'approved' && cl.approved_at && new Date(cl.approved_at) >= ago48)
        .forEach(cl => built.push({ id: `app-${cl.id}`, kind: 'positive', message: `${cl.store_name} has been approved — you can start uploading.` }))

      uploads_.filter(u => u.status === 'failed' && new Date(u.uploaded_at) >= ago7)
        .forEach(u => built.push({ id: `fail-${u.id}`, kind: 'neutral', message: `Upload failed for ${u.store_name ?? 'a client'}${u.error_message ? ` — ${u.error_message}` : ''}` }))

      uploads_.filter(u => u.status === 'on_hold' && new Date(u.uploaded_at) >= ago7)
        .forEach(u => built.push({ id: `hold-${u.id}`, kind: 'neutral', message: `Upload for ${u.store_name ?? 'a client'} is on hold` }))

      billing_.filter(b => b.status === 'overdue')
        .forEach(b => built.push({ id: `ov-${b.id}`, kind: 'neutral', message: `Your HigherUp share of $${b.total_amount} for ${b.month} is overdue` }))

      clients_.filter(cl => cl.approval_status === 'rejected' && cl.registered_at && new Date(cl.registered_at) >= ago7)
        .forEach(cl => built.push({ id: `rej-${cl.id}`, kind: 'neutral', message: `${cl.store_name} was not approved${cl.rejection_reason ? `: ${cl.rejection_reason}` : ''}` }))

      setAlerts(built)
    } catch { setFetchError(true) }
    finally   { setLoading(false) }
  }, [currentVA])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Dismiss alert ────────────────────────────────────────────────────────────
  async function handleDismiss(id: string, notificationId?: string) {
    if (notificationId) {
      // Mark as read in DB — fire and forget
      supabase.from('notifications').update({ is_read: true }).eq('id', notificationId).then(() => {})
    }
    setDismissed(p => new Set([...p, id]))
  }

  // ── Realtime: re-fetch when any upload changes ───────────────────────────────
  useEffect(() => {
    if (!currentVA) return
    const channel = supabase
      .channel('dashboard-uploads-rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'uploads', filter: `va_id=eq.${currentVA.id}` },
        () => fetchData(),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentVA, fetchData])

  // Success toast: disappear after 3s
  useEffect(() => {
    if (!successMsg) return
    const t = setTimeout(() => setSuccessMsg(false), 3000)
    return () => clearTimeout(t)
  }, [successMsg])

  if (!currentVA) return null

  // ── Computed ────────────────────────────────────────────────────────────────
  const monthStart      = getMonthStart()
  const activeClients   = clients.filter(c => c.approval_status === 'approved' && c.is_active)
  const monthDone       = uploads.filter(u => u.status === 'done' && new Date(u.uploaded_at) >= monthStart)
  const productsMonth   = monthDone.reduce((s, u) => s + (u.product_row_count ?? 0), 0)

  // Per-product pricing: first 10 free, $0.25 after
  const billableProducts = Math.max(0, productsMonth - FREE_PRODUCTS_PER_MONTH)
  const estimatedInv     = Math.round(billableProducts * PRICE_PER_PRODUCT * 100) / 100

  const isFirstMonth     = billing.length === 0
  const clientsWithRates = activeClients.filter(c => c.va_rate_per_product != null)
  const allHaveRates     = activeClients.length > 0 && clientsWithRates.length === activeClients.length
  const someHaveRates    = clientsWithRates.length > 0
  const estimatedIncome  = monthDone.reduce((sum, u) => {
    const cl = activeClients.find(c => c.id === u.client_id)
    if (!cl?.va_rate_per_product) return sum
    return sum + (u.product_row_count ?? 0) * cl.va_rate_per_product
  }, 0)
  const partialProfit = Math.round(estimatedIncome - estimatedInv)
  const clientRateMap = Object.fromEntries(clients.map(c => [c.id, c.va_rate_per_product ?? null]))
  const activeReferrals = affiliates.filter(a => a.is_active).length
  const lockedCount     = uploads.filter(u => u.output_locked === true).length
  const recentUploads   = uploads.slice(0, 5)
  const visibleAlerts   = alerts.filter(a => !dismissed.has(a.id))

  type UploadExt = Upload & { awaiting_va_response?: boolean; message_count?: number }
  const onHoldMessages  = (uploads as UploadExt[]).filter(u => u.status === 'on_hold' && u.awaiting_va_response)

  const firstName = currentVA.name.split(' ')[0]

  const C = {
    outer: { maxWidth: 880, margin: '0 auto', paddingInline: 48 } as React.CSSProperties,
    sectionLabel: { fontSize: 11, fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: T.ter } as React.CSSProperties,
  }

  return (
    <div style={{ paddingTop: 64, paddingBottom: 80, fontFamily: "'Inter', system-ui, sans-serif" }} className="content-pad">
      <div className="dashboard-grid">
      <div className="dashboard-main">

      {/* ── Greeting ────────────────────────────────────────── */}
      <div className="s1" style={{ ...C.outer, textAlign: 'center', marginBottom: 56 }}>
        <h1 style={{ fontSize: 32, fontWeight: 300, color: T.black, letterSpacing: '-0.03em', margin: 0, lineHeight: 1.2 }}>
          Good {getGreeting()},{' '}
          <span style={{ fontWeight: 600 }}>{firstName}</span>
        </h1>
        <p style={{ fontSize: 12, color: T.ter, letterSpacing: '0.02em', textTransform: 'uppercase', marginTop: 10, marginBottom: 0 }}>
          {getDateLabel()}
        </p>
      </div>

      <PageVideo slug="dashboard" />

      {/* ── On-hold with admin messages (prominent) ─────────── */}
      {onHoldMessages.length > 0 && (
        <div className="s1b" style={{ ...C.outer, marginBottom: 24 }}>
          {onHoldMessages.map(u => (
            <div key={u.id} style={{
              background: T.rowDiv, border: `1px solid ${T.div}`, borderRadius: 12,
              padding: '20px 24px', marginBottom: 12,
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
            }}>
              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: T.sec, marginBottom: 6 }}>
                  Action needed
                </div>
                <div style={{ fontSize: 15, fontWeight: 500, color: T.black, marginBottom: 4 }}>
                  Admin has a question about your upload for {u.store_name ?? 'a client'}
                </div>
                <a
                  href={`/dashboard/uploads/${u.id}`}
                  style={{ fontSize: 13, color: T.black, textDecoration: 'underline' }}
                >
                  Reply now →
                </a>
              </div>
            </div>
          ))}
        </div>
      )}


      {/* ── Locked files banner ─────────────────────────────── */}
      {!loading && lockedCount > 0 && (
        <div className="s2b" style={{ ...C.outer, marginBottom: 24 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#FEF3C7', borderRadius: 12, padding: '14px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16 }}>🔒</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#92400E' }}>
                  {lockedCount} file{lockedCount !== 1 ? 's' : ''} locked
                </div>
                <div style={{ fontSize: 12, color: '#B45309', marginTop: 2 }}>
                  Pay your HigherUp share to unlock {lockedCount !== 1 ? 'them' : 'it'} and access your results.
                </div>
              </div>
            </div>
            <Link href="/dashboard/billing" style={{
              fontSize: 12, fontWeight: 500, color: '#92400E',
              textDecoration: 'none', borderBottom: '1px solid #D97706', whiteSpace: 'nowrap', marginLeft: 16,
            }}>
              View billing →
            </Link>
          </div>
        </div>
      )}

      {/* Success toast */}
      {successMsg && (
        <div style={{ textAlign: 'center', fontSize: 13, color: T.green, marginBottom: 16 }}>
          Change request submitted
        </div>
      )}

      {/* Fetch error */}
      {fetchError && (
        <div style={{ ...C.outer, textAlign: 'center', marginBottom: 32 }}>
          <span style={{ fontSize: 14, color: T.ter }}>Something went wrong. </span>
          <button
            onClick={fetchData}
            style={{ fontSize: 12, color: T.black, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
          >Try again</button>
        </div>
      )}

      {/* ── Stats ───────────────────────────────────────────── */}
      <div className="s2" style={{ ...C.outer, display: 'flex', justifyContent: 'center', gap: 64, marginBottom: 56 }}>
        {loading ? (
          <>
            {[120, 100, 100, 90].map((w, i) => (
              <div key={i} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <Bone w={w} h={40} />
                <Bone w={60} h={8} />
              </div>
            ))}
          </>
        ) : (
          <>
            {(
              [
                { key: 'clients',   val: String(activeClients.length),           label: 'CLIENTS'   },
                { key: 'variants',  val: productsMonth.toLocaleString(),          label: 'PRODUCTS'  },
                { key: 'invoice',   val: '',                                      label: ''          },
                { key: 'referrals', val: String(activeReferrals),                 label: 'REFERRALS' },
              ] as { key: string; val: string; label: string }[]
            ).map(({ key, val, label }) => {
              if (key === 'invoice') {
                // ── Case 0: first month — no invoices yet ───────────────────
                if (isFirstMonth) {
                  if (someHaveRates) {
                    return (
                      <div key="invoice" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 44, fontWeight: 600, color: '#2DB87E', letterSpacing: '-0.04em', lineHeight: 1 }}>
                          ${partialProfit.toLocaleString()}
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.12em', color: T.ter, marginTop: 8 }}>
                          EST. PROFIT
                        </div>
                        <div style={{ fontSize: 11, color: T.ter, marginTop: 4 }}>
                          your first HigherUp share comes next month
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div key="invoice" style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 44, fontWeight: 600, color: T.black, letterSpacing: '-0.04em', lineHeight: 1 }}>
                        $0
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.12em', color: T.ter, marginTop: 8 }}>
                        FIRST MONTH
                      </div>
                      <div style={{ fontSize: 11, color: T.ter, marginTop: 4 }}>
                        paid so far · your first HigherUp share comes on the 1st
                      </div>
                    </div>
                  )
                }
                // ── Case 1: all clients have rates ──────────────────────────
                if (allHaveRates) {
                  return (
                    <div key="invoice" style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 44, fontWeight: 600, color: '#2DB87E', letterSpacing: '-0.04em', lineHeight: 1 }}>
                        ${partialProfit.toLocaleString()}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.12em', color: T.ter, marginTop: 8 }}>
                        EST. PROFIT
                      </div>
                      <div style={{ fontSize: 11, color: T.ter, marginTop: 4 }}>
                        on ${Math.round(estimatedIncome).toLocaleString()} earned · ${estimatedInv.toFixed(2)} share
                      </div>
                    </div>
                  )
                }
                // ── Case 2: some clients have rates (partial) ───────────────
                if (someHaveRates) {
                  return (
                    <div key="invoice" style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 44, fontWeight: 600, color: '#2DB87E', letterSpacing: '-0.04em', lineHeight: 1 }}>
                        ${partialProfit.toLocaleString()}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.12em', color: T.ter, marginTop: 8 }}>
                        EST. PROFIT
                      </div>
                      <div style={{ fontSize: 11, color: T.ter, marginTop: 4 }}>
                        partial · {clientsWithRates.length} of {activeClients.length} clients{' '}
                        <Link
                          href="/dashboard/clients"
                          style={{ color: T.black, textDecoration: 'none', borderBottom: '1px solid transparent', paddingBottom: 1, transition: 'border-color 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.borderBottomColor = T.black}
                          onMouseLeave={e => e.currentTarget.style.borderBottomColor = 'transparent'}
                        >
                          Set all →
                        </Link>
                      </div>
                    </div>
                  )
                }
                // ── Case 3: no rates set ────────────────────────────────────
                return (
                  <div key="invoice" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 44, fontWeight: 600, color: T.black, letterSpacing: '-0.04em', lineHeight: 1 }}>
                      ${estimatedInv.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.12em', color: T.ter, marginTop: 8 }}>
                      EST. SHARE
                    </div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>
                      <Link
                        href="/dashboard/clients"
                        style={{ color: T.ghost, textDecoration: 'none', transition: 'color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.color = T.black}
                        onMouseLeave={e => e.currentTarget.style.color = T.ghost}
                      >
                        Set rates to see profit →
                      </Link>
                    </div>
                  </div>
                )
              }
              return (
                <div key={key} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 44, fontWeight: 600, color: T.black, letterSpacing: '-0.04em', lineHeight: 1 }}>{val}</div>
                  <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.12em', color: T.ter, marginTop: 8 }}>{label}</div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Centered divider */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 56 }}>
        <div style={{ width: 40, height: 1, background: '#E8E8E8' }} />
      </div>

      {/* ── Upload CTA ──────────────────────────────────────── */}
      <div className="s3" style={{ ...C.outer, textAlign: 'center', marginBottom: 48 }}>
        <Link
          href="/dashboard/upload"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 9,
            padding: '14px 36px', borderRadius: 100,
            background: T.black, color: '#FFFFFF',
            fontSize: 13, fontWeight: 500,
            textDecoration: 'none',
            transition: 'background 0.15s, transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#333333'
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = T.black
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <UploadIcon size={15} />
          Upload CSV
        </Link>
      </div>

      {/* ── Recent Uploads ───────────────────────────────────── */}
      <div className="s4" style={{ ...C.outer, marginBottom: 56 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={C.sectionLabel}>Recent uploads</span>
          <Link
            href="/dashboard/uploads"
            style={{ fontSize: 11, color: T.ter, textDecoration: 'none', transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = T.black}
            onMouseLeave={e => e.currentTarget.style.color = T.ter}
          >View all →</Link>
        </div>

        {/* Table header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 80px 120px 80px 110px 32px',
          gap: 16, paddingBottom: 12, borderBottom: `1px solid ${T.div}`,
        }}>
          {['Client', 'Products', 'Status', 'Earned', 'Date', ''].map(h => (
            <span key={h} style={C.sectionLabel}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 120px 80px 110px 32px', gap: 16, padding: '16px 0', borderBottom: `1px solid ${T.rowDiv}` }}>
              <Bone w="60%" h={10} />
              <Bone w={32} h={10} />
              <Bone w={60} h={10} />
              <Bone w={40} h={10} />
              <Bone w={80} h={10} />
              <span />
            </div>
          ))
        ) : recentUploads.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 13, color: T.ter }}>
            No uploads yet
          </div>
        ) : (
          recentUploads.map((u) => (
            <div
              key={u.id}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 80px 120px 80px 110px 32px',
                gap: 16, padding: '16px 0',
                borderBottom: `1px solid ${T.rowDiv}`,
                transition: 'opacity 0.15s', cursor: 'default',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.6'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: T.black }}>{u.store_name ?? '—'}</span>
              <span style={{ fontSize: 13, color: T.black, fontVariantNumeric: 'tabular-nums' }}>
                {u.product_row_count != null ? u.product_row_count : '—'}
              </span>
              <StatusDot status={u.status} />
              {(() => {
                const rate = clientRateMap[u.client_id]
                if (rate == null || u.product_row_count == null) {
                  return <span style={{ fontSize: 13, color: T.ghost }}>—</span>
                }
                return (
                  <span style={{ fontSize: 13, color: '#2DB87E', fontVariantNumeric: 'tabular-nums' }}>
                    +${(u.product_row_count * rate).toFixed(2)}
                  </span>
                )
              })()}
              <span style={{ fontSize: 12, color: T.ter, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                {timeAgo(u.uploaded_at)}
              </span>
              <span>
                {u.status === 'done' && u.output_file_path && (
                  <button
                    onClick={() => downloadOutput(u)}
                    style={{ fontSize: 14, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.color = T.black}
                    onMouseLeave={e => e.currentTarget.style.color = T.ghost}
                    title="Download result"
                  >↓</button>
                )}
              </span>
            </div>
          ))
        )}
      </div>

      {/* ── Clients ─────────────────────────────────────────── */}
      <div className="s5" style={C.outer}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={C.sectionLabel}>Your clients</span>
          <Link
            href="/dashboard/clients/new"
            style={{
              fontSize: 13, fontWeight: 500, color: T.ter,
              border: '1px solid #EEEEEE', borderRadius: 100,
              padding: '5px 14px', textDecoration: 'none',
              transition: 'color 0.15s, border-color 0.15s',
              display: 'inline-block',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = T.black; e.currentTarget.style.borderColor = T.black }}
            onMouseLeave={e => { e.currentTarget.style.color = T.ter;   e.currentTarget.style.borderColor = '#EEEEEE' }}
          >+ New client</Link>
        </div>

        {/* Skeleton */}
        {loading && (
          <div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 0', borderBottom: `1px solid ${T.rowDiv}` }}>
                <Bone w={8} h={8} style={{ borderRadius: '50%', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <Bone w="40%" h={11} style={{ marginBottom: 6 }} />
                  <Bone w="25%" h={8} />
                </div>
                <Bone w={80} h={10} />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && clients.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 24, fontWeight: 300, color: T.ter, marginBottom: 10 }}>No clients yet.</div>
            <div style={{ fontSize: 13, color: T.ghost, marginBottom: 20 }}>Register your first client to get started.</div>
            <Link
              href="/dashboard/clients/new"
              style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '14px 36px', borderRadius: 100,
                background: T.black, color: '#FFFFFF',
                fontSize: 13, fontWeight: 500, textDecoration: 'none',
                transition: 'background 0.15s, transform 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#333333'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)' }}
              onMouseLeave={e => { e.currentTarget.style.background = T.black;    e.currentTarget.style.transform = 'translateY(0)';    e.currentTarget.style.boxShadow = 'none' }}
            >Register client</Link>
          </div>
        )}

        {/* Client rows */}
        {!loading && clients.map(client => (
          <ClientRow
            key={client.id}
            client={client}
            uploads={uploads}
            vaId={currentVA.id}
            expanded={expandedId === client.id}
            onToggle={() => setExpandedId(expandedId === client.id ? null : client.id)}
            onRequestChange={setModalClient}
          />
        ))}
      </div>

      {/* ── Footer ──────────────────────────────────────────── */}
      <div style={{ marginTop: 80, textAlign: 'center' }}>
        <span style={{ fontSize: 10, color: '#E8E8E8', letterSpacing: '0.05em' }}>HIGHERUP</span>
      </div>

      {/* ── Modal ───────────────────────────────────────────── */}
      {modalClient && (
        <ProfileChangeModal
          client={modalClient}
          vaId={currentVA.id}
          onClose={() => setModalClient(null)}
          onSuccess={() => { setModalClient(null); setSuccessMsg(true) }}
        />
      )}
      </div>

      <div className="dashboard-sidebar">
        <Leaderboard vaId={currentVA.id} />
      </div>
      </div>
    </div>
  )
}
