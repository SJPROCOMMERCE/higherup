'use client'

import { useState, useEffect } from 'react'
import { useVA } from '@/context/va-context'
import { FREE_PRODUCTS_PER_MONTH, PRICE_PER_PRODUCT } from '@/lib/usage-tracker'

const T = {
  black:  '#111111',
  muted:  '#666666',
  ghost:  '#999999',
  border: '#EEEEEE',
  green:  '#2DB87E',
  bg:     '#FAFAFA',
}

function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type UsageRow = {
  id:            string
  upload_id:     string | null
  product_count: number
  free_count:    number
  billable_count: number
  total_amount:  number
  source:        string
  created_at:    string
  store_name:    string | null
}

type Invoice = {
  id:                string
  invoice_number:    string
  month:             string
  total_amount:      number
  total_products:    number | null
  free_products:     number | null
  billable_products: number | null
  status:            'outstanding' | 'paid' | 'overdue' | 'waived'
  due_date:          string | null
  paid_at:           string | null
  generated_at:      string
}

type CurrentUsage = {
  billingMonth:     string
  totalProducts:    number
  freeProducts:     number
  billableProducts: number
  totalAmount:      number
  uploadCount:      number
  rows:             UsageRow[]
}

function StatusBadge({ status }: { status: Invoice['status'] }) {
  const map: Record<string, { label: string; bg: string; color: string; border: string }> = {
    outstanding: { label: 'Outstanding', bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
    overdue:     { label: 'Overdue',     bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA' },
    paid:        { label: 'Paid',        bg: '#ECFDF5', color: '#065F46', border: '#A7F3D0' },
    waived:      { label: 'Waived',      bg: '#F5F3FF', color: '#5B21B6', border: '#DDD6FE' },
  }
  const s = map[status] ?? map.outstanding
  return (
    <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 20, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {s.label}
    </span>
  )
}

function UsageMeter({ current }: { current: CurrentUsage | null }) {
  const FREE      = FREE_PRODUCTS_PER_MONTH
  const total     = current?.totalProducts    ?? 0
  const billable  = current?.billableProducts ?? 0
  const amount    = current?.totalAmount      ?? 0
  const month     = current?.billingMonth
    ? formatMonth(current.billingMonth)
    : new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const freeUsed  = Math.min(total, FREE)
  const barPct    = Math.min((freeUsed / FREE) * 100, 100)
  const overFree  = total > FREE

  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${T.border}`, borderRadius: 12, padding: '24px 28px', marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.black, marginBottom: 2 }}>{month}</div>
          <div style={{ fontSize: 12, color: T.muted }}>Current month usage</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 24, fontWeight: 600, color: billable > 0 ? T.black : T.ghost, letterSpacing: '-0.03em' }}>
            ${amount.toFixed(2)}
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>est. HigherUp share</div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 28, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, color: T.black, letterSpacing: '-0.03em' }}>{total.toLocaleString()}</div>
          <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>Products</div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, color: T.green, letterSpacing: '-0.03em' }}>{freeUsed}</div>
          <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>Free</div>
        </div>
        {billable > 0 ? (
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: T.black, letterSpacing: '-0.03em' }}>{billable.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>Billable</div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: T.ghost, letterSpacing: '-0.03em' }}>{FREE - freeUsed}</div>
            <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>Free left</div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ height: 6, background: T.border, borderRadius: 3, marginBottom: 8, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${barPct}%`, background: T.green, borderRadius: 3, transition: 'width 0.4s ease' }} />
        {overFree && (
          <div style={{ position: 'absolute', left: '100%', top: 0, height: '100%', width: '40px', background: T.black, opacity: 0.4 }} />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.ghost }}>
        <span>0</span>
        <span style={{ fontWeight: 500 }}>{FREE} free</span>
        {overFree && <span>{total.toLocaleString()} total</span>}
      </div>

      {total === 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: T.muted, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '8px 12px' }}>
          First {FREE} products per month are free. No invoice if you stay within that limit.
        </div>
      )}
      {total > 0 && !overFree && (
        <div style={{ marginTop: 12, fontSize: 12, color: T.muted, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '8px 12px' }}>
          🎉 You&apos;re within the free tier — {FREE - freeUsed} free products remaining this month.
        </div>
      )}
      {billable > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: T.muted }}>
          {billable.toLocaleString()} products × ${PRICE_PER_PRODUCT} = <strong style={{ color: T.black }}>${amount.toFixed(2)}</strong> HigherUp share. Invoice generated on the 1st of next month.
        </div>
      )}
    </div>
  )
}

