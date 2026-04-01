'use client'

import { useEffect, useState, useCallback } from 'react'
import { useVA } from '@/context/va-context'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { PageVideo } from '@/components/dashboard/PageVideo'

// ─── Types ────────────────────────────────────────────────────────────────────

type ReferralCode = {
  code: string
  link: string
  total_referrals: number
  active_referrals: number
  total_earned: number
  current_month_earned: number
  // Streak
  payment_streak: number
  current_percentage: number
  highest_streak: number
  streak_lost_count: number
  next_tier_at: number
  potential_monthly_earnings: number
  actual_monthly_earnings: number
  last_streak_reset_month: string | null
  streak_last_updated_month: string | null
}

type ReferredVA = {
  id: string
  affiliate_id: string
  referred_va_name: string
  referred_va_country: string | null
  referred_va_status: string | null
  is_active: boolean
  joined_at: string | null
  // Activity this month (enriched after load)
  totalProducts?: number
  theirShare?: number
  yourEarnings?: number
  isPaid?: boolean
  hasInvoice?: boolean
}

type PayoutRow = {
  id: string
  affiliate_id: string
  referred_va_id: string
  month: string
  referred_va_fee: number
  payout_percentage: number
  payout_amount: number
  status: 'pending' | 'paid' | 'skipped'
  is_free_month: boolean
  reason_skipped: string | null
  paid_at: string | null
}

type MonthGroup = {
  month: string
  totalPayout: number
  rows: PayoutRow[]
  expanded: boolean
}

// ─── Streak helpers ───────────────────────────────────────────────────────────

function getPercentageForStreak(streak: number): number {
  if (streak >= 12) return 35
  if (streak >= 10) return 30
  if (streak >= 7)  return 28
  if (streak >= 5)  return 25
  if (streak >= 3)  return 23
  return 20
}

const TIERS = [
  { label: 'Months 1–2',  pct: 20, streakNeeded: 0  },
  { label: 'Months 3–4',  pct: 23, streakNeeded: 3  },
  { label: 'Months 5–6',  pct: 25, streakNeeded: 5  },
  { label: 'Months 7–9',  pct: 28, streakNeeded: 7  },
  { label: 'Months 10–12', pct: 30, streakNeeded: 10 },
  { label: 'Month 12+',   pct: 35, streakNeeded: 12 },
]

// Tier span boundaries: [0, 3, 5, 7, 10, 12]
function getStreakProgress(streak: number): { fillPercent: number; monthsLeft: number; nextPct: number } {
  if (streak >= 12) return { fillPercent: 100, monthsLeft: 0, nextPct: 35 }
  const spans = [
    { lower: 0,  upper: 3,  nextPct: 23 },
    { lower: 3,  upper: 5,  nextPct: 25 },
    { lower: 5,  upper: 7,  nextPct: 28 },
    { lower: 7,  upper: 10, nextPct: 30 },
    { lower: 10, upper: 12, nextPct: 35 },
  ]
  for (const span of spans) {
    if (streak < span.upper) {
      const fill = ((streak - span.lower) / (span.upper - span.lower)) * 100
      return { fillPercent: Math.min(100, Math.max(0, fill)), monthsLeft: span.upper - streak, nextPct: span.nextPct }
    }
  }
  return { fillPercent: 100, monthsLeft: 0, nextPct: 35 }
}

// ─── Month helpers ────────────────────────────────────────────────────────────

function getPreviousMonth(): string {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = now.getMonth()
  if (m === 0) return `${y - 1}-12`
  return `${y}-${String(m).padStart(2, '0')}`
}

function fmtMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// Countdown to invoice deadline (7th of current month)
function getDeadlineCountdown(): { daysLeft: number; invoiceMonth: string } | null {
  const now       = new Date()
  const day       = now.getDate()
  if (day > 7) return null
  const daysLeft  = 7 - day + 1
  const invoiceMonth = getPreviousMonth()
  return daysLeft > 0 ? { daysLeft, invoiceMonth: fmtMonth(invoiceMonth) } : null
}

// ─── Design tokens ────────────────────────────────────────────────────────────

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

