'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Tokens ───────────────────────────────────────────────────────────────────
const T = {
  black: '#111111', sec: '#999999', ter: '#CCCCCC', ghost: '#DDDDDD',
  div: '#F0F0F0', row: '#FAFAFA', bg: '#FFFFFF',
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Period = 'today' | 'week' | 'month' | 'all' | 'custom'
type DateRange = { from: string | null; to: string | null }
type SortDir = 'asc' | 'desc'

type CoreMetrics = {
  variantsProcessed: number; uniqueProducts: number; uploads: number
  activeVAs: number; activeClients: number
  revenueInvoiced: number; revenueCollected: number; apiCosts: number
  affiliatePayouts: number; netMargin: number
}

type DailyRow = {
  key: string; label: string; variants: number; products: number
  uploads: number; vas: number; revenue: number; apiCost: number; margin: number
}

type VAPerfRow = {
  id: string; name: string; country: string | null; status: string
  clients: number; variants: number; uploads: number; revenue: number
  apiCost: number; profit: number; avgTime: number; failRate: number
}

type ClientBreak = { id: string; store_name: string; variants: number; uploads: number; tier: string }

type ClientPerfRow = {
  id: string; store_name: string; va_name: string; niche: string | null; market: string | null
  variants: number; products: number; uploads: number; tier: string; revenue: number; apiCost: number
}

type NicheRow  = { niche: string; clients: number; variants: number; revenue: number; pct: number }
type MarketRow = { market: string; clients: number; vas: number; variants: number; revenue: number; pct: number }
type TierRow   = { tier: string; range: string; price: number; clients: number; revenue: number; pct: number }

type ProcStats = {
  avgTime: number; fastestTime: number; fastestStore: string
  slowestTime: number; slowestStore: string; avgTimePerVariantMs: number
  successRate: number; partialSuccess: number; totalFailed: number; variantsFailed: number
  avgCostPerUpload: number; avgCostPerVariant: number; avgCostPerProduct: number
  cacheHitRate: number; totalTokens: number; inputTokens: number; outputTokens: number; cachedTokens: number
}

type GrowthData = {
  cur: { vas: number; clients: number; variants: number; revenue: number; avgRevPerVA: number }
  prv: { vas: number; clients: number; variants: number; revenue: number; avgRevPerVA: number }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getStandardFrom(period: Exclude<Period, 'custom'>): string | null {
  const now = new Date()
  if (period === 'today') { const d = new Date(now); d.setHours(0,0,0,0); return d.toISOString() }
  if (period === 'week') {
    const d = new Date(now); const day = d.getDay() || 7
    d.setDate(d.getDate() - day + 1); d.setHours(0,0,0,0); return d.toISOString()
  }
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  return null
}

function computeRange(period: Period, cfrom: string, cto: string): DateRange {
  if (period === 'custom') return { from: cfrom + 'T00:00:00.000Z', to: cto + 'T23:59:59.999Z' }
  return { from: getStandardFrom(period as Exclude<Period, 'custom'>), to: null }
}

function prevRange(period: Period, range: DateRange): DateRange | null {
  if (period === 'all') return null
  const { from, to } = range
  if (!from) return null
  const fromMs = new Date(from).getTime()
  const toMs   = to ? new Date(to).getTime() : Date.now()
  const durMs  = toMs - fromMs
  return { from: new Date(fromMs - durMs).toISOString(), to: new Date(toMs - durMs).toISOString() }
}

function fmtNum(n: number): string { return Math.round(n).toLocaleString('en-US') }
function fmtDollar(n: number): string { return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) }
function fmtDollarSigned(n: number): string { return (n >= 0 ? '' : '−') + fmtDollar(n) }
function tierLabel(v: number): string { return v <= 200 ? 'T1' : v <= 400 ? 'T2' : v <= 1000 ? 'T3' : 'T4' }
function tierAmount(v: number): number { return v <= 200 ? 50 : v <= 400 ? 110 : v <= 1000 ? 220 : 350 }

function fmtCustomLabel(from: string, to: string): string {
  const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(from)} — ${fmt(to)}`
}

function shouldGroupByWeek(range: DateRange): boolean {
  if (!range.from) return true
  const toMs   = range.to ? new Date(range.to).getTime() : Date.now()
  const fromMs = new Date(range.from).getTime()
  return (toMs - fromMs) / 86_400_000 > 60
}

function dayKey(isoDate: string, useWeeks: boolean): string {
  const d = new Date(isoDate)
  if (useWeeks) {
    const day = d.getDay() || 7
    d.setDate(d.getDate() - day + 1); d.setHours(0,0,0,0)
  } else {
    d.setHours(0,0,0,0)
  }
  return d.toISOString().slice(0, 10)
}

function allKeysInRange(range: DateRange, useWeeks: boolean): string[] {
  if (!range.from) return []
  const fromDate = new Date(range.from + (range.from.length === 10 ? 'T00:00:00.000Z' : ''))
  const toDate   = range.to ? new Date(range.to) : new Date()
  fromDate.setHours(0,0,0,0); toDate.setHours(23,59,59,999)
  const keys: string[] = []
  const cur = new Date(fromDate)
  if (useWeeks) {
    const day = cur.getDay() || 7; cur.setDate(cur.getDate() - day + 1); cur.setHours(0,0,0,0)
  }
  while (cur <= toDate) {
    keys.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + (useWeeks ? 7 : 1))
  }
  return keys
}

function keyLabel(key: string, useWeeks: boolean): string {
  const d = new Date(key + 'T12:00:00')
  if (useWeeks) return 'Week of ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function escapeCSV(v: unknown): string {
  const s = String(v ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}
function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const h = Object.keys(rows[0])
  return [h.map(escapeCSV).join(','), ...rows.map(r => h.map(k => escapeCSV(r[k])).join(','))].join('\n')
}

function downloadCSV(rows: Record<string, unknown>[], name: string) {
  const blob = new Blob([toCSV(rows)], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url; a.download = `${name}-${new Date().toISOString().slice(0,10)}.csv`
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
}

function sortRows<T>(rows: T[], col: keyof T, dir: SortDir): T[] {
  return [...rows].sort((a, b) => {
    const av = a[col], bv = b[col]
    if (typeof av === 'number' && typeof bv === 'number') return dir === 'asc' ? av - bv : bv - av
    return dir === 'asc' ? String(av ?? '').localeCompare(String(bv ?? '')) : String(bv ?? '').localeCompare(String(av ?? ''))
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Divider() { return <div style={{ height: 1, background: T.div, margin: '32px 0' }} /> }

function SectionHead({ label, onExport }: { label: string; onExport?: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.12em', color: T.ter }}>{label}</div>
      {onExport && (
        <button onClick={onExport} style={{ fontSize: 12, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = T.black}
          onMouseLeave={e => e.currentTarget.style.color = T.ter}
        >Export CSV →</button>
      )}
    </div>
  )
}

function ColHead({ label, col, sort, onSort }: { label: string; col: string; sort: { col: string; dir: SortDir }; onSort: (c: string) => void }) {
  const active = sort.col === col
  return (
    <div style={{ fontSize: 10, fontWeight: active ? 600 : 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: active ? T.black : T.ter, cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 3 }}
      onClick={() => onSort(col)}
    >
      {label}{active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </div>
  )
}

function Delta({ cur, prv, dollar }: { cur: number; prv: number; dollar?: boolean }) {
  const diff = cur - prv
  const pct  = prv > 0 ? Math.round((diff / prv) * 100) : null
  const pos  = diff >= 0
  const fmt  = dollar ? fmtDollar : fmtNum
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '8px 0', borderBottom: `1px solid ${T.row}` }}>
      <span style={{ fontSize: 13, color: T.ter, minWidth: 120 }}>{fmt(prv)} → {fmt(cur)}</span>
      <span style={{ fontSize: 13, fontWeight: pos ? 400 : 500, color: T.black }}>
        {pos ? '+' : '−'}{fmt(Math.abs(diff))}
        {pct !== null && <span style={{ fontSize: 11, color: T.sec, marginLeft: 4 }}>({pos ? '+' : ''}{pct}%)</span>}
      </span>
    </div>
  )
}

// ─── Period selector (shared UI) ─────────────────────────────────────────────

function PeriodSelector({ period, onChange, cfrom, cto, inputFrom, inputTo, setInputFrom, setInputTo, showCustom, setShowCustom }:
  { period: Period; onChange: (p: Period) => void; cfrom: string; cto: string; inputFrom: string; inputTo: string; setInputFrom: (v: string) => void; setInputTo: (v: string) => void; showCustom: boolean; setShowCustom: (v: boolean) => void; onApply: () => void }
  & { onApply: () => void }
) {
  const pills = [
    { p: 'today' as Period, label: 'Today' },
    { p: 'week'  as Period, label: 'This Week' },
    { p: 'month' as Period, label: 'This Month' },
    { p: 'all'   as Period, label: 'All Time' },
  ]
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {pills.map(({ p, label }) => {
          const active = period === p
          return (
            <button key={p} onClick={() => { onChange(p); setShowCustom(false) }}
              style={{ padding: '5px 16px', borderRadius: 100, fontSize: 12, background: active ? T.black : 'none', color: active ? T.bg : T.ter, border: `1px solid ${active ? T.black : '#EEEEEE'}`, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
            >{label}</button>
          )
        })}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <button onClick={() => { onChange('custom'); setShowCustom(true) }}
            style={{ padding: '5px 16px', borderRadius: 100, fontSize: 12, background: period === 'custom' ? T.black : 'none', color: period === 'custom' ? T.bg : T.ter, border: `1px solid ${period === 'custom' ? T.black : '#EEEEEE'}`, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
          >Custom</button>
          {period === 'custom' && <div style={{ fontSize: 11, color: T.ter, marginTop: 2, paddingLeft: 12 }}>{fmtCustomLabel(cfrom, cto)}</div>}
        </div>
      </div>
      {showCustom && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <input type="date" value={inputFrom} onChange={e => setInputFrom(e.target.value)} style={{ fontSize: 12, color: T.black, background: 'none', border: 'none', borderBottom: '1.5px solid #EEEEEE', outline: 'none', padding: '4px 0', fontFamily: 'inherit' }} onFocus={e => e.target.style.borderBottomColor = T.black} onBlur={e => e.target.style.borderBottomColor = '#EEEEEE'} />
          <span style={{ fontSize: 12, color: T.ter }}>→</span>
          <input type="date" value={inputTo}   onChange={e => setInputTo(e.target.value)}   style={{ fontSize: 12, color: T.black, background: 'none', border: 'none', borderBottom: '1.5px solid #EEEEEE', outline: 'none', padding: '4px 0', fontFamily: 'inherit' }} onFocus={e => e.target.style.borderBottomColor = T.black} onBlur={e => e.target.style.borderBottomColor = '#EEEEEE'} />
          <button onClick={() => { setShowCustom(false) }} style={{ fontSize: 12, color: T.black, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, padding: '4px 0' }}>Apply</button>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [period,     setPeriod]     = useState<Period>('month')
  const defaultFrom = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0,10) })()
  const defaultTo   = new Date().toISOString().slice(0,10)
  const [customFrom, setCustomFrom] = useState(defaultFrom)
  const [customTo,   setCustomTo]   = useState(defaultTo)
  const [inputFrom,  setInputFrom]  = useState(defaultFrom)
  const [inputTo,    setInputTo]    = useState(defaultTo)
  const [showCustom, setShowCustom] = useState(false)
  const [loading,    setLoading]    = useState(true)

  // Data states
  const [core,        setCore]        = useState<CoreMetrics | null>(null)
  const [daily,       setDaily]       = useState<DailyRow[]>([])
  const [dailyUseWk,  setDailyUseWk]  = useState(false)
  const [vaPerf,      setVAPerf]      = useState<VAPerfRow[]>([])
  const [clientPerf,  setClientPerf]  = useState<ClientPerfRow[]>([])
  const [nicheRows,   setNicheRows]   = useState<NicheRow[]>([])
  const [marketRows,  setMarketRows]  = useState<MarketRow[]>([])
  const [showAllMkt,  setShowAllMkt]  = useState(false)
  const [tierDist,    setTierDist]    = useState<TierRow[]>([])
  const [proc,        setProc]        = useState<ProcStats | null>(null)
  const [growth,      setGrowth]      = useState<GrowthData | null>(null)
  const [vaBreaks,    setVABreaks]    = useState<Record<string, ClientBreak[]>>({})
  const [expandedVA,  setExpandedVA]  = useState<string | null>(null)

  // Sort state
  const [vaSort, setVASort]       = useState<{ col: string; dir: SortDir }>({ col: 'variants', dir: 'desc' })
  const [clSort, setClSort]       = useState<{ col: string; dir: SortDir }>({ col: 'variants', dir: 'desc' })

  const rangeRef = useRef<DateRange>(computeRange(period, customFrom, customTo))
  useEffect(() => { rangeRef.current = computeRange(period, customFrom, customTo) }, [period, customFrom, customTo])

  // ── Load all data ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async (range: DateRange) => {
    setLoading(true)
    const { from, to } = range

    // Primary queries in parallel
    let upQ = supabase.from('uploads').select(
      'id,va_id,client_id,status,product_row_count,unique_product_count,api_cost_usd,api_input_tokens,api_output_tokens,api_cached_tokens,processing_time_seconds,processing_completed_at,products_failed,store_name'
    ).in('status', ['done', 'failed', 'on_hold'])
    if (from) upQ = upQ.gte('processing_completed_at', from)
    if (to)   upQ = upQ.lte('processing_completed_at', to)

    let billQ = supabase.from('billing').select('va_id,total_amount,status,paid_at,generated_at')
    if (from) billQ = billQ.gte('generated_at', from)
    if (to)   billQ = billQ.lte('generated_at', to)

    let affQ = supabase.from('affiliate_payouts').select('payout_amount,created_at')
    if (from) affQ = affQ.gte('created_at', from)
    if (to)   affQ = affQ.lte('created_at', to)

    const [
      { data: rawUploads },
      { data: rawBilling },
      { data: rawAff },
      { data: allVAs },
      { data: allClients },
    ] = await Promise.all([
      upQ,
      billQ,
      affQ,
      supabase.from('vas').select('id,name,country,status'),
      supabase.from('clients').select('id,store_name,niche,market,va_id,vas(name)'),
    ])

    const uploads  = (rawUploads  ?? []) as Array<{
      id: string; va_id: string; client_id: string | null; status: string
      product_row_count: number | null; unique_product_count: number | null
      api_cost_usd: number | null; api_input_tokens: number | null
      api_output_tokens: number | null; api_cached_tokens: number | null
      processing_time_seconds: number | null; processing_completed_at: string | null
      products_failed: number | null; store_name: string | null
    }>
    const billing  = rawBilling ?? []
    const affPay   = rawAff     ?? []

    type ClientQ = { id: string; store_name: string; niche: string | null; market: string | null; va_id: string; vas: { name: string } | null }
    const clients  = (allClients ?? []) as unknown as ClientQ[]
    const vasArr   = allVAs ?? []

    const vaMap:     Record<string, { name: string; country: string | null; status: string }> = {}
    const clientMap: Record<string, { store_name: string; niche: string | null; market: string | null; va_id: string; va_name: string }> = {}
    for (const v of vasArr)  vaMap[v.id]     = { name: v.name, country: v.country, status: v.status }
    for (const c of clients) clientMap[c.id] = { store_name: c.store_name, niche: c.niche, market: c.market, va_id: c.va_id, va_name: c.vas?.name ?? '' }

    const doneUploads   = uploads.filter(u => u.status === 'done')
    const failedUploads = uploads.filter(u => u.status === 'failed')

    // ── Core metrics ──────────────────────────────────────────────────────────
    const revenueInvoiced  = billing.reduce((s, b) => s + (b.total_amount ?? 0), 0)
    const revenueCollected = billing.filter(b => b.status === 'paid').reduce((s, b) => s + (b.total_amount ?? 0), 0)
    const apiCosts         = doneUploads.reduce((s, u) => s + (u.api_cost_usd ?? 0), 0)
    const affiliatePayouts = affPay.reduce((s, a) => s + (a.payout_amount ?? 0), 0)
    setCore({
      variantsProcessed: doneUploads.reduce((s, u) => s + (u.product_row_count ?? 0), 0),
      uniqueProducts:    doneUploads.reduce((s, u) => s + (u.unique_product_count ?? 0), 0),
      uploads:           doneUploads.length,
      activeVAs:         new Set(doneUploads.map(u => u.va_id)).size,
      activeClients:     new Set(doneUploads.map(u => u.client_id).filter(Boolean)).size,
      revenueInvoiced, revenueCollected, apiCosts, affiliatePayouts,
      netMargin: revenueCollected - apiCosts - affiliatePayouts,
    })

    // ── Daily breakdown ───────────────────────────────────────────────────────
    const useWk = shouldGroupByWeek(range)
    setDailyUseWk(useWk)
    const keys = allKeysInRange(range, useWk)
    const dailyAgg: Record<string, { variants: number; products: number; uploads: number; vas: Set<string>; apiCost: number }> = {}
    for (const k of keys) dailyAgg[k] = { variants: 0, products: 0, uploads: 0, vas: new Set(), apiCost: 0 }
    for (const u of doneUploads) {
      if (!u.processing_completed_at) continue
      const k = dayKey(u.processing_completed_at, useWk)
      if (!dailyAgg[k]) dailyAgg[k] = { variants: 0, products: 0, uploads: 0, vas: new Set(), apiCost: 0 }
      dailyAgg[k].variants += u.product_row_count ?? 0
      dailyAgg[k].products += u.unique_product_count ?? 0
      dailyAgg[k].uploads  += 1
      dailyAgg[k].vas.add(u.va_id)
      dailyAgg[k].apiCost  += u.api_cost_usd ?? 0
    }
    const revByDay: Record<string, number> = {}
    for (const b of billing.filter(b => b.status === 'paid' && b.paid_at)) {
      const k = dayKey(b.paid_at!, useWk)
      revByDay[k] = (revByDay[k] ?? 0) + (b.total_amount ?? 0)
    }
    const dailyRows: DailyRow[] = keys.map(k => {
      const d = dailyAgg[k] ?? { variants: 0, products: 0, uploads: 0, vas: new Set(), apiCost: 0 }
      const rev = revByDay[k] ?? 0
      return { key: k, label: keyLabel(k, useWk), variants: d.variants, products: d.products, uploads: d.uploads, vas: d.vas.size, revenue: rev, apiCost: d.apiCost, margin: rev - d.apiCost }
    })
    setDaily(dailyRows)

    // ── VA performance ────────────────────────────────────────────────────────
    const vaUpAgg: Record<string, { variants: number; products: number; uploads: number; failed: number; clients: Set<string>; apiCost: number; times: number[] }> = {}
    for (const u of [...doneUploads, ...failedUploads]) {
      if (!vaUpAgg[u.va_id]) vaUpAgg[u.va_id] = { variants: 0, products: 0, uploads: 0, failed: 0, clients: new Set(), apiCost: 0, times: [] }
      if (u.status === 'done') {
        vaUpAgg[u.va_id].variants += u.product_row_count ?? 0
        vaUpAgg[u.va_id].products += u.unique_product_count ?? 0
        vaUpAgg[u.va_id].uploads  += 1
        vaUpAgg[u.va_id].apiCost  += u.api_cost_usd ?? 0
        if (u.client_id) vaUpAgg[u.va_id].clients.add(u.client_id)
        if (u.processing_time_seconds) vaUpAgg[u.va_id].times.push(u.processing_time_seconds)
      } else {
        vaUpAgg[u.va_id].failed += 1
      }
    }
    const vaRevAgg: Record<string, number> = {}
    for (const b of billing) vaRevAgg[b.va_id] = (vaRevAgg[b.va_id] ?? 0) + (b.total_amount ?? 0)

    const vaRows: VAPerfRow[] = Object.entries(vaUpAgg).map(([id, a]) => {
      const va = vaMap[id] ?? { name: id.slice(0, 8), country: null, status: 'unknown' }
      const rev = vaRevAgg[id] ?? 0
      const totalUp = a.uploads + a.failed
      return {
        id, name: va.name, country: va.country, status: va.status,
        clients:  a.clients.size,
        variants: a.variants,
        uploads:  a.uploads,
        revenue:  rev,
        apiCost:  a.apiCost,
        profit:   rev - a.apiCost,
        avgTime:  a.times.length ? Math.round(a.times.reduce((s, t) => s + t, 0) / a.times.length) : 0,
        failRate: totalUp > 0 ? Math.round((a.failed / totalUp) * 100) : 0,
      }
    })
    setVAPerf(vaRows)

    // Build per-VA client breakdown for expand
    const vaClBreak: Record<string, Record<string, ClientBreak>> = {}
    for (const u of doneUploads) {
      if (!u.client_id || !u.va_id) continue
      if (!vaClBreak[u.va_id]) vaClBreak[u.va_id] = {}
      if (!vaClBreak[u.va_id][u.client_id]) {
        const c = clientMap[u.client_id]
        vaClBreak[u.va_id][u.client_id] = { id: u.client_id, store_name: c?.store_name ?? u.client_id.slice(0,8), variants: 0, uploads: 0, tier: 'T1' }
      }
      vaClBreak[u.va_id][u.client_id].variants += u.product_row_count ?? 0
      vaClBreak[u.va_id][u.client_id].uploads  += 1
    }
    const vaBreakMap: Record<string, ClientBreak[]> = {}
    for (const [vid, cls] of Object.entries(vaClBreak)) {
      vaBreakMap[vid] = Object.values(cls).map(c => ({ ...c, tier: tierLabel(c.variants) })).sort((a, b) => b.variants - a.variants)
    }
    setVABreaks(vaBreakMap)

    // ── Client performance ────────────────────────────────────────────────────
    const clAgg: Record<string, { variants: number; products: number; uploads: number; apiCost: number }> = {}
    for (const u of doneUploads) {
      if (!u.client_id) continue
      if (!clAgg[u.client_id]) clAgg[u.client_id] = { variants: 0, products: 0, uploads: 0, apiCost: 0 }
      clAgg[u.client_id].variants += u.product_row_count ?? 0
      clAgg[u.client_id].products += u.unique_product_count ?? 0
      clAgg[u.client_id].uploads  += 1
      clAgg[u.client_id].apiCost  += u.api_cost_usd ?? 0
    }
    const clRows: ClientPerfRow[] = Object.entries(clAgg).map(([id, a]) => {
      const c = clientMap[id]
      return {
        id, store_name: c?.store_name ?? id.slice(0,8), va_name: c?.va_name ?? '',
        niche: c?.niche ?? null, market: c?.market ?? null,
        variants: a.variants, products: a.products, uploads: a.uploads,
        tier: tierLabel(a.variants), revenue: tierAmount(a.variants),
        apiCost: a.apiCost,
      }
    })
    setClientPerf(clRows)

    // ── Niche breakdown ───────────────────────────────────────────────────────
    const nicheClientMap: Record<string, Set<string>> = {}
    const nicheVarMap:    Record<string, number> = {}
    const nicheRevMap:    Record<string, number> = {}
    for (const [cid, a] of Object.entries(clAgg)) {
      const niche = clientMap[cid]?.niche ?? 'other'
      if (!nicheClientMap[niche]) { nicheClientMap[niche] = new Set(); nicheVarMap[niche] = 0; nicheRevMap[niche] = 0 }
      nicheClientMap[niche].add(cid)
      nicheVarMap[niche] += a.variants
      nicheRevMap[niche] += tierAmount(a.variants)
    }
    const totalNicheRev = Object.values(nicheRevMap).reduce((s, v) => s + v, 0)
    const nicheR: NicheRow[] = Object.keys(nicheClientMap).map(n => ({
      niche:    n.charAt(0).toUpperCase() + n.slice(1).replace(/_/g, ' '),
      clients:  nicheClientMap[n].size,
      variants: nicheVarMap[n],
      revenue:  nicheRevMap[n],
      pct:      totalNicheRev > 0 ? Math.round((nicheRevMap[n] / totalNicheRev) * 100) : 0,
    })).sort((a, b) => b.revenue - a.revenue)
    setNicheRows(nicheR)

    // ── Market breakdown ──────────────────────────────────────────────────────
    const mktClients:  Record<string, Set<string>> = {}
    const mktVAs:      Record<string, Set<string>> = {}
    const mktVariants: Record<string, number> = {}
    const mktRevenue:  Record<string, number> = {}
    for (const [cid, a] of Object.entries(clAgg)) {
      const market = clientMap[cid]?.market ?? 'Unknown'
      const vaId   = clientMap[cid]?.va_id ?? ''
      if (!mktClients[market]) { mktClients[market] = new Set(); mktVAs[market] = new Set(); mktVariants[market] = 0; mktRevenue[market] = 0 }
      mktClients[market].add(cid)
      mktVAs[market].add(vaId)
      mktVariants[market] += a.variants
      mktRevenue[market]  += tierAmount(a.variants)
    }
    const totalMktRev = Object.values(mktRevenue).reduce((s, v) => s + v, 0)
    const mktR: MarketRow[] = Object.keys(mktClients).map(m => ({
      market:   m,
      clients:  mktClients[m].size,
      vas:      mktVAs[m].size,
      variants: mktVariants[m],
      revenue:  mktRevenue[m],
      pct:      totalMktRev > 0 ? Math.round((mktRevenue[m] / totalMktRev) * 100) : 0,
    })).sort((a, b) => b.revenue - a.revenue)
    setMarketRows(mktR)

    // ── Tier distribution ─────────────────────────────────────────────────────
    const tierCl  = [0, 0, 0, 0] // T1-T4 client counts
    const tierRev = [0, 0, 0, 0]
    for (const [, a] of Object.entries(clAgg)) {
      const idx = a.variants <= 200 ? 0 : a.variants <= 400 ? 1 : a.variants <= 1000 ? 2 : 3
      tierCl[idx]++; tierRev[idx] += tierAmount(a.variants)
    }
    const totalClients = tierCl.reduce((s, v) => s + v, 0)
    const tierR: TierRow[] = [
      { tier: 'Tier 1', range: '0–200 products · $50',    price: 50,  clients: tierCl[0], revenue: tierRev[0], pct: totalClients > 0 ? Math.round(tierCl[0] / totalClients * 100) : 0 },
      { tier: 'Tier 2', range: '200–400 products · $110', price: 110, clients: tierCl[1], revenue: tierRev[1], pct: totalClients > 0 ? Math.round(tierCl[1] / totalClients * 100) : 0 },
      { tier: 'Tier 3', range: '400–1000 products · $220', price: 220, clients: tierCl[2], revenue: tierRev[2], pct: totalClients > 0 ? Math.round(tierCl[2] / totalClients * 100) : 0 },
      { tier: 'Tier 4', range: '1000+ products · $350',   price: 350, clients: tierCl[3], revenue: tierRev[3], pct: totalClients > 0 ? Math.round(tierCl[3] / totalClients * 100) : 0 },
    ]
    setTierDist(tierR)

    // ── Processing stats ──────────────────────────────────────────────────────
    const times  = doneUploads.map(u => u.processing_time_seconds).filter(t => t != null) as number[]
    const allVars = doneUploads.map(u => u.product_row_count ?? 0)
    const totalVars = allVars.reduce((s, v) => s + v, 0)
    const allProds  = doneUploads.map(u => u.unique_product_count ?? 0).reduce((s, v) => s + v, 0)
    const totalInp = doneUploads.reduce((s, u) => s + (u.api_input_tokens  ?? 0), 0)
    const totalOut = doneUploads.reduce((s, u) => s + (u.api_output_tokens ?? 0), 0)
    const totalCch = doneUploads.reduce((s, u) => s + (u.api_cached_tokens ?? 0), 0)
    const totalFailed = failedUploads.length
    const varsFailed  = failedUploads.reduce((s, u) => s + (u.product_row_count ?? 0), 0)
    const partialSucc = doneUploads.filter(u => (u.products_failed ?? 0) > 0).length

    let fastestStore = '—', slowestStore = '—', fastestTime = 0, slowestTime = 0
    if (times.length) {
      fastestTime = Math.min(...times); slowestTime = Math.max(...times)
      const fu = doneUploads.find(u => u.processing_time_seconds === fastestTime)
      const su = doneUploads.find(u => u.processing_time_seconds === slowestTime)
      fastestStore = fu?.store_name ?? '—'; slowestStore = su?.store_name ?? '—'
    }

    setProc({
      avgTime:           times.length ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : 0,
      fastestTime, fastestStore, slowestTime, slowestStore,
      avgTimePerVariantMs: totalVars > 0 && times.length ? Math.round((times.reduce((s, t) => s + t, 0) / times.length / totalVars) * 1000) : 0,
      successRate:       (doneUploads.length + totalFailed) > 0 ? Math.round(doneUploads.length / (doneUploads.length + totalFailed) * 100) : 100,
      partialSuccess:    partialSucc,
      totalFailed,       variantsFailed: varsFailed,
      avgCostPerUpload:  doneUploads.length > 0 ? apiCosts / doneUploads.length : 0,
      avgCostPerVariant: totalVars > 0 ? apiCosts / totalVars : 0,
      avgCostPerProduct: allProds  > 0 ? apiCosts / allProds  : 0,
      cacheHitRate:      (totalInp + totalCch) > 0 ? Math.round(totalCch / (totalInp + totalCch) * 100) : 0,
      totalTokens: totalInp + totalOut + totalCch, inputTokens: totalInp, outputTokens: totalOut, cachedTokens: totalCch,
    })

    // ── Growth comparison ─────────────────────────────────────────────────────
    const prev = prevRange(period, range)
    if (prev && prev.from) {
      let prevUpQ = supabase.from('uploads').select('va_id,client_id,product_row_count').eq('status', 'done')
      if (prev.from) prevUpQ = prevUpQ.gte('processing_completed_at', prev.from)
      if (prev.to)   prevUpQ = prevUpQ.lte('processing_completed_at', prev.to)
      let prevBilQ = supabase.from('billing').select('va_id,total_amount,status').eq('status', 'paid')
      if (prev.from) prevBilQ = prevBilQ.gte('paid_at', prev.from)
      if (prev.to)   prevBilQ = prevBilQ.lte('paid_at', prev.to)

      const [{ data: pUp }, { data: pBil }] = await Promise.all([prevUpQ, prevBilQ])
      const pUploads = pUp ?? [], pBilling = pBil ?? []
      const pVAs = new Set(pUploads.map(u => u.va_id)).size
      const pClients = new Set(pUploads.map(u => u.client_id).filter(Boolean)).size
      const pVariants = pUploads.reduce((s, u) => s + (u.product_row_count ?? 0), 0)
      const pRevenue  = pBilling.reduce((s, b) => s + (b.total_amount ?? 0), 0)
      const curVAs  = new Set(doneUploads.map(u => u.va_id)).size
      const curRevenue = revenueCollected
      setGrowth({
        cur: { vas: curVAs, clients: new Set(doneUploads.map(u => u.client_id).filter(Boolean)).size, variants: doneUploads.reduce((s, u) => s + (u.product_row_count ?? 0), 0), revenue: curRevenue, avgRevPerVA: curVAs > 0 ? curRevenue / curVAs : 0 },
        prv: { vas: pVAs, clients: pClients, variants: pVariants, revenue: pRevenue, avgRevPerVA: pVAs > 0 ? pRevenue / pVAs : 0 },
      })
    } else {
      setGrowth(null)
    }

    setLoading(false)
  }, [period]) // eslint-disable-line react-hooks/exhaustive-deps

  const range = computeRange(period, customFrom, customTo)

  useEffect(() => {
    loadAll(computeRange(period, customFrom, customTo))
  }, [period, customFrom, customTo, loadAll]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleApply() {
    setCustomFrom(inputFrom); setCustomTo(inputTo); setShowCustom(false)
  }

  // ── Sort helpers ──────────────────────────────────────────────────────────
  function toggleVASort(col: string) {
    setVASort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' })
  }
  function toggleClSort(col: string) {
    setClSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' })
  }

  // ── Export full report ────────────────────────────────────────────────────
  function exportFullReport() {
    const sections: Array<{ name: string; rows: Record<string, unknown>[] }> = [
      { name: 'daily',   rows: daily.map(r => ({ Date: r.label, Products: r.variants, Unique: r.products, Uploads: r.uploads, VAs: r.vas, Revenue: r.revenue, 'API Cost': r.apiCost, Margin: r.margin })) },
      { name: 'va-perf', rows: vaPerf.map(r => ({ VA: r.name, Country: r.country, Clients: r.clients, Products: r.variants, Uploads: r.uploads, Revenue: r.revenue, 'API Cost': r.apiCost, Profit: r.profit, 'Avg Time': r.avgTime, 'Fail Rate': r.failRate })) },
      { name: 'clients', rows: clientPerf.map(r => ({ Client: r.store_name, VA: r.va_name, Niche: r.niche, Market: r.market, Products: r.variants, Unique: r.products, Uploads: r.uploads, Tier: r.tier, Revenue: r.revenue, 'API Cost': r.apiCost })) },
      { name: 'niche',   rows: nicheRows.map(r => ({ Niche: r.niche, Clients: r.clients, Products: r.variants, Revenue: r.revenue, '%': r.pct })) },
      { name: 'market',  rows: marketRows.map(r => ({ Market: r.market, Clients: r.clients, VAs: r.vas, Products: r.variants, Revenue: r.revenue, '%': r.pct })) },
    ]
    for (const s of sections) { if (s.rows.length) downloadCSV(s.rows, `analytics-${s.name}`) }
  }

  // ── Sorted tables ──────────────────────────────────────────────────────────
  const sortedVA = sortRows(vaPerf,      vaSort.col as keyof VAPerfRow,      vaSort.dir)
  const sortedCl = sortRows(clientPerf,  clSort.col as keyof ClientPerfRow,  clSort.dir)

  // Totals
  const vaTotal = vaPerf.reduce((a, r) => ({ ...a, variants: a.variants + r.variants, uploads: a.uploads + r.uploads, revenue: a.revenue + r.revenue, apiCost: a.apiCost + r.apiCost, profit: a.profit + r.profit }), { variants: 0, uploads: 0, revenue: 0, apiCost: 0, profit: 0 })
  const clTotal = clientPerf.reduce((a, r) => ({ ...a, variants: a.variants + r.variants, products: a.products + r.products, uploads: a.uploads + r.uploads, revenue: a.revenue + r.revenue, apiCost: a.apiCost + r.apiCost }), { variants: 0, products: 0, uploads: 0, revenue: 0, apiCost: 0 })
  const dailyTotal = daily.reduce((a, r) => ({ variants: a.variants + r.variants, products: a.products + r.products, uploads: a.uploads + r.uploads, revenue: a.revenue + r.revenue, apiCost: a.apiCost + r.apiCost, margin: a.margin + r.margin }), { variants: 0, products: 0, uploads: 0, revenue: 0, apiCost: 0, margin: 0 })

  const HDCOL  = { fontSize: 10, fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: T.ter }
  const ROWCOL = { padding: '12px 0', borderBottom: `1px solid ${T.row}`, transition: 'opacity 0.15s' }

  // ── VA grid layout ─────────────────────────────────────────────────────────
  const VA_GRID = '2fr 0.8fr 0.8fr 1fr 1fr 1fr 1fr 0.8fr 0.8fr 0.8fr'
  const CL_GRID = '2fr 1.5fr 0.8fr 0.8fr 1fr 0.8fr 1fr 0.5fr 0.8fr 0.8fr'

  return (
    <>
      <style>{`
        @media (max-width: 800px) {
          .ana-stats { grid-template-columns: repeat(3, 1fr) !important; }
          .ana-fin   { grid-template-columns: 1fr 1fr !important; }
          .ana-table { overflow-x: auto; }
        }
        @media (max-width: 600px) {
          .ana-stats { grid-template-columns: repeat(2, 1fr) !important; }
          .ana-pad   { padding: 32px 20px 60px !important; }
        }
      `}</style>

      <div className="ana-pad" style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 48px 80px' }}>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <div style={{ fontSize: 28, fontWeight: 300, color: T.black }}>Analytics</div>
          <button onClick={exportFullReport} style={{ fontSize: 12, color: T.ter, background: 'none', border: `1px solid #EEEEEE`, borderRadius: 100, padding: '6px 16px', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = T.black; e.currentTarget.style.color = T.black }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#EEEEEE'; e.currentTarget.style.color = T.ter }}
          >Export full report</button>
        </div>

        <PeriodSelector
          period={period} onChange={setPeriod}
          cfrom={customFrom} cto={customTo}
          inputFrom={inputFrom} inputTo={inputTo}
          setInputFrom={setInputFrom} setInputTo={setInputTo}
          showCustom={showCustom} setShowCustom={setShowCustom}
          onApply={handleApply}
        />

        {loading && <div style={{ fontSize: 13, color: T.ter, marginBottom: 32 }}>Loading…</div>}

        {/* ── Section 1: Core metrics ─────────────────────────────────────────── */}
        <div className="ana-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '28px 32px', marginBottom: 32 }}>
          {[
            { v: core ? fmtNum(core.variantsProcessed) : '—', l: 'PRODUCTS PROCESSED' },
            { v: core ? fmtNum(core.uniqueProducts)    : '—', l: 'UNIQUE PRODUCTS' },
            { v: core ? fmtNum(core.uploads)           : '—', l: 'UPLOADS' },
            { v: core ? fmtNum(core.activeVAs)         : '—', l: 'ACTIVE VA\'S' },
            { v: core ? fmtNum(core.activeClients)     : '—', l: 'ACTIVE CLIENTS' },
          ].map(({ v, l }) => (
            <div key={l}>
              <div style={{ fontSize: 36, fontWeight: 600, color: T.black, letterSpacing: '-0.02em', lineHeight: 1 }}>{v}</div>
              <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.12em', color: T.ter, marginTop: 5 }}>{l}</div>
            </div>
          ))}
          {[
            { v: core ? fmtDollar(core.revenueInvoiced)  : '—', l: 'REVENUE (INVOICED)' },
            { v: core ? fmtDollar(core.revenueCollected) : '—', l: 'REVENUE (COLLECTED)' },
            { v: core ? `$${core.apiCosts.toFixed(2)}`   : '—', l: 'API COSTS', c: T.sec },
            { v: core ? fmtDollar(core.affiliatePayouts) : '—', l: 'AFFILIATE PAYOUTS', c: T.sec },
            { v: core ? fmtDollarSigned(core.netMargin)  : '—', l: 'NET MARGIN', bold: core ? core.netMargin < 0 : false },
          ].map(({ v, l, c, bold }) => (
            <div key={l}>
              <div style={{ fontSize: 36, fontWeight: bold ? 700 : 600, color: c ?? T.black, letterSpacing: '-0.02em', lineHeight: 1 }}>{v}</div>
              <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.12em', color: T.ter, marginTop: 5 }}>{l}</div>
            </div>
          ))}
        </div>

        <Divider />

        {/* ── Section 2: Daily breakdown ─────────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <SectionHead label={dailyUseWk ? 'WEEKLY BREAKDOWN' : 'DAILY BREAKDOWN'} onExport={() => downloadCSV(daily.map(r => ({ Date: r.label, Products: r.variants, Unique: r.products, Uploads: r.uploads, VAs: r.vas, Revenue: r.revenue, 'API Cost': r.apiCost, Margin: r.margin })), 'daily-breakdown')} />
          {!range.from && period !== 'custom' ? (
            <div style={{ fontSize: 13, color: T.ter }}>Select a period to see breakdown.</div>
          ) : (
            <div className="ana-table">
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.8fr 0.8fr 0.6fr 0.9fr 0.9fr 0.9fr', ...HDCOL, padding: '0 0 8px', borderBottom: `1px solid ${T.row}`, minWidth: 640 }}>
                {['Date','Products','Unique','Uploads','VA\'s','Revenue','API Cost','Margin'].map(c => <div key={c}>{c}</div>)}
              </div>
              {daily.map(r => {
                const empty = r.variants === 0 && r.uploads === 0
                return (
                  <div key={r.key} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.8fr 0.8fr 0.6fr 0.9fr 0.9fr 0.9fr', ...ROWCOL, opacity: empty ? 0.4 : 1, minWidth: 640 }}
                    onMouseEnter={e => { if (!empty) e.currentTarget.style.opacity = '0.6' }}
                    onMouseLeave={e => e.currentTarget.style.opacity = empty ? '0.4' : '1'}
                  >
                    <div style={{ fontSize: 13, color: T.black }}>{r.label}</div>
                    <div style={{ fontSize: 13, color: T.black }}>{fmtNum(r.variants)}</div>
                    <div style={{ fontSize: 13, color: T.sec }}>{fmtNum(r.products)}</div>
                    <div style={{ fontSize: 13, color: T.black }}>{r.uploads}</div>
                    <div style={{ fontSize: 13, color: T.sec }}>{r.vas}</div>
                    <div style={{ fontSize: 13, color: T.black }}>{fmtDollar(r.revenue)}</div>
                    <div style={{ fontSize: 13, color: T.sec }}>${r.apiCost.toFixed(2)}</div>
                    <div style={{ fontSize: 13, color: T.black, fontWeight: r.margin < 0 ? 500 : 400 }}>{fmtDollarSigned(r.margin)}</div>
                  </div>
                )
              })}
              {/* Totals row */}
              {daily.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.8fr 0.8fr 0.6fr 0.9fr 0.9fr 0.9fr', padding: '12px 0', borderTop: '1px solid #E8E8E8', minWidth: 640 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.black }}>Total</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.black }}>{fmtNum(dailyTotal.variants)}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.black }}>{fmtNum(dailyTotal.products)}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.black }}>{dailyTotal.uploads}</div>
                  <div />
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.black }}>{fmtDollar(dailyTotal.revenue)}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.black }}>${dailyTotal.apiCost.toFixed(2)}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.black }}>{fmtDollarSigned(dailyTotal.margin)}</div>
                </div>
              )}
            </div>
          )}
        </div>

        <Divider />

        {/* ── Section 3: VA performance ──────────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <SectionHead label="VA PERFORMANCE" onExport={() => downloadCSV(vaPerf.map(r => ({ VA: r.name, Country: r.country, Clients: r.clients, Products: r.variants, Uploads: r.uploads, Revenue: r.revenue, 'API Cost': r.apiCost, Profit: r.profit, 'Avg Time (s)': r.avgTime, 'Fail Rate %': r.failRate })), 'va-performance')} />
          <div className="ana-table">
            <div style={{ display: 'grid', gridTemplateColumns: VA_GRID, padding: '0 0 8px', borderBottom: `1px solid ${T.row}`, minWidth: 800, columnGap: 8 }}>
              {[['VA','name'],['Country','country'],['Clients','clients'],['Products','variants'],['Uploads','uploads'],['Revenue','revenue'],['API Cost','apiCost'],['Profit','profit'],['Avg Time','avgTime'],['Fail %','failRate']].map(([l, c]) => (
                <ColHead key={c} label={l} col={c} sort={vaSort} onSort={toggleVASort} />
              ))}
            </div>
            {sortedVA.length === 0
              ? <div style={{ fontSize: 13, color: T.ter, padding: '12px 0' }}>No VA activity in this period.</div>
              : sortedVA.map(r => (
                <div key={r.id}>
                  <div style={{ display: 'grid', gridTemplateColumns: VA_GRID, ...ROWCOL, cursor: 'pointer', minWidth: 800, columnGap: 8 }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    onClick={() => setExpandedVA(expandedVA === r.id ? null : r.id)}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500, color: T.black }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: T.sec }}>{r.country ?? '—'}</div>
                    <div style={{ fontSize: 13, color: T.black }}>{r.clients}</div>
                    <div style={{ fontSize: 13, color: T.black }}>{fmtNum(r.variants)}</div>
                    <div style={{ fontSize: 13, color: T.black }}>{r.uploads}</div>
                    <div style={{ fontSize: 13, color: T.black }}>{fmtDollar(r.revenue)}</div>
                    <div style={{ fontSize: 13, color: T.sec }}>${r.apiCost.toFixed(2)}</div>
                    <div style={{ fontSize: 13, color: T.black, fontWeight: r.profit < 0 ? 500 : 400 }}>{fmtDollarSigned(r.profit)}</div>
                    <div style={{ fontSize: 13, color: T.sec }}>{r.avgTime ? `${r.avgTime}s` : '—'}</div>
                    <div style={{ fontSize: 13, color: r.failRate > 10 ? T.black : T.sec, fontWeight: r.failRate > 10 ? 500 : 400 }}>{r.failRate}%</div>
                  </div>
                  {/* Expanded client breakdown */}
                  {expandedVA === r.id && vaBreaks[r.id] && (
                    <div style={{ background: T.row, borderRadius: 8, margin: '0 0 4px', padding: '8px 16px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 0.5fr', ...HDCOL, padding: '6px 0 8px', borderBottom: `1px solid ${T.div}` }}>
                        {['Client', 'Products', 'Uploads', 'Tier'].map(c => <div key={c}>{c}</div>)}
                      </div>
                      {vaBreaks[r.id].map(c => (
                        <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 0.5fr', padding: '8px 0', borderBottom: `1px solid ${T.div}` }}>
                          <div style={{ fontSize: 12, color: T.black }}>{c.store_name}</div>
                          <div style={{ fontSize: 12, color: T.black }}>{fmtNum(c.variants)}</div>
                          <div style={{ fontSize: 12, color: T.sec }}>{c.uploads}</div>
                          <div style={{ fontSize: 12, color: T.ter }}>{c.tier}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            }
            {sortedVA.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: VA_GRID, padding: '12px 0', borderTop: '1px solid #E8E8E8', minWidth: 800, columnGap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.black }}>Total</div>
                <div /><div />
                <div style={{ fontSize: 13, fontWeight: 600, color: T.black }}>{fmtNum(vaTotal.variants)}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.black }}>{vaTotal.uploads}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.black }}>{fmtDollar(vaTotal.revenue)}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.black }}>${vaTotal.apiCost.toFixed(2)}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.black }}>{fmtDollarSigned(vaTotal.profit)}</div>
              </div>
            )}
          </div>
        </div>

        <Divider />

        {/* ── Section 4: Client performance ──────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <SectionHead label="CLIENT PERFORMANCE" onExport={() => downloadCSV(clientPerf.map(r => ({ Client: r.store_name, VA: r.va_name, Niche: r.niche, Market: r.market, Products: r.variants, Unique: r.products, Uploads: r.uploads, Tier: r.tier, Revenue: r.revenue, 'API Cost': r.apiCost })), 'client-performance')} />
          <div className="ana-table">
            <div style={{ display: 'grid', gridTemplateColumns: CL_GRID, padding: '0 0 8px', borderBottom: `1px solid ${T.row}`, minWidth: 820, columnGap: 8 }}>
              {[['Client','store_name'],['VA','va_name'],['Niche','niche'],['Market','market'],['Products','variants'],['Unique','products'],['Uploads','uploads'],['Tier','tier'],['Revenue','revenue'],['API Cost','apiCost']].map(([l, c]) => (
                <ColHead key={c} label={l} col={c} sort={clSort} onSort={toggleClSort} />
              ))}
            </div>
            {sortedCl.length === 0
              ? <div style={{ fontSize: 13, color: T.ter, padding: '12px 0' }}>No client activity in this period.</div>
              : sortedCl.map(r => (
                <div key={r.id} style={{ display: 'grid', gridTemplateColumns: CL_GRID, ...ROWCOL, minWidth: 820, columnGap: 8 }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.6'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  <div style={{ fontSize: 13, fontWeight: 500, color: T.black }}>{r.store_name}</div>
                  <div style={{ fontSize: 13, color: T.sec }}>{r.va_name}</div>
                  <div style={{ fontSize: 12, color: T.sec, textTransform: 'capitalize' }}>{r.niche?.replace(/_/g, ' ') ?? '—'}</div>
                  <div style={{ fontSize: 12, color: T.sec }}>{r.market ?? '—'}</div>
                  <div style={{ fontSize: 13, color: T.black }}>{fmtNum(r.variants)}</div>
                  <div style={{ fontSize: 13, color: T.sec }}>{fmtNum(r.products)}</div>
                  <div style={{ fontSize: 13, color: T.black }}>{r.uploads}</div>
                  <div style={{ fontSize: 12, color: T.ter }}>{r.tier}</div>
                  <div style={{ fontSize: 13, color: T.black }}>{fmtDollar(r.revenue)}</div>
                  <div style={{ fontSize: 13, color: T.sec }}>${r.apiCost.toFixed(2)}</div>
                </div>
              ))
            }
            {sortedCl.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: CL_GRID, padding: '12px 0', borderTop: '1px solid #E8E8E8', minWidth: 820, columnGap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.black }}>Total</div>
                <div /><div /><div />
                <div style={{ fontSize: 13, fontWeight: 600, color: T.black }}>{fmtNum(clTotal.variants)}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.black }}>{fmtNum(clTotal.products)}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.black }}>{clTotal.uploads}</div>
                <div />
                <div style={{ fontSize: 13, fontWeight: 600, color: T.black }}>{fmtDollar(clTotal.revenue)}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.black }}>${clTotal.apiCost.toFixed(2)}</div>
              </div>
            )}
          </div>
        </div>

        <Divider />

        {/* ── Section 5: Niche breakdown ─────────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <SectionHead label="BY NICHE" onExport={() => downloadCSV(nicheRows.map(r => ({ Niche: r.niche, Clients: r.clients, Products: r.variants, Revenue: r.revenue, '%': r.pct })), 'niche-breakdown')} />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 1.2fr 1fr 0.8fr', padding: '0 0 8px', borderBottom: `1px solid ${T.row}` }}>
            {['Niche', 'Clients', 'Products', 'Revenue', '% of Total'].map(c => <div key={c} style={HDCOL}>{c}</div>)}
          </div>
          {nicheRows.length === 0
            ? <div style={{ fontSize: 13, color: T.ter, padding: '12px 0' }}>No data.</div>
            : nicheRows.map(r => (
              <div key={r.niche} style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 1.2fr 1fr 0.8fr', ...ROWCOL }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.6'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: T.black }}>{r.niche}</div>
                <div style={{ fontSize: 13, color: T.black }}>{r.clients}</div>
                <div style={{ fontSize: 13, color: T.black }}>{fmtNum(r.variants)}</div>
                <div style={{ fontSize: 13, color: T.black }}>{fmtDollar(r.revenue)}</div>
                <div style={{ fontSize: 13, color: T.sec }}>{r.pct}%</div>
              </div>
            ))
          }
        </div>

        {/* ── Section 6: Market breakdown ────────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <SectionHead label="BY MARKET" onExport={() => downloadCSV(marketRows.map(r => ({ Market: r.market, Clients: r.clients, VAs: r.vas, Products: r.variants, Revenue: r.revenue, '%': r.pct })), 'market-breakdown')} />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.8fr 1.2fr 1fr 0.8fr', padding: '0 0 8px', borderBottom: `1px solid ${T.row}` }}>
            {['Market', 'Clients', "VA's", 'Products', 'Revenue', '% of Total'].map(c => <div key={c} style={HDCOL}>{c}</div>)}
          </div>
          {(showAllMkt ? marketRows : marketRows.slice(0, 10)).map(r => (
            <div key={r.market} style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.8fr 1.2fr 1fr 0.8fr', ...ROWCOL }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.6'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: T.black }}>{r.market}</div>
              <div style={{ fontSize: 13, color: T.black }}>{r.clients}</div>
              <div style={{ fontSize: 13, color: T.black }}>{r.vas}</div>
              <div style={{ fontSize: 13, color: T.black }}>{fmtNum(r.variants)}</div>
              <div style={{ fontSize: 13, color: T.black }}>{fmtDollar(r.revenue)}</div>
              <div style={{ fontSize: 13, color: T.sec }}>{r.pct}%</div>
            </div>
          ))}
          {marketRows.length > 10 && !showAllMkt && (
            <button onClick={() => setShowAllMkt(true)} style={{ marginTop: 8, fontSize: 12, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
              onMouseEnter={e => e.currentTarget.style.color = T.black}
              onMouseLeave={e => e.currentTarget.style.color = T.ter}
            >View all {marketRows.length} markets →</button>
          )}
        </div>

        <Divider />

        {/* ── Section 7: Tier distribution ────────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <SectionHead label="TIER DISTRIBUTION" />
          {tierDist.every(r => r.clients === 0)
            ? <div style={{ fontSize: 13, color: T.ter }}>No data.</div>
            : tierDist.map(r => (
              <div key={r.tier} style={{ padding: '12px 0', borderBottom: `1px solid ${T.row}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: T.black, minWidth: 52 }}>{r.tier}</span>
                    <span style={{ fontSize: 12, color: T.ter }}>{r.range}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 24, fontSize: 13, color: T.sec }}>
                    <span><span style={{ color: T.black, fontWeight: 500 }}>{r.clients}</span> client{r.clients !== 1 ? 's' : ''}</span>
                    <span>{fmtDollar(r.revenue)}</span>
                    <span style={{ minWidth: 36, textAlign: 'right' }}>{r.pct}%</span>
                  </div>
                </div>
                {/* Bar */}
                <div style={{ height: 4, background: '#F0F0F0', borderRadius: 2 }}>
                  <div style={{ height: 4, background: T.black, borderRadius: 2, width: `${r.pct}%`, transition: 'width 0.4s ease' }} />
                </div>
              </div>
            ))
          }
        </div>

        <Divider />

        {/* ── Section 8: Processing stats ─────────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <SectionHead label="PROCESSING" />
          {proc ? (
            <div className="ana-fin" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 48 }}>
              {/* Speed */}
              <div>
                <div style={{ fontSize: 11, color: T.ter, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Speed</div>
                {[
                  ['Avg processing time', `${proc.avgTime}s`],
                  ['Fastest', `${proc.fastestTime}s (${proc.fastestStore})`],
                  ['Slowest', `${proc.slowestTime}s (${proc.slowestStore})`],
                  ['Avg time/product', `${proc.avgTimePerVariantMs}ms`],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
                    <span style={{ fontSize: 12, color: T.ter }}>{l}</span>
                    <span style={{ fontSize: 13, color: T.black }}>{v}</span>
                  </div>
                ))}
              </div>
              {/* Quality */}
              <div>
                <div style={{ fontSize: 11, color: T.ter, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Quality</div>
                {[
                  ['Success rate', `${proc.successRate}%`],
                  ['Partial success', String(proc.partialSuccess)],
                  ['Total failed', String(proc.totalFailed)],
                  ['Products failed', fmtNum(proc.variantsFailed)],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
                    <span style={{ fontSize: 12, color: T.ter }}>{l}</span>
                    <span style={{ fontSize: 13, color: T.black }}>{v}</span>
                  </div>
                ))}
              </div>
              {/* Cost */}
              <div>
                <div style={{ fontSize: 11, color: T.ter, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Cost Efficiency</div>
                {[
                  ['Avg cost/upload',  `$${proc.avgCostPerUpload.toFixed(4)}`],
                  ['Avg cost/product row', `$${proc.avgCostPerVariant.toFixed(6)}`],
                  ['Avg cost/unique product', `$${proc.avgCostPerProduct.toFixed(5)}`],
                  ['Cache hit rate',   `${proc.cacheHitRate}%`],
                  ['Total tokens',     `${fmtNum(proc.totalTokens)} (in: ${fmtNum(proc.inputTokens)}, out: ${fmtNum(proc.outputTokens)}, cached: ${fmtNum(proc.cachedTokens)})`],
                ].map(([l, v]) => (
                  <div key={l} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: T.ter, marginBottom: 1 }}>{l}</div>
                    <div style={{ fontSize: 13, color: T.black }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : <div style={{ fontSize: 13, color: T.ter }}>No data.</div>}
        </div>

        <Divider />

        {/* ── Section 9: Growth ───────────────────────────────────────────────── */}
        <div>
          <SectionHead label="GROWTH" />
          {period === 'all' ? (
            <div style={{ fontSize: 14, color: T.ter }}>Select a specific period to see growth comparison.</div>
          ) : growth ? (
            <div>
              <div style={{ fontSize: 12, color: T.ter, marginBottom: 12 }}>Current period vs. previous {period === 'today' ? 'day' : period === 'week' ? 'week' : period === 'month' ? 'month' : 'period'}</div>
              {[
                { label: "VA's",              cur: growth.cur.vas,         prv: growth.prv.vas,         dollar: false },
                { label: 'Clients',           cur: growth.cur.clients,     prv: growth.prv.clients,     dollar: false },
                { label: 'Products',          cur: growth.cur.variants,    prv: growth.prv.variants,    dollar: false },
                { label: 'Revenue',           cur: growth.cur.revenue,     prv: growth.prv.revenue,     dollar: true  },
                { label: 'Avg revenue/VA',    cur: growth.cur.avgRevPerVA, prv: growth.prv.avgRevPerVA, dollar: true  },
              ].map(({ label, cur, prv, dollar }) => (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', alignItems: 'baseline', gap: 16 }}>
                  <div style={{ fontSize: 13, color: T.ter, padding: '8px 0' }}>{label}</div>
                  <Delta cur={cur} prv={prv} dollar={dollar} />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: T.ter }}>Loading growth data…</div>
          )}
        </div>

      </div>
    </>
  )
}
