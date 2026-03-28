import { supabase } from '@/lib/supabase'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// Mirror of SQL get_referral_percentage()
function getPercentageForStreak(streak: number): number {
  if (streak >= 12) return 35
  if (streak >= 10) return 30
  if (streak >= 7)  return 28
  if (streak >= 5)  return 25
  if (streak >= 3)  return 23
  return 20
}

// How many MORE months of full payment to reach the next tier
function monthsToNextTier(streak: number): number {
  if (streak >= 12) return 0   // already at max
  if (streak >= 10) return 12 - streak
  if (streak >= 7)  return 10 - streak
  if (streak >= 5)  return 7  - streak
  if (streak >= 3)  return 5  - streak
  return 3 - streak
}

// ─── POST /api/affiliates/calculate-payouts ──────────────────────────────────
// Body: { month?: "YYYY-MM" }
//
// FLOW:
//   Phase 1 — Create missing payout records per affiliate
//             (skips affiliates where mark-paid already created a record)
//   Phase 2 — Per referrer: read ALL their payout records for the month,
//             evaluate streak continuation / reset, update referral_codes
//             and affiliates.payout_percentage
//
// Run this on the 7th of every month (invoice deadline day).

export async function POST(req: Request) {
  let month: string
  try {
    const body = await req.json().catch(() => ({}))
    month = (body as Record<string, string>).month ?? getPreviousMonth()
  } catch {
    month = getPreviousMonth()
  }

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: 'Invalid month format. Use YYYY-MM.' }, { status: 400 })
  }

  const monthLabel = formatMonthLabel(month)

  // ── Load all active affiliates ─────────────────────────────────────────────
  const { data: affiliates, error: affErr } = await supabase
    .from('affiliates')
    .select('*')
    .eq('is_active', true)

  if (affErr || !affiliates) {
    return Response.json({ error: 'Failed to load affiliates' }, { status: 500 })
  }

  // ── Pre-load referral_codes for all referrers ──────────────────────────────
  const referrerIds = [...new Set(affiliates.map(a => a.referrer_va_id as string))]

  const { data: allCodes } = await supabase
    .from('referral_codes')
    .select('*')
    .in('va_id', referrerIds)

  type RCRow = {
    va_id: string; code: string; payment_streak: number | null
    current_percentage: number | null; highest_streak: number | null
    streak_lost_count: number | null; current_month_earned: number | null
    total_earned: number | null
  }
  const codeMap = new Map<string, RCRow>()
  for (const rc of allCodes ?? []) codeMap.set(rc.va_id as string, rc as RCRow)

  let payoutsCreated = 0
  let totalPayout    = 0
  let skipped        = 0
  let streaksGained  = 0
  let streaksLost    = 0

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1 — Individual payout records
  // ══════════════════════════════════════════════════════════════════════════

  for (const aff of affiliates) {

    // Skip if payout already exists for this month
    const { data: existingPayout } = await supabase
      .from('affiliate_payouts')
      .select('id')
      .eq('affiliate_id', aff.id)
      .eq('month', month)
      .maybeSingle()

    if (existingPayout) continue

    // Load both parties
    const { data: referredVA } = await supabase
      .from('vas').select('id, name, status').eq('id', aff.referred_va_id).single()

    const { data: referrerVA } = await supabase
      .from('vas').select('id, status').eq('id', aff.referrer_va_id).single()

    // Use the referrer's current streak percentage (not the stale aff.payout_percentage)
    const codeRow           = codeMap.get(aff.referrer_va_id as string)
    const currentStreak     = codeRow?.payment_streak      ?? 0
    const currentPercentage = codeRow?.current_percentage  ?? getPercentageForStreak(currentStreak)

    // ── Both parties must be active ─────────────────────────────────────────
    const bothActive = referredVA?.status === 'active' && referrerVA?.status === 'active'
    if (!bothActive) {
      await supabase.from('affiliate_payouts').insert({
        referrer_va_id:    aff.referrer_va_id,
        affiliate_id:      aff.id,
        referred_va_id:    aff.referred_va_id,
        month,
        referred_va_fee:   0,
        payout_percentage: currentPercentage,
        payout_amount:     0,
        status:            'skipped',
        reason_skipped:    'One or both parties inactive',
        is_free_month:     false,
      })
      skipped++
      continue
    }

    // ── Load billing record (any status) for potential tracking ─────────────
    const { data: bill } = await supabase
      .from('billing')
      .select('id, total_amount, status')
      .eq('va_id', aff.referred_va_id)
      .eq('month', month)
      .maybeSingle()

    const invoiceFee = (bill?.total_amount as number | null) ?? 0

    // ── Did NOT pay ─────────────────────────────────────────────────────────
    if (!bill || bill.status !== 'paid') {
      await supabase.from('affiliate_payouts').insert({
        referrer_va_id:    aff.referrer_va_id,
        affiliate_id:      aff.id,
        referred_va_id:    aff.referred_va_id,
        month,
        referred_va_fee:   invoiceFee,   // store invoice amount even when skipped
        payout_percentage: currentPercentage,
        payout_amount:     0,
        status:            'skipped',
        reason_skipped:    'Referred VA did not pay their invoice this month',
        is_free_month:     false,
      })
      skipped++
      continue
    }

    // ── DID pay — calculate payout ──────────────────────────────────────────
    const referredFee  = bill.total_amount as number
    const payoutAmount = Math.round((referredFee * currentPercentage / 100) * 100) / 100

    await supabase.from('affiliate_payouts').insert({
      referrer_va_id:    aff.referrer_va_id,
      affiliate_id:      aff.id,
      referred_va_id:    aff.referred_va_id,
      month,
      referred_va_fee:   referredFee,
      payout_percentage: currentPercentage,
      payout_amount:     payoutAmount,
      status:            'pending',
      is_free_month:     false,
    })

    // Update affiliate aggregate stats
    await supabase.from('affiliates').update({
      current_month_referred_fee:  referredFee,
      current_month_payout_amount: payoutAmount,
      current_month_referred_paid: true,
      months_paid:                 (aff.months_paid ?? 0) + 1,
      total_referred_va_paid:      (aff.total_referred_va_paid ?? 0) + referredFee,
      total_payout_earned:         (aff.total_payout_earned ?? 0) + payoutAmount,
      referred_va_status:          referredVA?.status ?? aff.referred_va_status,
    }).eq('id', aff.id)

    // Update referral_codes earned totals
    if (aff.referral_code) {
      const { data: rcRow } = await supabase
        .from('referral_codes')
        .select('total_earned, current_month_earned')
        .eq('code', aff.referral_code)
        .maybeSingle()
      if (rcRow) {
        await supabase.from('referral_codes').update({
          total_earned:         (rcRow.total_earned         ?? 0) + payoutAmount,
          current_month_earned: (rcRow.current_month_earned ?? 0) + payoutAmount,
        }).eq('code', aff.referral_code)
      }
    }

    // Per-referral earnings notification
    await supabase.from('notifications').insert({
      va_id:   aff.referrer_va_id,
      type:    'payment_received',
      title:   `Affiliate earnings — $${payoutAmount.toFixed(2)} for ${monthLabel}`,
      message: `You earned $${payoutAmount.toFixed(2)} from ${referredVA?.name ?? 'your referral'}'s payment this month.`,
      is_read: false,
    })

    payoutsCreated++
    totalPayout += payoutAmount
    console.log(`[calculate-payouts] ${aff.referrer_va_id} earns $${payoutAmount} from ${aff.referred_va_id} for ${month}`)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — Streak evaluation per referrer
  // ══════════════════════════════════════════════════════════════════════════

  for (const referrerId of referrerIds) {

    const codeRow           = codeMap.get(referrerId)
    const currentStreak     = codeRow?.payment_streak      ?? 0
    const currentPercentage = codeRow?.current_percentage  ?? getPercentageForStreak(currentStreak)
    const highestStreak     = codeRow?.highest_streak      ?? 0
    const lostCount         = codeRow?.streak_lost_count   ?? 0

    // Load ALL payout records for this referrer this month (includes Phase 1 + mark-paid records)
    const { data: monthPayouts } = await supabase
      .from('affiliate_payouts')
      .select('id, affiliate_id, referred_va_id, payout_amount, referred_va_fee, status, is_free_month, reason_skipped')
      .eq('referrer_va_id', referrerId)
      .eq('month', month)

    if (!monthPayouts || monthPayouts.length === 0) continue

    // ── Tally qualifying referrals ─────────────────────────────────────────
    // Qualifying = not free month, not "both parties inactive" skip
    let qualifyingCount = 0
    let paidCount       = 0
    let potentialAmount = 0
    let actualAmount    = 0

    for (const p of monthPayouts) {
      // Free month → skip from streak evaluation
      if (p.is_free_month) continue
      // Inactive skip → skip from streak evaluation (not their fault)
      if (p.status === 'skipped' && p.reason_skipped === 'One or both parties inactive') continue

      qualifyingCount++

      const fee = (p.referred_va_fee as number) ?? 0
      const potentialPayout = Math.round((fee * currentPercentage / 100) * 100) / 100
      potentialAmount += potentialPayout

      if ((p.payout_amount as number) > 0) {
        paidCount++
        actualAmount += p.payout_amount as number
      }
    }

    if (qualifyingCount === 0) continue  // nothing to evaluate

    const allPaid = paidCount === qualifyingCount

    // ── Update streak ──────────────────────────────────────────────────────
    const newStreak    = allPaid ? currentStreak + 1 : 0
    const newPercent   = getPercentageForStreak(newStreak)
    const newHighest   = Math.max(highestStreak, newStreak)
    const newLostCount = allPaid ? lostCount : lostCount + 1
    const nextTierIn   = monthsToNextTier(newStreak)

    const updatePayload: Record<string, unknown> = {
      payment_streak:             newStreak,
      current_percentage:         newPercent,
      highest_streak:             newHighest,
      streak_lost_count:          newLostCount,
      next_tier_at:               nextTierIn,
      potential_monthly_earnings: Math.round(potentialAmount * 100) / 100,
      actual_monthly_earnings:    Math.round(actualAmount   * 100) / 100,
      streak_last_updated_month:  month,
    }

    if (!allPaid) {
      updatePayload.last_streak_reset_month = month
    }

    await supabase.from('referral_codes').update(updatePayload).eq('va_id', referrerId)

    // Sync new percentage to all of this referrer's active affiliates
    await supabase.from('affiliates')
      .update({ payout_percentage: newPercent })
      .eq('referrer_va_id', referrerId)
      .eq('is_active', true)

    // ── Streak notifications ───────────────────────────────────────────────

    if (allPaid) {
      streaksGained++
      const tierUpgrade = newPercent > currentPercentage

      await supabase.from('notifications').insert({
        va_id:   referrerId,
        type:    'streak_extended',
        title:   tierUpgrade
          ? `Rate increased to ${newPercent}% — ${newStreak}-month streak`
          : `Streak extended — ${newStreak} month${newStreak !== 1 ? 's' : ''}`,
        message: tierUpgrade
          ? `All referrals paid. Your rate is now ${newPercent}%. You unlocked a new tier. Keep the streak alive to reach the next one.`
          : nextTierIn > 0
            ? `All referrals paid. Rate: ${newPercent}%. ${nextTierIn} more month${nextTierIn !== 1 ? 's' : ''} of full payment to unlock ${getPercentageForStreak(newStreak + nextTierIn)}%.`
            : 'All referrals paid. Maximum rate (35%) reached. Keep it going.',
        is_read: false,
      })

      console.log(`[calculate-payouts] Streak EXTENDED for ${referrerId}: ${currentStreak}→${newStreak} (${currentPercentage}%→${newPercent}%) | paid ${paidCount}/${qualifyingCount}`)
    } else {
      streaksLost++

      const lostAmount = potentialAmount - actualAmount

      await supabase.from('notifications').insert({
        va_id:   referrerId,
        type:    'streak_lost',
        title:   'Your streak has been reset',
        message: `One or more referrals did not pay this month. Your rate is back to 20%. You missed out on $${lostAmount.toFixed(2)} in potential earnings. Build it back up by ensuring all referrals pay next month.`,
        is_read: false,
      })

      console.log(`[calculate-payouts] Streak RESET for ${referrerId}: was ${currentStreak} months (${currentPercentage}%). Missed $${lostAmount.toFixed(2)}.`)
    }
  }

  return Response.json({
    ok:              true,
    month,
    payouts_created: payoutsCreated,
    total_payout:    Math.round(totalPayout * 100) / 100,
    skipped,
    streaks_gained:  streaksGained,
    streaks_lost:    streaksLost,
  })
}
