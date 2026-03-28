'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Tokens ───────────────────────────────────────────────────────────────────
const T = {
  black: '#111111', sec: '#555555', ter: '#999999', ghost: '#CCCCCC',
  div: '#EEEEEE', row: '#FAFAFA', bg: '#FFFFFF',
}

// ─── Infrastructure config (edit as needed) ───────────────────────────────────
const INFRA: Record<string, number> = {
  Supabase:  25,   // Pro plan
  Vercel:    20,   // Pro plan
  Domain:     1,   // ~$12/year
}
const INFRA_TOTAL = Object.values(INFRA).reduce((s, v) => s + v, 0)

// ─── Tier metadata ────────────────────────────────────────────────────────────
const TIER_META: Record<string, { label: string; range: string; price: number }> = {
  tier_1: { label: 'Tier 1', range: '0–200 products',   price: 50  },
  tier_2: { label: 'Tier 2', range: '201–400 products',  price: 110 },
  tier_3: { label: 'Tier 3', range: '401–1000 products', price: 220 },
  tier_4: { label: 'Tier 4', range: '1001+ products',    price: 350 },
}

// ─── Date / month helpers ─────────────────────────────────────────────────────
function curMonthKey(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}
function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number)
  return { start: new Date(y, m - 1, 1).toISOString(), end: new Date(y, m, 1).toISOString() }
}
function fmtMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
function fmtMonthShort(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}
function fmtDateShort(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}
function buildMonthOptions(n = 24): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function curYear(): number { return new Date().getFullYear() }

// ─── CSV ──────────────────────────────────────────────────────────────────────
function dlCSV(filename: string, rows: (string | number | null)[][]): void {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ─── Types ────────────────────────────────────────────────────────────────────
type BillingRow = {
  id: string; month: string; va_id: string; va_name: string | null
  total_amount: number; total_clients: number | null; total_variants: number | null
  status: 'outstanding' | 'paid' | 'overdue' | 'waived'; paid_at: string | null; generated_at: string
}
type LineItemRow = {
  billing_id: string; client_id: string; tier: string
  variant_count: number; amount: number
}
type UploadRow = {
  id: string; va_id: string | null; store_name: string | null
  api_cost_usd: number | null; api_input_tokens: number | null
  api_output_tokens: number | null; api_cached_tokens: number | null
  products_optimized: number | null; unique_product_count: number | null
  uploaded_at: string; processing_completed_at: string | null
}
type AffRow = {
  id: string; referrer_va_id: string; referred_va_id: string; month: string
  payout_amount: number; status: string; paid_at: string | null; created_at: string
}
type VARow = { id: string; name: string }

type FPeriod = 'month' | 'year' | 'all'
type CfFilter = 'all' | 'income' | 'api' | 'affiliate'

// ─── Period filter helper ─────────────────────────────────────────────────────
function periodFilter<T>(
  items: T[],
  period: FPeriod,
  dateKey: (item: T) => string | null,
): T[] {
  if (period === 'all') return items
  const now = new Date()
  if (period === 'month') {
    const cm = curMonthKey()
    const { start, end } = monthBounds(cm)
    return items.filter(i => { const d = dateKey(i); return d && d >= start && d < end })
  }
  // year
  const yearStart = `${curYear()}-01-01T00:00:00.000Z`
  return items.filter(i => { const d = dateKey(i); return d && d >= yearStart })
}

// ─── Small UI components ──────────────────────────────────────────────────────
function SectionHead({ label, sub }: { label: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost }}>{label}</span>
      {sub && <span style={{ fontSize: 12, color: T.ghost }}>{sub}</span>}
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: T.div, margin: '40px 0' }} />
}

