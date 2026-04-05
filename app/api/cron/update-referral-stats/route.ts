import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getCurrentBillingMonth } from '@/lib/usage-tracker'

export const maxDuration = 300

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const currentMonth = getCurrentBillingMonth()

  // Get all referral_tracking rows
  const { data: referrals } = await supabase
    .from('referral_tracking')
    .select('id, va_user_id, lg_id, status')

  let updated = 0

  for (const ref of referrals || []) {
    // Check if this VA has any earnings this month (= active)
    const { count: earningsCount } = await supabase
      .from('lg_earnings')
      .select('id', { count: 'exact', head: true })
      .eq('va_user_id', ref.va_user_id)
      .eq('billing_month', currentMonth)

    const status = (earningsCount || 0) > 0 ? 'active' : ref.status

    if (status !== ref.status) {
      await supabase.from('referral_tracking').update({ status }).eq('id', ref.id)
    }
    updated++
  }

  // Update active_vas count per LG
  const { data: lgIds } = await supabase.from('lead_generators').select('id')
  for (const lg of lgIds || []) {
    const { count } = await supabase
      .from('referral_tracking')
      .select('id', { count: 'exact', head: true })
      .eq('lg_id', lg.id)
      .eq('status', 'active')

    await supabase.from('lead_generators')
      .update({ active_vas: count || 0 })
      .eq('id', lg.id)
  }

  return NextResponse.json({ ok: true, updated })
}
