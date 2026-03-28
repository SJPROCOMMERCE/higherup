'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Billing, BillingLineItem } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { HIGHERUP_PAYMENT, getWisePaymentLink } from '@/lib/payment-config'

// ─── Tokens ───────────────────────────────────────────────────────────────────
const T = {
  black: '#111111', sec: '#555555', ter: '#999999', ghost: '#CCCCCC',
  div: '#EEEEEE', row: '#FAFAFA', bg: '#FFFFFF', red: '#CC3300',
  green: '#00A550',
}
const PAYMENT_LABELS: Record<string, string> = {
  wise: 'Wise', paypal: 'PayPal', gcash: 'GCash', maya: 'Maya',
  upi: 'UPI', jazzcash: 'JazzCash', easypaisa: 'EasyPaisa',
  bkash: 'bKash', bank_transfer: 'Bank Transfer',
}
const TIER_LABEL: Record<string, string> = {
  tier_1: 'Tier 1', tier_2: 'Tier 2', tier_3: 'Tier 3', tier_4: 'Tier 4',
}

// ─── Tier helpers ─────────────────────────────────────────────────────────────
function tierKey(v: number): string {
  if (v <= 200) return 'T1 ($50)'
  if (v <= 400) return 'T2 ($110)'
  if (v <= 1000) return 'T3 ($220)'
  return 'T4 ($350)'
}
function tierAmount(v: number): number {
  if (v <= 200) return 50
  if (v <= 400) return 110
  if (v <= 1000) return 220
  return 350
}

