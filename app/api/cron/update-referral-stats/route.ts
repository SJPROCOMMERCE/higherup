import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getCurrentBillingMonth, getPreviousBillingMonth } from '@/lib/usage-tracker'

export const maxDuration = 300

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const currentMonth = getCurrentBillingMonth()
  const lastMonth    = getPreviousBillingMonth()

  const { data: referrals } = await supabase
    .from('referral_tracking')
    .select('id, va_id, lg_id, products_this_month, products_last_month, first_upload_at')

  let updated = 0

  for (const ref of referrals || []) {
    const { data: usageThis } = await supabase
      .from('va_usage')
      .select('product_count')
      .eq('va_id', ref.va_id)
      .eq('billing_month', currentMonth)

    const { data: usageLast } = await supabase
      .from('va_usage')
      .select('product_count')
      .eq('va_id', ref.va_id)
      .eq('billing_month', lastMonth)

    const { data: usageLifetime } = await supabase
      .from('va_usage')
      .select('product_count')
      .eq('va_id', ref.va_id)

    const productsThis     = (usageThis    || []).reduce((s, r) => s + r.product_count, 0)
    const productsLast     = (usageLast    || []).reduce((s, r) => s + r.product_count, 0)
    const productsLifetime = (usageLifetime|| []).reduce((s, r) => s + r.product_count, 0)

    const velocity = productsLast > 0
      ? ((productsThis - productsLast) / productsLast * 100)
      : (productsThis > 0 ? 100 : 0)

    let status: string
    if (!ref.first_upload_at) status = 'signed_up'
    else if (productsThis >= 50) status = 'active'
    else if (productsThis > 0)  status = 'slow'
    else status = 'inactive'

    await supabase
      .from('referral_tracking')
      .update({
        products_this_month:    productsThis,
        products_last_month:    productsLast,
        velocity_percent:       Math.round(velocity * 10) / 10,
        total_products_lifetime:productsLifetime,
        status,
      })
      .eq('id', ref.id)

    updated++
  }

  // Update active_referred count per LG
  const { data: lgIds } = await supabase.from('lead_generators').select('id')
  for (const lg of lgIds || []) {
    const { count } = await supabase
      .from('referral_tracking')
      .select('id', { count: 'exact', head: true })
      .eq('lg_id', lg.id)
      .in('status', ['active', 'slow'])
    await supabase
      .from('lead_generators')
      .update({ active_referred: count || 0, updated_at: new Date().toISOString() })
      .eq('id', lg.id)
  }

  return NextResponse.json({ ok: true, updated })
}
