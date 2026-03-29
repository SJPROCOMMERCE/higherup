'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { timeAgo } from '@/lib/utils'

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  black: '#111111', sec: '#999999', ter: '#CCCCCC', ghost: '#DDDDDD',
  div: '#F0F0F0', row: '#FAFAFA', green: '#10B981', bg: '#FFFFFF',
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Period = 'today' | 'week' | 'month' | 'all' | 'custom'
type DateRange = { from: string | null; to: string | null }
type ActionKey = 'invoices' | 'deadlines' | 'overdue' | 'payouts'
type ActionState = 'idle' | 'running' | 'done' | 'error'

type CoreStats = {
  variantsProcessed: number; uploads: number; activeVAs: number
  revenue: number; apiCost: number; margin: number
}

type AttentionItem = {
  key: string; count: number; totalAmount?: number
  label: string; preview: string; href: string
}

type LogEntry = {
  id: string; action: string; details: string | null
  source: string | null; severity: string | null; va_id: string | null; created_at: string
}

type VARow = {
  id: string; name: string; country: string | null; status: string
  clients: number; variants: number; uploads: number; revenue: number
}

type ClientRow = {
  id: string; store_name: string; va_name: string; niche: string | null
  variants: number; tier: string; revenue: number
}

type FinancialData = {
  invoiced: number; collected: number; outstanding: number; overdue: number
  apiCost: number; avgCostPerUpload: number; avgCostPerVariant: number; cachedPct: number
  affiliateOwed: number; activeReferrers: number; totalReferrals: number; avgPayout: number
}

