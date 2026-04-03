import { getGenxSession } from '@/lib/genx-auth'
import { supabase } from '@/lib/supabase'
import { getCurrentBillingMonth } from '@/lib/usage-tracker'

export async function GET() {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const lgId = session.lgId

  const [referralsRes, earningsRes] = await Promise.all([
    supabase.from('referral_tracking')
      .select('va_id, signed_up_at, status, products_this_month, products_last_month, velocity_percent, total_products_lifetime, first_upload_at')
      .eq('lg_id', lgId)
      .order('products_this_month', { ascending: false }),
    supabase.from('lg_earnings')
      .select('va_id, amount')
      .eq('lg_id', lgId)
      .eq('billing_month', getCurrentBillingMonth()),
  ])

  const referrals  = referralsRes.data || []
  const earningsMap: Record<string, number> = {}
  for (const e of earningsRes.data || []) {
    earningsMap[e.va_id as string] = (earningsMap[e.va_id as string] || 0) + parseFloat(String(e.amount))
  }

  // Get VA names
  const vaIds = referrals.map((r: Record<string, unknown>) => r.va_id as string)
  let vaNames: Record<string, string> = {}
  if (vaIds.length > 0) {
    const { data: vas } = await supabase.from('vas').select('id, name').in('id', vaIds)
    vaNames = Object.fromEntries((vas || []).map(v => [v.id, v.name]))
  }

  const rows = referrals.map((r: Record<string, unknown>) => ({
    va_id:                r.va_id,
    va_name:              vaNames[r.va_id as string] || 'Unknown VA',
    signed_up_at:         r.signed_up_at,
    status:               r.status,
    products_this_month:  r.products_this_month,
    products_last_month:  r.products_last_month,
    velocity_percent:     r.velocity_percent,
    total_products_lifetime: r.total_products_lifetime,
    you_earned:           earningsMap[r.va_id as string] || 0,
  }))

  // Cohorts: group by signup month
  const cohorts: Record<string, { count: number; totalProducts: number; totalEarnings: number }> = {}
  for (const r of rows) {
    const month = String(r.signed_up_at).slice(0, 7)
    if (!cohorts[month]) cohorts[month] = { count: 0, totalProducts: 0, totalEarnings: 0 }
    cohorts[month].count++
    cohorts[month].totalProducts += r.products_this_month as number || 0
    cohorts[month].totalEarnings += r.you_earned as number || 0
  }

  const cohortList = Object.entries(cohorts)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, data]) => ({
      month,
      count: data.count,
      avg_products: data.count > 0 ? Math.round(data.totalProducts / data.count) : 0,
      avg_earnings: data.count > 0 ? Math.round(data.totalEarnings / data.count * 100) / 100 : 0,
    }))

  return Response.json({ rows, cohorts: cohortList })
}
