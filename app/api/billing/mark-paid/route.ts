import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { getVaMonthEarnings } from '@/lib/earnings'

// ─── POST /api/billing/mark-paid ──────────────────────────────────────────────

export async function POST(req: Request) {
  let body: Record<string, string>
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { billing_id, payment_method_used, payment_reference, payment_amount_received } = body
  if (!billing_id) return Response.json({ error: 'billing_id required' }, { status: 400 })

  // Load invoice
  const { data: bill, error: billErr } = await supabase
    .from('billing').select('*').eq('id', billing_id).single()
  if (billErr || !bill) return Response.json({ error: 'Invoice not found' }, { status: 404 })

  // Mark as paid
  const { error: updateErr } = await supabase.from('billing').update({
    status:                  'paid',
    paid_at:                 new Date().toISOString(),
    payment_method_used:     payment_method_used   || null,
    payment_reference:       payment_reference     || null,
    payment_amount_received: payment_amount_received ? parseFloat(payment_amount_received) : null,
  }).eq('id', billing_id)

  if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 })

  await logActivity({ action: 'invoice_marked_paid', va_id: bill.va_id, billing_id: billing_id, source: 'admin', details: `Invoice ${bill.invoice_number} marked paid — $${(bill.total_amount as number).toFixed(0)} for ${bill.month}`, metadata: { invoice_number: bill.invoice_number, amount: bill.total_amount, payment_method: payment_method_used ?? null, reference: payment_reference ?? null } })

  // Reactivate VA if paused or blocked
  const { data: va } = await supabase
    .from('vas').select('id, status').eq('id', bill.va_id).single()

  if (va && (va.status === 'paused' || va.status === 'blocked')) {
    await supabase.from('vas').update({ status: 'active' }).eq('id', va.id)

    // If was blocked → reactivate clients
    if (va.status === 'blocked') {
      await supabase.from('clients').update({ is_active: true }).eq('va_id', va.id)
    }
  }

  // ── Unlock outputs if all invoices are now paid/waived ───────────────────
  const { data: remainingBills } = await supabase
    .from('billing')
    .select('id')
    .eq('va_id', bill.va_id)
    .in('status', ['outstanding', 'overdue'])

  if (!remainingBills || remainingBills.length === 0) {
    await supabase.from('uploads')
      .update({ output_locked: false, output_unlocked_at: new Date().toISOString() })
      .eq('va_id', bill.va_id)
      .eq('output_locked', true)
  }

  // Notify VA
  const amount      = `$${(bill.total_amount as number).toFixed(0)}`
  const paidMonthLb = formatMonth(bill.month as string)
  const paidEarnings = await getVaMonthEarnings(bill.va_id as string, bill.month as string)

  const paidTitle = paidEarnings?.hasRates
    ? `Payment received — you're earning again`
    : `Payment received — ${amount}`
  const paidMsg = paidEarnings?.hasRates
    ? `Your ${amount} HigherUp share for ${paidMonthLb} has been received. Your account is fully active — keep earning!`
    : `Thank you. Your payment of ${amount} for ${paidMonthLb} has been received. Your account is fully active.`

  await supabase.from('notifications').insert({
    va_id:   bill.va_id,
    type:    'payment_received',
    title:   paidTitle,
    message: paidMsg,
    is_read: false,
  })

  // ── Trigger affiliate payout if this VA is a referred VA ──────────────────
  const { data: affRelation } = await supabase
    .from('affiliates')
    .select('id, referrer_va_id, referred_va_id, is_active, payout_percentage, referral_code, total_referred_va_paid, total_payout_earned, months_paid')
    .eq('referred_va_id', bill.va_id)
    .eq('is_active', true)
    .maybeSingle()

  if (affRelation) {
    // Check no payout exists yet for this month
    const { data: existPayout } = await supabase
      .from('affiliate_payouts')
      .select('id')
      .eq('affiliate_id', affRelation.id)
      .eq('month', bill.month as string)
      .maybeSingle()

    if (!existPayout) {
      const referredFee  = bill.total_amount as number
      const percentage   = affRelation.payout_percentage ?? 20
      const payoutAmount = Math.round((referredFee * percentage / 100) * 100) / 100

      // Create payout record (pending — admin marks paid separately)
      await supabase.from('affiliate_payouts').insert({
        referrer_va_id:    affRelation.referrer_va_id,
        affiliate_id:      affRelation.id,
        referred_va_id:    affRelation.referred_va_id,
        month:             bill.month,
        referred_va_fee:   referredFee,
        payout_percentage: percentage,
        payout_amount:     payoutAmount,
        status:            'pending',
        is_free_month:     false,
      })

      // Update affiliate stats
      await supabase.from('affiliates').update({
        current_month_referred_fee:  referredFee,
        current_month_payout_amount: payoutAmount,
        current_month_referred_paid: true,
        months_paid:                 (affRelation.months_paid ?? 0) + 1,
        total_referred_va_paid:      (affRelation.total_referred_va_paid ?? 0) + referredFee,
        total_payout_earned:         (affRelation.total_payout_earned ?? 0) + payoutAmount,
      }).eq('id', affRelation.id)

      // Update referral_codes totals
      if (affRelation.referral_code) {
        const { data: rcRow } = await supabase
          .from('referral_codes')
          .select('total_earned, current_month_earned')
          .eq('code', affRelation.referral_code)
          .maybeSingle()
        if (rcRow) {
          await supabase.from('referral_codes').update({
            total_earned:         (rcRow.total_earned ?? 0) + payoutAmount,
            current_month_earned: (rcRow.current_month_earned ?? 0) + payoutAmount,
          }).eq('code', affRelation.referral_code)
        }
      }

      // Notify referrer
      const monthLabel = formatMonth(bill.month as string)
      await supabase.from('notifications').insert({
        va_id:   affRelation.referrer_va_id,
        type:    'payment_received',
        title:   `Affiliate earnings — $${payoutAmount.toFixed(2)}`,
        message: `Your referral paid their ${monthLabel} HigherUp share ($${referredFee}). You've earned $${payoutAmount.toFixed(2)} (${percentage}%).`,
        is_read: false,
      })

      console.log(`[mark-paid] Affiliate payout created: referrer=${affRelation.referrer_va_id}, amount=$${payoutAmount}`)
    }
  }

  console.log(`[mark-paid] Invoice ${bill.invoice_number} marked paid for VA ${bill.va_id}`)
  return Response.json({ ok: true, invoice_number: bill.invoice_number })
}

function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
