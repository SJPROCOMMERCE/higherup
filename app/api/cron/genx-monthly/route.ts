import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getPreviousBillingMonth } from '@/lib/usage-tracker'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const lastMonth = getPreviousBillingMonth()

  // Get all active LGs
  const { data: lgs } = await supabase.from('lead_generators').select('id, minimum_payout').eq('status', 'active')

  let generated = 0

  for (const lg of lgs || []) {
    // Skip if payout already exists
    const { data: existing } = await supabase.from('lg_payouts').select('id').eq('lg_id', lg.id).eq('billing_month', lastMonth).single()
    if (existing) continue

    // Calculate earnings
    const { data: earnings } = await supabase.from('lg_earnings').select('amount, product_count, va_id').eq('lg_id', lg.id).eq('billing_month', lastMonth)
    const totalEarnings = (earnings || []).reduce((s, r) => s + parseFloat(String(r.amount)), 0)
    const totalProducts = (earnings || []).reduce((s, r) => s + (r.product_count || 0), 0)
    const uniqueVAs = new Set((earnings || []).map(r => r.va_id)).size

    // Rolled over amounts from previous
    const { data: rolledPayouts } = await supabase.from('lg_payouts').select('rolled_over').eq('lg_id', lg.id).eq('status', 'rolled_over')
    const rolledOver = (rolledPayouts || []).reduce((s, r) => s + parseFloat(String(r.rolled_over)), 0)
    const grandTotal = totalEarnings + rolledOver

    const meetsMinimum = grandTotal >= (parseFloat(String(lg.minimum_payout)) || 10)

    await supabase.from('lg_payouts').insert({
      lg_id: lg.id,
      billing_month: lastMonth,
      total_earnings: totalEarnings,
      payout_amount: meetsMinimum ? grandTotal : 0,
      rolled_over: meetsMinimum ? 0 : grandTotal,
      total_products: totalProducts,
      total_active_vas: uniqueVAs,
      status: meetsMinimum ? 'pending' : 'rolled_over',
    })

    if (meetsMinimum && rolledPayouts && rolledPayouts.length > 0) {
      await supabase.from('lg_payouts').update({ status: 'paid', notes: 'Included in later payout' }).eq('lg_id', lg.id).eq('status', 'rolled_over')
    }

    generated++
    console.log(`[genx-monthly] ${lg.id} | $${totalEarnings.toFixed(2)} | ${meetsMinimum ? 'PAYOUT' : 'ROLLED OVER'}`)
  }

  // Update leaderboard for last month
  const { data: allLGs } = await supabase.from('lead_generators').select('id').eq('status', 'active')
  const lbData: { lg_id: string; earnings: number; active_vas: number; new_signups: number }[] = []

  for (const lg of allLGs || []) {
    const { data: earn } = await supabase.from('lg_earnings').select('amount, va_id').eq('lg_id', lg.id).eq('billing_month', lastMonth)
    const earnings = (earn || []).reduce((s, r) => s + parseFloat(String(r.amount)), 0)
    const activeVAs = new Set((earn || []).map(r => r.va_id)).size

    const monthStart = `${lastMonth}-01`
    const monthEnd = `${lastMonth}-31`
    const { count: newSignups } = await supabase.from('referral_tracking')
      .select('id', { count: 'exact', head: true })
      .eq('lg_id', lg.id)
      .gte('signed_up_at', monthStart)
      .lte('signed_up_at', monthEnd)

    lbData.push({ lg_id: lg.id, earnings, active_vas: activeVAs, new_signups: newSignups || 0 })
  }

  // Sort and assign ranks
  const sorted = [...lbData].sort((a, b) => b.earnings - a.earnings)
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]
    await supabase.from('lg_leaderboard').upsert({
      lg_id: row.lg_id, period: lastMonth, period_type: 'month',
      active_vas: row.active_vas, total_products: 0, earnings: row.earnings,
      new_signups: row.new_signups, rank_earnings: i + 1, updated_at: new Date().toISOString(),
    }, { onConflict: 'lg_id,period,period_type' })
  }

  return NextResponse.json({ ok: true, generated, billingMonth: lastMonth })
}
