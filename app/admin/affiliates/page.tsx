'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type AffRow = {
  id: string
  referrer_va_id: string
  referred_va_id: string
  referral_code: string | null
  referrer_va_name: string | null
  referred_va_name: string | null
  referred_va_country: string | null
  is_active: boolean
  free_month_used: boolean
  payout_percentage: number
  months_paid: number
  total_referred_va_paid: number
  total_payout_earned: number
  current_month_referred_fee: number
  current_month_payout_amount: number
  current_month_referred_paid: boolean
  referred_va_status: string | null
  referred_va_joined_month: string | null
  created_at: string
}

type PayoutRow = {
  id: string
  affiliate_id: string
  referrer_va_id: string
  referred_va_id: string
  month: string
  referred_va_fee: number
  payout_percentage: number
  payout_amount: number
  status: 'pending' | 'paid' | 'skipped'
  is_free_month: boolean
  reason_skipped: string | null
  paid_at: string | null
  created_at: string
}

type RCRow = {
  id: string
  va_id: string
  code: string
  link: string
  total_referrals: number
  active_referrals: number
  total_earned: number
  current_month_earned: number
  created_at: string
  // Streak
  payment_streak: number | null
  current_percentage: number | null
  highest_streak: number | null
  streak_lost_count: number | null
  next_tier_at: number | null
  potential_monthly_earnings: number | null
  actual_monthly_earnings: number | null
  last_streak_reset_month: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const T = {
  black:  '#1D1D1F',
  gray:   '#86868B',
  ghost:  '#AEAEB2',
  light:  '#F5F5F7',
  border: '#E8E8ED',
  white:  '#FFFFFF',
  green:  '#10B981',
  red:    '#EF4444',
  amber:  '#F59E0B',
  blue:   '#007AFF',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'relations' | 'payouts' | 'codes' | 'streak'

export default function AdminAffiliatesPage() {
  const [tab,       setTab]       = useState<Tab>('relations')
  const [affs,      setAffs]      = useState<AffRow[]>([])
  const [payouts,   setPayouts]   = useState<PayoutRow[]>([])
  const [codes,     setCodes]     = useState<RCRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [expanded,  setExpanded]  = useState<string | null>(null)

  // Filters — relations
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')
  const [searchAff,    setSearchAff]    = useState('')

  // Filters — payouts
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'paid' | 'skipped'>('all')
  const [filterMonth,  setFilterMonth]  = useState('')

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    const [affRes, payRes, codeRes] = await Promise.all([
      supabase.from('affiliates').select('*').order('created_at', { ascending: false }),
      supabase.from('affiliate_payouts').select('*').order('month', { ascending: false }),
      supabase.from('referral_codes').select('*').order('created_at', { ascending: false }),
    ])
    if (affRes.data)  setAffs(affRes.data as AffRow[])
    if (payRes.data)  setPayouts(payRes.data as PayoutRow[])
    if (codeRes.data) setCodes(codeRes.data as RCRow[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Mark payout paid ─────────────────────────────────────────────────────

  async function markPayoutPaid(payoutId: string) {
    await supabase.from('affiliate_payouts').update({
      status:  'paid',
      paid_at: new Date().toISOString(),
    }).eq('id', payoutId)
    setPayouts(prev => prev.map(p => p.id === payoutId ? { ...p, status: 'paid', paid_at: new Date().toISOString() } : p))
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  const totalActive        = affs.filter(a => a.is_active).length
  const totalPending       = payouts.filter(p => p.status === 'pending').length
  const totalPendingAmount = payouts.filter(p => p.status === 'pending').reduce((s, p) => s + p.payout_amount, 0)
  const totalPaidAmount    = payouts.filter(p => p.status === 'paid').reduce((s, p) => s + p.payout_amount, 0)

  // ── Filtered lists ───────────────────────────────────────────────────────

  const filteredAffs = affs.filter(a => {
    if (filterActive === 'active'   && !a.is_active) return false
    if (filterActive === 'inactive' && a.is_active)  return false
    if (searchAff) {
      const q = searchAff.toLowerCase()
      if (!(a.referrer_va_name ?? '').toLowerCase().includes(q) &&
          !(a.referred_va_name ?? '').toLowerCase().includes(q) &&
          !(a.referral_code ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const filteredPayouts = payouts.filter(p => {
    if (filterStatus !== 'all' && p.status !== filterStatus) return false
    if (filterMonth && p.month !== filterMonth) return false
    return true
  })

  const monthOptions = [...new Set(payouts.map(p => p.month))].sort().reverse()

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{
      paddingTop: 48, paddingBottom: 100,
      maxWidth: 1100, margin: '0 auto', paddingInline: 48,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 24, fontWeight: 600, color: T.black, letterSpacing: '-0.03em', marginBottom: 4 }}>
          Affiliates
        </div>
        <div style={{ fontSize: 14, color: T.gray }}>
          Referral relations, payout management, and referral codes.
        </div>
      </div>

      {/* ── Stats bar ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
        {[
          { label: 'Relations',       value: affs.length.toString() },
          { label: 'Active',          value: totalActive.toString() },
          { label: 'Pending payouts', value: totalPending.toString(),              highlight: totalPending > 0 },
          { label: 'Pending amount',  value: `$${totalPendingAmount.toFixed(2)}`,  highlight: totalPendingAmount > 0 },
          { label: 'Total paid out',  value: `$${totalPaidAmount.toFixed(2)}` },
          { label: 'Codes issued',    value: codes.length.toString() },
        ].map(s => (
          <div key={s.label} style={{
            background: T.light, borderRadius: 12, padding: '14px 18px', minWidth: 130,
          }}>
            <div style={{ fontSize: 11, color: T.gray, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: s.highlight ? T.amber : T.black }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${T.border}`, marginBottom: 28 }}>
        {(['relations', 'payouts', 'codes', 'streak'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontSize: 13, fontWeight: tab === t ? 500 : 400,
              color: tab === t ? T.black : T.gray,
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '10px 20px', borderBottom: tab === t ? `2px solid ${T.black}` : '2px solid transparent',
              textTransform: 'capitalize',
            }}
          >
            {t === 'relations' ? `Relations (${affs.length})`
              : t === 'payouts' ? `Payouts (${payouts.length})`
              : t === 'codes'   ? `Codes (${codes.length})`
              : `Streak`}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: T.gray, fontSize: 14 }}>Loading…</div>
      ) : (
        <>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* TAB: RELATIONS                                                     */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {tab === 'relations' && (
            <div>
              {/* Filters */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={searchAff}
                  onChange={e => setSearchAff(e.target.value)}
                  placeholder="Search by name or code…"
                  style={{
                    fontSize: 13, color: T.black, background: T.light, border: 'none',
                    borderRadius: 8, padding: '8px 14px', outline: 'none', width: 240,
                  }}
                />
                {(['all', 'active', 'inactive'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setFilterActive(v)}
                    style={{
                      fontSize: 12, fontWeight: filterActive === v ? 500 : 400,
                      color: filterActive === v ? T.black : T.gray,
                      background: filterActive === v ? T.border : T.light,
                      border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    {v}
                  </button>
                ))}
                <div style={{ fontSize: 12, color: T.ghost, marginLeft: 'auto' }}>
                  {filteredAffs.length} of {affs.length}
                </div>
              </div>

              {/* Table */}
              <div style={{ border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
                {/* Header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 100px 90px 80px 90px 90px 80px',
                  gap: 0, padding: '10px 20px',
                  background: T.light, borderBottom: `1px solid ${T.border}`,
                  fontSize: 11, color: T.gray, letterSpacing: '0.04em',
                }}>
                  <div>REFERRER</div>
                  <div>REFERRED VA</div>
                  <div>CODE</div>
                  <div>STATUS</div>
                  <div>MONTHS</div>
                  <div>TOTAL PAID</div>
                  <div>TOTAL EARNED</div>
                  <div>JOINED</div>
                </div>

                {filteredAffs.length === 0 ? (
                  <div style={{ padding: '24px 20px', fontSize: 13, color: T.gray, textAlign: 'center' }}>
                    No relations found.
                  </div>
                ) : filteredAffs.map((a, i) => (
                  <div key={a.id}>
                    <div
                      onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 100px 90px 80px 90px 90px 80px',
                        gap: 0, padding: '13px 20px',
                        borderBottom: i < filteredAffs.length - 1 ? `1px solid ${T.border}` : 'none',
                        cursor: 'pointer',
                        background: expanded === a.id ? '#FAFAFA' : T.white,
                      }}
                      onMouseEnter={e => { if (expanded !== a.id) e.currentTarget.style.background = '#FAFAFA' }}
                      onMouseLeave={e => { if (expanded !== a.id) e.currentTarget.style.background = T.white }}
                    >
                      <div style={{ fontSize: 13, color: T.black, fontWeight: 500 }}>{a.referrer_va_name ?? a.referrer_va_id.slice(0, 8)}</div>
                      <div style={{ fontSize: 13, color: T.black }}>{a.referred_va_name ?? a.referred_va_id.slice(0, 8)}</div>
                      <div style={{ fontSize: 12, color: T.gray, fontFamily: 'monospace' }}>{a.referral_code ?? '—'}</div>
                      <div>
                        <span style={{
                          fontSize: 11, fontWeight: 500,
                          color: a.is_active ? T.green : T.gray,
                          background: a.is_active ? '#ECFDF5' : T.light,
                          borderRadius: 5, padding: '2px 7px',
                        }}>
                          {a.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: T.black }}>{a.months_paid ?? 0}</div>
                      <div style={{ fontSize: 13, color: T.black }}>${(a.total_referred_va_paid ?? 0).toFixed(0)}</div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: T.green }}>${(a.total_payout_earned ?? 0).toFixed(2)}</div>
                      <div style={{ fontSize: 12, color: T.gray }}>{a.referred_va_joined_month ? fmtMonth(a.referred_va_joined_month) : '—'}</div>
                    </div>

                    {/* Expanded */}
                    {expanded === a.id && (
                      <div style={{
                        padding: '16px 20px 20px 20px',
                        background: '#FAFAFA',
                        borderBottom: i < filteredAffs.length - 1 ? `1px solid ${T.border}` : 'none',
                      }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                          {[
                            { label: 'Payout %',           value: `${a.payout_percentage ?? 20}%` },
                            { label: 'Free month used',    value: a.free_month_used ? 'Yes' : 'No' },
                            { label: 'This month paid',    value: a.current_month_referred_paid ? 'Yes' : 'No' },
                            { label: 'This month VA fee',  value: `$${(a.current_month_referred_fee ?? 0).toFixed(0)}` },
                            { label: 'This month payout',  value: `$${(a.current_month_payout_amount ?? 0).toFixed(2)}` },
                            { label: 'Referred VA status', value: a.referred_va_status ?? '—' },
                            { label: 'Created',            value: fmtDate(a.created_at) },
                          ].map(f => (
                            <div key={f.label}>
                              <div style={{ fontSize: 10, color: T.ghost, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{f.label}</div>
                              <div style={{ fontSize: 13, color: T.black }}>{f.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* TAB: PAYOUTS                                                       */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {tab === 'payouts' && (
            <div>
              {/* Filters */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                {(['all', 'pending', 'paid', 'skipped'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setFilterStatus(v)}
                    style={{
                      fontSize: 12, fontWeight: filterStatus === v ? 500 : 400,
                      color: filterStatus === v ? T.black : T.gray,
                      background: filterStatus === v ? T.border : T.light,
                      border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    {v}
                  </button>
                ))}
                <select
                  value={filterMonth}
                  onChange={e => setFilterMonth(e.target.value)}
                  style={{
                    fontSize: 12, color: T.black, background: T.light, border: 'none',
                    borderRadius: 8, padding: '7px 14px', cursor: 'pointer', outline: 'none',
                  }}
                >
                  <option value="">All months</option>
                  {monthOptions.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
                </select>
                <div style={{ fontSize: 12, color: T.ghost, marginLeft: 'auto' }}>
                  {filteredPayouts.length} of {payouts.length}
                </div>
              </div>

              {/* Table */}
              <div style={{ border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 80px 80px 70px 90px 80px 90px',
                  padding: '10px 20px', background: T.light, borderBottom: `1px solid ${T.border}`,
                  fontSize: 11, color: T.gray, letterSpacing: '0.04em',
                }}>
                  <div>REFERRER</div>
                  <div>REFERRED VA</div>
                  <div>MONTH</div>
                  <div>VA FEE</div>
                  <div>%</div>
                  <div>PAYOUT</div>
                  <div>STATUS</div>
                  <div>ACTION</div>
                </div>

                {filteredPayouts.length === 0 ? (
                  <div style={{ padding: '24px 20px', fontSize: 13, color: T.gray, textAlign: 'center' }}>No payouts found.</div>
                ) : filteredPayouts.map((p, i) => {
                  // Match referrer/referred names from affs list
                  const aff = affs.find(a => a.id === p.affiliate_id)
                  const referrerName  = aff?.referrer_va_name  ?? p.referrer_va_id.slice(0, 8)
                  const referredName  = aff?.referred_va_name  ?? p.referred_va_id.slice(0, 8)

                  return (
                    <div key={p.id} style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 80px 80px 70px 90px 80px 90px',
                      padding: '13px 20px', alignItems: 'center',
                      borderBottom: i < filteredPayouts.length - 1 ? `1px solid ${T.border}` : 'none',
                    }}>
                      <div style={{ fontSize: 13, color: T.black, fontWeight: 500 }}>{referrerName}</div>
                      <div style={{ fontSize: 13, color: T.black }}>
                        {referredName}
                        {p.is_free_month && (
                          <span style={{ fontSize: 10, color: T.blue, background: '#EFF6FF', borderRadius: 4, padding: '1px 5px', marginLeft: 6 }}>
                            free month
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: T.gray }}>{fmtMonth(p.month)}</div>
                      <div style={{ fontSize: 13, color: T.black }}>{p.referred_va_fee > 0 ? `$${p.referred_va_fee.toFixed(0)}` : '—'}</div>
                      <div style={{ fontSize: 13, color: T.gray }}>{p.payout_percentage}%</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: p.payout_amount > 0 ? T.green : T.gray }}>
                        {p.payout_amount > 0 ? `$${p.payout_amount.toFixed(2)}` : '—'}
                      </div>
                      <div>
                        <span style={{
                          fontSize: 11, fontWeight: 500,
                          color:      p.status === 'paid' ? T.green : p.status === 'pending' ? T.amber : T.gray,
                          background: p.status === 'paid' ? '#ECFDF5' : p.status === 'pending' ? '#FFFBEB' : T.light,
                          borderRadius: 5, padding: '2px 7px',
                        }}>
                          {p.status}
                        </span>
                      </div>
                      <div>
                        {p.status === 'pending' && p.payout_amount > 0 && (
                          <button
                            onClick={() => markPayoutPaid(p.id)}
                            style={{
                              fontSize: 11, fontWeight: 500, color: T.white,
                              background: T.black, border: 'none',
                              borderRadius: 7, padding: '5px 12px', cursor: 'pointer',
                              transition: 'opacity 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                          >
                            Mark paid
                          </button>
                        )}
                        {p.status === 'paid' && p.paid_at && (
                          <span style={{ fontSize: 11, color: T.ghost }}>{fmtDate(p.paid_at)}</span>
                        )}
                        {p.status === 'skipped' && p.reason_skipped && (
                          <span style={{ fontSize: 11, color: T.ghost }} title={p.reason_skipped}>—</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* TAB: CODES                                                         */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {tab === 'codes' && (
            <div>
              <div style={{ border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '160px 1fr 80px 80px 100px 110px 100px',
                  padding: '10px 20px', background: T.light, borderBottom: `1px solid ${T.border}`,
                  fontSize: 11, color: T.gray, letterSpacing: '0.04em',
                }}>
                  <div>CODE</div>
                  <div>LINK</div>
                  <div>REFERRALS</div>
                  <div>ACTIVE</div>
                  <div>TOTAL EARNED</div>
                  <div>THIS MONTH</div>
                  <div>CREATED</div>
                </div>

                {codes.length === 0 ? (
                  <div style={{ padding: '24px 20px', fontSize: 13, color: T.gray, textAlign: 'center' }}>No codes yet.</div>
                ) : codes.map((c, i) => (
                  <div key={c.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 1fr 80px 80px 100px 110px 100px',
                    padding: '13px 20px', alignItems: 'center',
                    borderBottom: i < codes.length - 1 ? `1px solid ${T.border}` : 'none',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.black, fontFamily: 'monospace' }}>{c.code}</div>
                    <div style={{ fontSize: 11, color: T.ghost, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.link}
                    </div>
                    <div style={{ fontSize: 13, color: T.black }}>{c.total_referrals ?? 0}</div>
                    <div style={{ fontSize: 13, color: T.black }}>{c.active_referrals ?? 0}</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: T.green }}>${(c.total_earned ?? 0).toFixed(2)}</div>
                    <div style={{ fontSize: 13, color: (c.current_month_earned ?? 0) > 0 ? T.amber : T.gray }}>
                      ${(c.current_month_earned ?? 0).toFixed(2)}
                    </div>
                    <div style={{ fontSize: 12, color: T.gray }}>{fmtDate(c.created_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* TAB: STREAK OVERVIEW                                               */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {tab === 'streak' && (
            <div>
              {/* Summary stats */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                {(() => {
                  const withStreak     = codes.filter(c => (c.payment_streak ?? 0) > 0)
                  const onMaxTier      = codes.filter(c => (c.current_percentage ?? 0) >= 35)
                  const totalPotential = codes.reduce((s, c) => s + (c.potential_monthly_earnings ?? 0), 0)
                  const totalActual    = codes.reduce((s, c) => s + (c.actual_monthly_earnings    ?? 0), 0)
                  const totalLoss      = totalPotential - totalActual
                  return [
                    { label: 'Active streaks',     value: withStreak.length.toString() },
                    { label: 'At max tier (35%)',  value: onMaxTier.length.toString() },
                    { label: 'Total potential',    value: `$${totalPotential.toFixed(2)}` },
                    { label: 'Total actual',       value: `$${totalActual.toFixed(2)}` },
                    { label: 'System-wide loss',   value: `$${totalLoss.toFixed(2)}`, highlight: totalLoss > 0 },
                  ].map(s => (
                    <div key={s.label} style={{ background: T.light, borderRadius: 12, padding: '14px 18px', minWidth: 130 }}>
                      <div style={{ fontSize: 11, color: T.gray, marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 20, fontWeight: 600, color: s.highlight ? T.red : T.black }}>{s.value}</div>
                    </div>
                  ))
                })()}
              </div>

              {/* Streak table — sorted by streak desc */}
              <div style={{ border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 80px 60px 80px 100px 100px 90px 70px 80px',
                  padding: '10px 20px', background: T.light, borderBottom: `1px solid ${T.border}`,
                  fontSize: 11, color: T.gray, letterSpacing: '0.04em',
                }}>
                  <div>VA / CODE</div>
                  <div>STREAK</div>
                  <div>RATE</div>
                  <div>HIGHEST</div>
                  <div>POTENTIAL</div>
                  <div>ACTUAL</div>
                  <div>LOSS</div>
                  <div>RESETS</div>
                  <div>NEXT TIER</div>
                </div>

                {codes.length === 0 ? (
                  <div style={{ padding: '24px 20px', fontSize: 13, color: T.gray, textAlign: 'center' }}>No codes yet.</div>
                ) : [...codes]
                    .sort((a, b) => (b.payment_streak ?? 0) - (a.payment_streak ?? 0))
                    .map((c, i) => {
                      const streak    = c.payment_streak             ?? 0
                      const pct       = c.current_percentage         ?? 20
                      const highest   = c.highest_streak             ?? 0
                      const potential = c.potential_monthly_earnings ?? 0
                      const actual    = c.actual_monthly_earnings    ?? 0
                      const loss      = Math.max(0, potential - actual)
                      const resets    = c.streak_lost_count          ?? 0
                      const nextTier  = c.next_tier_at               ?? 3
                      const wasReset  = c.last_streak_reset_month !== null && streak === 0

                      // Find referrer VA name from affs
                      const aff       = affs.find(a => a.referral_code === c.code)
                      const vaName    = aff?.referrer_va_name ?? c.va_id.slice(0, 8)

                      return (
                        <div key={c.id} style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 80px 60px 80px 100px 100px 90px 70px 80px',
                          padding: '13px 20px', alignItems: 'center',
                          borderBottom: i < codes.length - 1 ? `1px solid ${T.border}` : 'none',
                          background: wasReset ? '#FFFAF0' : T.white,
                        }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: T.black }}>{vaName}</div>
                            <div style={{ fontSize: 11, color: T.ghost, fontFamily: 'monospace' }}>{c.code}</div>
                          </div>
                          <div>
                            <div style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              fontSize: 13, fontWeight: 600,
                              color: streak >= 10 ? '#7C3AED' : streak >= 5 ? T.green : streak > 0 ? T.amber : T.gray,
                            }}>
                              {streak > 0 ? `${streak}mo` : '—'}
                            </div>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: pct >= 35 ? '#7C3AED' : pct >= 28 ? T.green : T.black }}>
                            {pct}%
                          </div>
                          <div style={{ fontSize: 13, color: T.gray }}>
                            {highest > 0 ? `${highest}mo` : '—'}
                          </div>
                          <div style={{ fontSize: 13, color: T.black }}>{potential > 0 ? `$${potential.toFixed(2)}` : '—'}</div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: actual > 0 ? T.green : T.gray }}>
                            {actual > 0 ? `$${actual.toFixed(2)}` : '—'}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: loss > 0 ? 500 : 400, color: loss > 0.01 ? T.red : T.gray }}>
                            {loss > 0.01 ? `-$${loss.toFixed(2)}` : '—'}
                          </div>
                          <div style={{ fontSize: 13, color: resets > 0 ? T.amber : T.gray }}>{resets > 0 ? resets : '—'}</div>
                          <div style={{ fontSize: 12, color: nextTier === 0 ? '#7C3AED' : T.gray }}>
                            {nextTier === 0 ? 'Max' : `${nextTier}mo`}
                          </div>
                        </div>
                      )
                    })}
              </div>
            </div>
          )}

        </>
      )}
    </div>
  )
}