export default function BillingPage() {
  const { currentVA } = useVA()
  const [current,  setCurrent]  = useState<CurrentUsage | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading,  setLoading]  = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (!currentVA?.id) return
    void (async () => {
      setLoading(true)
      const [usageRes, billRes] = await Promise.all([
        fetch(`/api/usage?va_id=${currentVA.id}`),
        fetch(`/api/billing/list?va_id=${currentVA.id}`),
      ])
      if (usageRes.ok) setCurrent(await usageRes.json())
      if (billRes.ok)  setInvoices(await billRes.json())
      setLoading(false)
    })()
  }, [currentVA?.id])

  if (!currentVA) return null

  const paidTotal = invoices
    .filter(i => i.status === 'paid' || i.status === 'waived')
    .reduce((s, i) => s + i.total_amount, 0)

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px', fontFamily: "'Inter', system-ui, sans-serif" }}>

      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: T.black, margin: 0, marginBottom: 6 }}>Billing</h1>
        <p style={{ fontSize: 13, color: T.muted, margin: 0 }}>
          First {FREE_PRODUCTS_PER_MONTH} products/month free · ${PRICE_PER_PRODUCT} per product after that
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: T.ghost, fontSize: 13 }}>Loading...</div>
      ) : (
        <>
          <UsageMeter current={current} />

          {/* This month's upload breakdown */}
          {current && current.rows.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, marginBottom: 12 }}>
                This month's uploads
              </div>
              <div style={{ background: '#FFFFFF', border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
                {current.rows.map((row, i) => (
                  <div
                    key={row.id}
                    style={{
                      padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      borderBottom: i < current.rows.length - 1 ? `1px solid ${T.border}` : 'none',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, color: T.black }}>{row.store_name ?? 'Upload'}</div>
                      <div style={{ fontSize: 11, color: T.ghost, marginTop: 2 }}>
                        {row.product_count} products
                        {row.free_count > 0 && ` · ${row.free_count} free`}
                        {row.billable_count > 0 && ` · ${row.billable_count} billable`}
                        {' · '}{new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                    <div>
                      {row.total_amount > 0 ? (
                        <span style={{ fontSize: 13, fontWeight: 500, color: T.black }}>${row.total_amount.toFixed(2)}</span>
                      ) : (
                        <span style={{ fontSize: 12, color: T.green, fontWeight: 500 }}>Free</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Past invoices */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost }}>
                Past invoices
              </div>
              {paidTotal > 0 && (
                <div style={{ fontSize: 12, color: T.muted }}>
                  Total paid: <strong style={{ color: T.black }}>${paidTotal.toFixed(2)}</strong>
                </div>
              )}
            </div>

            {invoices.length === 0 ? (
              <div style={{ background: '#FFFFFF', border: `1px solid ${T.border}`, borderRadius: 10, padding: '32px 24px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: T.ghost, margin: 0 }}>
                  No invoices yet. Your first invoice will appear here on the 1st of next month (only if you process more than {FREE_PRODUCTS_PER_MONTH} products).
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {invoices.map(inv => (
                  <div
                    key={inv.id}
                    style={{ background: '#FFFFFF', border: `1px solid ${inv.status === 'overdue' ? '#FECACA' : T.border}`, borderRadius: 10 }}
                  >
                    <button
                      onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
                      style={{ width: '100%', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: T.black }}>{formatMonth(inv.month)}</div>
                        <div style={{ fontSize: 11, color: T.ghost, marginTop: 2 }}>
                          {inv.invoice_number}
                          {inv.billable_products != null && inv.billable_products > 0 && ` · ${inv.billable_products} billable products`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <StatusBadge status={inv.status} />
                        <span style={{ fontSize: 15, fontWeight: 600, color: T.black, letterSpacing: '-0.02em' }}>
                          ${inv.total_amount.toFixed(2)}
                        </span>
                        <span style={{ fontSize: 11, color: T.ghost }}>{expanded === inv.id ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {expanded === inv.id && (
                      <div style={{ padding: '0 20px 16px', borderTop: `1px solid ${T.border}` }}>
                        <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {([
                            ['Invoice', inv.invoice_number],
                            ['Period', formatMonth(inv.month)],
                            inv.total_products != null ? ['Total products', inv.total_products.toLocaleString()] : null,
                            inv.free_products != null ? ['Free products', `${inv.free_products} of ${FREE_PRODUCTS_PER_MONTH}`] : null,
                            (inv.billable_products != null && inv.billable_products > 0) ? ['Billable products', `${inv.billable_products} × $${PRICE_PER_PRODUCT} = $${inv.total_amount.toFixed(2)}`] : null,
                            (inv.due_date && inv.status !== 'paid' && inv.status !== 'waived') ? ['Due date', formatDate(inv.due_date)] : null,
                            inv.paid_at ? ['Paid on', formatDate(inv.paid_at)] : null,
                            ['Generated', formatDate(inv.generated_at)],
                          ] as ([string, string] | null)[]).filter(Boolean).map((row, i) => row && (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                              <span style={{ color: T.muted }}>{row[0]}</span>
                              <span style={{ color: T.black }}>{row[1]}</span>
                            </div>
                          ))}
                        </div>
                        {(inv.status === 'outstanding' || inv.status === 'overdue') && (
                          <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: inv.status === 'overdue' ? '#FEF2F2' : '#FFFBEB', border: `1px solid ${inv.status === 'overdue' ? '#FECACA' : '#FDE68A'}` }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: inv.status === 'overdue' ? '#B91C1C' : '#92400E', marginBottom: 4 }}>
                              {inv.status === 'overdue' ? '⚠️ Payment overdue' : '💳 Payment due'}
                            </div>
                            <div style={{ fontSize: 12, color: T.muted }}>
                              Transfer ${inv.total_amount.toFixed(2)} to HigherUp. Contact support if you need payment details.
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