// ─── Month / date helpers ─────────────────────────────────────────────────────
function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number)
  return { start: new Date(y, m - 1, 1).toISOString(), end: new Date(y, m, 1).toISOString() }
}
function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function relDate(iso: string | null): string {
  if (!iso) return '—'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (diff === 0) return 'today'
  if (diff === 1) return 'yesterday'
  if (diff < 7) return `${diff}d ago`
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`
  return `${Math.floor(diff / 30)}mo ago`
}
function buildMonthOptions(): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}
function daysPastDue(due_date: string | null): number | null {
  if (!due_date) return null
  const due = new Date(due_date); due.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.floor((today.getTime() - due.getTime()) / 86400000)
  return diff >= 0 ? diff : null
}
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ─── CSV export ───────────────────────────────────────────────────────────────
function downloadCSV(filename: string, rows: (string | number | null)[][]): void {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ─── Types ────────────────────────────────────────────────────────────────────
type LiveClient = {
  client_id: string; store_name: string; variants: number
  uploads: number; last_upload_at: string | null
}
type LiveVA = {
  va_id: string; va_name: string; clients: LiveClient[]
  totalVariants: number; totalClients: number; estAmount: number
  invoiceStatus: 'paid' | 'outstanding' | 'overdue' | 'waived' | 'not_invoiced'
}
type OverdueRow = Billing & { va_status: 'active' | 'paused' | 'blocked' | null }
type ProjMonth = { vas: number; clients: number; variants: number; revenue: number; apiCost: number; affiliatePayout: number; net: number }
type Projection = { growthRate: number; next1: ProjMonth; next3: ProjMonth; next6: ProjMonth }
type Comparison = { vsLast: number | null; vsLastPct: number | null; vs3Ago: number | null; vs3AgoPct: number | null }
type StatusFilter = 'all' | 'outstanding' | 'overdue' | 'paid' | 'waived'

// ─── SectionLabel ─────────────────────────────────────────────────────────────
function SectionLabel({ left, right }: { left: string; right?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <span style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost }}>{left}</span>
      {right && <span style={{ fontSize: 12, color: T.ghost }}>{right}</span>}
    </div>
  )
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: Billing['status'] }) {
  const map: Record<string, { color: string; weight?: number; italic?: boolean }> = {
    paid: { color: T.black }, outstanding: { color: T.ghost },
    overdue: { color: T.red, weight: 500 }, waived: { color: T.ghost, italic: true },
  }
  const s = map[status] ?? { color: T.ghost }
  return (
    <span style={{ fontSize: 12, color: s.color, fontWeight: s.weight, fontStyle: s.italic ? 'italic' : undefined }}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

// ─── LiveVARow ────────────────────────────────────────────────────────────────
function LiveVARow({ va }: { va: LiveVA }) {
  const [open, setOpen] = useState(false)

  const paidEl = () => {
    if (va.invoiceStatus === 'not_invoiced') return <span style={{ fontSize: 12, color: '#DDDDDD' }}>Not invoiced</span>
    if (va.invoiceStatus === 'paid')         return <span style={{ fontSize: 12, color: T.black }}>Paid</span>
    if (va.invoiceStatus === 'outstanding')  return <span style={{ fontSize: 12, color: T.ghost }}>Outstanding</span>
    if (va.invoiceStatus === 'overdue')      return <span style={{ fontSize: 12, fontWeight: 500, color: T.black }}>Overdue</span>
    if (va.invoiceStatus === 'waived')       return <span style={{ fontSize: 12, color: T.ghost, fontStyle: 'italic' }}>Waived</span>
    return null
  }

  return (
    <div style={{ borderBottom: `1px solid ${T.row}` }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ display: 'grid', gridTemplateColumns: '1fr 80px 110px 120px 120px', gap: 12, padding: '14px 0', cursor: 'pointer', alignItems: 'center', transition: 'opacity 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.6')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        <span style={{ fontSize: 14, fontWeight: 500, color: T.black }}>{va.va_name}</span>
        <span style={{ fontSize: 13, color: T.sec }}>{va.totalClients}</span>
        <span style={{ fontSize: 13, color: T.sec }}>{va.totalVariants.toLocaleString()}</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: T.black }}>${va.estAmount}</span>
        {paidEl()}
      </div>

      <div style={{ maxHeight: open ? 600 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
        <div style={{ paddingLeft: 16, paddingBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 70px 120px', gap: 8, marginBottom: 8 }}>
            {['Store', 'Products', 'Tier', 'Uploads', 'Last upload'].map(h => (
              <span key={h} style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost }}>{h}</span>
            ))}
          </div>
          {va.clients.map(c => (
            <div key={c.client_id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 70px 120px', gap: 8, paddingBlock: 8, borderBottom: `1px solid ${T.row}`, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: T.black }}>{c.store_name}</span>
              <span style={{ fontSize: 12, color: T.sec }}>{c.variants.toLocaleString()}</span>
              <span style={{ fontSize: 12, color: T.ter }}>{tierKey(c.variants)}</span>
              <span style={{ fontSize: 12, color: T.ghost }}>{c.uploads}</span>
              <span style={{ fontSize: 12, color: T.ghost }}>{relDate(c.last_upload_at)}</span>
            </div>
          ))}
          <div style={{ paddingTop: 10, fontSize: 13, fontWeight: 500, color: T.black }}>
            Total: {va.totalVariants.toLocaleString()} products across {va.totalClients} client{va.totalClients !== 1 ? 's' : ''} = ${va.estAmount}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── OverdueInvoiceRow ────────────────────────────────────────────────────────
function OverdueInvoiceRow({ row, onRefresh }: { row: OverdueRow; onRefresh: () => void }) {
  const [action, setAction] = useState<'none' | 'pay'>('none')
  const [saving, setSaving] = useState(false)
  const [payMethod, setPayMethod] = useState('')
  const [payRef, setPayRef] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [msg, setMsg] = useState('')

  const days = daysPastDue(row.due_date)
  const escalation = row.va_status === 'blocked' ? 'Blocked'
    : row.va_status === 'paused' ? 'Paused'
    : row.reminded_at ? 'Reminded' : null

  async function markPaid() {
    setSaving(true); setMsg('')
    const res = await fetch('/api/billing/mark-paid', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billing_id: row.id, payment_method_used: payMethod, payment_reference: payRef, payment_amount_received: payAmount }),
    })
    if (res.ok) {
      void logActivity({
        action: 'invoice_marked_paid',
        billing_id: row.id,
        va_id: row.va_id ?? undefined,
        source: 'admin',
        details: `Invoice marked as paid`,
      })
      setMsg('Marked as paid.'); setAction('none'); onRefresh()
    }
    else setMsg('Error. Try again.')
    setSaving(false)
  }

  async function sendReminder() {
    setSaving(true)
    const wiseLink = getWisePaymentLink(row.total_amount, row.invoice_number ?? '')
    await Promise.all([
      supabase.from('notifications').insert({
        va_id: row.va_id, type: 'invoice_overdue',
        title: `Reminder: your HigherUp share is overdue`,
        message: `Your HigherUp share of $${row.total_amount.toFixed(0)} for ${formatMonth(row.month)} (${row.invoice_number ?? ''}) is overdue.\n\nPay via bank transfer:\nIBAN: ${HIGHERUP_PAYMENT.bank.iban}\nBIC: ${HIGHERUP_PAYMENT.bank.bic}\nName: ${HIGHERUP_PAYMENT.bank.holder}\nAmount: $${row.total_amount.toFixed(2)} — Reference: ${row.invoice_number ?? ''}\n\nOr pay via Wise: ${wiseLink}\n\nPlease pay promptly to avoid account suspension.`,
        is_read: false,
      }),
      supabase.from('billing').update({ reminded_at: new Date().toISOString() }).eq('id', row.id),
    ])
    setMsg('Reminder sent.'); setSaving(false); onRefresh()
  }

  async function pauseVA() {
    setSaving(true)
    await Promise.all([
      supabase.from('vas').update({ status: 'paused' }).eq('id', row.va_id),
      supabase.from('billing').update({ paused_at: new Date().toISOString() }).eq('id', row.id),
    ])
    setSaving(false); onRefresh()
  }

  async function blockVA() {
    setSaving(true)
    await Promise.all([
      supabase.from('vas').update({ status: 'blocked' }).eq('id', row.va_id),
      supabase.from('billing').update({ blocked_at: new Date().toISOString() }).eq('id', row.id),
    ])
    setSaving(false); onRefresh()
  }

  async function waiveInvoice() {
    setSaving(true)
    const res = await fetch('/api/billing/waive', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billing_id: row.id }),
    })
    if (res.ok) {
      void logActivity({
        action: 'invoice_waived',
        billing_id: row.id,
        va_id: row.va_id ?? undefined,
        source: 'admin',
        details: `Invoice waived`,
      })
      onRefresh()
    } else setMsg('Error.')
    setSaving(false)
  }

  const actionBtn = (label: string, fn: () => void, primary = false): React.CSSProperties => ({
    fontSize: 12, color: primary ? T.bg : T.ghost, background: primary ? T.black : 'none',
    border: 'none', borderRadius: primary ? 100 : 0, padding: primary ? '7px 14px' : 0,
    cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
    opacity: saving ? 0.5 : 1, textDecoration: primary ? 'none' : 'underline',
  })
  void actionBtn // suppress unused warning

  return (
    <div style={{ paddingBlock: 16, borderBottom: `1px solid ${T.row}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: T.black, minWidth: 120 }}>{row.va_name ?? '—'}</span>
          <span style={{ fontSize: 12, color: T.ghost }}>{row.invoice_number ?? '—'}</span>
          <span style={{ fontSize: 14, fontWeight: 500, color: T.black }}>${row.total_amount.toFixed(0)}</span>
          <span style={{ fontSize: 12, color: T.black }}>{days != null ? `${days} day${days !== 1 ? 's' : ''} overdue` : 'Overdue'}</span>
          {escalation && <span style={{ fontSize: 11, color: T.ter }}>{escalation}</span>}
        </div>
        {action === 'none' && (
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => setAction('pay')} disabled={saving}
              style={{ fontSize: 12, color: T.black, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}
            >Mark paid</button>
            <button
              onClick={() => { void sendReminder() }} disabled={saving}
              style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = T.black)}
              onMouseLeave={e => (e.currentTarget.style.color = T.ghost)}
            >Send reminder</button>
            {row.va_status !== 'paused' && row.va_status !== 'blocked' && (
              <button
                onClick={() => { void pauseVA() }} disabled={saving}
                style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = T.black)}
                onMouseLeave={e => (e.currentTarget.style.color = T.ghost)}
              >Pause VA</button>
            )}
            {row.va_status !== 'blocked' && (
              <button
                onClick={() => { void blockVA() }} disabled={saving}
                style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = T.black)}
                onMouseLeave={e => (e.currentTarget.style.color = T.ghost)}
              >Block VA</button>
            )}
            <button
              onClick={() => { void waiveInvoice() }} disabled={saving}
              style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = T.black)}
              onMouseLeave={e => (e.currentTarget.style.color = T.ghost)}
            >Waive</button>
          </div>
        )}
      </div>

      {action === 'pay' && (() => {
        const enteredAmount  = parseFloat(payAmount)
        const expected       = row.total_amount
        const hasDeviation   = payAmount.trim() !== '' && !isNaN(enteredAmount) && Math.abs(enteredAmount - expected) > 0.01
        const isUnderpayment = hasDeviation && enteredAmount < expected
        const isOverpayment  = hasDeviation && enteredAmount > expected
        const deviation      = hasDeviation ? Math.abs(enteredAmount - expected).toFixed(2) : null
        return (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: T.ghost, marginBottom: 8 }}>
              Expected: <strong style={{ color: T.black }}>${expected.toFixed(2)}</strong>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: T.ghost, marginBottom: 4 }}>Method</div>
                <input value={payMethod} onChange={e => setPayMethod(e.target.value)} placeholder="wise / paypal / bank"
                  style={{ width: 140, fontSize: 12, border: `1px solid ${T.div}`, borderRadius: 6, padding: '7px 10px', fontFamily: 'inherit', outline: 'none' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: T.ghost, marginBottom: 4 }}>Reference</div>
                <input value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="Txn #"
                  style={{ width: 160, fontSize: 12, border: `1px solid ${T.div}`, borderRadius: 6, padding: '7px 10px', fontFamily: 'inherit', outline: 'none' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: T.ghost, marginBottom: 4 }}>Amount received</div>
                <input value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder={`${expected.toFixed(2)}`}
                  style={{ width: 110, fontSize: 12, border: `1px solid ${hasDeviation ? '#F59E0B' : T.div}`, borderRadius: 6, padding: '7px 10px', fontFamily: 'inherit', outline: 'none', transition: 'border-color 0.15s' }} />
              </div>
              <button onClick={() => { void markPaid() }} disabled={saving}
                style={{ fontSize: 12, fontWeight: 500, color: T.bg, background: T.black, border: 'none', borderRadius: 100, padding: '8px 16px', cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.5 : 1 }}>
                {saving ? 'Saving…' : 'Confirm'}
              </button>
              <button onClick={() => setAction('none')}
                style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
            </div>
            {isUnderpayment && (
              <div style={{ fontSize: 11, color: '#92400E', background: '#FEF3C7', borderRadius: 6, padding: '6px 10px', marginBottom: 4 }}>
                ⚠ Underpayment — ${deviation} short.
              </div>
            )}
            {isOverpayment && (
              <div style={{ fontSize: 11, color: '#1D4ED8', background: '#EFF6FF', borderRadius: 6, padding: '6px 10px', marginBottom: 4 }}>
                ℹ Overpayment — ${deviation} extra.
              </div>
            )}
          </div>
        )
      })()}
      {msg && <div style={{ fontSize: 12, color: T.ghost, marginTop: 8 }}>{msg}</div>}
    </div>
  )
}