type SystemHealth = {
  queued: number; processing: number; failed24h: number; avgTime: number
  current: Array<{ store: string; va: string; variants: number; secs: number }>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getFrom(period: Exclude<Period, 'custom'>): string | null {
  const now = new Date()
  if (period === 'today') { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.toISOString() }
  if (period === 'week') {
    const d = new Date(now); const day = d.getDay() || 7
    d.setDate(d.getDate() - day + 1); d.setHours(0, 0, 0, 0); return d.toISOString()
  }
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  return null
}

function computeRange(period: Period, customFrom: string, customTo: string): DateRange {
  if (period === 'custom') return { from: customFrom + 'T00:00:00.000Z', to: customTo + 'T23:59:59.999Z' }
  return { from: getFrom(period as Exclude<Period, 'custom'>), to: null }
}

function fmtCustomLabel(from: string, to: string): string {
  const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(from)} — ${fmt(to)}`
}

function tierLabel(v: number): string { return v <= 200 ? 'T1' : v <= 400 ? 'T2' : v <= 1000 ? 'T3' : 'T4' }
function tierAmount(v: number): number { return v <= 200 ? 50 : v <= 400 ? 110 : v <= 1000 ? 220 : 350 }
function fmtNum(n: number): string { return n.toLocaleString('en-US') }
function fmtDollar(n: number): string { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) }

function getPrevMonthLabel(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function escapeCSV(val: unknown): string {
  const s = String(val ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  return [headers.map(escapeCSV).join(','), ...rows.map(r => headers.map(h => escapeCSV(r[h])).join(','))].join('\n')
}

const SEV_DOT: Record<string, string> = { warning: '#F59E0B', error: '#EF4444', critical: '#7C3AED' }
const SRC_LABEL: Record<string, string> = { va: 'VA', admin: 'ADMIN', system: 'SYS', api: 'API' }

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatNum({ value, label, color = T.black, weight = 600 }: { value: string; label: string; color?: string; weight?: number }) {
  return (
    <div>
      <div style={{ fontSize: 44, fontWeight: weight, color, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.12em', color: T.ter, marginTop: 6 }}>{label}</div>
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: T.div, margin: '32px 0' }} />
}

function SectionHeader({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.12em', color: T.ter }}>{label}</div>
      {right && <div>{right}</div>}
    </div>
  )
}

function FinLine({ label, value, color = T.black, weight = 400 }: { label: string; value: string; color?: string; weight?: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
      <span style={{ fontSize: 12, color: T.ter }}>{label}</span>
      <span style={{ fontSize: 14, color, fontWeight: weight }}>{value}</span>
    </div>
  )
}

function HealthStat({ label, value, warn, red }: { label: string; value: number; warn: number; red?: boolean }) {
  const isHigh = value >= warn
  const color = isHigh && red ? '#EF4444' : isHigh ? T.black : T.ter
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
      <span style={{ fontSize: 12, color: T.ter }}>{label}:</span>
      <span style={{ fontSize: 13, fontWeight: isHigh ? 500 : 400, color }}>{value}</span>
    </div>
  )
}

function ActionBtn({ label, state, onClick }: { label: string; state: ActionState; onClick: () => void }) {
  const running = state === 'running', done = state === 'done', err = state === 'error'
  const text   = running ? 'Running…' : done ? 'Done ✓' : err ? 'Error ✗' : label
  const bColor = done ? T.green : err ? '#EF4444' : '#EEEEEE'
  const tColor = done ? T.green : err ? '#EF4444' : T.sec
  return (
    <button
      onClick={onClick} disabled={running}
      style={{
        padding: '8px 16px', borderRadius: 100, fontSize: 12, background: 'none',
        border: `1px solid ${bColor}`, color: tColor, cursor: running ? 'default' : 'pointer',
        fontFamily: 'inherit', transition: 'all 0.15s', opacity: running ? 0.7 : 1,
      }}
      onMouseEnter={e => { if (!running && !done && !err) { e.currentTarget.style.borderColor = T.black; e.currentTarget.style.color = T.black } }}
      onMouseLeave={e => { if (!running && !done && !err) { e.currentTarget.style.borderColor = '#EEEEEE'; e.currentTarget.style.color = T.sec } }}
    >
      {text}
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const [period,      setPeriod]      = useState<Period>('month')
  const [stats,       setStats]       = useState<CoreStats | null>(null)
  const [attention,   setAttention]   = useState<AttentionItem[]>([])
  const [activity,    setActivity]    = useState<LogEntry[]>([])
  const [vaRows,      setVARows]      = useState<VARow[]>([])
  const [vaSummary,   setVASummary]   = useState({ active: 0, pending: 0, total: 0 })
  const [vaTotal,     setVATotal]     = useState(0)
  const [clientRows,  setClientRows]  = useState<ClientRow[]>([])
  const [clientTotal, setClientTotal] = useState(0)
  const [financial,   setFinancial]   = useState<FinancialData | null>(null)
  const [health,      setHealth]      = useState<SystemHealth | null>(null)

  const [actions,      setActions]      = useState<Record<ActionKey, ActionState>>({ invoices: 'idle', deadlines: 'idle', overdue: 'idle', payouts: 'idle' })
  const [showExport,   setShowExport]   = useState(false)
  const [showInvModal, setShowInvModal] = useState(false)

  // Custom date range state
  const defaultFrom = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10) })()
  const defaultTo   = new Date().toISOString().slice(0, 10)
  const [customFrom,  setCustomFrom]  = useState(defaultFrom)
  const [customTo,    setCustomTo]    = useState(defaultTo)
  const [inputFrom,   setInputFrom]   = useState(defaultFrom)
  const [inputTo,     setInputTo]     = useState(defaultTo)
  const [showCustom,  setShowCustom]  = useState(false)

  const rangeRef   = useRef<DateRange>(computeRange(period, customFrom, customTo))
  const exportRef  = useRef<HTMLDivElement>(null)
  useEffect(() => { rangeRef.current = computeRange(period, customFrom, customTo) }, [period, customFrom, customTo])

  // ── Close export dropdown on outside click ──────────────────────────────────
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExport(false)
    }
    if (showExport) document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showExport])

  // ── Load: core stats ────────────────────────────────────────────────────────
  const loadStats = useCallback(async ({ from, to }: DateRange) => {
    let uploadQ = supabase.from('uploads').select('va_id, product_row_count, api_cost_usd').eq('status', 'done')
    if (from) uploadQ = uploadQ.gte('processing_completed_at', from)
    if (to)   uploadQ = uploadQ.lte('processing_completed_at', to)
    let billingQ = supabase.from('billing').select('va_id, total_amount').eq('status', 'paid')
    if (from) billingQ = billingQ.gte('paid_at', from)
    if (to)   billingQ = billingQ.lte('paid_at', to)

    const [{ data: uploads }, { data: billing }] = await Promise.all([uploadQ, billingQ])
    const u = uploads ?? [], b = billing ?? []
    const variantsProcessed = u.reduce((s, x) => s + (x.product_row_count ?? 0), 0)
    const apiCost           = u.reduce((s, x) => s + (x.api_cost_usd ?? 0), 0)
    const revenue           = b.reduce((s, x) => s + (x.total_amount ?? 0), 0)
    const margin            = revenue > 0 ? ((revenue - apiCost) / revenue) * 100 : 0
    setStats({ variantsProcessed, uploads: u.length, activeVAs: new Set(u.map(x => x.va_id)).size, revenue, apiCost, margin })
  }, [])

  // ── Load: needs attention ───────────────────────────────────────────────────
  const loadAttention = useCallback(async () => {
    const now    = new Date()
    const s24h   = new Date(now.getTime() - 24 * 3_600_000).toISOString()
    const in12h  = new Date(now.getTime() + 12 * 3_600_000).toISOString()
    const nowStr = now.toISOString()

    const s7d = new Date(now.getTime() - 7 * 24 * 3_600_000).toISOString()

    const [
      { data: pVAs }, { data: pClients }, { data: pReqs },
      { data: onHold }, { data: overdues }, { data: failed }, { data: expiring },
      { data: promptReqs }, { data: customReqData },
    ] = await Promise.all([
      supabase.from('vas').select('id, name, country, joined_at').eq('status', 'pending_approval').order('joined_at', { ascending: false }),
      supabase.from('clients').select('id, store_name, created_at, va_id, vas(name)').eq('approval_status', 'pending').order('created_at', { ascending: false }),
      supabase.from('profile_change_requests').select('id, va_id, request_text, created_at, vas(name)').eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('uploads').select('id, store_name, error_message, uploaded_at').eq('status', 'on_hold').order('uploaded_at', { ascending: false }),
      supabase.from('billing').select('id, va_id, va_name, total_amount, due_date').eq('status', 'overdue').order('due_date', { ascending: true }),
      supabase.from('uploads').select('id, store_name, error_message, vas(name)').eq('status', 'failed').gte('processing_completed_at', s24h).order('processing_completed_at', { ascending: false }),
      supabase.from('clients').select('id, store_name, deadline_48h, va_id, vas(name)').eq('approval_status', 'approved').eq('is_active', true).not('deadline_48h', 'is', null).lte('deadline_48h', in12h).gte('deadline_48h', nowStr).order('deadline_48h', { ascending: true }),
      supabase.from('prompt_requests').select('id, client_id, va_id, message, created_at, clients(store_name), vas(name)').eq('status', 'submitted').order('created_at', { ascending: true }).limit(10),
      supabase.from('client_profiles').select('client_id, created_at, clients!inner(store_name, va_id, vas!inner(name))').eq('custom_requirements', true).gte('created_at', s7d).order('created_at', { ascending: false }).limit(5),
    ])

    const items: AttentionItem[] = []

    const va0 = (pVAs ?? [])
    if (va0.length) {
      const f = va0[0]
      items.push({ key: 'pending_vas', count: va0.length, label: `${va0.length} VA${va0.length !== 1 ? "'s" : ''} waiting for approval`, preview: `${f.name}${f.country ? ` from ${f.country}` : ''}, submitted ${timeAgo(f.joined_at)}`, href: '/admin/vas' })
    }

    type ClientR = { id: string; store_name: string; created_at: string; va_id: string; vas: { name: string } | null }
    const cl0 = (pClients ?? []) as unknown as ClientR[]
    if (cl0.length) {
      const f = cl0[0]
      items.push({ key: 'pending_clients', count: cl0.length, label: `${cl0.length} client${cl0.length !== 1 ? 's' : ''} waiting for approval`, preview: `${f.store_name}${f.vas ? ` for ${f.vas.name}` : ''}, submitted ${timeAgo(f.created_at)}`, href: '/admin/approvals' })
    }

    type ReqR = { id: string; va_id: string; request_text: string; created_at: string; vas: { name: string } | null }
    const rq0 = (pReqs ?? []) as unknown as ReqR[]
    if (rq0.length) {
      const f = rq0[0]
      const prev = f.request_text.slice(0, 40) + (f.request_text.length > 40 ? '…' : '')
      items.push({ key: 'pending_requests', count: rq0.length, label: `${rq0.length} profile change request${rq0.length !== 1 ? 's' : ''} pending`, preview: `${f.vas?.name ?? 'VA'}: ${prev}`, href: '/admin/requests' })
    }

    const oh0 = onHold ?? []
    if (oh0.length) {
      const f = oh0[0]
      items.push({ key: 'on_hold', count: oh0.length, label: `${oh0.length} upload${oh0.length !== 1 ? 's' : ''} on hold`, preview: `${f.store_name ?? 'Unknown'}: instructions flagged${f.error_message ? ` — ${f.error_message.slice(0, 40)}` : ''}`, href: '/admin/logs' })
    }

    const ov0 = overdues ?? []
    if (ov0.length) {
      const total = ov0.reduce((s, x) => s + (x.total_amount ?? 0), 0)
      const f = ov0[0]
      const days = Math.floor((Date.now() - new Date(f.due_date as string).getTime()) / 86_400_000)
      items.push({ key: 'overdue_invoices', count: ov0.length, totalAmount: total, label: `${ov0.length} overdue invoice${ov0.length !== 1 ? 's' : ''} totaling ${fmtDollar(total)}`, preview: `${f.va_name}: ${fmtDollar(f.total_amount ?? 0)}, ${days} day${days !== 1 ? 's' : ''} overdue`, href: '/admin/billing' })
    }

    type FailR = { id: string; store_name: string | null; error_message: string | null; vas: { name: string } | null }
    const fa0 = (failed ?? []) as unknown as FailR[]
    if (fa0.length) {
      const f = fa0[0]
      items.push({ key: 'failed_uploads', count: fa0.length, label: `${fa0.length} upload${fa0.length !== 1 ? 's' : ''} failed in the last 24 hours`, preview: `${f.store_name ?? 'Unknown'}${f.vas ? ` for ${f.vas.name}` : ''}${f.error_message ? `: ${f.error_message.slice(0, 40)}` : ''}`, href: '/admin/logs' })
    }

    type ExpR = { id: string; store_name: string; deadline_48h: string; va_id: string; vas: { name: string } | null }
    const ex0 = (expiring ?? []) as unknown as ExpR[]
    if (ex0.length) {
      const f = ex0[0]
      const hrs = Math.max(0, Math.floor((new Date(f.deadline_48h).getTime() - Date.now()) / 3_600_000))
      items.push({ key: 'expiring_deadlines', count: ex0.length, label: `${ex0.length} client${ex0.length !== 1 ? 's' : ''} about to expire (48h deadline)`, preview: `${f.store_name}${f.vas ? ` for ${f.vas.name}` : ''}: expires in ${hrs}h`, href: '/admin/approvals' })
    }

    type PromptReqR = { id: string; client_id: string; va_id: string; message: string | null; created_at: string; clients: { store_name: string } | null; vas: { name: string } | null }
    const pr0 = (promptReqs ?? []) as unknown as PromptReqR[]
    if (pr0.length) {
      const f = pr0[0]
      const preview = f.message ? `"${f.message.slice(0, 40)}${f.message.length > 40 ? '…' : ''}"` : 'No message'
      items.push({ key: 'prompt_requests', count: pr0.length, label: `${pr0.length} optimization request${pr0.length !== 1 ? 's' : ''} pending review`, preview: `${f.clients?.store_name ?? '—'} via ${f.vas?.name ?? '—'}: ${preview}`, href: '/admin/clients' })
    }

    type CustomReqR = { client_id: string; created_at: string; clients: { store_name: string; va_id: string; vas: { name: string } } | null }
    const cr0 = (customReqData ?? []) as unknown as CustomReqR[]
    if (cr0.length) {
      const f = cr0[0]
      items.push({ key: 'custom_requirements', count: cr0.length, label: `${cr0.length} new client${cr0.length !== 1 ? 's' : ''} with custom listing requirements (last 7 days)`, preview: `${f.clients?.store_name ?? '—'} via ${f.clients?.vas?.name ?? '—'}, submitted ${timeAgo(f.created_at)}`, href: '/admin/clients' })
    }

    setAttention(items)
  }, [])

  // ── Load: recent activity ───────────────────────────────────────────────────
  const loadActivity = useCallback(async () => {
    const { data } = await supabase
      .from('activity_log')
      .select('id, action, details, source, severity, va_id, created_at')
      .neq('action', 'api_call_made')
      .order('created_at', { ascending: false })
      .limit(15)
    setActivity((data ?? []) as LogEntry[])
  }, [])

  // ── Load: VA overview ────────────────────────────────────────────────────────
  const loadVAs = useCallback(async ({ from, to }: DateRange) => {
    let uploadQ = supabase.from('uploads').select('va_id, product_row_count').eq('status', 'done')
    if (from) uploadQ = uploadQ.gte('processing_completed_at', from)
    if (to)   uploadQ = uploadQ.lte('processing_completed_at', to)
    let billingQ = supabase.from('billing').select('va_id, total_amount').eq('status', 'paid')
    if (from) billingQ = billingQ.gte('paid_at', from)
    if (to)   billingQ = billingQ.lte('paid_at', to)

    const [{ data: allVAs }, { data: uploads }, { data: billing }, { data: clientCounts }] = await Promise.all([
      supabase.from('vas').select('id, name, country, status').order('name'),
      uploadQ,
      billingQ,
      supabase.from('clients').select('va_id').eq('approval_status', 'approved'),
    ])

    const vas = allVAs ?? []
    setVASummary({ active: vas.filter(v => v.status === 'active').length, pending: vas.filter(v => v.status === 'pending_approval').length, total: vas.length })

    const uploadAgg: Record<string, { variants: number; uploads: number }> = {}
    for (const u of uploads ?? []) {
      if (!uploadAgg[u.va_id]) uploadAgg[u.va_id] = { variants: 0, uploads: 0 }
      uploadAgg[u.va_id].variants += u.product_row_count ?? 0
      uploadAgg[u.va_id].uploads  += 1
    }
    const revenueAgg: Record<string, number> = {}
    for (const b of billing ?? []) revenueAgg[b.va_id] = (revenueAgg[b.va_id] ?? 0) + (b.total_amount ?? 0)
    const clientAgg: Record<string, number> = {}
    for (const c of clientCounts ?? []) clientAgg[c.va_id] = (clientAgg[c.va_id] ?? 0) + 1

    const rows: VARow[] = vas
      .filter(v => uploadAgg[v.id] || revenueAgg[v.id])
      .map(v => ({ id: v.id, name: v.name, country: v.country, status: v.status, clients: clientAgg[v.id] ?? 0, variants: uploadAgg[v.id]?.variants ?? 0, uploads: uploadAgg[v.id]?.uploads ?? 0, revenue: revenueAgg[v.id] ?? 0 }))
      .sort((a, b) => b.variants - a.variants)

    setVATotal(rows.length)
    setVARows(rows.slice(0, 10))
  }, [])

  // ── Load: top clients ────────────────────────────────────────────────────────
  const loadClients = useCallback(async ({ from, to }: DateRange) => {
    let uploadQ = supabase.from('uploads').select('client_id, va_id, product_row_count').eq('status', 'done')
    if (from) uploadQ = uploadQ.gte('processing_completed_at', from)
    if (to)   uploadQ = uploadQ.lte('processing_completed_at', to)

    const { data: uploads } = await uploadQ
    if (!uploads?.length) { setClientRows([]); setClientTotal(0); return }

    const clientIds = [...new Set(uploads.map(u => u.client_id).filter(Boolean))] as string[]
    const { data: clients } = await supabase
      .from('clients').select('id, store_name, niche, va_id, vas(name)').in('id', clientIds.slice(0, 200))

    type ClientQ = { id: string; store_name: string; niche: string | null; va_id: string; vas: { name: string } | null }
    const clientMap: Record<string, { store_name: string; niche: string | null; va_name: string }> = {}
    for (const c of (clients ?? []) as unknown as ClientQ[]) clientMap[c.id] = { store_name: c.store_name, niche: c.niche, va_name: c.vas?.name ?? '' }

    const agg: Record<string, { variants: number }> = {}
    for (const u of uploads) {
      if (!u.client_id) continue
      if (!agg[u.client_id]) agg[u.client_id] = { variants: 0 }
      agg[u.client_id].variants += u.product_row_count ?? 0
    }

    const rows: ClientRow[] = Object.entries(agg)
      .filter(([id]) => clientMap[id])
      .map(([id, a]) => {
        const c = clientMap[id]
        return { id, store_name: c.store_name, va_name: c.va_name, niche: c.niche, variants: a.variants, tier: tierLabel(a.variants), revenue: tierAmount(a.variants) }
      })
      .sort((a, b) => b.variants - a.variants)

    setClientTotal(rows.length)
    setClientRows(rows.slice(0, 10))
  }, [])

  // ── Load: financial ──────────────────────────────────────────────────────────
  const loadFinancial = useCallback(async () => {
    const from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const [
      { data: billing }, { data: monthUploads },
      { data: affPayouts }, { data: refCodes }, { data: affs },
    ] = await Promise.all([
      supabase.from('billing').select('status, total_amount').gte('generated_at', from),
      supabase.from('uploads').select('api_cost_usd, product_row_count').eq('status', 'done').gte('processing_completed_at', from),
      supabase.from('affiliate_payouts').select('payout_amount').eq('status', 'pending'),
      supabase.from('referral_codes').select('va_id').eq('is_active', true),
      supabase.from('affiliates').select('id').eq('is_active', true),
    ])

    const b = billing ?? [], u = monthUploads ?? []
    const invoiced    = b.reduce((s, x) => s + (x.total_amount ?? 0), 0)
    const collected   = b.filter(x => x.status === 'paid').reduce((s, x) => s + (x.total_amount ?? 0), 0)
    const outstanding = b.filter(x => x.status === 'outstanding').reduce((s, x) => s + (x.total_amount ?? 0), 0)
    const overdue     = b.filter(x => x.status === 'overdue').reduce((s, x) => s + (x.total_amount ?? 0), 0)
    const apiCost     = u.reduce((s, x) => s + (x.api_cost_usd ?? 0), 0)
    const variants    = u.reduce((s, x) => s + (x.product_row_count ?? 0), 0)
    const affiliateOwed   = (affPayouts ?? []).reduce((s, x) => s + (x.payout_amount ?? 0), 0)
    const activeReferrers = (refCodes ?? []).length
    const totalReferrals  = (affs ?? []).length

    setFinancial({
      invoiced, collected, outstanding, overdue, apiCost,
      avgCostPerUpload:  u.length   > 0 ? apiCost / u.length   : 0,
      avgCostPerVariant: variants   > 0 ? apiCost / variants    : 0,
      cachedPct: 0,
      affiliateOwed, activeReferrers, totalReferrals,
      avgPayout: activeReferrers > 0 ? affiliateOwed / activeReferrers : 0,
    })
  }, [])

  // ── Load: system health ──────────────────────────────────────────────────────
  const loadHealth = useCallback(async () => {
    const s24h     = new Date(Date.now() - 24 * 3_600_000).toISOString()
    const todayStr = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
    const [
      { count: queuedCount }, { data: processingUploads }, { count: failed24h }, { data: todayUploads },
    ] = await Promise.all([
      supabase.from('uploads').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
      supabase.from('uploads').select('id, store_name, product_row_count, processing_started_at, vas(name)').eq('status', 'processing').order('processing_started_at', { ascending: true }),
      supabase.from('uploads').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('processing_completed_at', s24h),
      supabase.from('uploads').select('processing_time_seconds').eq('status', 'done').gte('processing_completed_at', todayStr).not('processing_time_seconds', 'is', null),
    ])

    const times = (todayUploads ?? []).map(u => u.processing_time_seconds as number).filter(t => t > 0)
    const avgTime = times.length ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : 0

    type ProcU = { id: string; store_name: string | null; product_row_count: number | null; processing_started_at: string | null; vas: { name: string } | null }
    const current = ((processingUploads ?? []) as unknown as ProcU[]).map(u => ({
      store:    u.store_name ?? 'Unknown',
      va:       u.vas?.name ?? 'Unknown',
      variants: u.product_row_count ?? 0,
      secs:     u.processing_started_at ? Math.floor((Date.now() - new Date(u.processing_started_at).getTime()) / 1000) : 0,
    }))

    setHealth({ queued: queuedCount ?? 0, processing: current.length, failed24h: failed24h ?? 0, avgTime, current })
  }, [])

  // ── Load all ─────────────────────────────────────────────────────────────────
  const loadAll = useCallback(async (r: DateRange) => {
    await Promise.all([loadStats(r), loadAttention(), loadActivity(), loadVAs(r), loadClients(r), loadFinancial(), loadHealth()])
  }, [loadStats, loadAttention, loadActivity, loadVAs, loadClients, loadFinancial, loadHealth])

  useEffect(() => { loadAll(computeRange(period, customFrom, customTo)) }, [period, customFrom, customTo, loadAll]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh
  useEffect(() => {
    const slow = setInterval(() => { const r = rangeRef.current; Promise.all([loadStats(r), loadActivity(), loadVAs(r), loadClients(r), loadFinancial()]) }, 60_000)
    const fast = setInterval(() => { loadAttention(); loadHealth() }, 30_000)
    return () => { clearInterval(slow); clearInterval(fast) }
  }, [loadStats, loadAttention, loadActivity, loadVAs, loadClients, loadFinancial, loadHealth])

  // Realtime activity
  useEffect(() => {
    const ch = supabase.channel('dash_activity')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, (payload) => {
        const e = payload.new as LogEntry
        if (e.action === 'api_call_made') return
        setActivity(prev => [e, ...prev].slice(0, 15))
      })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [])

  // ── Quick actions ─────────────────────────────────────────────────────────────
  async function runAction(key: ActionKey, endpoint: string, method = 'POST') {
    setActions(p => ({ ...p, [key]: 'running' }))
    try {
      const res = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' } })
      if (!res.ok) throw new Error()
      setActions(p => ({ ...p, [key]: 'done' }))
      setTimeout(() => setActions(p => ({ ...p, [key]: 'idle' })), 3000)
      loadAttention(); loadHealth()
    } catch {
      setActions(p => ({ ...p, [key]: 'error' }))
      setTimeout(() => setActions(p => ({ ...p, [key]: 'idle' })), 3000)
    }
  }

  async function exportCSV(type: string) {
    setShowExport(false)
    let rows: Record<string, unknown>[] = []
    if (type === 'vas')      { const { data } = await supabase.from('vas').select('*').order('name');                                       rows = (data ?? []) as Record<string, unknown>[] }
    else if (type === 'clients')  { const { data } = await supabase.from('clients').select('*').order('store_name');                        rows = (data ?? []) as Record<string, unknown>[] }
    else if (type === 'uploads')  { const { data } = await supabase.from('uploads').select('id,va_id,client_id,store_name,status,product_row_count,uploaded_at,processing_completed_at,api_cost_usd').order('uploaded_at', { ascending: false }).limit(5000); rows = (data ?? []) as Record<string, unknown>[] }
    else if (type === 'invoices') { const { data } = await supabase.from('billing').select('*').order('generated_at', { ascending: false }); rows = (data ?? []) as Record<string, unknown>[] }
    else if (type === 'activity') { const { data } = await supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(1000); rows = (data ?? []) as Record<string, unknown>[] }
    if (!rows.length) return
    const blob = new Blob([toCSV(rows)], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = `${type}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  const today   = new Date()
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const VA_GRID    = '2fr 0.7fr 1.2fr 0.7fr 0.9fr 0.8fr'
  const CLIENT_GRID = '2fr 1.5fr 1fr 1fr 0.4fr 0.9fr'

  return (
    <>
      <style>{`
        @media (max-width: 800px) {
          .dash-stats { grid-template-columns: repeat(2, 1fr) !important; }
          .dash-fin   { grid-template-columns: 1fr !important; }
          .dash-table-wrap { overflow-x: auto; }
        }
        @media (max-width: 600px) {
          .dash-stats { grid-template-columns: 1fr !important; }
          .dash-pad   { padding: 32px 20px 60px !important; }
        }
      `}</style>

      <div className="dash-pad" style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 48px 80px' }}>

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 28, fontWeight: 300, color: T.black }}>Dashboard</div>
          <div style={{ fontSize: 13, color: T.ter }}>{dateStr}</div>
        </div>

        {/* Period selector */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {(['today', 'week', 'month', 'all'] as Period[]).map(p => {
              const active = period === p
              const label  = p === 'today' ? 'Today' : p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'All Time'
              return (
                <button key={p} onClick={() => { setPeriod(p); setShowCustom(false) }} style={{ padding: '5px 16px', borderRadius: 100, fontSize: 12, background: active ? T.black : 'none', color: active ? T.bg : T.ter, border: `1px solid ${active ? T.black : '#EEEEEE'}`, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                  {label}
                </button>
              )
            })}
            {/* Custom pill */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <button onClick={() => { setPeriod('custom'); setShowCustom(true) }} style={{ padding: '5px 16px', borderRadius: 100, fontSize: 12, background: period === 'custom' ? T.black : 'none', color: period === 'custom' ? T.bg : T.ter, border: `1px solid ${period === 'custom' ? T.black : '#EEEEEE'}`, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                Custom
              </button>
              {period === 'custom' && <div style={{ fontSize: 11, color: T.ter, marginTop: 2, paddingLeft: 12 }}>{fmtCustomLabel(customFrom, customTo)}</div>}
            </div>
          </div>
          {/* Custom date inputs */}
          {showCustom && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
              <input type="date" value={inputFrom} onChange={e => setInputFrom(e.target.value)} style={{ fontSize: 12, color: T.black, background: 'none', border: 'none', borderBottom: '1.5px solid #EEEEEE', outline: 'none', padding: '4px 0', fontFamily: 'inherit', cursor: 'pointer' }} onFocus={e => e.target.style.borderBottomColor = T.black} onBlur={e => e.target.style.borderBottomColor = '#EEEEEE'} />
              <span style={{ fontSize: 12, color: T.ter }}>→</span>
              <input type="date" value={inputTo} onChange={e => setInputTo(e.target.value)} style={{ fontSize: 12, color: T.black, background: 'none', border: 'none', borderBottom: '1.5px solid #EEEEEE', outline: 'none', padding: '4px 0', fontFamily: 'inherit', cursor: 'pointer' }} onFocus={e => e.target.style.borderBottomColor = T.black} onBlur={e => e.target.style.borderBottomColor = '#EEEEEE'} />
              <button onClick={() => { setCustomFrom(inputFrom); setCustomTo(inputTo); setShowCustom(false) }} style={{ fontSize: 12, color: T.black, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, padding: '4px 0' }}>Apply</button>
            </div>
          )}
        </div>

        {/* ── Section 1: Core stats ─────────────────────────────────────────── */}
        <div className="dash-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px 48px', marginBottom: 32 }}>
          <StatNum value={stats ? fmtNum(stats.variantsProcessed) : '—'} label="PRODUCTS PROCESSED" />
          <StatNum value={stats ? fmtNum(stats.uploads) : '—'} label="UPLOADS" />
          <StatNum value={stats ? fmtNum(stats.activeVAs) : '—'} label="ACTIVE VA'S" />
          <StatNum value={stats ? fmtDollar(stats.revenue) : '—'} label="REVENUE" />
          <StatNum value={stats ? `$${stats.apiCost.toFixed(2)}` : '—'} label="API COST" color={T.sec} />
          <StatNum
            value={stats ? `${stats.margin.toFixed(1)}%` : '—'} label="MARGIN"
            color={stats ? (stats.margin < 50 ? T.black : stats.margin < 80 ? T.sec : T.black) : T.black}
            weight={stats && stats.margin < 50 ? 700 : 600}
          />
        </div>

        <Divider />

        {/* ── Section 2: Needs attention ────────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <SectionHeader
            label="NEEDS ATTENTION"
            right={<span style={{ fontSize: 12, color: T.ter }}>{attention.length} item{attention.length !== 1 ? 's' : ''}</span>}
          />
          {attention.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 14, color: T.ter }}>✓ All clear. Nothing needs your attention.</div>
          ) : (
            attention.map(item => (
              <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 0', borderBottom: `1px solid ${T.row}` }}>
                <div>
                  <div style={{ fontSize: 14, color: T.black, marginBottom: 3 }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: T.ter }}>{item.preview}</div>
                </div>
                <Link href={item.href} style={{ fontSize: 12, color: T.black, textDecoration: 'underline', whiteSpace: 'nowrap', marginLeft: 16, flexShrink: 0 }}>
                  {item.key === 'overdue_invoices' || item.key === 'failed_uploads' || item.key === 'on_hold' ? 'View →' : 'Review →'}
                </Link>
              </div>
            ))
          )}
        </div>

        <Divider />

        {/* ── Section 3: Recent activity ────────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <SectionHeader
            label="RECENT ACTIVITY"
            right={
              <Link href="/admin/logs" style={{ fontSize: 12, color: T.ter, textDecoration: 'none', transition: 'color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.color = T.black}
                onMouseLeave={e => e.currentTarget.style.color = T.ter}
              >View all →</Link>
            }
          />
          {activity.length === 0 ? (
            <div style={{ fontSize: 13, color: T.ter }}>No recent activity.</div>
          ) : (
            activity.map(entry => {
              const dot = entry.severity ? SEV_DOT[entry.severity] : null
              return (
                <div
                  key={entry.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${T.row}`, cursor: 'pointer', transition: 'opacity 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.6'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  onClick={() => window.location.href = '/admin/logs'}
                >
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: T.ter, minWidth: 38, flexShrink: 0 }}>
                    {new Date(entry.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </span>
                  {dot
                    ? <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                    : <span style={{ width: 6, flexShrink: 0 }} />
                  }
                  <span style={{ fontSize: 9, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ter, minWidth: 34, flexShrink: 0 }}>
                    {SRC_LABEL[entry.source ?? ''] ?? (entry.source ?? '')}
                  </span>
                  <span style={{ fontSize: 13, color: T.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(entry.details ?? entry.action ?? '').slice(0, 80)}
                  </span>
                </div>
              )
            })
          )}
        </div>

        <Divider />

        {/* ── Section 4: VA overview ────────────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <SectionHeader
            label="VA'S"
            right={
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: T.ter }}>
                <span>{vaSummary.active} active · {vaSummary.pending} pending · {vaSummary.total} total</span>
                <Link href="/admin/vas" style={{ color: T.ter, textDecoration: 'none' }}
                  onMouseEnter={e => e.currentTarget.style.color = T.black}
                  onMouseLeave={e => e.currentTarget.style.color = T.ter}
                >Manage →</Link>
              </div>
            }
          />
          <div className="dash-table-wrap">
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: VA_GRID, padding: '0 0 8px', borderBottom: `1px solid ${T.row}`, marginBottom: 2, minWidth: 600 }}>
              {['VA', 'Clients', 'Products', 'Uploads', 'Revenue', 'Status'].map(c => (
                <div key={c} style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ter }}>{c}</div>
              ))}
            </div>
            {vaRows.length === 0
              ? <div style={{ fontSize: 13, color: T.ter, padding: '12px 0' }}>No activity in this period.</div>
              : vaRows.map(va => (
                <div key={va.id} style={{ display: 'grid', gridTemplateColumns: VA_GRID, padding: '12px 0', borderBottom: `1px solid ${T.row}`, transition: 'opacity 0.15s', minWidth: 600 }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.6'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: T.black }}>{va.name}</div>
                    {va.country && <div style={{ fontSize: 11, color: T.ter }}>{va.country}</div>}
                  </div>
                  <div style={{ fontSize: 13, color: T.black, display: 'flex', alignItems: 'center' }}>{va.clients}</div>
                  <div style={{ fontSize: 13, color: T.black, display: 'flex', alignItems: 'center' }}>{fmtNum(va.variants)}</div>
                  <div style={{ fontSize: 13, color: T.black, display: 'flex', alignItems: 'center' }}>{va.uploads}</div>
                  <div style={{ fontSize: 13, color: T.black, display: 'flex', alignItems: 'center' }}>{fmtDollar(va.revenue)}</div>
                  <div style={{ fontSize: 13, color: va.status === 'active' ? T.black : T.sec, display: 'flex', alignItems: 'center', textTransform: 'capitalize' }}>{va.status.replace(/_/g, ' ')}</div>
                </div>
              ))
            }
          </div>
          {vaTotal > 10 && (
            <div style={{ marginTop: 12 }}>
              <Link href="/admin/vas" style={{ fontSize: 12, color: T.ter, textDecoration: 'none' }}
                onMouseEnter={e => e.currentTarget.style.color = T.black}
                onMouseLeave={e => e.currentTarget.style.color = T.ter}
              >View all {vaTotal} VA&apos;s →</Link>
            </div>
          )}
        </div>

        {/* ── Section 5: Top clients ─────────────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <SectionHeader
            label="TOP CLIENTS"
            right={
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: T.ter }}>
                <span>{clientTotal} active</span>
                <Link href="/admin/clients" style={{ color: T.ter, textDecoration: 'none' }}
                  onMouseEnter={e => e.currentTarget.style.color = T.black}
                  onMouseLeave={e => e.currentTarget.style.color = T.ter}
                >Manage →</Link>
              </div>
            }
          />
          <div className="dash-table-wrap">
            <div style={{ display: 'grid', gridTemplateColumns: CLIENT_GRID, padding: '0 0 8px', borderBottom: `1px solid ${T.row}`, marginBottom: 2, minWidth: 620 }}>
              {['Client', 'VA', 'Niche', 'Products', 'Tier', 'Revenue'].map(c => (
                <div key={c} style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ter }}>{c}</div>
              ))}
            </div>
            {clientRows.length === 0
              ? <div style={{ fontSize: 13, color: T.ter, padding: '12px 0' }}>No activity in this period.</div>
              : clientRows.map(c => (
                <div key={c.id} style={{ display: 'grid', gridTemplateColumns: CLIENT_GRID, padding: '12px 0', borderBottom: `1px solid ${T.row}`, transition: 'opacity 0.15s', minWidth: 620 }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.6'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  <div style={{ fontSize: 13, fontWeight: 500, color: T.black, display: 'flex', alignItems: 'center' }}>{c.store_name}</div>
                  <div style={{ fontSize: 13, color: T.sec, display: 'flex', alignItems: 'center' }}>{c.va_name}</div>
                  <div style={{ fontSize: 12, color: T.sec, display: 'flex', alignItems: 'center', textTransform: 'capitalize' }}>{c.niche?.replace(/_/g, ' ') ?? '—'}</div>
                  <div style={{ fontSize: 13, color: T.black, display: 'flex', alignItems: 'center' }}>{fmtNum(c.variants)}</div>
                  <div style={{ fontSize: 12, color: T.ter, display: 'flex', alignItems: 'center' }}>{c.tier}</div>
                  <div style={{ fontSize: 13, color: T.black, display: 'flex', alignItems: 'center' }}>{fmtDollar(c.revenue)}</div>
                </div>
              ))
            }
          </div>
          {clientTotal > 10 && (
            <div style={{ marginTop: 12 }}>
              <Link href="/admin/clients" style={{ fontSize: 12, color: T.ter, textDecoration: 'none' }}
                onMouseEnter={e => e.currentTarget.style.color = T.black}
                onMouseLeave={e => e.currentTarget.style.color = T.ter}
              >View all {clientTotal} clients →</Link>
            </div>
          )}
        </div>

        <Divider />

        {/* ── Section 6: Financial ──────────────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <SectionHeader
            label="FINANCIAL"
            right={
              <Link href="/admin/billing" style={{ fontSize: 12, color: T.ter, textDecoration: 'none' }}
                onMouseEnter={e => e.currentTarget.style.color = T.black}
                onMouseLeave={e => e.currentTarget.style.color = T.ter}
              >Full report →</Link>
            }
          />
          <div className="dash-fin" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 48 }}>
            <div>
              <div style={{ fontSize: 11, color: T.ter, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>This Month</div>
              <FinLine label="Invoiced"    value={financial ? fmtDollar(financial.invoiced)    : '—'} />
              <FinLine label="Collected"   value={financial ? fmtDollar(financial.collected)   : '—'} />
              <FinLine label="Outstanding" value={financial ? fmtDollar(financial.outstanding) : '—'} color={T.sec} />
              <FinLine label="Overdue"     value={financial ? fmtDollar(financial.overdue)     : '—'} color={financial && financial.overdue > 0 ? T.black : T.sec} weight={financial && financial.overdue > 0 ? 500 : 400} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.ter, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Costs</div>
              <FinLine label="API costs"        value={financial ? `$${financial.apiCost.toFixed(4)}`           : '—'} />
              <FinLine label="Avg cost/upload"  value={financial ? `$${financial.avgCostPerUpload.toFixed(4)}`  : '—'} color={T.sec} />
              <FinLine label="Avg cost/product" value={financial ? `$${financial.avgCostPerVariant.toFixed(6)}` : '—'} color={T.sec} />
              <FinLine label="Cached tokens"    value={financial ? `${financial.cachedPct.toFixed(1)}%`         : '—'} color={T.sec} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.ter, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Affiliate Payouts</div>
              <FinLine label="Total owed"          value={financial ? fmtDollar(financial.affiliateOwed)   : '—'} />
              <FinLine label="Active referrers"    value={financial ? String(financial.activeReferrers)    : '—'} color={T.sec} />
              <FinLine label="Total referrals"     value={financial ? String(financial.totalReferrals)     : '—'} color={T.sec} />
              <FinLine label="Avg payout/referrer" value={financial ? fmtDollar(financial.avgPayout)       : '—'} color={T.sec} />
            </div>
          </div>
        </div>

        <Divider />

        {/* ── Section 7: System health ──────────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <SectionHeader label="SYSTEM" />
          <div style={{ display: 'flex', gap: 28, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <HealthStat label="Queue"        value={health?.queued     ?? 0} warn={10} />
            <HealthStat label="Processing"   value={health?.processing ?? 0} warn={10} />
            <HealthStat label="Failed (24h)" value={health?.failed24h  ?? 0} warn={5}  red />
            <span style={{ fontSize: 13, color: health?.avgTime ? T.black : T.ter }}>
              Avg time: {health?.avgTime ? `${health.avgTime}s` : '—'}
            </span>
          </div>
          {health?.current && health.current.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {health.current.map((p, i) => (
                <div key={i} style={{ fontSize: 12, color: T.sec, marginBottom: 3 }}>
                  Currently processing: {p.store} for {p.va} ({fmtNum(p.variants)} products, started {p.secs}s ago)
                </div>
              ))}
            </div>
          )}
        </div>

        <Divider />

        {/* ── Section 8: Quick actions ──────────────────────────────────────── */}
        <div>
          <SectionHeader label="QUICK ACTIONS" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>

            <ActionBtn label="Generate invoices" state={actions.invoices} onClick={() => setShowInvModal(true)} />
            <ActionBtn label="Check deadlines"   state={actions.deadlines} onClick={() => runAction('deadlines', '/api/check-deadlines', 'POST')} />
            <ActionBtn label="Check overdue"     state={actions.overdue}   onClick={() => runAction('overdue', '/api/billing/check-overdue', 'GET')} />
            <ActionBtn label="Calculate payouts" state={actions.payouts}   onClick={() => runAction('payouts', '/api/affiliates/calculate-payouts', 'POST')} />

            {/* Export dropdown */}
            <div ref={exportRef} style={{ position: 'relative' }}>
              <ActionBtn label="Export data ▾" state="idle" onClick={() => setShowExport(p => !p)} />
              {showExport && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, background: T.bg, border: `1px solid ${T.ghost}`, borderRadius: 10, minWidth: 180, boxShadow: '0 4px 16px rgba(0,0,0,0.08)', zIndex: 20, overflow: 'hidden' }}>
                  {[
                    { key: 'vas',      label: "VA's (CSV)" },
                    { key: 'clients',  label: 'Clients (CSV)' },
                    { key: 'uploads',  label: 'Uploads (CSV)' },
                    { key: 'invoices', label: 'Invoices (CSV)' },
                    { key: 'activity', label: 'Activity log (CSV)' },
                  ].map(opt => (
                    <button key={opt.key} onClick={() => exportCSV(opt.key)}
                      style={{ display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left', fontSize: 13, color: T.black, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = T.row}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Invoice confirmation modal ─────────────────────────────────────────── */}
      {showInvModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowInvModal(false)}
        >
          <div style={{ background: T.bg, borderRadius: 16, padding: 32, maxWidth: 400, width: '100%', margin: 24 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 500, color: T.black, marginBottom: 8 }}>Generate invoices</div>
            <div style={{ fontSize: 14, color: T.sec, marginBottom: 24 }}>
              Generate invoices for {getPrevMonthLabel()}?
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowInvModal(false)}
                style={{ padding: '9px 20px', borderRadius: 8, border: `1px solid ${T.ghost}`, background: 'none', fontSize: 13, color: T.sec, cursor: 'pointer', fontFamily: 'inherit' }}
              >Cancel</button>
              <button onClick={() => { setShowInvModal(false); runAction('invoices', '/api/billing/generate-invoices', 'POST') }}
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: T.black, color: T.bg, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
              >Generate</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
