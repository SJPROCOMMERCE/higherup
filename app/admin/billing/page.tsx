'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { FREE_PRODUCTS_PER_MONTH, PRICE_PER_PRODUCT, getCurrentBillingMonth, formatBillingMonth } from '@/lib/usage-tracker'

const T = {
  black:  '#111111',
  muted:  '#666666',
  ghost:  '#999999',
  border: '#EEEEEE',
  bg:     '#FAFAFA',
  green:  '#2DB87E',
}

function fmt(n: number) { return `$${n.toFixed(2)}` }
function fmtMonth(month: string) {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type BillRow = {
  id:                string
  invoice_number:    string
  va_id:             string
  va_name:           string
  va_email:          string
  month:             string
  total_amount:      number
  total_products:    number | null
  free_products:     number | null
  billable_products: number | null
  status:            'outstanding' | 'overdue' | 'paid' | 'waived'
  due_date:          string | null
  paid_at:           string | null
  generated_at:      string
  reminded_at:       string | null
  paused_at:         string | null
}

type LineItem = {
  id:             string
  store_name:     string
  product_count:  number | null
  free_count:     number | null
  billable_count: number | null
  amount:         number
  upload_count:   number
}

type VaUsage = {
  va_id:        string
  va_name:      string
  billing_month: string
  totalProducts: number
  freeProducts:  number
  billableProducts: number
  totalAmount:   number
  uploadCount:   number
  invoice:       BillRow | null
}

function StatusBadge({ status }: { status: BillRow['status'] }) {
  const s: Record<string, { bg: string; color: string; border: string; label: string }> = {
    outstanding: { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A', label: 'Outstanding' },
    overdue:     { bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA', label: 'Overdue' },
    paid:        { bg: '#ECFDF5', color: '#065F46', border: '#A7F3D0', label: 'Paid' },
    waived:      { bg: '#F5F3FF', color: '#5B21B6', border: '#DDD6FE', label: 'Waived' },
  }
  const m = s[status] ?? s.outstanding
  return (
    <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 20, background: m.bg, color: m.color, border: `1px solid ${m.border}` }}>
      {m.label}
    </span>
  )
}

type MarkPaidModal = { bill: BillRow }

function MarkPaidModalComp({ bill, onClose, onDone }: { bill: BillRow; onClose: () => void; onDone: () => void }) {
  const [method,    setMethod]    = useState('')
  const [ref,       setRef]       = useState('')
  const [amount,    setAmount]    = useState(String(bill.total_amount.toFixed(2)))
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  async function submit() {
    if (!method) return setError('Payment method required')
    setSaving(true); setError('')
    const res = await fetch('/api/billing/mark-paid', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billing_id: bill.id, payment_method_used: method, payment_reference: ref, payment_amount_received: amount }),
    })
    if (res.ok) { onDone(); onClose() }
    else { const d = await res.json(); setError(d.error ?? 'Failed'); setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 28, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: T.black, margin: '0 0 6px' }}>Mark as Paid</h3>
        <p style={{ fontSize: 12, color: T.muted, margin: '0 0 20px' }}>
          {bill.va_name} · {fmtMonth(bill.month)} · {fmt(bill.total_amount)}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 500, color: T.muted, display: 'block', marginBottom: 4 }}>Payment method *</label>
            <select value={method} onChange={e => setMethod(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: `1.5px solid ${T.border}`, fontSize: 13, color: T.black, background: '#FFF', outline: 'none', boxSizing: 'border-box' }}>
              <option value="">Select...</option>
              <option value="wise">Wise</option>
              <option value="paypal">PayPal</option>
              <option value="bank">Bank transfer</option>
              <option value="gcash">GCash</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 500, color: T.muted, display: 'block', marginBottom: 4 }}>Reference / notes</label>
            <input type="text" value={ref} onChange={e => setRef(e.target.value)} placeholder="Transaction ID or notes" style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: `1.5px solid ${T.border}`, fontSize: 13, color: T.black, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 500, color: T.muted, display: 'block', marginBottom: 4 }}>Amount received ($)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} step="0.01" style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: `1.5px solid ${T.border}`, fontSize: 13, color: T.black, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
        {error && <div style={{ marginTop: 12, fontSize: 12, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 7, padding: '7px 10px' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 7, fontSize: 13, border: `1.5px solid ${T.border}`, background: 'none', color: T.muted, cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={saving} style={{ padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 500, background: saving ? '#999' : T.black, color: '#FFF', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Marking...' : 'Mark Paid'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminBillingPage() {
  const [month,      setMonth]      = useState(getCurrentBillingMonth())
  const [viewMode,   setViewMode]   = useState<'invoices' | 'usage'>('invoices')
  const [invoices,   setInvoices]   = useState<BillRow[]>([])
  const [vaUsage,    setVaUsage]    = useState<VaUsage[]>([])
  const [expanded,   setExpanded]   = useState<string | null>(null)
  const [lineItems,  setLineItems]  = useState<Record<string, LineItem[]>>({})
  const [loading,    setLoading]    = useState(true)
  const [markModal,  setMarkModal]  = useState<MarkPaidModal | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)

    // Invoices for selected month
    const { data: bills } = await supabase
      .from('billing')
      .select('id, invoice_number, va_id, va_name, va_email, month, total_amount, total_products, free_products, billable_products, status, due_date, paid_at, generated_at, reminded_at, paused_at')
      .eq('month', month)
      .order('generated_at', { ascending: false })

    setInvoices((bills ?? []) as BillRow[])

    // VA usage for selected month (from va_usage table)
    const { data: usageRows } = await supabase
      .from('va_usage')
      .select('va_id, product_count, free_count, billable_count, total_amount')
      .eq('billing_month', month)

    // Get VA names
    const vaIds = [...new Set((usageRows ?? []).map(r => r.va_id))]
    let vaNames: Record<string, string> = {}
    if (vaIds.length) {
      const { data: vas } = await supabase.from('vas').select('id, name').in('id', vaIds)
      for (const v of vas ?? []) vaNames[v.id] = v.name
    }

    // Aggregate per VA
    const aggMap = new Map<string, VaUsage>()
    for (const row of usageRows ?? []) {
      const existing = aggMap.get(row.va_id)
      if (existing) {
        existing.totalProducts    += row.product_count   ?? 0
        existing.freeProducts     += row.free_count      ?? 0
        existing.billableProducts += row.billable_count  ?? 0
        existing.totalAmount      += Number(row.total_amount ?? 0)
        existing.uploadCount      += 1
      } else {
        aggMap.set(row.va_id, {
          va_id:            row.va_id,
          va_name:          vaNames[row.va_id] ?? 'Unknown VA',
          billing_month:    month,
          totalProducts:    row.product_count   ?? 0,
          freeProducts:     row.free_count      ?? 0,
          billableProducts: row.billable_count  ?? 0,
          totalAmount:      Number(row.total_amount ?? 0),
          uploadCount:      1,
          invoice:          null,
        })
      }
    }

    // Link invoices to usage rows
    for (const bill of bills ?? []) {
      const u = aggMap.get(bill.va_id)
      if (u) u.invoice = bill as BillRow
    }

    setVaUsage([...aggMap.values()].sort((a, b) => b.totalAmount - a.totalAmount))
    setLoading(false)
  }, [month])

  useEffect(() => { void load() }, [load])

  async function loadLineItems(billId: string) {
    if (lineItems[billId]) return
    const { data } = await supabase
      .from('billing_line_items')
      .select('id, store_name, product_count, free_count, billable_count, amount, upload_count')
      .eq('billing_id', billId)
    setLineItems(prev => ({ ...prev, [billId]: (data ?? []) as LineItem[] }))
  }

  function toggleExpand(id: string, billId?: string) {
    setExpanded(expanded === id ? null : id)
    if (billId && expanded !== id) void loadLineItems(billId)
  }

  async function waive(billId: string) {
    if (!confirm('Waive this invoice? The VA will be notified.')) return
    setActionLoading(billId)
    await fetch('/api/billing/waive', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billing_id: billId }),
    })
    await load()
    setActionLoading(null)
  }

  async function generateInvoices() {
    if (!confirm(`Generate invoices for ${fmtMonth(month)}?`)) return
    setActionLoading('gen')
    const res = await fetch('/api/billing/generate-invoices', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? ''}` },
      body: JSON.stringify({ month }),
    })
    const data = await res.json()
    alert(`Done. ${data.invoices_generated ?? 0} invoices generated, total $${(data.total_revenue ?? 0).toFixed(2)}`)
    await load()
    setActionLoading(null)
  }

  // Summary stats
  const totalOutstanding = invoices.filter(i => i.status === 'outstanding' || i.status === 'overdue').reduce((s, i) => s + i.total_amount, 0)
  const totalPaid        = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total_amount, 0)
  const overdueCount     = invoices.filter(i => i.status === 'overdue').length

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '36px 32px', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: T.black, margin: 0, marginBottom: 4 }}>Billing</h1>
          <p style={{ fontSize: 13, color: T.muted, margin: 0 }}>
            {FREE_PRODUCTS_PER_MONTH} products/month free · ${PRICE_PER_PRODUCT}/product after
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 7, border: `1.5px solid ${T.border}`, fontSize: 13, color: T.black, outline: 'none' }}
          />
          <button
            onClick={generateInvoices}
            disabled={actionLoading === 'gen'}
            style={{ padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 500, background: T.black, color: '#FFF', border: 'none', cursor: 'pointer', opacity: actionLoading === 'gen' ? 0.6 : 1 }}
          >
            {actionLoading === 'gen' ? 'Generating...' : 'Generate invoices'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Outstanding', val: fmt(totalOutstanding), color: '#92400E', bg: '#FEF3C7' },
          { label: 'Paid', val: fmt(totalPaid), color: '#065F46', bg: '#ECFDF5' },
          { label: 'Overdue invoices', val: String(overdueCount), color: '#B91C1C', bg: overdueCount > 0 ? '#FEF2F2' : '#F9FAFB' },
          { label: 'Invoices total', val: String(invoices.length), color: T.black, bg: '#F9FAFB' },
        ].map(c => (
          <div key={c.label} style={{ background: c.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: c.color, letterSpacing: '-0.02em', marginBottom: 4 }}>{c.val}</div>
            <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: 3, width: 'fit-content' }}>
        {(['invoices', 'usage'] as const).map(v => (
          <button
            key={v}
            onClick={() => setViewMode(v)}
            style={{ padding: '6px 16px', borderRadius: 6, fontSize: 13, fontWeight: viewMode === v ? 500 : 400, background: viewMode === v ? '#FFFFFF' : 'none', color: viewMode === v ? T.black : T.muted, border: 'none', cursor: 'pointer', boxShadow: viewMode === v ? '0 1px 3px rgba(0,0,0,0.06)' : 'none', textTransform: 'capitalize' }}
          >
            {v}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: T.ghost, fontSize: 13 }}>Loading...</div>
      ) : viewMode === 'invoices' ? (

        /* ─── INVOICES VIEW ──────────────────────────────────────────────────── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {invoices.length === 0 ? (
            <div style={{ background: '#FFFFFF', border: `1px solid ${T.border}`, borderRadius: 10, padding: '32px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: T.ghost, margin: 0 }}>No invoices for {fmtMonth(month)}. Click &quot;Generate invoices&quot; to create them.</p>
            </div>
          ) : invoices.map(inv => (
            <div key={inv.id} style={{ background: '#FFFFFF', border: `1px solid ${inv.status === 'overdue' ? '#FECACA' : T.border}`, borderRadius: 10 }}>
              {/* Invoice row */}
              <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: T.black }}>{inv.va_name}</span>
                    <StatusBadge status={inv.status} />
                  </div>
                  <div style={{ fontSize: 11, color: T.ghost }}>
                    {inv.invoice_number} · {fmtMonth(inv.month)}
                    {inv.billable_products != null && ` · ${inv.billable_products} billable products`}
                    {inv.due_date && inv.status !== 'paid' && inv.status !== 'waived' && ` · Due ${fmtDate(inv.due_date)}`}
                    {inv.paid_at && ` · Paid ${fmtDate(inv.paid_at)}`}
                  </div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, color: T.black, letterSpacing: '-0.02em', marginRight: 8 }}>
                  {fmt(inv.total_amount)}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(inv.status === 'outstanding' || inv.status === 'overdue') && (
                    <>
                      <button
                        onClick={() => setMarkModal({ bill: inv })}
                        style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, background: T.black, color: '#FFF', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                      >
                        Mark paid
                      </button>
                      <button
                        onClick={() => waive(inv.id)}
                        disabled={actionLoading === inv.id}
                        style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#F9FAFB', color: T.muted, cursor: 'pointer' }}
                      >
                        Waive
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => toggleExpand(inv.id, inv.id)}
                    style={{ fontSize: 11, padding: '5px 8px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#F9FAFB', color: T.ghost, cursor: 'pointer' }}
                  >
                    {expanded === inv.id ? '▲' : '▼'}
                  </button>
                </div>
              </div>

              {/* Expanded line items */}
              {expanded === inv.id && (
                <div style={{ borderTop: `1px solid ${T.border}`, padding: '12px 20px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, marginBottom: 10 }}>
                    Upload line items
                  </div>
                  {!lineItems[inv.id] ? (
                    <div style={{ fontSize: 12, color: T.ghost }}>Loading...</div>
                  ) : lineItems[inv.id].length === 0 ? (
                    <div style={{ fontSize: 12, color: T.ghost }}>No line items found.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {lineItems[inv.id].map(li => (
                        <div key={li.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: `1px solid ${T.border}` }}>
                          <span style={{ color: T.black }}>{li.store_name}</span>
                          <span style={{ color: T.muted, fontSize: 12 }}>
                            {li.product_count ?? '?'} products
                            {li.free_count != null && li.free_count > 0 && ` · ${li.free_count} free`}
                            {li.billable_count != null && li.billable_count > 0 && ` · ${li.billable_count} billable`}
                          </span>
                          <span style={{ color: T.black, fontWeight: 500 }}>
                            {li.amount > 0 ? fmt(li.amount) : <span style={{ color: T.green }}>Free</span>}
                          </span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, paddingTop: 8, fontWeight: 600 }}>
                        <span style={{ color: T.black }}>Total</span>
                        <span style={{ color: T.black }}>{fmt(inv.total_amount)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

      ) : (

        /* ─── USAGE VIEW ─────────────────────────────────────────────────────── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {vaUsage.length === 0 ? (
            <div style={{ background: '#FFFFFF', border: `1px solid ${T.border}`, borderRadius: 10, padding: '32px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: T.ghost, margin: 0 }}>No usage recorded for {fmtMonth(month)}.</p>
            </div>
          ) : vaUsage.map(va => (
            <div key={va.va_id} style={{ background: '#FFFFFF', border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.black, marginBottom: 3 }}>{va.va_name}</div>
                  <div style={{ fontSize: 12, color: T.ghost }}>
                    {va.totalProducts.toLocaleString()} products · {va.freeProducts} free · {va.billableProducts} billable
                    {va.uploadCount > 0 && ` · ${va.uploadCount} upload${va.uploadCount !== 1 ? 's' : ''}`}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {va.invoice && <StatusBadge status={va.invoice.status} />}
                  {!va.invoice && va.billableProducts > 0 && (
                    <span style={{ fontSize: 11, color: T.muted, fontStyle: 'italic' }}>No invoice yet</span>
                  )}
                  {!va.invoice && va.billableProducts === 0 && (
                    <span style={{ fontSize: 11, color: T.green, fontWeight: 500 }}>Free tier</span>
                  )}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: T.black, letterSpacing: '-0.02em' }}>
                      {va.totalAmount > 0 ? fmt(va.totalAmount) : <span style={{ color: T.green }}>$0.00</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Mini progress bar */}
              {va.totalProducts > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      width: `${Math.min((va.freeProducts / Math.max(va.totalProducts, FREE_PRODUCTS_PER_MONTH)) * 100, 100)}%`,
                      background: T.green,
                    }} />
                  </div>
                  <div style={{ fontSize: 11, color: T.ghost, marginTop: 4 }}>
                    {va.freeProducts}/{FREE_PRODUCTS_PER_MONTH} free used
                    {va.billableProducts > 0 && ` · ${va.billableProducts} × $${PRICE_PER_PRODUCT} = ${fmt(va.totalAmount)}`}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

      )}

      {markModal && (
        <MarkPaidModalComp
          bill={markModal.bill}
          onClose={() => setMarkModal(null)}
          onDone={() => void load()}
        />
      )}
    </div>
  )
}