// ─── InvoiceRow ───────────────────────────────────────────────────────────────
type UploadItem = { id: string; uploaded_at: string; original_filename: string | null; product_row_count: number | null; excluded_from_billing: boolean | null; excluded_reason: string | null }

function InvoiceRow({
  invoice, expanded, onToggle, onRefresh,
}: {
  invoice: Billing; expanded: boolean; onToggle: () => void; onRefresh: () => void
}) {
  const [lineItems, setLineItems] = useState<BillingLineItem[] | null>(null)
  const [action, setAction] = useState<'none' | 'pay' | 'waive'>('none')
  const [saving, setSaving] = useState(false)
  const [payMethod, setPayMethod] = useState('')
  const [payRef, setPayRef] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [statusMsg, setStatusMsg] = useState('')
  const [openLineItemUploads, setOpenLineItemUploads] = useState<string | null>(null)
  const [lineItemUploadsData, setLineItemUploadsData] = useState<Record<string, UploadItem[]>>({})
  const [excludingId, setExcludingId] = useState<string | null>(null)

  useEffect(() => {
    if (!expanded || lineItems !== null) return
    supabase.from('billing_line_items').select('*')
      .eq('billing_id', invoice.id)
      .order('amount', { ascending: false })
      .then(({ data }) => setLineItems((data ?? []) as BillingLineItem[]))
  }, [expanded, invoice.id, lineItems])

  async function loadLineItemUploads(clientId: string, month: string) {
    const key = `${clientId}-${month}`
    if (lineItemUploadsData[key]) return
    const [y, m] = month.split('-').map(Number)
    const start = new Date(y, m - 1, 1).toISOString()
    const end   = new Date(y, m, 1).toISOString()
    const { data } = await supabase
      .from('uploads')
      .select('id, uploaded_at, original_filename, product_row_count, excluded_from_billing, excluded_reason')
      .eq('client_id', clientId)
      .eq('status', 'done')
      .gte('uploaded_at', start)
      .lt('uploaded_at', end)
      .order('uploaded_at', { ascending: false })
    setLineItemUploadsData(prev => ({ ...prev, [key]: (data ?? []) as UploadItem[] }))
  }

  async function toggleExclude(uploadId: string, currentlyExcluded: boolean, clientId: string, month: string) {
    setExcludingId(uploadId)
    await supabase.from('uploads').update({
      excluded_from_billing: !currentlyExcluded,
      excluded_reason: !currentlyExcluded ? 'Excluded by admin' : null,
      excluded_by: !currentlyExcluded ? 'admin' : null,
      excluded_at: !currentlyExcluded ? new Date().toISOString() : null,
    }).eq('id', uploadId)
    const key = `${clientId}-${month}`
    setLineItemUploadsData(prev => {
      const uploads = prev[key]?.map(u => u.id === uploadId ? { ...u, excluded_from_billing: !currentlyExcluded } : u)
      return { ...prev, [key]: uploads ?? [] }
    })
    setExcludingId(null)
  }

  async function handleMarkPaid() {
    setSaving(true); setStatusMsg('')
    const res = await fetch('/api/billing/mark-paid', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billing_id: invoice.id, payment_method_used: payMethod, payment_reference: payRef, payment_amount_received: payAmount }),
    })
    if (res.ok) {
      void logActivity({
        action: 'invoice_marked_paid',
        billing_id: invoice.id,
        va_id: invoice.va_id ?? undefined,
        source: 'admin',
        details: `Invoice marked as paid`,
      })
      setStatusMsg('Marked as paid.'); setAction('none'); onRefresh()
    }
    else setStatusMsg('Error. Please try again.')
    setSaving(false)
  }

  async function handleWaive() {
    setSaving(true)
    const res = await fetch('/api/billing/waive', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billing_id: invoice.id }),
    })
    if (res.ok) {
      void logActivity({
        action: 'invoice_waived',
        billing_id: invoice.id,
        va_id: invoice.va_id ?? undefined,
        source: 'admin',
        details: `Invoice waived`,
      })
      setAction('none'); onRefresh()
    } else setStatusMsg('Error.')
    setSaving(false)
  }

  async function handleRecalculate() {
    setSaving(true)
    const res = await fetch('/api/billing/recalculate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billing_id: invoice.id }),
    })
    if (res.ok) { setLineItems(null); onRefresh(); setStatusMsg('Recalculated.') } else setStatusMsg('Error.')
    setSaving(false)
  }

  async function handleReminder() {
    setSaving(true)
    const wiseLink = getWisePaymentLink(invoice.total_amount, invoice.invoice_number ?? '')
    await supabase.from('notifications').insert({
      va_id: invoice.va_id, type: 'invoice_overdue',
      title: `Reminder: your HigherUp share is overdue`,
      message: `Your HigherUp share of $${invoice.total_amount.toFixed(0)} for ${formatMonth(invoice.month)} (${invoice.invoice_number ?? ''}) is overdue.\n\nPay via bank transfer:\nIBAN: ${HIGHERUP_PAYMENT.bank.iban}\nBIC: ${HIGHERUP_PAYMENT.bank.bic}\nName: ${HIGHERUP_PAYMENT.bank.holder}\nAmount: $${invoice.total_amount.toFixed(2)} — Reference: ${invoice.invoice_number ?? ''}\n\nOr pay via Wise: ${wiseLink}\n\nPlease pay promptly to avoid account suspension.`,
      is_read: false,
    })
    await supabase.from('billing').update({ reminded_at: new Date().toISOString() }).eq('id', invoice.id)
    setStatusMsg('Reminder sent.'); setSaving(false); setAction('none')
  }

  const overdueDays = daysPastDue(invoice.due_date)

  const btnStyle = (primary?: boolean): React.CSSProperties => ({
    fontSize: 12, color: primary ? T.bg : T.ter, fontFamily: 'inherit',
    background: primary ? T.black : 'none', border: 'none',
    cursor: saving ? 'default' : 'pointer', padding: primary ? '7px 16px' : 0,
    borderRadius: primary ? 100 : 0, transition: 'opacity 0.15s', opacity: saving ? 0.5 : 1,
  })

  return (
    <div style={{ borderBottom: `1px solid ${T.row}` }}>
      <div
        onClick={onToggle}
        style={{ display: 'grid', gridTemplateColumns: '140px 1fr 100px 80px 100px 110px', gap: 12, padding: '14px 0', cursor: 'pointer', alignItems: 'center', transition: 'opacity 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        <span style={{ fontSize: 13, fontWeight: 500, color: T.black }}>{invoice.va_name ?? invoice.va_id.slice(0, 8)}</span>
        <span style={{ fontSize: 12, color: T.ghost }}>{invoice.invoice_number ?? '—'}</span>
        <span style={{ fontSize: 12, color: T.ter }}>{formatMonth(invoice.month)}</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: T.black, textAlign: 'right' }}>${invoice.total_amount.toFixed(0)}</span>
        <StatusBadge status={invoice.status} />
        <span style={{ fontSize: 12, color: overdueDays != null && overdueDays >= 3 ? T.red : T.ghost }}>
          {invoice.due_date ? formatDate(invoice.due_date) : '—'}
          {overdueDays != null && overdueDays > 0 && ` (+${overdueDays}d)`}
        </span>
      </div>

      <div style={{ maxHeight: expanded ? 700 : 0, overflow: 'hidden', opacity: expanded ? 1 : 0, transition: 'max-height 0.3s ease, opacity 0.2s ease' }}>
        <div style={{ paddingLeft: 16, paddingBottom: 24 }}>
          {invoice.va_payment_method && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, marginBottom: 4 }}>Payment destination</div>
              <div style={{ fontSize: 12, color: T.ter }}>
                {PAYMENT_LABELS[invoice.va_payment_method] ?? invoice.va_payment_method}
                {invoice.va_email && ` · ${invoice.va_email}`}
              </div>
            </div>
          )}

          {lineItems === null ? (
            <div style={{ fontSize: 12, color: T.ghost, marginBottom: 16 }}>Loading…</div>
          ) : lineItems.length === 0 ? (
            <div style={{ fontSize: 12, color: T.ghost, marginBottom: 16 }}>No line items.</div>
          ) : (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 64px 80px', gap: 8, marginBottom: 8 }}>
                {['Store', 'Products', 'Uploads', 'Tier', 'Amount'].map(h => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost }}>{h}</span>
                ))}
              </div>
              {lineItems.map(li => (
                <div key={li.id} style={{ paddingBlock: 9, borderBottom: `1px solid ${T.div}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 64px 80px', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: T.black }}>{li.store_name}</span>
                  <span style={{ fontSize: 12, color: T.sec }}>{li.variant_count.toLocaleString()}</span>
                  <span style={{ fontSize: 12, color: T.ghost }}>{li.upload_count ?? 0}</span>
                  <span style={{ fontSize: 12, color: T.ghost }}>{TIER_LABEL[li.tier] ?? li.tier}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: T.black }}>${li.amount}</span>
                  </div>
                  {/* View uploads toggle */}
                  {li.client_id && (
                    <>
                      <div
                        style={{ fontSize: 11, color: T.ghost, cursor: 'pointer', marginTop: 4, display: 'inline-block' }}
                        onMouseEnter={e => (e.currentTarget.style.color = T.black)}
                        onMouseLeave={e => (e.currentTarget.style.color = T.ghost)}
                        onClick={() => {
                          const key = `${li.client_id}-${invoice.month}`
                          const isOpen = openLineItemUploads === key
                          setOpenLineItemUploads(isOpen ? null : key)
                          if (!isOpen) void loadLineItemUploads(li.client_id!, invoice.month)
                        }}
                      >
                        {openLineItemUploads === `${li.client_id}-${invoice.month}` ? 'Hide uploads ↑' : 'View uploads →'}
                      </div>
                      {openLineItemUploads === `${li.client_id}-${invoice.month}` && (() => {
                        const key = `${li.client_id}-${invoice.month}`
                        const uploads = lineItemUploadsData[key]
                        return (
                          <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid #F0F0F0' }}>
                            {!uploads ? (
                              <div style={{ fontSize: 12, color: T.ghost }}>Loading…</div>
                            ) : uploads.length === 0 ? (
                              <div style={{ fontSize: 12, color: T.ghost }}>No uploads found for this period.</div>
                            ) : (
                              <>
                                <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 80px 100px', gap: 8, marginBottom: 4 }}>
                                  {['Date', 'File', 'Rows', 'Action'].map(h => (
                                    <span key={h} style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.ghost }}>{h}</span>
                                  ))}
                                </div>
                                {uploads.map(u => (
                                  <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 80px 100px', gap: 8, paddingBlock: 5, borderBottom: '1px solid #F5F5F5', alignItems: 'center', opacity: u.excluded_from_billing ? 0.5 : 1 }}>
                                    <span style={{ fontSize: 11, color: T.ghost }}>{new Date(u.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                    <span style={{ fontSize: 12, color: T.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.original_filename ?? 'Upload'}</span>
                                    <span style={{ fontSize: 12, color: T.sec, textDecoration: u.excluded_from_billing ? 'line-through' : 'none' }}>{(u.product_row_count ?? 0).toLocaleString()}</span>
                                    <button
                                      disabled={excludingId === u.id}
                                      onClick={() => { void toggleExclude(u.id, !!u.excluded_from_billing, li.client_id!, invoice.month) }}
                                      style={{ fontSize: 11, color: u.excluded_from_billing ? T.green : T.ghost, background: 'none', border: 'none', cursor: excludingId === u.id ? 'default' : 'pointer', fontFamily: 'inherit', textAlign: 'left', padding: 0, opacity: excludingId === u.id ? 0.5 : 1 }}
                                    >
                                      {excludingId === u.id ? '…' : u.excluded_from_billing ? 'Include' : 'Exclude'}
                                    </button>
                                  </div>
                                ))}
                              </>
                            )}
                          </div>
                        )
                      })()}
                    </>
                  )}
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 64px 80px', gap: 8, paddingTop: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Total</span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{lineItems.reduce((s, l) => s + l.variant_count, 0).toLocaleString()}</span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{lineItems.reduce((s, l) => s + (l.upload_count ?? 0), 0)}</span>
                <span />
                <span style={{ fontSize: 13, fontWeight: 500 }}>${lineItems.reduce((s, l) => s + l.amount, 0).toFixed(0)}</span>
              </div>
            </div>
          )}

          {invoice.status === 'paid' && (
            <div style={{ marginBottom: 16, fontSize: 12, color: T.ter }}>
              Paid {formatDate(invoice.paid_at)}
              {invoice.payment_method_used && ` · ${PAYMENT_LABELS[invoice.payment_method_used] ?? invoice.payment_method_used}`}
              {invoice.payment_reference && ` · ${invoice.payment_reference}`}
              {invoice.payment_amount_received != null && ` · Received $${invoice.payment_amount_received.toFixed(2)}`}
            </div>
          )}

          {invoice.status !== 'paid' && invoice.status !== 'waived' && action === 'none' && (
            <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', marginBottom: statusMsg ? 8 : 0 }}>
              <button onClick={() => setAction('pay')} style={btnStyle(true)}>Mark as paid</button>
              <button onClick={() => setAction('waive')} disabled={saving} style={btnStyle()}>Waive</button>
              <button onClick={() => { void handleRecalculate() }} disabled={saving} style={btnStyle()}>Recalculate</button>
              <button onClick={() => { void handleReminder() }} disabled={saving} style={btnStyle()}>Send reminder</button>
            </div>
          )}

          {action === 'pay' && (() => {
            const enteredAmount   = parseFloat(payAmount)
            const expected        = invoice.total_amount
            const hasDeviation    = payAmount.trim() !== '' && !isNaN(enteredAmount) && Math.abs(enteredAmount - expected) > 0.01
            const isUnderpayment  = hasDeviation && enteredAmount < expected
            const isOverpayment   = hasDeviation && enteredAmount > expected
            const deviation       = hasDeviation ? Math.abs(enteredAmount - expected).toFixed(2) : null
            return (
              <div style={{ marginBottom: 16 }}>
                {/* Expected amount hint */}
                <div style={{ fontSize: 11, color: T.ghost, marginBottom: 10 }}>
                  Expected: <strong style={{ color: T.black }}>${expected.toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: T.ghost, marginBottom: 4 }}>Method</div>
                    <input value={payMethod} onChange={e => setPayMethod(e.target.value)} placeholder="wise / paypal / bank_transfer"
                      style={{ width: 160, fontSize: 12, border: `1px solid ${T.div}`, borderRadius: 6, padding: '7px 10px', fontFamily: 'inherit', outline: 'none' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: T.ghost, marginBottom: 4 }}>Reference</div>
                    <input value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="Transfer ID / Txn #"
                      style={{ width: 180, fontSize: 12, border: `1px solid ${T.div}`, borderRadius: 6, padding: '7px 10px', fontFamily: 'inherit', outline: 'none' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: T.ghost, marginBottom: 4 }}>Amount received</div>
                    <input value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder={`${expected.toFixed(2)}`}
                      style={{ width: 110, fontSize: 12, border: `1px solid ${hasDeviation ? '#F59E0B' : T.div}`, borderRadius: 6, padding: '7px 10px', fontFamily: 'inherit', outline: 'none', transition: 'border-color 0.15s' }} />
                  </div>
                </div>
                {/* Deviation warning */}
                {isUnderpayment && (
                  <div style={{ fontSize: 11, color: '#92400E', background: '#FEF3C7', borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>
                    ⚠ Underpayment — ${deviation} short. Mark as partial payment or chase the difference before confirming.
                  </div>
                )}
                {isOverpayment && (
                  <div style={{ fontSize: 11, color: '#1D4ED8', background: '#EFF6FF', borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>
                    ℹ Overpayment — ${deviation} extra received. Credit or refund the difference after confirming.
                  </div>
                )}
                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={() => { void handleMarkPaid() }} disabled={saving} style={btnStyle(true)}>{saving ? 'Saving…' : 'Confirm paid'}</button>
                  <button onClick={() => setAction('none')} style={btnStyle()}>Cancel</button>
                </div>
              </div>
            )
          })()}

          {action === 'waive' && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 12, color: T.ter }}>Waive this invoice?</span>
              <button onClick={() => { void handleWaive() }} disabled={saving} style={btnStyle(true)}>{saving ? 'Waiving…' : 'Confirm waive'}</button>
              <button onClick={() => setAction('none')} style={btnStyle()}>Cancel</button>
            </div>
          )}

          {statusMsg && <div style={{ fontSize: 12, color: T.ghost, marginTop: 4 }}>{statusMsg}</div>}
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminBillingPage() {
  const monthOptions = buildMonthOptions()
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[1] ?? monthOptions[0])

  const [invoices,    setInvoices]    = useState<Billing[]>([])
  const [liveData,    setLiveData]    = useState<LiveVA[]>([])
  const [overdueRows, setOverdueRows] = useState<OverdueRow[]>([])
  const [projection,  setProjection]  = useState<Projection | null>(null)
  const [comparison,  setComparison]  = useState<Comparison | null>(null)

  const [loading,    setLoading]    = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [expandedId,   setExpandedId]   = useState<string | null>(null)
  const [generating,   setGenerating]   = useState(false)
  const [checkingOD,   setCheckingOD]   = useState(false)
  const [genMsg,       setGenMsg]       = useState('')
  const [exportOpen,   setExportOpen]   = useState(false)

  // ── Load live current month ─────────────────────────────────────────────────
  const loadLive = useCallback(async () => {
    const cm = currentMonthKey()
    const { start, end } = monthBounds(cm)

    const [{ data: rawUploads }, { data: billingNow }] = await Promise.all([
      supabase.from('uploads')
        .select('va_id, client_id, product_row_count, uploaded_at, clients(store_name), vas(name)')
        .eq('status', 'done')
        .gte('uploaded_at', start)
        .lt('uploaded_at', end),
      supabase.from('billing').select('va_id, status').eq('month', cm),
    ])

    type UpRow = {
      va_id: string; client_id: string; product_row_count: number | null
      uploaded_at: string
      clients: { store_name: string } | null
      vas: { name: string } | null
    }
    const uploads = (rawUploads ?? []) as unknown as UpRow[]
    const billingMap = new Map<string, string>((billingNow ?? []).map(b => [b.va_id, b.status as string]))

    type ClientAcc = { store_name: string; variants: number; uploads: number; last_upload_at: string | null }
    type VAAcc = { va_name: string; clients: Map<string, ClientAcc> }
    const vaMap = new Map<string, VAAcc>()

    for (const u of uploads) {
      if (!vaMap.has(u.va_id)) {
        vaMap.set(u.va_id, { va_name: u.vas?.name ?? u.va_id.slice(0, 8), clients: new Map() })
      }
      const va = vaMap.get(u.va_id)!
      const existing = va.clients.get(u.client_id)
      if (existing) {
        existing.variants += u.product_row_count ?? 0
        existing.uploads += 1
        if (u.uploaded_at > (existing.last_upload_at ?? '')) existing.last_upload_at = u.uploaded_at
      } else {
        va.clients.set(u.client_id, {
          store_name: u.clients?.store_name ?? 'Unknown',
          variants: u.product_row_count ?? 0,
          uploads: 1,
          last_upload_at: u.uploaded_at,
        })
      }
    }

    const result: LiveVA[] = []
    for (const [va_id, { va_name, clients }] of vaMap) {
      const clientArr = [...clients.entries()]
        .map(([client_id, c]) => ({ client_id, ...c }))
        .filter(c => c.variants > 0)
        .sort((a, b) => b.variants - a.variants)

      if (clientArr.length === 0) continue
      const totalVariants = clientArr.reduce((s, c) => s + c.variants, 0)
      const estAmount = clientArr.reduce((s, c) => s + tierAmount(c.variants), 0)
      const rawStatus = billingMap.get(va_id)
      const invoiceStatus = (rawStatus as LiveVA['invoiceStatus']) ?? 'not_invoiced'

      result.push({ va_id, va_name, clients: clientArr, totalVariants, totalClients: clientArr.length, estAmount, invoiceStatus })
    }

    setLiveData(result.sort((a, b) => b.estAmount - a.estAmount))
  }, [])

  // ── Load overdue ────────────────────────────────────────────────────────────
  const loadOverdue = useCallback(async () => {
    const { data: raw } = await supabase.from('billing').select('*').eq('status', 'overdue').order('due_date', { ascending: true })
    if (!raw || raw.length === 0) { setOverdueRows([]); return }
    const vaIds = [...new Set(raw.map(o => o.va_id))]
    const { data: vas } = await supabase.from('vas').select('id, status').in('id', vaIds)
    const statusMap = new Map((vas ?? []).map(v => [v.id, v.status as 'active' | 'paused' | 'blocked']))
    setOverdueRows((raw as Billing[]).map(inv => ({ ...inv, va_status: statusMap.get(inv.va_id) ?? null })))
  }, [])

  // ── Load invoices for selected month ────────────────────────────────────────
  const loadInvoices = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('billing').select('*').eq('month', selectedMonth).order('total_amount', { ascending: false })
    const inv = (data ?? []) as Billing[]
    setInvoices(inv)

    // Comparison: vs last month + vs 3 months ago
    const lastM = shiftMonth(selectedMonth, -1)
    const ago3M = shiftMonth(selectedMonth, -3)
    const [{ data: last }, { data: ago3 }] = await Promise.all([
      supabase.from('billing').select('total_amount').eq('month', lastM),
      supabase.from('billing').select('total_amount').eq('month', ago3M),
    ])
    const curTotal  = inv.reduce((s, i) => s + i.total_amount, 0)
    const lastTotal = (last ?? []).reduce((s: number, i: { total_amount: number }) => s + i.total_amount, 0)
    const ago3Total = (ago3 ?? []).reduce((s: number, i: { total_amount: number }) => s + i.total_amount, 0)
    setComparison({
      vsLast:    lastTotal > 0 ? curTotal - lastTotal : null,
      vsLastPct: lastTotal > 0 ? ((curTotal - lastTotal) / lastTotal) * 100 : null,
      vs3Ago:    ago3Total > 0 ? curTotal - ago3Total : null,
      vs3AgoPct: ago3Total > 0 ? ((curTotal - ago3Total) / ago3Total) * 100 : null,
    })
    setLoading(false)
  }, [selectedMonth])

  // ── Load projection ─────────────────────────────────────────────────────────
  const loadProjection = useCallback(async () => {
    const cm = currentMonthKey()
    const months = [shiftMonth(cm, -3), shiftMonth(cm, -2), shiftMonth(cm, -1)]

    const [{ data: histBilling }, { data: histUploads }, { data: histAff }] = await Promise.all([
      supabase.from('billing').select('month, total_amount, total_clients, total_variants, va_id').in('month', months),
      supabase.from('uploads').select('api_cost_usd, uploaded_at').eq('status', 'done')
        .gte('uploaded_at', monthBounds(months[0]).start)
        .lt('uploaded_at', monthBounds(cm).start),
      supabase.from('affiliate_payouts').select('month, payout_amount').in('month', months),
    ])

    type MonthAgg = { revenue: number; clients: number; variants: number; vasSet: Set<string>; apiCost: number; affiliate: number }
    const aggMap = new Map<string, MonthAgg>()
    for (const m of months) aggMap.set(m, { revenue: 0, clients: 0, variants: 0, vasSet: new Set(), apiCost: 0, affiliate: 0 })

    for (const b of histBilling ?? []) {
      const agg = aggMap.get(b.month as string)
      if (agg) {
        agg.revenue  += (b.total_amount as number) ?? 0
        agg.clients  += (b.total_clients as number) ?? 0
        agg.variants += (b.total_variants as number) ?? 0
        agg.vasSet.add(b.va_id as string)
      }
    }
    for (const u of histUploads ?? []) {
      const mKey = (u.uploaded_at as string).slice(0, 7)
      const agg = aggMap.get(mKey)
      if (agg) agg.apiCost += (u.api_cost_usd as number) ?? 0
    }
    for (const a of histAff ?? []) {
      const agg = aggMap.get(a.month as string)
      if (agg) agg.affiliate += (a.payout_amount as number) ?? 0
    }

    const aggArr = months.map(m => aggMap.get(m)!)
    const revenues = aggArr.map(a => a.revenue).filter(r => r > 0)

    let growthRate = 0.15
    if (revenues.length >= 2) {
      const raw = Math.pow(revenues[revenues.length - 1] / revenues[0], 1 / (revenues.length - 1)) - 1
      growthRate = Math.min(Math.max(raw, -0.5), 0.5)
    }

    const last = aggArr[aggArr.length - 1]
    const baseRevenue   = last?.revenue ?? 0
    const baseClients   = last?.clients ?? 0
    const baseVariants  = last?.variants ?? 0
    const baseVAs       = last?.vasSet.size ?? 0
    const apiRatio      = baseRevenue > 0 ? (last?.apiCost ?? 0) / baseRevenue : 0.08
    const affRatio      = baseRevenue > 0 ? (last?.affiliate ?? 0) / baseRevenue : 0.05

    function project(n: number): ProjMonth {
      const f = Math.pow(1 + growthRate, n)
      const revenue = Math.round(baseRevenue * f)
      const apiCost = Math.round(revenue * apiRatio)
      const affiliatePayout = Math.round(revenue * affRatio)
      return {
        vas: Math.round(baseVAs * f), clients: Math.round(baseClients * f),
        variants: Math.round(baseVariants * f), revenue, apiCost, affiliatePayout,
        net: revenue - apiCost - affiliatePayout,
      }
    }

    setProjection({ growthRate: Math.round(growthRate * 1000) / 10, next1: project(1), next3: project(3), next6: project(6) })
  }, [])

  useEffect(() => { void loadLive(); void loadOverdue(); void loadProjection() }, [loadLive, loadOverdue, loadProjection])
  useEffect(() => { void loadInvoices() }, [loadInvoices])

  function refreshAll() { void loadLive(); void loadOverdue(); void loadInvoices() }

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function generateInvoices() {
    setGenerating(true); setGenMsg('')
    const res = await fetch('/api/billing/generate-invoices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: selectedMonth }),
    })
    const data = await res.json() as { invoices_generated?: number; total_amount?: number; error?: string }
    if (res.ok) {
      setGenMsg(`${data.invoices_generated} invoice${data.invoices_generated !== 1 ? 's' : ''} generated — $${data.total_amount?.toFixed(0)} total.`)
      refreshAll()
    } else setGenMsg(data.error ?? 'Error generating invoices.')
    setGenerating(false)
  }

  async function checkOverdue() {
    setCheckingOD(true)
    const res = await fetch('/api/billing/check-overdue')
    const data = await res.json() as { reminded?: number; paused?: number; blocked?: number }
    if (res.ok) {
      setGenMsg(`Overdue check: ${data.reminded} reminded, ${data.paused} paused, ${data.blocked} blocked.`)
      refreshAll()
    } else setGenMsg('Error running overdue check.')
    setCheckingOD(false)
  }

  // ── CSV exports ─────────────────────────────────────────────────────────────
  function exportMonthInvoices() {
    const rows: (string | number | null)[][] = [['Invoice #', 'VA', 'Month', 'Amount', 'Status', 'Due Date', 'Paid At']]
    for (const inv of invoices) rows.push([inv.invoice_number, inv.va_name, inv.month, inv.total_amount, inv.status, inv.due_date, inv.paid_at])
    downloadCSV(`invoices-${selectedMonth}.csv`, rows)
  }

  async function exportMonthDetail() {
    const rows: (string | number | null)[][] = [['Invoice #', 'VA', 'Store', 'Products', 'Tier', 'Amount', 'Uploads']]
    for (const inv of invoices) {
      const { data: items } = await supabase.from('billing_line_items').select('*').eq('billing_id', inv.id)
      for (const item of (items ?? []) as BillingLineItem[])
        rows.push([inv.invoice_number, inv.va_name, item.store_name, item.variant_count, item.tier, item.amount, item.upload_count])
    }
    downloadCSV(`billing-detail-${selectedMonth}.csv`, rows)
  }

  function exportOverdueReport() {
    const rows: (string | number | null)[][] = [['VA Name', 'Invoice #', 'Month', 'Amount', 'Due Date', 'Days Overdue', 'VA Email', 'Payment Method', 'Escalation']]
    for (const r of overdueRows) {
      const esc = r.va_status === 'blocked' ? 'Blocked' : r.va_status === 'paused' ? 'Paused' : r.reminded_at ? 'Reminded' : 'None'
      rows.push([r.va_name, r.invoice_number, r.month, r.total_amount, r.due_date, daysPastDue(r.due_date), r.va_email, r.va_payment_method, esc])
    }
    downloadCSV('overdue-report.csv', rows)
  }

  async function exportFullHistory() {
    const { data: all } = await supabase.from('billing').select('*').order('month', { ascending: false })
    const rows: (string | number | null)[][] = [['Invoice #', 'VA', 'Month', 'Amount', 'Status', 'Due Date', 'Paid At']]
    for (const inv of (all ?? []) as Billing[])
      rows.push([inv.invoice_number, inv.va_name, inv.month, inv.total_amount, inv.status, inv.due_date, inv.paid_at])
    downloadCSV('billing-history.csv', rows)
  }

  function exportProjection() {
    if (!projection) return
    const rows: (string | number | null)[][] = [['Period', 'Est VAs', 'Est Clients', 'Est Products', 'Est Revenue', 'Est API Cost', 'Est Affiliate', 'Est Net']]
    for (const [label, d] of [['Next Month', projection.next1], ['In 3 Months', projection.next3], ['In 6 Months', projection.next6]] as [string, ProjMonth][])
      rows.push([label, d.vas, d.clients, d.variants, d.revenue, d.apiCost, d.affiliatePayout, d.net])
    downloadCSV('projection-report.csv', rows)
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const filtered = invoices.filter(inv => statusFilter === 'all' || inv.status === statusFilter)
  const stats = {
    total:       invoices.reduce((s, i) => s + i.total_amount, 0),
    paid:        invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total_amount, 0),
    outstanding: invoices.filter(i => i.status === 'outstanding').reduce((s, i) => s + i.total_amount, 0),
    overdue:     invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total_amount, 0),
    count:       invoices.length,
  }

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 14px', borderRadius: 100, fontSize: 12, cursor: 'pointer',
    background: active ? T.black : 'none', color: active ? T.bg : T.ghost,
    border: `1px solid ${active ? T.black : T.div}`, fontFamily: 'inherit', transition: 'all 0.15s',
  })

  function fmtDelta(v: number | null, pct: number | null): string | null {
    if (v === null || pct === null) return null
    const sign = v >= 0 ? '+' : ''
    return `${sign}$${Math.abs(Math.round(v)).toLocaleString()} (${sign}${pct.toFixed(1)}%)`
  }

  const EXPORTS: [string, () => void][] = [
    ['This month invoices (CSV)',   exportMonthInvoices],
    ['This month detail (CSV)',     () => { void exportMonthDetail() }],
    ['Overdue report (CSV)',        exportOverdueReport],
    ['Full billing history (CSV)', () => { void exportFullHistory() }],
    ['Projection report (CSV)',    exportProjection],
  ]

  return (
    <div style={{ paddingTop: 48, paddingBottom: 100, maxWidth: 1100, margin: '0 auto', paddingInline: 48 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 40, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ fontSize: 28, fontWeight: 300, color: T.black }}>Billing overview</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Month selector + comparison */}
          <div>
            <select
              value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              style={{ fontSize: 13, color: T.black, border: `1px solid ${T.div}`, borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', outline: 'none', background: T.bg, cursor: 'pointer' }}
            >
              {monthOptions.map(m => <option key={m} value={m}>{formatMonth(m)}</option>)}
            </select>
            {comparison && (
              <div style={{ marginTop: 5, fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {comparison.vsLast !== null && (
                  <span style={{ color: T.black }}>vs last month: {fmtDelta(comparison.vsLast, comparison.vsLastPct)}</span>
                )}
                {comparison.vs3Ago !== null && (
                  <span style={{ color: T.ghost }}>vs 3mo ago: {fmtDelta(comparison.vs3Ago, comparison.vs3AgoPct)}</span>
                )}
              </div>
            )}
          </div>

          <button onClick={() => { void generateInvoices() }} disabled={generating}
            style={{ fontSize: 13, fontWeight: 500, color: T.bg, background: T.black, border: 'none', borderRadius: 100, padding: '9px 18px', cursor: generating ? 'default' : 'pointer', fontFamily: 'inherit', opacity: generating ? 0.5 : 1, transition: 'opacity 0.15s' }}
            onMouseEnter={e => { if (!generating) e.currentTarget.style.opacity = '0.75' }}
            onMouseLeave={e => { if (!generating) e.currentTarget.style.opacity = '1' }}
          >
            {generating ? 'Generating…' : `Generate invoices for ${formatMonth(selectedMonth)}`}
          </button>

          <button onClick={() => { void checkOverdue() }} disabled={checkingOD}
            style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: checkingOD ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'color 0.15s', padding: '9px 0' }}
            onMouseEnter={e => { if (!checkingOD) e.currentTarget.style.color = T.black }}
            onMouseLeave={e => { if (!checkingOD) e.currentTarget.style.color = T.ghost }}
          >
            {checkingOD ? 'Checking…' : 'Run overdue check'}
          </button>

          {/* Export dropdown */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setExportOpen(!exportOpen)}
              style={{ fontSize: 12, color: T.ghost, background: 'none', border: `1px solid ${T.div}`, borderRadius: 8, padding: '9px 14px', cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = T.black)}
              onMouseLeave={e => (e.currentTarget.style.color = T.ghost)}
            >Export ▾</button>
            {exportOpen && (
              <>
                <div onClick={() => setExportOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
                <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: T.bg, border: `1px solid ${T.div}`, borderRadius: 8, padding: '6px 0', zIndex: 100, minWidth: 240, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                  {EXPORTS.map(([label, fn]) => (
                    <button key={label} onClick={() => { fn(); setExportOpen(false) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 13, color: T.black, background: 'none', border: 'none', padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = T.row)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >{label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {genMsg && (
        <div style={{ fontSize: 13, color: T.ter, marginBottom: 24, paddingBottom: 24, borderBottom: `1px solid ${T.div}` }}>{genMsg}</div>
      )}

      {/* ── Summary stats ───────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 24, marginBottom: 56 }}>
        {[
          { label: 'Invoiced',    value: `$${stats.total.toFixed(0)}` },
          { label: 'Paid',        value: `$${stats.paid.toFixed(0)}` },
          { label: 'Outstanding', value: `$${stats.outstanding.toFixed(0)}` },
          { label: 'Overdue',     value: `$${stats.overdue.toFixed(0)}`, hi: stats.overdue > 0 },
          { label: '# Invoices',  value: String(stats.count) },
        ].map(s => (
          <div key={s.label} style={{ paddingTop: 20, borderTop: `1px solid ${T.div}` }}>
            <div style={{ fontSize: 22, fontWeight: 300, color: s.hi ? T.red : T.black }}>{s.value}</div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Section 1: Current month live ───────────────────────────────────── */}
      <div style={{ marginBottom: 56 }}>
        <SectionLabel left="Current month (live)" right={formatMonth(currentMonthKey())} />
        {liveData.length === 0 ? (
          <div style={{ fontSize: 13, color: T.ghost }}>No uploads processed this month yet.</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 110px 120px 120px', gap: 12, paddingBottom: 10, borderBottom: `1px solid ${T.div}` }}>
              {['VA', 'Clients', 'Products', 'Est. Amount', 'Paid Status'].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost }}>{h}</span>
              ))}
            </div>
            {liveData.map(va => <LiveVARow key={va.va_id} va={va} />)}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 110px 120px 120px', gap: 12, padding: '14px 0', borderTop: `1px solid #E8E8E8` }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.black }}>TOTAL</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: T.black }}>{liveData.reduce((s, v) => s + v.totalClients, 0)}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: T.black }}>{liveData.reduce((s, v) => s + v.totalVariants, 0).toLocaleString()}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: T.black }}>${liveData.reduce((s, v) => s + v.estAmount, 0).toLocaleString()}</span>
              <span />
            </div>
          </>
        )}
      </div>

      {/* ── Section 2: Overdue ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: 56 }}>
        <SectionLabel
          left="Overdue"
          right={overdueRows.length > 0
            ? `${overdueRows.length} invoice${overdueRows.length !== 1 ? 's' : ''} · $${overdueRows.reduce((s, r) => s + r.total_amount, 0).toFixed(0)}`
            : undefined}
        />
        {overdueRows.length === 0 ? (
          <div style={{ fontSize: 13, color: T.ghost }}>No overdue invoices.</div>
        ) : (
          overdueRows.map(row => (
            <OverdueInvoiceRow key={row.id} row={row} onRefresh={() => { void loadOverdue(); void loadInvoices() }} />
          ))
        )}
      </div>

      {/* ── Section 3: Invoices ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: 56 }}>
        <SectionLabel left="Invoices" right={formatMonth(selectedMonth)} />

        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {(['all', 'outstanding', 'overdue', 'paid', 'waived'] as StatusFilter[]).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={pillStyle(statusFilter === s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
              {s !== 'all' && (
                <span style={{ fontSize: 10, marginLeft: 5, opacity: 0.6 }}>({invoices.filter(i => i.status === s).length})</span>
              )}
            </button>
          ))}
        </div>

        <div style={{ borderBottom: `1px solid ${T.div}`, paddingBottom: 12, marginBottom: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 100px 80px 100px 110px', gap: 12 }}>
            {['VA', 'Invoice #', 'Month', 'Amount', 'Status', 'Due date'].map(h => (
              <span key={h} style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost }}>{h}</span>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ fontSize: 13, color: T.ghost, paddingTop: 24 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ fontSize: 13, color: T.ghost, paddingTop: 24 }}>
            No invoices found for {formatMonth(selectedMonth)}{statusFilter !== 'all' ? ` with status "${statusFilter}"` : ''}.
          </div>
        ) : (
          filtered.map(inv => (
            <InvoiceRow
              key={inv.id} invoice={inv}
              expanded={expandedId === inv.id}
              onToggle={() => setExpandedId(expandedId === inv.id ? null : inv.id)}
              onRefresh={loadInvoices}
            />
          ))
        )}
      </div>

      {/* ── Section 4: Projection ───────────────────────────────────────────── */}
      {projection && (
        <div style={{ marginBottom: 56 }}>
          <SectionLabel left="Projection" />
          <div style={{ fontSize: 12, color: T.ghost, marginTop: -12, marginBottom: 24 }}>Based on current activity and growth trends</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 40 }}>
            {([['NEXT MONTH', projection.next1], ['IN 3 MONTHS', projection.next3], ['IN 6 MONTHS', projection.next6]] as [string, ProjMonth][]).map(([label, d]) => (
              <div key={label} style={{ paddingTop: 20, borderTop: `1px solid ${T.div}` }}>
                <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, marginBottom: 16 }}>{label}</div>
                {[
                  ["Estimated VA's",              d.vas.toLocaleString()],
                  ['Estimated clients',           d.clients.toLocaleString()],
                  ['Estimated products',          d.variants.toLocaleString()],
                  ['Estimated revenue',           `$${d.revenue.toLocaleString()}`],
                  ['Estimated API cost',          `$${d.apiCost.toLocaleString()}`],
                  ['Estimated affiliate payouts', `$${d.affiliatePayout.toLocaleString()}`],
                  ['Estimated net',               `$${d.net.toLocaleString()}`],
                ].map(([lbl, val]) => (
                  <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBlock: 7, borderBottom: `1px solid ${T.row}` }}>
                    <span style={{ fontSize: 12, color: T.ghost }}>{lbl}</span>
                    <span style={{ fontSize: 14, color: T.black }}>{val}</span>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: T.ghost, marginTop: 10 }}>
                  ({projection.growthRate >= 0 ? '+' : ''}{projection.growthRate}%/month)
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#DDDDDD', fontStyle: 'italic', marginTop: 28 }}>
            Projections are estimates based on recent trends. Actual results may vary.
          </div>
        </div>
      )}
    </div>
  )
}
