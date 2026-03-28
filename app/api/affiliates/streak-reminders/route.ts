import { supabase } from '@/lib/supabase'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function getPreviousMonth(): string {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = now.getMonth()
  if (m === 0) return `${y - 1}-12`
  return `${y}-${String(m).padStart(2, '0')}`
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// ─── POST /api/affiliates/streak-reminders ───────────────────────────────────
// Body: { day: 1 | 5 | 7, month?: "YYYY-MM" }
//
// day 1 — Invoice month opened: "X referrals invoiced, keep your XX% streak alive."
// day 5 — 2 days before deadline: "X of Y paid. Z outstanding. Deadline in 2 days."
// day 7 — Deadline day: Called by a cron on the 7th. Triggers calculate-payouts
//          internally (or just sends final status notification — payouts calculated
//          separately via calculate-payouts).
//
// Intended to be called by a cron job or Vercel scheduled function.
// Can also be triggered manually from the admin panel.

export async function POST(req: Request) {
  let body: Record<string, string | number>
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const day       = Number(body.day)
  const invoiceMonth = (body.month as string) ?? getPreviousMonth()  // the month being billed

  if (![1, 5, 7].includes(day)) {
    return Response.json({ error: 'day must be 1, 5, or 7' }, { status: 400 })
  }

  const monthLabel = formatMonthLabel(invoiceMonth)

  // Load all active referrers (unique)
  const { data: affiliates } = await supabase
    .from('affiliates')
    .select('referrer_va_id, referred_va_id, referral_code, free_month_used, referred_va_joined_month')
    .eq('is_active', true)

  if (!affiliates || affiliates.length === 0) {
    return Response.json({ ok: true, day, notified: 0 })
  }

  // Group by referrer
  const byReferrer = new Map<string, typeof affiliates>()
  for (const a of affiliates) {
    const arr = byReferrer.get(a.referrer_va_id as string) ?? []
    arr.push(a)
    byReferrer.set(a.referrer_va_id as string, arr)
  }

  // Load referral_codes for all referrers
  const referrerIds = [...byReferrer.keys()]
  const { data: allCodes } = await supabase
    .from('referral_codes')
    .select('va_id, current_percentage, payment_streak, next_tier_at')
    .in('va_id', referrerIds)

  const codeMap = new Map<string, { current_percentage: number; payment_streak: number; next_tier_at: number }>()
  for (const rc of allCodes ?? []) {
    codeMap.set(rc.va_id as string, {
      current_percentage: rc.current_percentage ?? 20,
      payment_streak:     rc.payment_streak     ?? 0,
      next_tier_at:       rc.next_tier_at       ?? 3,
    })
  }

  let notified = 0

  for (const [referrerId, refAffs] of byReferrer) {
    const code = codeMap.get(referrerId)
    const pct    = code?.current_percentage ?? 20
    const streak = code?.payment_streak     ?? 0

    // All active referrals qualify (no free month exclusion)
    const qualifying = refAffs

    const totalQualifying = qualifying.length
    if (totalQualifying === 0) continue

    // ── Day 1: Invoice month opened ─────────────────────────────────────────
    if (day === 1) {
      const streakMsg = streak > 0
        ? `You're on a ${streak}-month streak. Keep all ${totalQualifying} referral${totalQualifying !== 1 ? 's' : ''} paying to protect your ${pct}% rate.`
        : `Make sure all ${totalQualifying} referral${totalQualifying !== 1 ? 's' : ''} pay their invoice to start building your streak and unlock higher rates.`

      await supabase.from('notifications').insert({
        va_id:   referrerId,
        type:    'streak_reminder',
        title:   `${totalQualifying} referral${totalQualifying !== 1 ? 's' : ''} invoiced for ${monthLabel}`,
        message: streakMsg,
        is_read: false,
      })
      notified++
    }

    // ── Day 5: 2 days before deadline ──────────────────────────────────────
    if (day === 5) {
      // Count how many referred VAs have paid their invoice so far
      const referredVAIds = qualifying.map(a => a.referred_va_id as string)

      const { data: bills } = await supabase
        .from('billing')
        .select('va_id, status')
        .in('va_id', referredVAIds)
        .eq('month', invoiceMonth)

      const paidCount      = bills?.filter(b => b.status === 'paid').length ?? 0
      const outstandingCount = totalQualifying - paidCount

      if (outstandingCount === 0) {
        // Everyone already paid — send a positive message
        await supabase.from('notifications').insert({
          va_id:   referrerId,
          type:    'streak_reminder',
          title:   `All ${totalQualifying} referrals paid — streak safe`,
          message: `All your referrals have paid their ${monthLabel} invoice. Your ${pct}% streak is secured for this month.`,
          is_read: false,
        })
      } else {
        await supabase.from('notifications').insert({
          va_id:   referrerId,
          type:    'streak_reminder',
          title:   `${outstandingCount} referral${outstandingCount !== 1 ? 's' : ''} still outstanding — 2 days left`,
          message: `${paidCount} of ${totalQualifying} referrals have paid. ${outstandingCount} ${outstandingCount === 1 ? 'has' : 'have'} not paid yet. Invoice deadline: the 7th. Your ${pct}% rate depends on full payment.`,
          is_read: false,
        })
      }
      notified++
    }

    // ── Day 7: Deadline day — final streak status ───────────────────────────
    if (day === 7) {
      const referredVAIds = qualifying.map(a => a.referred_va_id as string)

      const { data: bills } = await supabase
        .from('billing')
        .select('va_id, status')
        .in('va_id', referredVAIds)
        .eq('month', invoiceMonth)

      const paidCount       = bills?.filter(b => b.status === 'paid').length ?? 0
      const allPaid         = paidCount === totalQualifying

      if (allPaid) {
        // Streak notification sent by calculate-payouts after it runs.
        // This day-7 reminder is a pre-run confirmation.
        await supabase.from('notifications').insert({
          va_id:   referrerId,
          type:    'streak_reminder',
          title:   `All referrals paid — processing your streak`,
          message: `All ${totalQualifying} referrals paid their ${monthLabel} invoice. Your earnings and streak update will be processed shortly.`,
          is_read: false,
        })
      } else {
        const missing = totalQualifying - paidCount
        await supabase.from('notifications').insert({
          va_id:   referrerId,
          type:    'streak_reminder',
          title:   `${missing} referral${missing !== 1 ? 's' : ''} missed the deadline`,
          message: `${paidCount} of ${totalQualifying} referrals paid. ${missing} did not pay by the 7th. Your streak will be reset to 0 when payouts are processed.`,
          is_read: false,
        })
      }
      notified++
    }
  }

  console.log(`[streak-reminders] Day ${day} — notified ${notified} referrers for ${invoiceMonth}`)

  return Response.json({ ok: true, day, invoice_month: invoiceMonth, notified })
}
