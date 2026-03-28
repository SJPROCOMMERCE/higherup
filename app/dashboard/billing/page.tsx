'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useVA } from '@/context/va-context'
import { supabase } from '@/lib/supabase'
import type { Billing, BillingLineItem } from '@/lib/supabase'
import { getTiers, getTierSync, DEFAULT_TIERS, type Tier } from '@/lib/pricing'
import { HIGHERUP_PAYMENT, getWisePaymentLink } from '@/lib/payment-config'
import { Copy, Check } from 'lucide-react'

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  black:  '#111111',
  sec:    '#555555',
  ter:    '#999999',
  ghost:  '#CCCCCC',
  div:    '#EEEEEE',
  row:    '#FAFAFA',
  bg:     '#FFFFFF',
  green:  '#00A550',
  red:    '#CC3300',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  wise: 'Wise', paypal: 'PayPal', gcash: 'GCash', maya: 'Maya',
  upi: 'UPI', jazzcash: 'JazzCash', easypaisa: 'EasyPaisa',
  bkash: 'bKash', bank_transfer: 'Bank Transfer',
}

const TIER_LABEL: Record<string, string> = {
  tier_1: 'Starter', tier_2: 'Growth', tier_3: 'Professional', tier_4: 'Enterprise',
}

function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getPaymentSummary(method: string, pd: Record<string, string>): string {
  switch (method) {
    case 'wise':          return pd.wise_email        ?? ''
    case 'paypal':        return pd.paypal_email      ?? ''
    case 'gcash':         return pd.gcash_number      ?? ''
    case 'maya':          return pd.maya_number       ?? ''
    case 'upi':           return pd.upi_id            ?? ''
    case 'jazzcash':      return pd.jazzcash_number   ?? ''
    case 'easypaisa':     return pd.easypaisa_number  ?? ''
    case 'bkash':         return pd.bkash_number      ?? ''
    case 'bank_transfer': return [pd.bank_name, pd.account_number].filter(Boolean).join(' · ')
    default:              return ''
  }
}

// ─── Month card ───────────────────────────────────────────────────────────────

type MonthClient = {
  client_id:            string
  store_name:           string
  variant_count:        number
  va_rate_per_product:  number | null
}

