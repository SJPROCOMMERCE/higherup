import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getPreviousBillingMonth } from '@/lib/usage-tracker'

export const maxDuration = 300

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = admin()
  const lastMonth = getPreviousBillingMonth()
  const periodStart = `${lastMonth}-01`
  const periodEnd   = new Date(new Date(periodStart).getFullYear(), new Date(periodStart).getMonth() + 1, 0)
    .toISOString().slice(0, 10)

  const { data: lgs } = await db.from('lead_generators').select('id').eq('status', 'active')
  let generated = 0

  for (const lg of lgs || []) {
    // Skip if payout already exists for this period
    const { data: existing } = await db.from('lg_payouts')
      .select('id')
      .eq('lg_id', lg.id)
      .eq('period_start', periodStart)
      .maybeSingle()
    if (existing) continue

    // Sum earnings for last month
    const { data: earnings } = await db.from('lg_earnings')
      .select('amount')
      .eq('lg_id', lg.id)
      .eq('billing_month', lastMonth)

    const totalEarnings = (earnings || []).reduce((s, r) => s + parseFloat(String(r.amount)), 0)
    if (totalEarnings < 10) continue  // below minimum payout threshold

    await db.from('lg_payouts').insert({
      lg_id:        lg.id,
      amount:       totalEarnings,
      period_start: periodStart,
      period_end:   periodEnd,
      status:       'pending',
    })

    generated++
    console.log(`[genx-payout] ${lg.id} | $${totalEarnings.toFixed(2)} | PENDING`)
  }

  return NextResponse.json({ ok: true, generated, billing_month: lastMonth })
}