export default function AffiliatesPage() {
  const { currentVA: va } = useVA()

  const [code,        setCode]        = useState<ReferralCode | null>(null)
  const [referrals,   setReferrals]   = useState<ReferredVA[]>([])
  const [months,      setMonths]      = useState<MonthGroup[]>([])
  const [loading,     setLoading]     = useState(true)
  const [copied,      setCopied]      = useState<'code' | 'link' | null>(null)
  const [paidCount,   setPaidCount]   = useState(0)
  const [totalCount,  setTotalCount]  = useState(0)

  // Simulator
  const [simReferrals, setSimReferrals] = useState('5')
  const [simAvg,       setSimAvg]       = useState('100')

  // ── Load ─────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!va) return
    setLoading(true)

    // 1. Generate / fetch referral code (auto-creates if missing)
    const gcRes = await fetch('/api/affiliates/generate-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ va_id: va.id }),
    })
    const gcData = await gcRes.json() as { ok?: boolean; code?: string; link?: string }

    let currentPct = 20
    if (gcData.ok && gcData.code) {
      // Use the data returned directly from the API to avoid RLS select issues
      const { data: rcArr } = await supabase
        .from('referral_codes').select('*').eq('va_id', va.id).limit(1)
      const rc = rcArr?.[0] ?? null
      if (rc) {
        currentPct = (rc as unknown as { current_percentage?: number }).current_percentage ?? 20
        setCode(rc as unknown as ReferralCode)
      } else {
        // Fallback: build minimal code object from API response
        setCode({
          code: gcData.code,
          link: gcData.link ?? `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/join?ref=${gcData.code}`,
          total_referrals: 0, active_referrals: 0, total_earned: 0,
          current_month_earned: 0, payment_streak: 0, current_percentage: 20,
          highest_streak: 0, streak_lost_count: 0, next_tier_at: 3,
          potential_monthly_earnings: 0, actual_monthly_earnings: 0,
          last_streak_reset_month: null, streak_last_updated_month: null,
        })
      }
    }

    // 2. Affiliates where this VA is the referrer (only use columns that exist in DB)
    const { data: affs, error: affsErr } = await supabase
      .from('affiliates')
      .select('id, referred_va_id, is_active, referred_at')
      .eq('referrer_va_id', va.id)
      .order('referred_at', { ascending: false })

    console.log('[affiliates] affs query:', affs, affsErr?.message)

    // Resolve names/country from vas table
    const referredIds = (affs ?? []).map(a => a.referred_va_id as string).filter(Boolean)
    const vaDetailMap: Record<string, { name: string; country: string | null; status: string }> = {}
    if (referredIds.length > 0) {
      const { data: vaRows } = await supabase
        .from('vas')
        .select('id, name, country, status')
        .in('id', referredIds)
      for (const row of vaRows ?? []) {
        vaDetailMap[row.id as string] = {
          name:    row.name    as string,
          country: row.country as string | null,
          status:  row.status  as string,
        }
      }
    }

    const referralList: ReferredVA[] = (affs ?? []).map(a => {
      const det = vaDetailMap[a.referred_va_id as string]
      return {
        id:                  a.referred_va_id as string,
        affiliate_id:        a.id as string,
        referred_va_name:    det?.name    ?? 'Unknown',
        referred_va_country: det?.country ?? null,
        referred_va_status:  det?.status  ?? null,
        is_active:           a.is_active  as boolean,
        joined_at:           a.referred_at as string | null,
      }
    })
    // Enrich with this month's activity (batch queries)
    if (referredIds.length > 0) {
      const currentMonth = new Date().toISOString().slice(0, 7)
      const monthStart   = `${currentMonth}-01`

      const [{ data: allUploads }, { data: allBilling }] = await Promise.all([
        supabase
          .from('uploads')
          .select('va_id, product_row_count')
          .in('va_id', referredIds)
          .eq('status', 'done')
          .gte('uploaded_at', monthStart),
        supabase
          .from('billing')
          .select('va_id, total_amount, status')
          .in('va_id', referredIds)
          .eq('month', currentMonth),
      ])

      // Build per-VA maps
      const uploadMap: Record<string, number> = {}
      for (const u of (allUploads ?? []) as { va_id: string; product_row_count: number | null }[]) {
        uploadMap[u.va_id] = (uploadMap[u.va_id] ?? 0) + (u.product_row_count ?? 0)
      }
      const billingMap: Record<string, { total_amount: number; status: string }> = {}
      for (const b of (allBilling ?? []) as { va_id: string; total_amount: number; status: string }[]) {
        billingMap[b.va_id] = b
      }

      for (const r of referralList) {
        const products   = uploadMap[r.id]  ?? 0
        const invoice    = billingMap[r.id] ?? null
        const theirShare = invoice?.total_amount ?? 0
        r.totalProducts  = products
        r.theirShare     = theirShare
        r.yourEarnings   = Math.round(theirShare * (currentPct / 100) * 100) / 100
        r.isPaid         = invoice?.status === 'paid'
        r.hasInvoice     = !!invoice
      }
    }

    console.log('[affiliates] referralList:', referralList)
    setReferrals(referralList)

    // 3. This month's billing status (paid / total) for countdown widget
    if (referralList.length > 0) {
      const prevMonth = getPreviousMonth()
      const { data: bills } = await supabase
        .from('billing')
        .select('va_id, status')
        .in('va_id', referralList.map(r => r.id))
        .eq('month', prevMonth)

      const qualifying = referralList.filter(r => r.is_active)

      setTotalCount(qualifying.length)
      setPaidCount(bills?.filter(b => b.status === 'paid').length ?? 0)
    }

    // 4. Payout history grouped by month
    const { data: payouts } = await supabase
      .from('affiliate_payouts')
      .select('*')
      .eq('referrer_va_id', va.id)
      .order('month', { ascending: false })

    if (payouts) {
      const map = new Map<string, PayoutRow[]>()
      for (const p of payouts as PayoutRow[]) {
        const arr = map.get(p.month) ?? []
        arr.push(p)
        map.set(p.month, arr)
      }
      const groups: MonthGroup[] = []
      for (const [month, rows] of map) {
        const totalPayout = rows.reduce((s, r) => s + (r.payout_amount ?? 0), 0)
        groups.push({ month, totalPayout, rows, expanded: false })
      }
      setMonths(groups)
    }

    setLoading(false)
  }, [va])

  useEffect(() => { load() }, [load])

  // ── Helpers ──────────────────────────────────────────────────────────────

  function copy(text: string, type: 'code' | 'link') {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(type)
      setTimeout(() => setCopied(null), 1800)
      void logActivity({
        action: 'referral_code_shared',
        va_id: va!.id,
        source: 'va',
        details: `${va!.name} copied referral ${type}`,
        metadata: { type },
      })
    })
  }

  function toggleMonth(month: string) {
    setMonths(prev => prev.map(g => g.month === month ? { ...g, expanded: !g.expanded } : g))
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  if (!va) return null

  const totalReferrals  = referrals.length
  const activeReferrals = referrals.filter(r => r.is_active).length
  const thisMonthEarned = code?.current_month_earned ?? 0
  const allTimeEarned   = code?.total_earned         ?? 0

  const streak          = code?.payment_streak          ?? 0
  const percentage      = code?.current_percentage      ?? 20
  const highestStreak   = code?.highest_streak          ?? 0
  const potential       = code?.potential_monthly_earnings ?? 0
  const actual          = code?.actual_monthly_earnings    ?? 0
  const lossAmount      = Math.max(0, potential - actual)
  const { fillPercent, monthsLeft, nextPct } = getStreakProgress(streak)

  // Was streak just reset this month?
  const prevMonth = getPreviousMonth()
  const streakJustReset = code?.last_streak_reset_month === prevMonth && streak === 0
  const prevPercentage  = streakJustReset ? getPercentageForStreak(highestStreak) : percentage

  const countdown       = getDeadlineCountdown()

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{
      paddingTop: 64, paddingBottom: 100,
      maxWidth: 860, margin: '0 auto', paddingInline: 48,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>

      <PageVideo slug="affiliates" />

      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 48 }}>
        <div style={{ fontSize: 28, fontWeight: 600, color: T.black, letterSpacing: '-0.03em', marginBottom: 8 }}>
          Referral program
        </div>
        <div style={{ fontSize: 15, color: T.gray }}>
          Earn up to 35% of what your referrals pay. Rates increase with every month everyone pays on time.
        </div>
      </div>

      {loading ? (
        <div style={{ color: T.gray, fontSize: 14 }}>Loading…</div>
      ) : (
        <>

          {/* ─── Referral code card ────────────────────────────────────────── */}
          <div style={{
            background: T.black, borderRadius: 20, padding: '32px 40px',
            marginBottom: 28, color: T.white, position: 'relative',
          }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
              Your referral code
            </div>
            <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.04em', marginBottom: 20 }}>
              {code?.code ?? '—'}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                onClick={() => code && copy(code.code, 'code')}
                style={{ fontSize: 13, fontWeight: 500, color: T.white, background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 10, padding: '9px 18px', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.18)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
              >
                {copied === 'code' ? '✓ Copied' : 'Copy code'}
              </button>
              <button
                onClick={() => code && copy(code.link, 'link')}
                style={{ fontSize: 13, fontWeight: 500, color: T.white, background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 10, padding: '9px 18px', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.18)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
              >
                {copied === 'link' ? '✓ Copied' : 'Copy link'}
              </button>
            </div>
            {code && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 14, fontFamily: 'monospace' }}>
                {code.link}
              </div>
            )}
            {/* Current rate badge */}
            <div style={{
              position: 'absolute', top: 28, right: 36,
              fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
              color: T.black, background: '#FFFFFF',
              borderRadius: 8, padding: '4px 10px',
            }}>
              {percentage}% rate
            </div>
          </div>

          {/* ─── Stats row ─────────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 28 }}>
            {[
              { label: 'Referrals',  value: totalReferrals.toString() },
              { label: 'Active',     value: activeReferrals.toString() },
              { label: 'This month', value: `$${thisMonthEarned.toFixed(2)}` },
              { label: 'All time',   value: `$${allTimeEarned.toFixed(2)}` },
            ].map(s => (
              <div key={s.label} style={{ background: T.light, borderRadius: 14, padding: '18px 18px' }}>
                <div style={{ fontSize: 11, color: T.gray, marginBottom: 5 }}>{s.label}</div>
                <div style={{ fontSize: 26, fontWeight: 600, color: T.black, letterSpacing: '-0.03em' }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* ─── STREAK SECTION ────────────────────────────────────────────── */}
          <div style={{
            border: `1px solid ${T.border}`, borderRadius: 18, padding: '32px 36px', marginBottom: 16,
          }}>

            {/* YOUR RATE display */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 10, color: '#CCCCCC', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                Your rate
              </div>
              <div style={{ fontSize: 64, fontWeight: 700, color: '#111111', letterSpacing: '-0.05em', lineHeight: 1 }}>
                {percentage}%
              </div>
              <div style={{ fontSize: 14, color: '#999999', marginTop: 8 }}>
                {streak > 0 ? `${streak}-month streak` : 'No streak yet'}
              </div>
            </div>

            {/* Progress bar to next tier */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ height: 4, background: '#F0F0F0', borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{
                  height: '100%', background: '#111111', borderRadius: 99,
                  width: `${fillPercent}%`, transition: 'width 0.4s ease',
                }} />
              </div>
              <div style={{ fontSize: 12, color: '#CCCCCC', textAlign: 'center' }}>
                {monthsLeft === 0
                  ? 'Maximum rate achieved. Keep it going.'
                  : `${monthsLeft} more month${monthsLeft !== 1 ? 's' : ''} of full payment to reach ${nextPct}%`
                }
              </div>
            </div>

            {/* Loss display — shown when potential > actual (streak broken) */}
            {lossAmount > 0.01 && (
              <div style={{
                borderTop: `1px solid ${T.border}`, paddingTop: 20, marginBottom: 20,
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 10, color: '#CCCCCC', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                  You could be earning
                </div>
                <div style={{ fontSize: 36, fontWeight: 600, color: '#111111', letterSpacing: '-0.04em' }}>
                  ${potential.toFixed(2)}
                </div>
                <div style={{ fontSize: 14, color: '#999999', marginTop: 4 }}>
                  instead of ${actual.toFixed(2)}
                </div>
                <div style={{ fontSize: 13, color: '#999999', marginTop: 6 }}>
                  ${lossAmount.toFixed(2)} lost because {totalCount > paidCount ? `${totalCount - paidCount} referral${totalCount - paidCount !== 1 ? 's' : ''} didn't pay.` : "referrals didn't pay."}
                </div>
              </div>
            )}

            {/* Streak just reset alert */}
            {streakJustReset && (
              <div style={{
                borderTop: `1px solid #FFE4E4`, paddingTop: 20, marginBottom: 4,
                background: '#FFF5F5', borderRadius: 10, padding: 18, marginTop: 8,
              }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#1D1D1F', marginBottom: 6 }}>
                  Your streak was reset this month.
                </div>
                <div style={{ fontSize: 13, color: '#999999', marginBottom: 4 }}>
                  You were earning {prevPercentage}%. Now back to 20%.
                </div>
                {potential > 0 && (
                  <div style={{ fontSize: 13, color: '#999999', marginBottom: 4 }}>
                    At your previous rate, you would have earned ${potential.toFixed(2)}. At 20%, you earn ${actual.toFixed(2)}.
                    <span style={{ fontWeight: 500, color: '#1D1D1F' }}> Difference: ${lossAmount.toFixed(2)}/month.</span>
                  </div>
                )}
                <div style={{ fontSize: 12, color: '#CCCCCC', marginTop: 8 }}>
                  Get all referrals to pay next month to start rebuilding.
                </div>
              </div>
            )}
          </div>

          {/* ─── Tier roadmap ──────────────────────────────────────────────── */}
          <div style={{
            border: `1px solid ${T.border}`, borderRadius: 14, padding: '22px 28px', marginBottom: 28,
          }}>
            <div style={{ fontSize: 10, color: '#CCCCCC', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>
              Rate tiers
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {TIERS.map((tier) => {
                const isCurrentTier = getPercentageForStreak(streak) === tier.pct
                const isReached     = streak >= tier.streakNeeded
                const wasLost       = highestStreak >= tier.streakNeeded && streak < tier.streakNeeded

                return (
                  <div key={tier.pct} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Dot */}
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: isCurrentTier ? '#111111' : isReached ? T.green : '#DDDDDD',
                    }} />
                    {/* Label */}
                    <div style={{
                      fontSize: 13,
                      fontWeight: isCurrentTier ? 500 : 400,
                      color:      wasLost    ? '#DDDDDD'
                                : isCurrentTier ? '#111111'
                                : isReached  ? T.gray
                                : '#CCCCCC',
                      textDecoration: wasLost ? 'line-through' : 'none',
                    }}>
                      {tier.label}: {tier.pct}%
                      {isCurrentTier && <span style={{ fontSize: 11, color: T.gray, marginLeft: 8 }}>← current</span>}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ fontSize: 11, color: '#999999', fontStyle: 'italic', marginTop: 14 }}>
              One missed payment from any referral resets to 20%.
            </div>
          </div>

          {/* ─── Countdown ─────────────────────────────────────────────────── */}
          {countdown && totalCount > 0 && (
            <div style={{
              border: `1px solid ${T.border}`, borderRadius: 14, padding: '18px 24px', marginBottom: 28,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: T.black, marginBottom: 2 }}>
                  {paidCount} of {totalCount} referral{totalCount !== 1 ? 's' : ''} paid for {countdown.invoiceMonth}
                </div>
                <div style={{ fontSize: 12, color: T.gray }}>
                  Invoice deadline: the 7th
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontSize: 22, fontWeight: 700, color: countdown.daysLeft <= 2 ? T.red : T.black,
                  letterSpacing: '-0.03em',
                }}>
                  {countdown.daysLeft}
                </div>
                <div style={{ fontSize: 11, color: T.gray }}>
                  day{countdown.daysLeft !== 1 ? 's' : ''} left
                </div>
              </div>
            </div>
          )}

          {/* ─── How it works ──────────────────────────────────────────────── */}
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 16, padding: '28px 32px', marginBottom: 28 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.black, marginBottom: 18 }}>How it works</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { n: '1', text: 'Share your referral code with other VAs.' },
                { n: '2', text: 'They enter it during onboarding. Their first month is free.' },
                { n: '3', text: 'From month 2 onward, you earn a percentage of their monthly HigherUp share — every month they pay.' },
                { n: '4', text: 'The more consecutive months everyone pays, the higher your rate — up to 35%. One missed payment from any referral resets it all back to 20%.' },
              ].map(step => (
                <div key={step.n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', background: T.black, color: T.white,
                    fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
                  }}>
                    {step.n}
                  </div>
                  <div style={{ fontSize: 14, color: T.black, lineHeight: 1.6 }}>{step.text}</div>
                </div>
              ))}
            </div>

            {/* Example table */}
            <div style={{ marginTop: 22, background: T.light, borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 11, color: T.gray, marginBottom: 8, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Example earnings at {percentage}%
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                <div style={{ fontSize: 10, color: T.gray, paddingBottom: 5, borderBottom: `1px solid ${T.border}` }}>Referral pays</div>
                <div style={{ fontSize: 10, color: T.gray, paddingBottom: 5, borderBottom: `1px solid ${T.border}` }}>Your cut ({percentage}%)</div>
                <div style={{ fontSize: 10, color: T.gray, paddingBottom: 5, borderBottom: `1px solid ${T.border}` }}>Per year</div>
                {([50, 110, 220, 350] as number[]).map(fee => {
                  const cut = (fee * percentage / 100)
                  return (
                    <>
                      <div key={`f${fee}`} style={{ fontSize: 13, color: T.black, padding: '5px 0' }}>${fee}/mo</div>
                      <div key={`c${fee}`} style={{ fontSize: 13, color: T.green, fontWeight: 500, padding: '5px 0' }}>${cut.toFixed(0)}/mo</div>
                      <div key={`y${fee}`} style={{ fontSize: 13, color: T.gray, padding: '5px 0' }}>${(cut * 12).toFixed(0)}</div>
                    </>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ─── Earnings simulator ────────────────────────────────────────── */}
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 16, padding: '28px 32px', marginBottom: 28 }}>
            <div style={{ fontSize: 10, color: '#CCCCCC', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6, textAlign: 'center' }}>
              Earnings simulator
            </div>
            <div style={{ fontSize: 13, color: T.gray, textAlign: 'center', marginBottom: 24 }}>
              See what you could earn.
            </div>

            {/* Two inputs */}
            <div style={{ display: 'flex', gap: 32, justifyContent: 'center', alignItems: 'flex-end', marginBottom: 24 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#CCCCCC', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Referrals
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={simReferrals}
                  onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setSimReferrals(v) }}
                  style={{
                    width: 80, textAlign: 'center', background: 'none', border: 'none',
                    borderBottom: '1.5px solid #EEEEEE', outline: 'none',
                    fontSize: 24, fontWeight: 500, color: T.black, fontFamily: 'inherit',
                    paddingBottom: 6,
                  }}
                  onFocus={e => e.target.style.borderBottomColor = T.black}
                  onBlur={e => e.target.style.borderBottomColor = '#EEEEEE'}
                />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#CCCCCC', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Avg monthly share
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
                  <span style={{ fontSize: 20, color: T.gray, paddingBottom: 7 }}>$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={simAvg}
                    onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setSimAvg(v) }}
                    style={{
                      width: 90, textAlign: 'center', background: 'none', border: 'none',
                      borderBottom: '1.5px solid #EEEEEE', outline: 'none',
                      fontSize: 24, fontWeight: 500, color: T.black, fontFamily: 'inherit',
                      paddingBottom: 6,
                    }}
                    onFocus={e => e.target.style.borderBottomColor = T.black}
                    onBlur={e => e.target.style.borderBottomColor = '#EEEEEE'}
                  />
                </div>
              </div>
            </div>

            {/* Main result */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 40, fontWeight: 600, color: T.green, letterSpacing: '-0.04em', lineHeight: 1 }}>
                ${((parseFloat(simReferrals) || 0) * (parseFloat(simAvg) || 0) * (percentage / 100)).toFixed(2)}
              </div>
              <div style={{ fontSize: 16, color: T.gray, marginTop: 4 }}>/month at {percentage}%</div>
            </div>

            {/* Three scenarios */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
              {[
                { pct: 20,  color: '#CCCCCC' },
                { pct: 28,  color: '#CCCCCC' },
                { pct: 35,  color: '#999999' },
              ].map(({ pct, color }) => (
                <div key={pct} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color }}>
                  <span>At {pct}%</span>
                  <span style={{ fontWeight: pct === 35 ? 500 : 400 }}>
                    ${((parseFloat(simReferrals) || 0) * (parseFloat(simAvg) || 0) * (pct / 100)).toFixed(2)}/month
                  </span>
                </div>
              ))}
            </div>

            {/* Yearly */}
            <div style={{ textAlign: 'center', fontSize: 14, color: T.black }}>
              In 12 months:{' '}
              <span style={{ fontWeight: 500 }}>
                ${((parseFloat(simReferrals) || 0) * (parseFloat(simAvg) || 0) * (percentage / 100) * 12).toFixed(2)}
              </span>
            </div>
          </div>

          {/* ─── Your referrals ────────────────────────────────────────────── */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: T.black }}>
                Your referrals
                {totalReferrals > 0 && <span style={{ fontSize: 13, color: T.gray, fontWeight: 400, marginLeft: 8 }}>({totalReferrals})</span>}
              </div>
              {totalCount > 0 && (
                <div style={{ fontSize: 12, color: paidCount === totalCount ? T.green : T.amber }}>
                  {paidCount} of {totalCount} paid this month
                </div>
              )}
            </div>

            {referrals.length === 0 ? (
              <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: '28px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: T.gray }}>No referrals yet. Share your code to get started.</div>
              </div>
            ) : (
              <div style={{ border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
                {referrals.map((r, i) => {
                  // Activity line
                  let activityNode: React.ReactNode
                  if (r.totalProducts === undefined) {
                    activityNode = null
                  } else if (r.totalProducts === 0) {
                    activityNode = (
                      <div style={{ fontSize: 12, color: T.ghost, marginTop: 4 }}>No activity this month yet</div>
                    )
                  } else {
                    const shareColor = r.isPaid ? T.green : T.ghost
                    const prefix     = r.hasInvoice && !r.isPaid ? 'est. ' : ''
                    activityNode = (
                      <div style={{ fontSize: 12, color: '#999999', marginTop: 4 }}>
                        {r.totalProducts} products this month
                        {r.theirShare ? (
                          <>
                            {' · '}{prefix}share:{' '}
                            <span style={{ color: shareColor }}>${r.theirShare.toFixed(2)}</span>
                            {' · '}your {prefix}earnings:{' '}
                            <span style={{ color: shareColor, fontWeight: 500 }}>${(r.yourEarnings ?? 0).toFixed(2)}</span>
                          </>
                        ) : null}
                      </div>
                    )
                  }

                  return (
                    <div
                      key={r.id}
                      style={{
                        padding: '14px 20px',
                        borderBottom: i < referrals.length - 1 ? `1px solid ${T.border}` : 'none',
                      }}
                    >
                      {/* Top row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 1, background: r.is_active ? T.green : T.ghost }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: T.black }}>{r.referred_va_name}</div>
                          <div style={{ fontSize: 12, color: T.ghost, marginTop: 2 }}>
                            {[r.referred_va_country, r.joined_at ? `Joined ${fmtMonth(r.joined_at.slice(0, 7))}` : null].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <div style={{
                          fontSize: 11, fontWeight: 500, flexShrink: 0,
                          color:      r.is_active ? T.green : T.ghost,
                          background: r.is_active ? '#ECFDF5' : T.light,
                          borderRadius: 6, padding: '3px 8px',
                        }}>
                          {r.is_active ? 'Active' : 'Inactive'}
                        </div>
                      </div>
                      {/* Activity line */}
                      <div style={{ paddingLeft: 17 }}>{activityNode}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ─── Earnings history ──────────────────────────────────────────── */}
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.black, marginBottom: 14 }}>Earnings history</div>

            {months.length === 0 ? (
              <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: '28px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: T.gray }}>No earnings yet. Payouts appear here once your referrals pay their HigherUp share.</div>
              </div>
            ) : (
              <div style={{ border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
                {months.map((g, gi) => {
                  const paidRows    = g.rows.filter(r => r.status === 'paid')
                  const pendingRows = g.rows.filter(r => r.status === 'pending' && !r.is_free_month && r.payout_amount > 0)
                  const skippedRows = g.rows.filter(r => r.status === 'skipped')
                  const freeRows    = g.rows.filter(r => r.is_free_month)
                  const totalPaid   = paidRows.reduce((s, r) => s + r.payout_amount, 0)
                  const totalPending = pendingRows.reduce((s, r) => s + r.payout_amount, 0)

                  return (
                    <div key={g.month} style={{ borderBottom: gi < months.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                      <button
                        onClick={() => toggleMonth(g.month)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '15px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                      >
                        <div style={{ fontSize: 10, color: T.gray, transform: g.expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▶</div>
                        <div style={{ flex: 1, fontSize: 14, fontWeight: 500, color: T.black }}>{fmtMonth(g.month)}</div>
                        <div style={{ fontSize: 12, color: T.gray }}>{g.rows.filter(r => !r.is_free_month).length} referral{g.rows.filter(r => !r.is_free_month).length !== 1 ? 's' : ''}</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: g.totalPayout > 0 ? T.green : T.gray, minWidth: 72, textAlign: 'right' }}>
                          {g.totalPayout > 0 ? `$${g.totalPayout.toFixed(2)}` : '—'}
                        </div>
                        <div style={{
                          fontSize: 11, fontWeight: 500,
                          color:      totalPaid > 0 ? T.green : totalPending > 0 ? T.amber : T.gray,
                          background: totalPaid > 0 ? '#ECFDF5' : totalPending > 0 ? '#FFFBEB' : T.light,
                          borderRadius: 6, padding: '3px 8px', flexShrink: 0,
                        }}>
                          {totalPaid > 0 ? 'Paid' : totalPending > 0 ? 'Pending' : 'No earnings'}
                        </div>
                      </button>

                      <div style={{ overflow: 'hidden', maxHeight: g.expanded ? 600 : 0, transition: 'max-height 0.25s ease' }}>
                        <div style={{ padding: '0 20px 18px 44px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                          {pendingRows.map(r => (
                            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.black }}>
                              <span style={{ color: T.gray }}>↳ Referral paid (${r.referred_va_fee.toFixed(0)} HigherUp share)</span>
                              <span style={{ fontWeight: 500, color: T.amber }}>+${r.payout_amount.toFixed(2)} pending</span>
                            </div>
                          ))}
                          {paidRows.map(r => (
                            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.black }}>
                              <span style={{ color: T.gray }}>↳ Referral paid (${r.referred_va_fee.toFixed(0)} HigherUp share)</span>
                              <span style={{ fontWeight: 500, color: T.green }}>+${r.payout_amount.toFixed(2)} paid</span>
                            </div>
                          ))}
                          {freeRows.length > 0 && (
                            <div style={{ fontSize: 13, color: T.gray }}>
                              {freeRows.length} referral{freeRows.length !== 1 ? 's' : ''} — first month free (no payout)
                            </div>
                          )}
                          {skippedRows.length > 0 && (
                            <div style={{ fontSize: 13, color: T.gray }}>
                              {skippedRows.length} referral{skippedRows.length !== 1 ? 's' : ''} — did not pay this month
                            </div>
                          )}
                          {g.totalPayout > 0 && (
                            <div style={{ marginTop: 6, paddingTop: 8, borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: T.black }}>
                              <span>Total</span>
                              <span>${g.totalPayout.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </>
      )}
    </div>
  )
}
