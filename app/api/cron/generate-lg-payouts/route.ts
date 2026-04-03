import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getPreviousBillingMonth } from '@/lib/usage-tracker'

export const maxDuration = 300

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const lastMonth = getPreviousBillingMonth()

  const { data: lgs } = await supabase
    .from('lead_generators')
    .select('id, minimum_payout')
    .eq('status', 'active')

  let generated = 0

  for (const lg of lgs || []) {
    // Skip if payout already exists for this month
    const { data: existing } = await supabase
      .from('lg_payouts')
      .select('id')
      .eq('lg_id', lg.id)
      .eq('billing_month', lastMonth)
      .maybeSingle()

    if (existing) continue

    const { data: earnings } = await supabase
      .from('lg_earnings')
      .select('amount, product_count, va_id')
      .eq('lg_id', lg.id)
      .eq('billing_month', lastMonth)

    const totalEarnings  = (earnings || []).reduce((s, r) => s + parseFloat(String(r.amount)), 0)
    const totalProducts  = (earnings || []).reduce((s, r) => s + r.product_count, 0)
    const uniqueVAs      = new Set((earnings || []).map(r => r.va_id)).size

    // Add any previously rolled-over amounts
    const { data: rolledPayouts } = await supabase
      .from('lg_payouts')
      .select('rolled_over')
      .eq('lg_id', lg.id)
      .eq('status', 'rolled_over')

    const prevRolled   = (rolledPayouts || []).reduce((s, r) => s + parseFloat(String(r.rolled_over)), 0)
    const grandTotal   = totalEarnings + prevRolled
    const minPayout    = parseFloat(String(lg.minimum_payout))
    const meetsMinimum = grandTotal >= minPayout

    await supabase.from('lg_payouts').insert({
      lg_id:             lg.id,
      billing_month:     lastMonth,
      total_earnings:    totalEarnings,
      payout_amount:     meetsMinimum ? grandTotal : 0,
      rolled_over:       meetsMinimum ? 0 : grandTotal,
      total_products:    totalProducts,
      total_active_vas:  uniqueVAs,
      status:            meetsMinimum ? 'pending' : 'rolled_over',
    })

    // If paying out, mark old rolled_over payouts as included
    if (meetsMinimum && rolledPayouts && rolledPayouts.length > 0) {
      await supabase
        .from('lg_payouts')
        .update({ status: 'paid', notes: 'Included in later payout', updated_at: new Date().toISOString() })
        .eq('lg_id', lg.id)
        .eq('status', 'rolled_over')
    }

    generated++
    console.log(`[genx-payout] ${lg.id} | $${totalEarnings.toFixed(2)} earned | ${meetsMinimum ? 'PAYOUT' : 'ROLLED OVER'} | $${grandTotal.toFixed(2)}`)
  }

  return NextResponse.json({ ok: true, generated, billing_month: lastMonth })
}