function MonthCard({
  monthClients,
  pricingTiers,
}: {
  monthClients: MonthClient[]
  pricingTiers: Tier[]
}) {
  const [visible,     setVisible]     = useState(false)
  const [heroDisplay, setHeroDisplay] = useState(0)

  // Calculations
  const now         = new Date()
  const monthSeed   = now.getMonth() // 0–11, consistent within a month
  const hasRates    = monthClients.some(c => c.va_rate_per_product != null)
  const grossIncome = monthClients.reduce((s, c) => s + (c.variant_count * (c.va_rate_per_product ?? 0)), 0)
  const totalFee    = monthClients.reduce((s, c) => s + getTierSync(pricingTiers, c.variant_count).amount, 0)
  const netIncome   = grossIncome - totalFee
  const margin      = grossIncome > 0 ? Math.round((netIncome / grossIncome) * 100) : 0

  const totalVariants  = monthClients.reduce((s, c) => s + c.variant_count, 0)
  const manualHours    = Math.round(totalVariants * 13 / 60)
  const higherUpHours  = monthClients.length * 2
  const savedHours     = Math.max(0, manualHours - higherUpHours)
  const savedDays      = Math.round(savedHours / 8 * 10) / 10

  // Hero: profit if rates set, otherwise hours saved
  const heroValue  = hasRates ? Math.round(netIncome) : savedHours
  const heroLabel  = hasRates ? 'profit' : 'saved'
  const heroPrefix = hasRates ? '$' : ''
  const heroSuffix = hasRates ? '' : 'h'

  // Motivating phrase — no emoji, seeded per month
  const effectiveRate = Math.round((hasRates ? netIncome : grossIncome) / Math.max(higherUpHours, 1))
  const PHRASES = [
    `That's ${savedDays} days you got back this month.`,
    manualHours > 0 ? `You'd need ${Math.ceil(manualHours / 40)} full work weeks to do this manually.` : `${totalVariants.toLocaleString()} products optimized. Zero hours typing.`,
    `${savedHours} hours back. Spend them on what matters.`,
    effectiveRate > 0 ? `Your effective rate: $${effectiveRate}/hour.` : `${totalVariants.toLocaleString()} products optimized. Zero hours typing.`,
    `${totalVariants.toLocaleString()} products optimized. Zero hours typing.`,
  ]
  const phrase = PHRASES[monthSeed % PHRASES.length]

  // Bar: HigherUp hours as % of manual hours
  const barPct = manualHours > 0 ? Math.round((higherUpHours / manualHours) * 100) : 0

  // Fade-in on mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80)
    return () => clearTimeout(t)
  }, [])

  // Count-up animation on hero number
  useEffect(() => {
    if (!visible || heroValue === 0) { setHeroDisplay(heroValue); return }
    let current = 0
    const steps = 22
    const step  = heroValue / steps
    const id    = setInterval(() => {
      current = Math.min(current + step, heroValue)
      setHeroDisplay(Math.round(current))
      if (current >= heroValue) clearInterval(id)
    }, 25)
    return () => clearInterval(id)
  }, [visible, heroValue])

  if (monthClients.length === 0) return null

  const Divider = ({ mt = 0, mb = 16 }: { mt?: number; mb?: number }) => (
    <div style={{ height: 1, background: '#EEEEEE', marginTop: mt, marginBottom: mb }} />
  )
  const Label = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#CCCCCC', marginBottom: 16 }}>
      {children}
    </div>
  )
  const Row = ({ label, value, bold = false, dim = false, green = false }: { label: string; value: string; bold?: boolean; dim?: boolean; green?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: bold ? 8 : 10 }}>
      <span style={{ fontSize: 14, fontWeight: bold ? 500 : 400, color: bold ? '#111111' : '#999999' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: bold ? 500 : 400, color: green ? '#2DB87E' : bold ? '#111111' : dim ? '#999999' : '#111111' }}>{value}</span>
    </div>
  )

  return (
    <div style={{
      opacity:    visible ? 1 : 0,
      transform:  visible ? 'translateY(0)' : 'translateY(8px)',
      transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
    }}>
      <div style={{
        background:   '#F9F9F8',
        border:       '1px solid #F0F0F0',
        borderRadius: 16,
        padding:      32,
      }}>

        {/* ── Hero ───────────────────────────────────────────── */}
        <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#CCCCCC', marginBottom: 12 }}>
          THIS MONTH
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 4 }}>
          {heroPrefix && (
            <span style={{ fontSize: 36, fontWeight: 600, color: hasRates ? '#2DB87E' : '#111111', letterSpacing: '-0.02em', lineHeight: 1 }}>
              {heroPrefix}
            </span>
          )}
          <span style={{ fontSize: 64, fontWeight: 600, color: hasRates ? '#2DB87E' : '#111111', letterSpacing: '-0.04em', lineHeight: 1 }}>
            {heroDisplay.toLocaleString()}
          </span>
          {heroSuffix && (
            <span style={{ fontSize: 36, fontWeight: 600, color: hasRates ? '#2DB87E' : '#111111', letterSpacing: '-0.02em', lineHeight: 1 }}>
              {heroSuffix}
            </span>
          )}
        </div>
        <div style={{ fontSize: 16, fontWeight: 300, color: '#999999', marginBottom: 40 }}>{heroLabel}</div>

        {/* ── Breakdown ──────────────────────────────────────── */}
        <Divider mb={16} />
        {hasRates ? (
          <>
            <Row label="Income"       value={`$${grossIncome.toFixed(0)}`} />
            <Row label="HigherUp share" value={`−$${totalFee.toFixed(0)}`}  dim />
            <div style={{ height: 1, background: '#F5F5F5', marginBottom: 12 }} />
            <Row label="Profit"       value={`$${netIncome.toFixed(0)}`}  bold green />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
              <span style={{ fontSize: 13, color: '#CCCCCC' }}>Margin</span>
              <span style={{ fontSize: 13, color: '#CCCCCC' }}>{margin}%</span>
            </div>
          </>
        ) : (
          <div style={{ marginBottom: 24 }}>
            <a
              href="/dashboard/clients"
              style={{ fontSize: 13, color: '#999999', textDecoration: 'none', borderBottom: '1px solid #EEEEEE', paddingBottom: 1 }}
            >
              Set your rate to see earnings →
            </a>
          </div>
        )}

        {/* ── Time saved ─────────────────────────────────────── */}
        <Divider mb={16} />
        <Label>Time saved</Label>
        <div style={{ display: 'flex', gap: 32, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 32, fontWeight: 600, color: '#111111', lineHeight: 1, letterSpacing: '-0.02em' }}>{manualHours}h</div>
            <div style={{ fontSize: 12, color: '#CCCCCC', marginTop: 5 }}>manual</div>
          </div>
          <div>
            <div style={{ fontSize: 32, fontWeight: 600, color: '#111111', lineHeight: 1, letterSpacing: '-0.02em' }}>{higherUpHours}h</div>
            <div style={{ fontSize: 12, color: '#CCCCCC', marginTop: 5 }}>with HigherUp</div>
          </div>
        </div>
        {/* Proportional bar: black = HigherUp hours, gray = manual hours */}
        <div style={{ height: 6, background: '#F0F0F0', borderRadius: 3, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${barPct}%`, background: '#111111', borderRadius: 3,
            transition: visible ? 'width 0.6s ease-out' : 'none',
          }} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#111111', marginBottom: 4 }}>
            You saved {savedHours} hours
          </div>
          <div style={{ fontSize: 13, color: '#CCCCCC' }}>That&apos;s {savedDays} work days</div>
        </div>

        {/* ── Per client ─────────────────────────────────────── */}
        <Divider mb={16} />
        <Label>Per client</Label>
        {monthClients.map(c => (
          <div
            key={c.client_id}
            style={{ display: 'flex', justifyContent: 'space-between', paddingBlock: 8, borderBottom: '1px solid #F5F5F5' }}
          >
            <span style={{ fontSize: 13, color: '#111111', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.store_name}
            </span>
            <span style={{ fontSize: 13, color: '#CCCCCC' }}>
              {c.variant_count.toLocaleString()} products
            </span>
          </div>
        ))}

        {/* ── Closer ─────────────────────────────────────────── */}
        <Divider mt={16} mb={20} />
        <div style={{ fontSize: 13, color: '#CCCCCC' }}>{phrase}</div>
      </div>
    </div>
  )
}

// ─── Invoice row (expandable) ─────────────────────────────────────────────────

function InvoiceRow({
  invoice,
  expanded,
  onToggle,
}: {
  invoice: Billing
  expanded: boolean
  onToggle: () => void
}) {
  const [lineItems, setLineItems] = useState<BillingLineItem[] | null>(null)

  useEffect(() => {
    if (!expanded || lineItems !== null) return
    supabase
      .from('billing_line_items')
      .select('*')
      .eq('billing_id', invoice.id)
      .order('amount', { ascending: false })
      .then(({ data }) => setLineItems((data ?? []) as BillingLineItem[]))
  }, [expanded, invoice.id, lineItems])

  const statusEl = () => {
    switch (invoice.status) {
      case 'paid':
        return <span style={{ color: T.ter }}>Paid {invoice.paid_at ? formatDate(invoice.paid_at) : ''}</span>
      case 'outstanding':
        return <span style={{ color: T.ghost }}>Outstanding</span>
      case 'overdue': {
        const days = invoice.due_date
          ? Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / 86400000)
          : 0
        return <span style={{ fontWeight: 500, color: T.black }}>Overdue ({days}d)</span>
      }
      case 'waived':
        return <span style={{ color: T.ghost, fontStyle: 'italic' }}>Waived</span>
      default:
        return <span style={{ color: T.ghost }}>{invoice.status}</span>
    }
  }

  return (
    <div style={{ borderBottom: '1px solid #F5F5F5' }}>
      {/* Row */}
      <div
        onClick={onToggle}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', cursor: 'pointer', transition: 'opacity 0.15s' }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '0.6' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
      >
        <div style={{ fontSize: 14, color: T.black }}>
          {formatMonth(invoice.month)}{' '}
          <span style={{ color: T.ghost }}>·</span>{' '}
          <span style={{ fontWeight: 500 }}>${invoice.total_amount.toFixed(0)}</span>{' '}
          <span style={{ color: T.ghost }}>·</span>{' '}
          {statusEl()}
        </div>
        <svg width="12" height="12" viewBox="0 0 12 12" style={{ flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', marginLeft: 8 }}>
          <path d="M2 4l4 4 4-4" stroke="#CCCCCC" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Expanded line items */}
      <div style={{ maxHeight: expanded ? 480 : 0, overflow: 'hidden', opacity: expanded ? 1 : 0, transition: 'max-height 0.3s ease, opacity 0.2s ease' }}>
        <div style={{ paddingBottom: 16, paddingLeft: 12 }}>
          {lineItems === null ? (
            <div style={{ fontSize: 12, color: T.ghost }}>Loading…</div>
          ) : lineItems.length === 0 ? (
            <div style={{ fontSize: 12, color: T.ghost }}>No line items.</div>
          ) : (
            <>
              {lineItems.map(li => (
                <div key={li.id} style={{ paddingBlock: 10, borderBottom: '1px solid #F9F9F9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: T.black }}>{li.store_name}</span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: T.black }}>${li.amount}</span>
                  </div>
                  <div style={{ fontSize: 12, color: T.ghost, marginTop: 3 }}>
                    {li.variant_count.toLocaleString()} products · {TIER_LABEL[li.tier] ?? li.tier}
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10 }}>
                <span style={{ fontSize: 12, color: T.ter }}>
                  {lineItems.reduce((s, l) => s + l.variant_count, 0).toLocaleString()} products
                </span>
                <span style={{ fontSize: 14, fontWeight: 500, color: T.black }}>
                  ${lineItems.reduce((s, l) => s + l.amount, 0).toFixed(0)}
                </span>
              </div>
              {invoice.status === 'paid' && invoice.payment_method_used && (
                <div style={{ marginTop: 10, fontSize: 12, color: T.ghost }}>
                  {PAYMENT_LABELS[invoice.payment_method_used] ?? invoice.payment_method_used}
                  {invoice.payment_reference && ` · Ref: ${invoice.payment_reference}`}
                </div>
              )}
              {/* Download invoice — coming soon */}
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  title="Invoice PDF download is coming soon"
                  style={{ fontSize: 12, color: T.ghost, cursor: 'default', textDecoration: 'none', userSelect: 'none' }}
                >
                  Download invoice
                </span>
                <span style={{ fontSize: 10, background: '#F0F0F0', color: T.ter, borderRadius: 100, padding: '2px 8px', fontWeight: 500, letterSpacing: '0.04em' }}>
                  Coming soon
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { currentVA } = useVA()

  const [pricingTiers,        setPricingTiers]        = useState<Tier[]>(DEFAULT_TIERS)
  const [monthClients,        setMonthClients]        = useState<MonthClient[]>([])
  const [invoices,            setInvoices]            = useState<Billing[]>([])
  const [loading,             setLoading]             = useState(true)
  const [expandedId,          setExpandedId]          = useState<string | null>(null)
  const [showPayInstructions, setShowPayInstructions] = useState(false)
  const [countdown,           setCountdown]           = useState('')
  const [lockedCount,         setLockedCount]         = useState(0)

  const load = useCallback(async () => {
    if (!currentVA) return
    setLoading(true)
    const now        = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

    const [uploadsRes, invoicesRes] = await Promise.all([
      supabase
        .from('uploads')
        .select('client_id, product_row_count, clients(store_name, va_rate_per_product)')
        .eq('va_id', currentVA.id)
        .in('status', ['done', 'processing', 'queued'])
        .gte('uploaded_at', monthStart)
        .lt('uploaded_at', monthEnd),
      supabase
        .from('billing')
        .select('*')
        .eq('va_id', currentVA.id)
        .order('generated_at', { ascending: false }),
    ])

    const clientMap = new Map<string, MonthClient>()
    for (const row of (uploadsRes.data ?? [])) {
      const r = row as unknown as {
        client_id: string
        product_row_count: number | null
        clients: { store_name: string; va_rate_per_product: number | null } | null
      }
      const ex = clientMap.get(r.client_id)
      if (ex) ex.variant_count += r.product_row_count ?? 0
      else clientMap.set(r.client_id, {
        client_id:           r.client_id,
        store_name:          r.clients?.store_name ?? 'Unknown',
        variant_count:       r.product_row_count ?? 0,
        va_rate_per_product: r.clients?.va_rate_per_product ?? null,
      })
    }
    setMonthClients([...clientMap.values()].sort((a, b) => b.variant_count - a.variant_count))
    setInvoices((invoicesRes.data ?? []) as Billing[])

    // Count locked uploads
    const { count: lc } = await supabase
      .from('uploads')
      .select('id', { count: 'exact', head: true })
      .eq('va_id', currentVA.id)
      .eq('output_locked', true)
    setLockedCount(lc ?? 0)

    setLoading(false)
  }, [currentVA])

  useEffect(() => { load() }, [load])
  useEffect(() => { getTiers().then(setPricingTiers) }, [])

  // Countdown timer for open invoice
  useEffect(() => {
    const openInv = invoices.find(i => i.status === 'outstanding' || i.status === 'overdue')
    if (!openInv?.due_date) return
    const dueDate = new Date(openInv.due_date)
    const update = () => {
      const diff = dueDate.getTime() - Date.now()
      if (diff <= 0) { setCountdown('Overdue'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      setCountdown(`${h}h ${m}m`)
    }
    update()
    const id = setInterval(update, 60000)
    return () => clearInterval(id)
  }, [invoices])

  if (!currentVA) return null

  const pd             = (currentVA.payment_details ?? {}) as Record<string, string>
  const method         = currentVA.payment_method ?? ''
  const paymentSummary = getPaymentSummary(method, pd)
  const currentMonthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // Derived
  const estimatedTotal = monthClients.reduce((s, c) => s + getTierSync(pricingTiers, c.variant_count).amount, 0)
  const totalVariants  = monthClients.reduce((s, c) => s + c.variant_count, 0)
  const openInvoice    = invoices.find(i => i.status === 'outstanding' || i.status === 'overdue')
  const pastInvoices   = invoices.filter(i => i.id !== openInvoice?.id)

  // ROI
  const hasRates    = monthClients.some(c => c.va_rate_per_product != null)
  const grossIncome = monthClients.reduce((s, c) => s + (c.variant_count * (c.va_rate_per_product ?? 0)), 0)
  const roi         = estimatedTotal > 0 && grossIncome > 0
    ? Math.round(((grossIncome - estimatedTotal) / estimatedTotal) * 100)
    : null

  // Copy helper
  const [copied, setCopied] = useState<string | null>(null)
  function copyText(text: string, key: string) {
    void navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(p => p === key ? null : p), 2000)
  }

  return (
    <>
      <style>{`
        @media (max-width: 1024px) {
          .billing-layout  { flex-direction: column !important; }
          .billing-receipt { position: static !important; width: auto !important; max-width: 360px !important; margin: 0 auto !important; }
        }
      `}</style>

      <div
        className="billing-layout"
        style={{
          paddingTop: 56, paddingBottom: 100, maxWidth: 960,
          margin: '0 auto', paddingInline: 48,
          display: 'flex', gap: 48, alignItems: 'flex-start',
        }}
      >
        {/* ── Left column ──────────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, maxWidth: 580 }}>

          <div style={{ fontSize: 28, fontWeight: 300, color: T.black, marginBottom: 40 }}>Billing</div>

          {/* ── Open invoice block (if any) ─────────────────────────────── */}
          {openInvoice && (
            <div style={{ background: T.row, border: `1px solid ${T.div}`, borderRadius: 12, padding: 24, marginBottom: 32 }}>
              <div style={{ fontSize: 11, color: T.ghost, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                Invoice {openInvoice.invoice_number}
              </div>
              <div style={{ fontSize: 32, fontWeight: 600, color: T.black, letterSpacing: '-0.02em', marginBottom: 8 }}>
                ${openInvoice.total_amount.toFixed(0)}
              </div>
              {openInvoice.status === 'outstanding' ? (
                <div style={{ fontSize: 14, color: T.black, marginBottom: 16 }}>
                  {countdown ? `Due in ${countdown}` : openInvoice.due_date ? `Due ${formatDate(openInvoice.due_date)}` : 'Due soon'}
                </div>
              ) : (
                <div style={{ fontSize: 14, fontWeight: 500, color: T.black, marginBottom: 16 }}>
                  Overdue{openInvoice.due_date ? ` · ${Math.floor((Date.now() - new Date(openInvoice.due_date).getTime()) / 86400000)} days` : ''}
                </div>
              )}
              {lockedCount > 0 && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: '#FEF3C7', borderRadius: 8, padding: '6px 12px', marginBottom: 16,
                }}>
                  <span style={{ fontSize: 12 }}>🔒</span>
                  <span style={{ fontSize: 12, color: '#92400E', fontWeight: 500 }}>
                    {lockedCount} file{lockedCount !== 1 ? 's' : ''} locked — pay your share to unlock
                  </span>
                </div>
              )}
              <div
                onClick={() => setShowPayInstructions(p => !p)}
                style={{ fontSize: 13, color: T.black, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, marginBottom: showPayInstructions ? 20 : 0, userSelect: 'none' }}
              >
                {showPayInstructions ? 'Hide payment details' : 'How to pay'}
              </div>
              {showPayInstructions && openInvoice && (
                <div style={{ marginTop: 4 }}>

                  {/* ── Block 1: Bank transfer ── */}
                  <div style={{ background: '#F9F9F8', border: '1px solid #F0F0F0', borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, marginBottom: 12 }}>
                      Bank transfer
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      {/* IBAN with copy icon */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <span style={{ fontSize: 11, color: T.ghost }}>IBAN</span>
                          <div style={{ fontSize: 13, fontWeight: 500, color: T.black, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.03em' }}>
                            {HIGHERUP_PAYMENT.bank.iban}
                          </div>
                        </div>
                        <button
                          onClick={() => copyText(HIGHERUP_PAYMENT.bank.iban.replace(/\s/g, ''), 'iban')}
                          title="Copy IBAN"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: copied === 'iban' ? T.green : T.ghost, display: 'flex', alignItems: 'center', transition: 'color 0.15s', flexShrink: 0 }}
                        >
                          {copied === 'iban' ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 24 }}>
                        <div>
                          <span style={{ fontSize: 11, color: T.ghost }}>BIC</span>
                          <div style={{ fontSize: 13, color: T.black }}>{HIGHERUP_PAYMENT.bank.bic}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: 11, color: T.ghost }}>Bank</span>
                          <div style={{ fontSize: 13, color: T.black }}>{HIGHERUP_PAYMENT.bank.bank_name}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: 11, color: T.ghost }}>Name</span>
                          <div style={{ fontSize: 13, color: T.black }}>{HIGHERUP_PAYMENT.bank.holder}</div>
                        </div>
                      </div>
                      <div style={{ height: 1, background: T.div }} />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <span style={{ fontSize: 11, color: T.ghost }}>Amount</span>
                          <div style={{ fontSize: 13, fontWeight: 500, color: T.black }}>${openInvoice.total_amount.toFixed(2)}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, marginLeft: 24 }}>
                          <div>
                            <span style={{ fontSize: 11, color: T.ghost }}>Reference</span>
                            <div style={{ fontSize: 13, fontWeight: 500, color: T.black }}>{openInvoice.invoice_number ?? '—'}</div>
                          </div>
                          {openInvoice.invoice_number && (
                            <button
                              onClick={() => copyText(openInvoice.invoice_number!, 'ref')}
                              title="Copy reference"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: copied === 'ref' ? T.green : T.ghost, display: 'flex', alignItems: 'center', transition: 'color 0.15s', flexShrink: 0 }}
                            >
                              {copied === 'ref' ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Block 2: Wise ── */}
                  <div style={{ background: '#F9F9F8', border: '1px solid #F0F0F0', borderRadius: 10, padding: '14px 16px', marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, marginBottom: 10 }}>
                      Wise
                    </div>
                    <a
                      href={getWisePaymentLink(openInvoice.total_amount, openInvoice.invoice_number ?? '')}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 13, fontWeight: 500, color: T.black, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, borderBottom: '1px solid transparent', transition: 'border-color 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.borderBottomColor = T.black)}
                      onMouseLeave={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
                    >
                      Pay ${openInvoice.total_amount.toFixed(2)} via Wise →
                    </a>
                    <div style={{ fontSize: 11, color: T.ghost, marginTop: 6 }}>
                      Amount and reference pre-filled.
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: T.ghost }}>
                    After payment, allow up to 24 hours for verification.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Payout method strip ─────────────────────────────────────── */}
          <div style={{
            background: T.row, borderRadius: 8, padding: '12px 16px',
            marginBottom: 32,
          }}>
            <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, marginBottom: 8 }}>
              Your payout method
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {method ? (
                <>
                  <span style={{ fontSize: 13, color: T.ter }}>
                    {PAYMENT_LABELS[method] ?? method}{paymentSummary ? ` · ${paymentSummary}` : ''}
                  </span>
                  <Link
                    href="/dashboard/profile"
                    style={{ fontSize: 12, color: T.ghost, textDecoration: 'none' }}
                    onMouseEnter={e => { e.currentTarget.style.color = T.black }}
                    onMouseLeave={e => { e.currentTarget.style.color = T.ghost }}
                  >
                    Change →
                  </Link>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 13, color: T.ter }}>No payout method set</span>
                  <Link href="/dashboard/profile" style={{ fontSize: 13, fontWeight: 500, color: T.black, textDecoration: 'none' }}>
                    Set up →
                  </Link>
                </>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#DDDDDD', marginTop: 8 }}>
              This is how we pay you for affiliate earnings.
            </div>
          </div>

          {/* ── First month banner ──────────────────────────────────────── */}
          {invoices.length === 0 && !loading && (() => {
            const nextMonth1st = new Date(
              new Date().getFullYear(),
              new Date().getMonth() + 1,
              1
            ).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            const estimatedProfit = hasRates ? Math.round(grossIncome - estimatedTotal) : null

            return (
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.ghost, marginBottom: 12 }}>
                  Your first month
                </div>
                <div style={{ fontSize: 15, fontWeight: 300, color: T.black, marginBottom: 8 }}>
                  You&apos;re in your first month. Keep uploading and earning.
                </div>
                <div style={{ fontSize: 13, color: T.ter, lineHeight: 1.6, marginBottom: 16 }}>
                  Your first invoice will be generated on {nextMonth1st}. Until then, everything you upload earns you money.
                </div>
                {totalVariants > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: 12, color: T.ghost, marginBottom: 6 }}>So far this month:</div>
                    <div style={{ fontSize: 14, color: T.black, lineHeight: 1.7 }}>
                      {totalVariants.toLocaleString()} products across {monthClients.length} client{monthClients.length !== 1 ? 's' : ''}{' '}
                      · est. HigherUp share: ${estimatedTotal}{' '}
                      {estimatedProfit !== null ? (
                        <>· est. profit: <span style={{ color: '#2DB87E' }}>${estimatedProfit}</span></>
                      ) : (
                        <></>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── Current month ───────────────────────────────────────────── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 500, color: T.black }}>{currentMonthLabel}</div>
            <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.ghost }}>
              Estimated invoice
            </div>
          </div>

          {loading ? (
            <div style={{ fontSize: 13, color: T.ghost, marginBottom: 32 }}>Loading…</div>
          ) : monthClients.length === 0 ? (
            <div style={{ fontSize: 13, color: T.ghost, marginBottom: 32 }}>No uploads processed this month.</div>
          ) : (
            <>
              {monthClients.map(c => {
                const tier = getTierSync(pricingTiers, c.variant_count)
                return (
                  <div key={c.client_id} style={{ paddingBlock: 16, borderBottom: '1px solid #F5F5F5' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 500, color: T.black }}>{c.store_name}</span>
                      <span style={{ fontSize: 15, fontWeight: 500, color: T.black }}>${tier.amount}</span>
                    </div>
                    <div style={{ fontSize: 12, color: T.ghost }}>
                      {c.variant_count.toLocaleString()} products · {tier.display_name}
                    </div>
                  </div>
                )
              })}
              <div style={{ height: 1, background: '#E8E8E8', margin: '16px 0 12px' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 500, color: T.black }}>Total</span>
                <span style={{ fontSize: 20, fontWeight: 600, color: T.black, letterSpacing: '-0.02em' }}>
                  ${estimatedTotal.toFixed(0)}
                </span>
              </div>
              <div style={{ fontSize: 12, color: T.ghost, marginBottom: 32 }}>
                {totalVariants.toLocaleString()} products across {monthClients.length} client{monthClients.length !== 1 ? 's' : ''}
              </div>
            </>
          )}

          {/* ── Payment timeline (two lines) ────────────────────────────── */}
          <div style={{ marginBottom: 32 }}>
            {invoices.length === 0 ? (
              <>
                <div style={{ fontSize: 13, color: T.black, marginBottom: 6 }}>
                  Your first invoice:{' '}
                  {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
                    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
                <div style={{ fontSize: 12, color: T.ghost }}>
                  Due within 48 hours of invoice date.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, color: T.black, marginBottom: 6 }}>
                  Payment due within 48 hours of invoice.
                </div>
                <div style={{ fontSize: 12, color: T.ghost }}>
                  Late payment: account paused. 14 days unpaid: account deleted.
                </div>
              </>
            )}
          </div>

          {/* ── ROI indicator ───────────────────────────────────────────── */}
          {estimatedTotal > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.ghost, marginBottom: 10 }}>
                Your ROI this month
              </div>
              {hasRates && roi !== null ? (
                <div style={{ fontSize: 14, color: T.black, lineHeight: 1.6 }}>
                  HigherUp share: <strong>${estimatedTotal.toFixed(0)}</strong>. You earn <strong>${grossIncome.toFixed(0)}</strong>. That&apos;s a <strong>{roi}% return</strong>.
                </div>
              ) : (
                <Link
                  href="/dashboard/clients"
                  style={{ fontSize: 13, color: T.ghost, textDecoration: 'none', borderBottom: `1px solid ${T.div}`, paddingBottom: 1 }}
                >
                  Set your rate per product to see your ROI →
                </Link>
              )}
            </div>
          )}

          {/* ── Past invoices ───────────────────────────────────────────── */}
          {pastInvoices.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.ghost, marginBottom: 12 }}>
                Past invoices
              </div>
              {pastInvoices.map(inv => (
                <InvoiceRow
                  key={inv.id}
                  invoice={inv}
                  expanded={expandedId === inv.id}
                  onToggle={() => setExpandedId(expandedId === inv.id ? null : inv.id)}
                />
              ))}
            </div>
          )}

        </div>

        {/* ── Right column: earnings card ──────────────────────────────────── */}
        <div className="billing-receipt" style={{ width: 320, flexShrink: 0, position: 'sticky', top: 120 }}>
          <MonthCard
            monthClients={monthClients}
            pricingTiers={pricingTiers}
          />
        </div>

      </div>
    </>
  )
}
