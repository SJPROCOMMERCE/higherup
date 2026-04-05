import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getPreviousBillingMonth } from '@/lib/usage-tracker'

function admin() {
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

  const db = admin()
  const lastMonth   = getPreviousBillingMonth()
  const periodStart = `${lastMonth}-01`
  const periodEnd   = new Date(new Date(periodStart).getFullYear(), new Date(periodStart).getMonth() + 1, 0)
    .toISOString().slice(0, 10)

  const { data: lgs } = await db.from('lead_generators').select('id').eq('status', 'active')
  let generated = 0

  // Generate payouts
  for (const lg of lgs || []) {
    const { data: existing } = await db.from('lg_payouts')
      .select('id').eq('lg_id', lg.id).eq('period_start', periodStart).maybeSingle()
    if (existing) continue

    const { data: earnings } = await db.from('lg_earnings')
      .select('amount').eq('lg_id', lg.id).eq('billing_month', lastMonth)

    const totalEarnings = (earnings || []).reduce((s, r) => s + parseFloat(String(r.amount)), 0)
    if (totalEarnings < 10) continue

    await db.from('lg_payouts').insert({
      lg_id:        lg.id,
      amount:       totalEarnings,
      period_start: periodStart,
      period_end:   periodEnd,
      status:       'pending',
    })

    generated++
  }

  // Update leaderboard
  const { data: allLGs } = await db.from('lead_generators').select('id').eq('status', 'active')

  const lbData: { lg_id: string; total_earned: number; active_vas: number; products: number }[] = []

  for (const lg of allLGs || []) {
    const { data: earn } = await db.from('lg_earnings')
      .select('amount, products, va_user_id')
      .eq('lg_id', lg.id)
      .eq('billing_month', lastMonth)

    const total_earned = (earn || []).reduce((s, r) => s + parseFloat(String(r.amount)), 0)
    const active_vas   = new Set((earn || []).map(r => r.va_user_id)).size
    const products     = (earn || []).reduce((s, r) => s + (r.products || 0), 0)

    lbData.push({ lg_id: lg.id, total_earned, active_vas, products })
  }

  const sorted = [...lbData].sort((a, b) => b.total_earned - a.total_earned)
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]
    await db.from('lg_leaderboard').upsert({
      lg_id:         row.lg_id,
      billing_month: lastMonth,
      rank:          i + 1,
      total_earned:  row.total_earned,
      active_vas:    row.active_vas,
      products:      row.products,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'lg_id,billing_month' })
  }

  return NextResponse.json({ ok: true, generated, billingMonth: lastMonth })
}