function PeriodPills({ value, onChange }: { value: FPeriod; onChange: (p: FPeriod) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {(['month', 'year', 'all'] as FPeriod[]).map(p => (
        <button key={p} onClick={() => onChange(p)}
          style={{ fontSize: 11, padding: '4px 10px', borderRadius: 100, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', border: `1px solid ${value === p ? T.black : T.div}`, background: value === p ? T.black : 'none', color: value === p ? T.bg : T.ghost }}
        >{p === 'month' ? 'This Month' : p === 'year' ? 'This Year' : 'All Time'}</button>
      ))}
    </div>
  )
}

// ─── P&L line helper ─────────────────────────────────────────────────────────
function PLLine({
  label, value, indent = false, total = false, negative = false, large = false, dividerBefore = false,
}: {
  label: string; value: string; indent?: boolean; total?: boolean; negative?: boolean
  large?: boolean; dividerBefore?: boolean
}) {
  return (
    <>
      {dividerBefore && <div style={{ height: 1, background: '#E8E8E8', margin: '8px 0' }} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBlock: total ? 7 : 5, paddingLeft: indent ? 24 : 0 }}>
        <span style={{ fontSize: total || large ? 13 : 13, fontWeight: total ? 600 : 400, color: total ? T.black : T.ter }}>
          {label}
        </span>
        <span style={{ fontSize: large ? 18 : 14, fontWeight: total || large ? 600 : (negative ? 500 : 400), color: T.black, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </span>
      </div>
    </>
  )
}

// ─── Projection helper ────────────────────────────────────────────────────────
function computeProjection(billing: BillingRow[], uploads: UploadRow[], aff: AffRow[]) {
  const cm = curMonthKey()
  const months = [shiftMonth(cm, -3), shiftMonth(cm, -2), shiftMonth(cm, -1)]

  type Agg = { revenue: number; clients: number; variants: number; vasSet: Set<string>; api: number; affiliate: number }
  const map = new Map<string, Agg>()
  for (const m of months) map.set(m, { revenue: 0, clients: 0, variants: 0, vasSet: new Set(), api: 0, affiliate: 0 })

  for (const b of billing) {
    const agg = map.get(b.month)
    if (!agg) continue
    if (b.status === 'paid') agg.revenue += b.total_amount
    agg.clients  += b.total_clients ?? 0
    agg.variants += b.total_variants ?? 0
    agg.vasSet.add(b.va_id)
  }
  for (const u of uploads) {
    const mKey = u.uploaded_at.slice(0, 7)
    const agg = map.get(mKey)
    if (agg) agg.api += u.api_cost_usd ?? 0
  }
  for (const a of aff) {
    const agg = map.get(a.month)
    if (agg) agg.affiliate += a.payout_amount
  }

  const arr = months.map(m => map.get(m)!)
  const revs = arr.map(a => a.revenue).filter(v => v > 0)
  let rate = 0.15
  if (revs.length >= 2) {
    const raw = Math.pow(revs[revs.length - 1] / revs[0], 1 / (revs.length - 1)) - 1
    rate = Math.min(Math.max(raw, -0.5), 0.5)
  }

  const last = arr[arr.length - 1]
  const baseRev    = last?.revenue ?? 0
  const baseApi    = last?.api ?? 0
  const baseAff    = last?.affiliate ?? 0
  const baseVas    = last?.vasSet.size ?? 0
  const baseClients = last?.clients ?? 0
  const baseVariants = last?.variants ?? 0
  const apiRatio   = baseRev > 0 ? baseApi / baseRev : 0.08
  const affRatio   = baseRev > 0 ? baseAff / baseRev : 0.05

  function project(n: number) {
    const f = Math.pow(1 + rate, n)
    const revenue = Math.round(baseRev * f)
    const apiCost = Math.round(revenue * apiRatio)
    const affPay  = Math.round(revenue * affRatio)
    return { vas: Math.round(baseVas * f), clients: Math.round(baseClients * f), variants: Math.round(baseVariants * f), revenue, apiCost, affPay, net: revenue - apiCost - affPay }
  }

  return { rate: Math.round(rate * 1000) / 10, current: project(0), p1: project(1), p3: project(3), p6: project(6), p12: project(12) }
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminFinancePage() {
  const monthOptions = buildMonthOptions()

  const [billing,   setBilling]   = useState<BillingRow[]>([])
  const [lineItems, setLineItems] = useState<LineItemRow[]>([])
  const [uploads,   setUploads]   = useState<UploadRow[]>([])
  const [aff,       setAff]       = useState<AffRow[]>([])
  const [vas,       setVas]       = useState<VARow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [plMonth,      setPlMonth]      = useState(curMonthKey())
  const [revPeriod,    setRevPeriod]    = useState<FPeriod>('all')
  const [costPeriod,   setCostPeriod]   = useState<FPeriod>('all')
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)
  const [cfFilter,     setCfFilter]     = useState<CfFilter>('all')
  const [cfPage,       setCfPage]       = useState(0)
  const [exportOpen,   setExportOpen]   = useState(false)
  const [showAllVAs,   setShowAllVAs]   = useState(false)

  // ── Load all data ────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    const [
      { data: bill },
      { data: li },
      { data: up },
      { data: af },
      { data: vaList },
    ] = await Promise.all([
      supabase.from('billing').select('id, month, va_id, va_name, total_amount, total_clients, total_variants, status, paid_at, generated_at').order('month', { ascending: false }),
      supabase.from('billing_line_items').select('billing_id, client_id, tier, variant_count, amount'),
      supabase.from('uploads').select('id, va_id, store_name, api_cost_usd, api_input_tokens, api_output_tokens, api_cached_tokens, products_optimized, unique_product_count, uploaded_at, processing_completed_at').eq('status', 'done').gt('api_cost_usd', 0).order('uploaded_at', { ascending: false }),
      supabase.from('affiliate_payouts').select('id, referrer_va_id, referred_va_id, month, payout_amount, status, paid_at, created_at').order('created_at', { ascending: false }),
      supabase.from('vas').select('id, name'),
    ])
    setBilling((bill ?? []) as BillingRow[])
    setLineItems((li ?? []) as LineItemRow[])
    setUploads((up ?? []) as UploadRow[])
    setAff((af ?? []) as AffRow[])
    setVas((vaList ?? []) as VARow[])
    setLastUpdated(new Date())
    setLoading(false)
  }, [])

  useEffect(() => { void loadAll() }, [loadAll])

  // ── VA name map ──────────────────────────────────────────────────────────────
  const vaNameMap = useMemo(() => new Map(vas.map(v => [v.id, v.name])), [vas])

  // ── Big Numbers ──────────────────────────────────────────────────────────────
  const bigNums = useMemo(() => {
    const cm = curMonthKey()
    const yearStart = `${curYear()}-01-01T00:00:00.000Z`
    return {
      earnedAllTime:    billing.filter(b => b.status === 'paid').reduce((s, b) => s + b.total_amount, 0),
      earnedThisMonth:  billing.filter(b => b.status === 'paid' && b.month === cm).reduce((s, b) => s + b.total_amount, 0),
      earnedThisYear:   billing.filter(b => b.status === 'paid' && (b.paid_at ?? '') >= yearStart).reduce((s, b) => s + b.total_amount, 0),
      invoicedThisMonth: billing.filter(b => b.month === cm).reduce((s, b) => s + b.total_amount, 0),
      outstanding:      billing.filter(b => b.status === 'outstanding' || b.status === 'overdue').reduce((s, b) => s + b.total_amount, 0),
      overdue:          billing.filter(b => b.status === 'overdue').reduce((s, b) => s + b.total_amount, 0),
    }
  }, [billing])

  // ── P&L data ─────────────────────────────────────────────────────────────────
  const plData = useMemo(() => {
    const { start, end } = monthBounds(plMonth)
    const monthBill = billing.filter(b => b.month === plMonth)
    const monthUploads = uploads.filter(u => u.uploaded_at >= start && u.uploaded_at < end)
    const monthAff = aff.filter(a => a.month === plMonth)

    const collected   = monthBill.filter(b => b.status === 'paid').reduce((s, b) => s + b.total_amount, 0)
    const outstanding = monthBill.filter(b => b.status === 'outstanding').reduce((s, b) => s + b.total_amount, 0)
    const overdue_    = monthBill.filter(b => b.status === 'overdue').reduce((s, b) => s + b.total_amount, 0)
    const waived      = monthBill.filter(b => b.status === 'waived').reduce((s, b) => s + b.total_amount, 0)
    const totalInvoiced = collected + outstanding + overdue_
    const apiCost     = monthUploads.reduce((s, u) => s + (u.api_cost_usd ?? 0), 0)
    const affOwed     = monthAff.filter(a => a.status !== 'paid').reduce((s, a) => s + a.payout_amount, 0)
    const affPaid     = monthAff.filter(a => a.status === 'paid').reduce((s, a) => s + a.payout_amount, 0)
    const totalCosts  = apiCost + affPaid + INFRA_TOTAL
    return { collected, outstanding, overdue: overdue_, waived, totalInvoiced, apiCost, affOwed, affPaid, totalCosts, netCollected: collected - totalCosts, netInvoiced: totalInvoiced - apiCost - affOwed - INFRA_TOTAL }
  }, [billing, uploads, aff, plMonth])

  // ── Monthly overview ──────────────────────────────────────────────────────────
  const monthRows = useMemo(() => {
    const months = [...new Set(billing.map(b => b.month))].sort((a, b) => b.localeCompare(a))
    return months.map(m => {
      const { start, end } = monthBounds(m)
      const mb = billing.filter(b => b.month === m)
      const mu = uploads.filter(u => u.uploaded_at >= start && u.uploaded_at < end)
      const ma = aff.filter(a => a.month === m && a.status === 'paid')
      const invoiced   = mb.reduce((s, b) => s + b.total_amount, 0)
      const collected  = mb.filter(b => b.status === 'paid').reduce((s, b) => s + b.total_amount, 0)
      const apiCost    = mu.reduce((s, u) => s + (u.api_cost_usd ?? 0), 0)
      const affiliates = ma.reduce((s, a) => s + a.payout_amount, 0)
      const netProfit  = collected - apiCost - affiliates - INFRA_TOTAL
      const margin     = collected > 0 ? (netProfit / collected) * 100 : 0
      const vasSet     = new Set(mb.map(b => b.va_id))
      const clientSet  = new Set(mb.map(b => b.total_clients).map((v, i) => `${mb[i]?.va_id}-${v}`))
      void clientSet
      return {
        month: m, vas: vasSet.size,
        clients: mb.reduce((s, b) => s + (b.total_clients ?? 0), 0),
        variants: mb.reduce((s, b) => s + (b.total_variants ?? 0), 0),
        invoiced, collected, apiCost, affiliates, netProfit, margin,
      }
    })
  }, [billing, uploads, aff])

  // ── Collection rate ───────────────────────────────────────────────────────────
  const collectionRates = useMemo(() =>
    monthRows.map(r => ({
      month: r.month,
      invoiced: r.invoiced,
      collected: r.collected,
      rate: r.invoiced > 0 ? (r.collected / r.invoiced) * 100 : 0,
    })).filter(r => r.invoiced > 0)
  , [monthRows])

  const avgCollectionRate = useMemo(() => {
    const rates = collectionRates.filter(r => r.rate > 0)
    return rates.length > 0 ? rates.reduce((s, r) => s + r.rate, 0) / rates.length : 0
  }, [collectionRates])

  // ── Revenue by VA ─────────────────────────────────────────────────────────────
  const vaRevRows = useMemo(() => {
    const filteredBill = periodFilter(billing, revPeriod, b => b.paid_at)
    const filteredUploads = periodFilter(uploads, revPeriod, u => u.uploaded_at)
    const filteredAff = periodFilter(aff, revPeriod, a => a.created_at)

    const map = new Map<string, { revenue: number; clients: number; variants: number; api: number; affOwed: number }>()

    for (const b of filteredBill) {
      const e = map.get(b.va_id) ?? { revenue: 0, clients: 0, variants: 0, api: 0, affOwed: 0 }
      if (b.status === 'paid') e.revenue += b.total_amount
      e.clients  += b.total_clients ?? 0
      e.variants += b.total_variants ?? 0
      map.set(b.va_id, e)
    }
    for (const u of filteredUploads) {
      if (!u.va_id) continue
      const e = map.get(u.va_id) ?? { revenue: 0, clients: 0, variants: 0, api: 0, affOwed: 0 }
      e.api += u.api_cost_usd ?? 0
      map.set(u.va_id, e)
    }
    for (const a of filteredAff) {
      const e = map.get(a.referred_va_id) ?? { revenue: 0, clients: 0, variants: 0, api: 0, affOwed: 0 }
      e.affOwed += a.payout_amount
      map.set(a.referred_va_id, e)
    }

    const totalRevenue = [...map.values()].reduce((s, e) => s + e.revenue, 0)
    return [...map.entries()]
      .map(([va_id, e]) => ({
        va_id, va_name: vaNameMap.get(va_id) ?? va_id.slice(0, 8),
        ...e, net: e.revenue - e.api - e.affOwed,
        pct: totalRevenue > 0 ? (e.revenue / totalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [billing, uploads, aff, revPeriod, vaNameMap])

  // ── Revenue by tier ───────────────────────────────────────────────────────────
  const tierRevRows = useMemo(() => {
    // Map billing_id → month for period filtering
    const billMap = new Map(billing.map(b => [b.id, b]))
    const filteredLI = lineItems.filter(li => {
      const b = billMap.get(li.billing_id)
      if (!b) return false
      if (revPeriod === 'month') return b.month === curMonthKey()
      if (revPeriod === 'year') return b.month.startsWith(String(curYear()))
      return true
    })

    const map = new Map<string, { revenue: number; clients: number }>()
    for (const li of filteredLI) {
      const e = map.get(li.tier) ?? { revenue: 0, clients: 0 }
      e.revenue += li.amount
      e.clients += 1
      map.set(li.tier, e)
    }
    const totalRev = [...map.values()].reduce((s, e) => s + e.revenue, 0)
    const totalClients = [...map.values()].reduce((s, e) => s + e.clients, 0)

    return ['tier_1', 'tier_2', 'tier_3', 'tier_4'].map(tier => {
      const e = map.get(tier) ?? { revenue: 0, clients: 0 }
      return { tier, meta: TIER_META[tier]!, ...e, pctRev: totalRev > 0 ? (e.revenue / totalRev) * 100 : 0, pctClients: totalClients > 0 ? (e.clients / totalClients) * 100 : 0 }
    })
  }, [lineItems, billing, revPeriod])

  // ── Cost breakdown ────────────────────────────────────────────────────────────
  const costData = useMemo(() => {
    const filteredUploads = periodFilter(uploads, costPeriod, u => u.uploaded_at)
    const filteredAff = periodFilter(aff, costPeriod, a => a.created_at)

    const totalApi       = filteredUploads.reduce((s, u) => s + (u.api_cost_usd ?? 0), 0)
    const totalInput     = filteredUploads.reduce((s, u) => s + (u.api_input_tokens ?? 0), 0)
    const totalOutput    = filteredUploads.reduce((s, u) => s + (u.api_output_tokens ?? 0), 0)
    const totalCached    = filteredUploads.reduce((s, u) => s + (u.api_cached_tokens ?? 0), 0)
    const totalVariants  = filteredUploads.reduce((s, u) => s + (u.products_optimized ?? 0), 0)
    const totalProducts  = filteredUploads.reduce((s, u) => s + (u.unique_product_count ?? 0), 0)
    const cacheRate      = totalInput > 0 ? (totalCached / totalInput) * 100 : 0
    const avgPerUpload   = filteredUploads.length > 0 ? totalApi / filteredUploads.length : 0
    const avgPerVariant  = totalVariants > 0 ? totalApi / totalVariants : 0
    const avgPerProduct  = totalProducts > 0 ? totalApi / totalProducts : 0

    const affOwed   = filteredAff.filter(a => a.status !== 'paid').reduce((s, a) => s + a.payout_amount, 0)
    const affPaid   = filteredAff.filter(a => a.status === 'paid').reduce((s, a) => s + a.payout_amount, 0)
    const activeRels = new Set(filteredAff.map(a => a.referrer_va_id)).size
    const avgPayout = activeRels > 0 ? (affPaid + affOwed) / activeRels : 0

    const filteredBill = periodFilter(billing, costPeriod, b => b.paid_at)
    const totalRev = filteredBill.filter(b => b.status === 'paid').reduce((s, b) => s + b.total_amount, 0)
    const affPct   = totalRev > 0 ? ((affPaid + affOwed) / totalRev) * 100 : 0

    return { totalApi, totalInput, totalOutput, totalCached, totalVariants, cacheRate, avgPerUpload, avgPerVariant, avgPerProduct, affOwed, affPaid, activeRels, avgPayout, affPct, totalRev }
  }, [uploads, aff, billing, costPeriod])

  // ── Projections ───────────────────────────────────────────────────────────────
  const proj = useMemo(() => computeProjection(billing, uploads, aff), [billing, uploads, aff])

  // ── Cashflow timeline ─────────────────────────────────────────────────────────
  const cashflowAll = useMemo(() => {
    const events: { key: string; date: string; type: 'income' | 'api' | 'affiliate'; desc: string; amount: number }[] = []

    for (const b of billing) {
      if (b.status === 'paid' && b.paid_at) {
        events.push({ key: `bill-${b.id}`, date: b.paid_at, type: 'income', desc: `Invoice paid — ${b.va_name ?? '?'} (${b.id.slice(0, 6)})`, amount: b.total_amount })
      }
    }
    for (const u of uploads) {
      if ((u.api_cost_usd ?? 0) > 0) {
        const d = u.processing_completed_at ?? u.uploaded_at
        events.push({ key: `up-${u.id}`, date: d, type: 'api', desc: `Claude API — ${u.store_name ?? 'Unknown store'} (${u.products_optimized ?? 0} products)`, amount: -(u.api_cost_usd ?? 0) })
      }
    }
    for (const a of aff) {
      if (a.status === 'paid' && a.paid_at) {
        events.push({ key: `aff-${a.id}`, date: a.paid_at, type: 'affiliate', desc: `Affiliate payout — ${vaNameMap.get(a.referrer_va_id) ?? '?'} (for ${vaNameMap.get(a.referred_va_id) ?? '?'})`, amount: -a.payout_amount })
      }
    }

    events.sort((a, b) => b.date.localeCompare(a.date))
    return events
  }, [billing, uploads, aff, vaNameMap])

  const cashflowFiltered = useMemo(() =>
    cfFilter === 'all' ? cashflowAll
    : cfFilter === 'income' ? cashflowAll.filter(e => e.type === 'income')
    : cfFilter === 'api' ? cashflowAll.filter(e => e.type === 'api')
    : cashflowAll.filter(e => e.type === 'affiliate')
  , [cashflowAll, cfFilter])

  const PAGE_SIZE = 50
  const cashflowPage = cashflowFiltered.slice(cfPage * PAGE_SIZE, (cfPage + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(cashflowFiltered.length / PAGE_SIZE)

  const runningBalance = useMemo(() =>
    cashflowAll.reduce((s, e) => s + e.amount, 0)
  , [cashflowAll])

  // ── Exports ───────────────────────────────────────────────────────────────────
  function exportAll() {
    // Sheet 1: Summary
    dlCSV('01-summary.csv', [
      ['Metric', 'Value'],
      ['Earned All Time', bigNums.earnedAllTime],
      ['Earned This Month', bigNums.earnedThisMonth],
      ['Earned This Year', bigNums.earnedThisYear],
      ['Invoiced This Month', bigNums.invoicedThisMonth],
      ['Outstanding', bigNums.outstanding],
      ['Overdue', bigNums.overdue],
    ])

    // Sheet 2: Monthly overview
    dlCSV('02-monthly-overview.csv', [
      ['Month', "VA's", 'Clients', 'Products', 'Invoiced', 'Collected', 'API Cost', 'Affiliates', 'Net Profit', 'Margin %'],
      ...monthRows.map(r => [fmtMonthShort(r.month), r.vas, r.clients, r.variants, r.invoiced, r.collected, r.apiCost.toFixed(2), r.affiliates.toFixed(2), r.netProfit.toFixed(2), r.margin.toFixed(1)]),
    ])

    // Sheet 3: Revenue by VA
    dlCSV('03-revenue-by-va.csv', [
      ['VA', 'Clients', 'Products', 'Revenue', 'API Cost', 'Affiliate Owed', 'Net', '% of Total'],
      ...vaRevRows.map(r => [r.va_name, r.clients, r.variants, r.revenue, r.api.toFixed(2), r.affOwed.toFixed(2), r.net.toFixed(2), r.pct.toFixed(1)]),
    ])

    // Sheet 4: Revenue by tier
    dlCSV('04-revenue-by-tier.csv', [
      ['Tier', 'Price', 'Clients', 'Revenue', '% Revenue', '% Clients'],
      ...tierRevRows.map(r => [r.meta.label, r.meta.price, r.clients, r.revenue, r.pctRev.toFixed(1), r.pctClients.toFixed(1)]),
    ])

    // Sheet 5: Cashflow
    dlCSV('05-cashflow.csv', [
      ['Date', 'Type', 'Description', 'Amount'],
      ...cashflowAll.map(e => [fmtDateShort(e.date), e.type, e.desc, e.amount.toFixed(2)]),
    ])

    // Sheet 6: Collection rate
    dlCSV('06-collection-rate.csv', [
      ['Month', 'Invoiced', 'Collected', 'Rate %'],
      ...collectionRates.map(r => [fmtMonthShort(r.month), r.invoiced, r.collected, r.rate.toFixed(1)]),
    ])

    // Sheet 7: Projections
    dlCSV('07-projections.csv', [
      ['Metric', 'Current', '+1 Month', '+3 Months', '+6 Months', '+12 Months'],
      ["Active VA's",        proj.current.vas, proj.p1.vas, proj.p3.vas, proj.p6.vas, proj.p12.vas],
      ['Active Clients',     proj.current.clients, proj.p1.clients, proj.p3.clients, proj.p6.clients, proj.p12.clients],
      ['Monthly Products',   proj.current.variants, proj.p1.variants, proj.p3.variants, proj.p6.variants, proj.p12.variants],
      ['Monthly Revenue',    proj.current.revenue, proj.p1.revenue, proj.p3.revenue, proj.p6.revenue, proj.p12.revenue],
      ['Monthly API Cost',   proj.current.apiCost, proj.p1.apiCost, proj.p3.apiCost, proj.p6.apiCost, proj.p12.apiCost],
      ['Monthly Affiliates', proj.current.affPay, proj.p1.affPay, proj.p3.affPay, proj.p6.affPay, proj.p12.affPay],
      ['Monthly Net Profit', proj.current.net, proj.p1.net, proj.p3.net, proj.p6.net, proj.p12.net],
    ])
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const $ = (v: number, decimals = 0) => `$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
  const sfmt = (v: number) => `${v >= 0 ? '+' : '−'}${$(v)}`
  void sfmt

  if (loading) {
    return (
      <div style={{ paddingTop: 80, textAlign: 'center', fontSize: 13, color: T.ghost, fontFamily: "'Inter', system-ui, sans-serif" }}>
        Loading financial data…
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 48, paddingBottom: 120, maxWidth: 1100, margin: '0 auto', paddingInline: 48, fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 40, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 300, color: T.black }}>Financial summary</div>
          {lastUpdated && (
            <div style={{ fontSize: 12, color: T.ghost, marginTop: 6 }}>
              Last updated: {fmtTime(lastUpdated)} &nbsp;·&nbsp;
              <button onClick={() => { void loadAll() }} style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', padding: 0, transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = T.black)}
                onMouseLeave={e => (e.currentTarget.style.color = T.ghost)}
              >Refresh</button>
            </div>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setExportOpen(!exportOpen)}
            style={{ fontSize: 13, fontWeight: 500, color: T.bg, background: T.black, border: 'none', borderRadius: 100, padding: '9px 20px', cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >Export full report ▾</button>
          {exportOpen && (
            <>
              <div onClick={() => setExportOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
              <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: T.bg, border: `1px solid ${T.div}`, borderRadius: 8, padding: '6px 0', zIndex: 100, minWidth: 260, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                <button onClick={() => { exportAll(); setExportOpen(false) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 13, color: T.black, background: 'none', border: 'none', padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit' }}
                  onMouseEnter={e => (e.currentTarget.style.background = T.row)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >Download all reports (7 CSVs)</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Section 1: Big Numbers ───────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px 56px', marginBottom: 48 }}>
        {[
          { label: 'EARNED ALL TIME',    value: bigNums.earnedAllTime,    bold: false },
          { label: 'EARNED THIS MONTH',  value: bigNums.earnedThisMonth,  bold: false },
          { label: 'EARNED THIS YEAR',   value: bigNums.earnedThisYear,   bold: false },
          { label: 'INVOICED THIS MONTH', value: bigNums.invoicedThisMonth, bold: false },
          { label: 'OUTSTANDING',        value: bigNums.outstanding,      bold: false },
          { label: 'OVERDUE',            value: bigNums.overdue,          bold: bigNums.overdue > 0 },
        ].map(s => (
          <div key={s.label}>
            <div style={{ fontSize: 48, fontWeight: s.bold ? 700 : 600, color: T.black, lineHeight: 1, letterSpacing: '-0.02em' }}>
              ${s.value.toLocaleString('en-US')}
            </div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: T.ghost, marginTop: 8 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <Divider />

      {/* ── Section 2: P&L ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost }}>
            P&L — {fmtMonth(plMonth).toUpperCase()}
          </span>
          <select value={plMonth} onChange={e => setPlMonth(e.target.value)}
            style={{ fontSize: 12, color: T.black, border: `1px solid ${T.div}`, borderRadius: 6, padding: '6px 10px', fontFamily: 'inherit', outline: 'none', background: T.bg, cursor: 'pointer' }}>
            {monthOptions.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
          </select>
        </div>

        <div style={{ maxWidth: 560 }}>
          {/* Revenue header */}
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, marginBottom: 6 }}>REVENUE</div>
          <PLLine label="Billing collected"     value={$(plData.collected)}   indent />
          <PLLine label="Billing outstanding"   value={$(plData.outstanding)} indent />
          <PLLine label="Billing overdue"       value={$(plData.overdue)}     indent />
          <PLLine label="Billing waived"        value={$(plData.waived)}      indent />
          <PLLine label="Total invoiced" value={$(plData.totalInvoiced)} total dividerBefore />

          {/* Costs header */}
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, margin: '20px 0 6px' }}>COSTS</div>
          <PLLine label="Claude API"                       value={$(plData.apiCost, 2)}    indent />
          <PLLine label="Affiliate payouts (owed)"         value={$(plData.affOwed)}       indent />
          <PLLine label="Affiliate payouts (paid)"         value={$(plData.affPaid)}       indent />
          <PLLine label="Infrastructure (Supabase + Vercel + Domain)" value={$(INFRA_TOTAL)} indent />
          <PLLine label="Total costs" value={$(plData.totalCosts, 2)} total dividerBefore />

          {/* Net */}
          <div style={{ height: 2, background: T.black, margin: '12px 0' }} />
          <PLLine label="Net revenue (collected − costs)" value={$(plData.netCollected)} large />
          <PLLine label="Net revenue (invoiced − costs)"  value={$(plData.netInvoiced)}  />
        </div>
      </div>

      <Divider />

      {/* ── Section 3: Monthly Overview ──────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <SectionHead label="Monthly Overview" />
          <button onClick={() => {
            dlCSV('monthly-overview.csv', [
              ['Month', "VA's", 'Clients', 'Products', 'Invoiced', 'Collected', 'API Cost', 'Affiliates', 'Net Profit', 'Margin'],
              ...monthRows.map(r => [fmtMonthShort(r.month), r.vas, r.clients, r.variants, r.invoiced, r.collected, r.apiCost.toFixed(2), r.affiliates.toFixed(2), r.netProfit.toFixed(2), r.margin.toFixed(1) + '%']),
            ])
          }} style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', padding: 0, transition: 'color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = T.black)}
          onMouseLeave={e => (e.currentTarget.style.color = T.ghost)}
          >Export CSV →</button>
        </div>

        {/* Table header */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 900 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '100px 50px 60px 80px 90px 90px 80px 80px 90px 70px', gap: 8, paddingBottom: 10, borderBottom: `1px solid ${T.div}` }}>
              {['Month', "VA's", 'Clients', 'Products', 'Invoiced', 'Collected', 'API Cost', 'Affiliates', 'Net Profit', 'Margin'].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost }}>{h}</span>
              ))}
            </div>

            {monthRows.map(r => {
              const isExpanded = expandedMonth === r.month
              const rowBill = billing.filter(b => b.month === r.month)
              const top5 = rowBill.sort((a, b) => b.total_amount - a.total_amount).slice(0, 5)
              const rMonthPL_collected = rowBill.filter(b => b.status === 'paid').reduce((s, b) => s + b.total_amount, 0)
              const rMonthPL_outstanding = rowBill.filter(b => b.status === 'outstanding').reduce((s, b) => s + b.total_amount, 0)
              const rMonthPL_overdue = rowBill.filter(b => b.status === 'overdue').reduce((s, b) => s + b.total_amount, 0)

              return (
                <div key={r.month} style={{ borderBottom: `1px solid ${T.row}` }}>
                  <div
                    onClick={() => setExpandedMonth(isExpanded ? null : r.month)}
                    style={{ display: 'grid', gridTemplateColumns: '100px 50px 60px 80px 90px 90px 80px 80px 90px 70px', gap: 8, padding: '14px 0', cursor: 'pointer', alignItems: 'center', transition: 'opacity 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.6')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500, color: T.black }}>{fmtMonthShort(r.month)}</span>
                    <span style={{ fontSize: 12, color: T.sec }}>{r.vas}</span>
                    <span style={{ fontSize: 12, color: T.sec }}>{r.clients}</span>
                    <span style={{ fontSize: 12, color: T.sec }}>{r.variants.toLocaleString()}</span>
                    <span style={{ fontSize: 13, color: T.black }}>${r.invoiced.toLocaleString()}</span>
                    <span style={{ fontSize: 13, color: T.black }}>${r.collected.toLocaleString()}</span>
                    <span style={{ fontSize: 12, color: T.ter }}>${r.apiCost.toFixed(0)}</span>
                    <span style={{ fontSize: 12, color: T.ter }}>${r.affiliates.toFixed(0)}</span>
                    <span style={{ fontSize: 13, fontWeight: r.netProfit < 0 ? 700 : 500, color: T.black }}>${r.netProfit.toFixed(0)}</span>
                    <span style={{ fontSize: 13, color: r.margin >= 80 ? T.black : T.ter, fontWeight: r.margin < 50 ? 500 : 400 }}>{r.margin.toFixed(0)}%</span>
                  </div>

                  {isExpanded && (
                    <div style={{ paddingLeft: 16, paddingBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, marginBottom: 10 }}>Mini P&L</div>
                        {[
                          ['Collected',    $(rMonthPL_collected)],
                          ['Outstanding',  $(rMonthPL_outstanding)],
                          ['Overdue',      $(rMonthPL_overdue)],
                          ['API Cost',     $(r.apiCost, 2)],
                          ['Affiliates',   $(r.affiliates)],
                          ['Net Profit',   $(r.netProfit)],
                        ].map(([l, v]) => (
                          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', paddingBlock: 4, fontSize: 12, color: T.ter, borderBottom: `1px solid ${T.row}` }}>
                            <span>{l}</span><span style={{ color: T.black, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, marginBottom: 10 }}>Top VA's</div>
                        {top5.map(b => (
                          <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', paddingBlock: 4, fontSize: 12, borderBottom: `1px solid ${T.row}` }}>
                            <span style={{ color: T.sec }}>{b.va_name ?? b.va_id.slice(0, 8)}</span>
                            <span style={{ color: T.black, fontVariantNumeric: 'tabular-nums' }}>${b.total_amount}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Totals row */}
            {monthRows.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '100px 50px 60px 80px 90px 90px 80px 80px 90px 70px', gap: 8, padding: '14px 0', borderTop: `1px solid #E8E8E8` }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.black }}>TOTAL</span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{[...new Set(billing.map(b => b.va_id))].length}</span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{monthRows.reduce((s, r) => s + r.clients, 0)}</span>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{monthRows.reduce((s, r) => s + r.variants, 0).toLocaleString()}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>${monthRows.reduce((s, r) => s + r.invoiced, 0).toLocaleString()}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>${monthRows.reduce((s, r) => s + r.collected, 0).toLocaleString()}</span>
                <span style={{ fontSize: 12 }}>${monthRows.reduce((s, r) => s + r.apiCost, 0).toFixed(0)}</span>
                <span style={{ fontSize: 12 }}>${monthRows.reduce((s, r) => s + r.affiliates, 0).toFixed(0)}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>${monthRows.reduce((s, r) => s + r.netProfit, 0).toFixed(0)}</span>
                <span />
              </div>
            )}
          </div>
        </div>
      </div>

      <Divider />

      {/* ── Section 4: Collection Rate ───────────────────────────────────────── */}
      <div>
        <SectionHead label="Collection Rate" />
        {collectionRates.length === 0 ? (
          <div style={{ fontSize: 13, color: T.ghost }}>No data yet.</div>
        ) : (
          <>
            {collectionRates.slice(0, 12).map(r => (
              <div key={r.month} style={{ display: 'flex', alignItems: 'center', gap: 20, paddingBlock: 10, borderBottom: `1px solid ${T.row}` }}>
                <span style={{ fontSize: 13, color: T.black, minWidth: 80 }}>{fmtMonthShort(r.month)}</span>
                <span style={{ fontSize: 13, color: T.ter, minWidth: 120 }}>Invoiced: ${r.invoiced.toLocaleString()}</span>
                <span style={{ fontSize: 13, color: T.black, minWidth: 120 }}>Collected: ${r.collected.toLocaleString()}</span>
                <span style={{ fontSize: 14, fontWeight: r.rate < 90 ? 700 : 500, color: T.black, minWidth: 60 }}>{r.rate.toFixed(0)}%</span>
                <div style={{ flex: 1, height: 4, background: '#F0F0F0', borderRadius: 2, maxWidth: 200 }}>
                  <div style={{ height: '100%', background: T.black, borderRadius: 2, width: `${Math.min(r.rate, 100)}%`, transition: 'width 0.4s' }} />
                </div>
              </div>
            ))}
            <div style={{ paddingTop: 16, fontSize: 14, fontWeight: 600, color: T.black }}>
              Average: {avgCollectionRate.toFixed(0)}%
            </div>
          </>
        )}
      </div>

      <Divider />

      {/* ── Section 5: Revenue by VA ─────────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <SectionHead label="Revenue by VA" />
          <PeriodPills value={revPeriod} onChange={setRevPeriod} />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 800 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 80px 90px 80px 110px 90px 70px', gap: 8, paddingBottom: 10, borderBottom: `1px solid ${T.div}` }}>
              {['VA', 'Clients', 'Products', 'Revenue', 'API Cost', 'Aff. Owed', 'Net', '% Total'].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost }}>{h}</span>
              ))}
            </div>

            {(showAllVAs ? vaRevRows : vaRevRows.slice(0, 10)).map(r => (
              <div key={r.va_id} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 80px 90px 80px 110px 90px 70px', gap: 8, padding: '12px 0', borderBottom: `1px solid ${T.row}`, alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: T.black }}>{r.va_name}</span>
                <span style={{ fontSize: 12, color: T.sec }}>{r.clients}</span>
                <span style={{ fontSize: 12, color: T.sec }}>{r.variants.toLocaleString()}</span>
                <span style={{ fontSize: 13, color: T.black }}>${r.revenue.toLocaleString()}</span>
                <span style={{ fontSize: 12, color: T.ter }}>${r.api.toFixed(0)}</span>
                <span style={{ fontSize: 12, color: T.ter }}>${r.affOwed.toFixed(0)}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: T.black }}>${r.net.toFixed(0)}</span>
                <span style={{ fontSize: 12, color: T.ghost }}>{r.pct.toFixed(1)}%</span>
              </div>
            ))}

            {vaRevRows.length > 10 && (
              <div style={{ paddingTop: 12 }}>
                <button onClick={() => setShowAllVAs(!showAllVAs)}
                  style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', padding: 0, transition: 'color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = T.black)}
                  onMouseLeave={e => (e.currentTarget.style.color = T.ghost)}
                >{showAllVAs ? 'Show less ↑' : `View all ${vaRevRows.length} VA's →`}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <Divider />

      {/* ── Section 6: Revenue by Tier ───────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <SectionHead label="Revenue by Tier" />
          <PeriodPills value={revPeriod} onChange={setRevPeriod} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {tierRevRows.map(r => (
            <div key={r.tier} style={{ padding: '14px 0', borderBottom: `1px solid ${T.row}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: T.black, minWidth: 220 }}>{r.meta.label} · ${r.meta.price} · {r.meta.range}</span>
                <span style={{ fontSize: 12, color: T.ter, minWidth: 90 }}>Clients: {r.clients}</span>
                <span style={{ fontSize: 13, color: T.black, minWidth: 90 }}>Revenue: ${r.revenue.toLocaleString()}</span>
                <span style={{ fontSize: 12, color: T.ter, minWidth: 80 }}>{r.pctRev.toFixed(1)}% revenue</span>
                <span style={{ fontSize: 12, color: T.ghost, minWidth: 80 }}>{r.pctClients.toFixed(1)}% clients</span>
                <div style={{ flex: 1, height: 4, background: '#F0F0F0', borderRadius: 2, maxWidth: 160, minWidth: 80 }}>
                  <div style={{ height: '100%', background: T.black, borderRadius: 2, width: `${r.pctRev}%`, transition: 'width 0.4s' }} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {tierRevRows.some(r => r.clients > 0) && (
          <div style={{ paddingTop: 14, fontSize: 14, color: T.black }}>
            Average revenue per client: ${tierRevRows.reduce((s, r) => s + r.revenue, 0) > 0 && tierRevRows.reduce((s, r) => s + r.clients, 0) > 0
              ? (tierRevRows.reduce((s, r) => s + r.revenue, 0) / tierRevRows.reduce((s, r) => s + r.clients, 0)).toFixed(0)
              : '—'}
          </div>
        )}
      </div>

      <Divider />

      {/* ── Section 7: Cost Breakdown ────────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <SectionHead label="Cost Breakdown" />
          <PeriodPills value={costPeriod} onChange={setCostPeriod} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 48 }}>
          {/* API Costs */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, marginBottom: 14 }}>API COSTS</div>
            {[
              ['Total',           $(costData.totalApi, 2)],
              ['Per upload',      $(costData.avgPerUpload, 4)],
              ['Per product row',     $(costData.avgPerVariant, 5)],
              ['Per unique product',  $(costData.avgPerProduct, 4)],
              ['Cache hit rate',  `${costData.cacheRate.toFixed(1)}%`],
              ['Total tokens',    `${(costData.totalInput / 1e6).toFixed(1)}M`],
              ['Input tokens',    `${(costData.totalInput / 1e6).toFixed(1)}M`],
              ['Output tokens',   `${(costData.totalOutput / 1e6).toFixed(1)}M`],
              ['Cached tokens',   `${(costData.totalCached / 1e6).toFixed(1)}M`],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', paddingBlock: 6, borderBottom: `1px solid ${T.row}`, fontSize: 12 }}>
                <span style={{ color: T.ghost }}>{l}</span>
                <span style={{ color: T.black, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Affiliate Payouts */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, marginBottom: 14 }}>AFFILIATE PAYOUTS</div>
            {[
              ['Total owed',               $(costData.affOwed)],
              ['Total paid',               $(costData.affPaid)],
              ['Active referral relations', String(costData.activeRels)],
              ['Avg payout per referrer',  $(costData.avgPayout)],
              ['As % of revenue',          `${costData.affPct.toFixed(1)}%`],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', paddingBlock: 6, borderBottom: `1px solid ${T.row}`, fontSize: 12 }}>
                <span style={{ color: T.ghost }}>{l}</span>
                <span style={{ color: T.black, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Infrastructure */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, marginBottom: 14 }}>INFRASTRUCTURE</div>
            {Object.entries(INFRA).map(([name, cost]) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', paddingBlock: 6, borderBottom: `1px solid ${T.row}`, fontSize: 12 }}>
                <span style={{ color: T.ghost }}>{name}</span>
                <span style={{ color: T.black, fontVariantNumeric: 'tabular-nums' }}>${cost}/mo</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBlock: 8, borderTop: `1px solid ${T.div}`, marginTop: 4, fontSize: 13, fontWeight: 600 }}>
              <span style={{ color: T.black }}>Total</span>
              <span style={{ color: T.black }}>${INFRA_TOTAL}/mo</span>
            </div>
          </div>
        </div>

        {/* Total cost % of revenue */}
        {costData.totalRev > 0 && (
          <div style={{ marginTop: 24, fontSize: 14, fontWeight: 600, color: T.black }}>
            Total cost as % of revenue: {(((costData.totalApi + costData.affPaid + costData.affOwed + INFRA_TOTAL) / costData.totalRev) * 100).toFixed(1)}%
          </div>
        )}
      </div>

      <Divider />

      {/* ── Section 8: Projections ───────────────────────────────────────────── */}
      <div>
        <SectionHead label="Projections" />
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 760 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '200px repeat(5, 1fr)', gap: 8, paddingBottom: 10, borderBottom: `1px solid ${T.div}` }}>
              {['Metric', 'Current', '+1 Month', '+3 Months', '+6 Months', '+12 Months'].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost }}>{h}</span>
              ))}
            </div>

            {[
              { label: "Active VA's",             vals: [proj.current.vas, proj.p1.vas, proj.p3.vas, proj.p6.vas, proj.p12.vas],                                   fmt: (v: number) => String(v) },
              { label: 'Active clients',          vals: [proj.current.clients, proj.p1.clients, proj.p3.clients, proj.p6.clients, proj.p12.clients],               fmt: (v: number) => String(v) },
              { label: 'Monthly products',        vals: [proj.current.variants, proj.p1.variants, proj.p3.variants, proj.p6.variants, proj.p12.variants],           fmt: (v: number) => v.toLocaleString() },
              { label: 'Monthly revenue',         vals: [proj.current.revenue, proj.p1.revenue, proj.p3.revenue, proj.p6.revenue, proj.p12.revenue],               fmt: (v: number) => `$${v.toLocaleString()}` },
              { label: 'Monthly API cost',        vals: [proj.current.apiCost, proj.p1.apiCost, proj.p3.apiCost, proj.p6.apiCost, proj.p12.apiCost],               fmt: (v: number) => `$${v.toLocaleString()}` },
              { label: 'Monthly aff. payouts',    vals: [proj.current.affPay, proj.p1.affPay, proj.p3.affPay, proj.p6.affPay, proj.p12.affPay],                   fmt: (v: number) => `$${v.toLocaleString()}` },
              { label: 'Monthly net profit',      vals: [proj.current.net, proj.p1.net, proj.p3.net, proj.p6.net, proj.p12.net],                                   fmt: (v: number) => `$${v.toLocaleString()}` },
              { label: 'Cumulative net',          vals: [proj.current.net, proj.current.net + proj.p1.net, proj.current.net + proj.p1.net * 3, proj.current.net + proj.p1.net * 6, proj.current.net + proj.p1.net * 12], fmt: (v: number) => `$${v.toLocaleString()}` },
            ].map(row => (
              <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '200px repeat(5, 1fr)', gap: 8, padding: '12px 0', borderBottom: `1px solid ${T.row}`, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: T.ter }}>{row.label}</span>
                {row.vals.map((v, i) => (
                  <span key={i} style={{ fontSize: 13, color: T.black, fontVariantNumeric: 'tabular-nums' }}>{row.fmt(v)}</span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Annual projection */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: T.black }}>
            Annual projection: ${(proj.p1.net * 12).toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: '#DDDDDD', fontStyle: 'italic', marginTop: 6 }}>
            Based on {proj.rate >= 0 ? '+' : ''}{proj.rate}% monthly growth from last 3 months. Capped at 50%/month. Actual results may vary.
          </div>
        </div>
      </div>

      <Divider />

      {/* ── Section 9: Cashflow Timeline ────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <SectionHead label="Cashflow" />
          <div style={{ fontSize: 14, fontWeight: 500, color: T.black }}>
            Balance: ${runningBalance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {(['all', 'income', 'api', 'affiliate'] as CfFilter[]).map(f => (
            <button key={f} onClick={() => { setCfFilter(f); setCfPage(0) }}
              style={{ fontSize: 11, padding: '4px 12px', borderRadius: 100, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', border: `1px solid ${cfFilter === f ? T.black : T.div}`, background: cfFilter === f ? T.black : 'none', color: cfFilter === f ? T.bg : T.ghost }}
            >
              {f === 'all' ? 'All' : f === 'income' ? 'Income' : f === 'api' ? 'API Costs' : 'Affiliates'}
            </button>
          ))}
        </div>

        {cashflowPage.length === 0 ? (
          <div style={{ fontSize: 13, color: T.ghost }}>No events found.</div>
        ) : (
          cashflowPage.map(e => (
            <div key={e.key} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0', borderBottom: `1px solid ${T.row}` }}>
              <span style={{ fontSize: 12, fontFamily: 'monospace', color: T.ghost, minWidth: 56 }}>{fmtDateShort(e.date)}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: e.type === 'income' ? T.black : T.ter, minWidth: 14 }}>
                {e.type === 'income' ? '+' : '−'}
              </span>
              <span style={{ fontSize: 13, color: T.black, flex: 1 }}>{e.desc}</span>
              <span style={{ fontSize: 14, fontWeight: 500, color: e.type === 'income' ? T.black : T.ter, fontVariantNumeric: 'tabular-nums' }}>
                {e.type === 'income' ? '+' : '−'}${Math.abs(e.amount).toFixed(e.type === 'income' ? 0 : 2)}
              </span>
            </div>
          ))
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, fontSize: 13, color: T.ghost }}>
            <button onClick={() => setCfPage(p => Math.max(0, p - 1))} disabled={cfPage === 0}
              style={{ fontSize: 12, color: T.ghost, background: 'none', border: `1px solid ${T.div}`, borderRadius: 6, padding: '5px 12px', cursor: cfPage === 0 ? 'default' : 'pointer', fontFamily: 'inherit', opacity: cfPage === 0 ? 0.4 : 1, transition: 'color 0.15s' }}
              onMouseEnter={e => { if (cfPage > 0) e.currentTarget.style.color = T.black }}
              onMouseLeave={e => (e.currentTarget.style.color = T.ghost)}
            >← Previous</button>
            <span>Page {cfPage + 1} of {totalPages} · {cashflowFiltered.length} events</span>
            <button onClick={() => setCfPage(p => Math.min(totalPages - 1, p + 1))} disabled={cfPage >= totalPages - 1}
              style={{ fontSize: 12, color: T.ghost, background: 'none', border: `1px solid ${T.div}`, borderRadius: 6, padding: '5px 12px', cursor: cfPage >= totalPages - 1 ? 'default' : 'pointer', fontFamily: 'inherit', opacity: cfPage >= totalPages - 1 ? 0.4 : 1, transition: 'color 0.15s' }}
              onMouseEnter={e => { if (cfPage < totalPages - 1) e.currentTarget.style.color = T.black }}
              onMouseLeave={e => (e.currentTarget.style.color = T.ghost)}
            >Next →</button>
          </div>
        )}
      </div>

    </div>
  )
}
