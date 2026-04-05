import { getGenxSession } from '@/lib/genx-auth'
import { supabase } from '@/lib/supabase'
import { getCurrentBillingMonth } from '@/lib/usage-tracker'

export async function GET() {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const lgId = session.lgId

  const [referralsRes, earningsRes] = await Promise.all([
    supabase.from('referral_tracking')
      .select('va_user_id, referred_at, status, source')
      .eq('lg_id', lgId)
      .order('referred_at', { ascending: false }),
    supabase.from('lg_earnings')
      .select('va_user_id, amount')
      .eq('lg_id', lgId)
      .eq('billing_month', getCurrentBillingMonth()),
  ])

  const referrals = referralsRes.data || []

  // Earnings this month per VA
  const earningsMap: Record<string, number> = {}
  for (const e of earningsRes.data || []) {
    const key = e.va_user_id as string
    earningsMap[key] = (earningsMap[key] || 0) + parseFloat(String(e.amount))
  }

  // Get VA names from vas table
  const vaIds = referrals.map((r: Record<string, unknown>) => r.va_user_id as string)
  let vaNames: Record<string, string> = {}
  if (vaIds.length > 0) {
    const { data: vas } = await supabase.from('vas').select('id, name').in('id', vaIds)
    vaNames = Object.fromEntries((vas || []).map(v => [v.id, v.name]))
  }

  const rows = referrals.map((r: Record<string, unknown>) => ({
    va_id:       r.va_user_id,
    va_name:     vaNames[r.va_user_id as string] || 'Unknown VA',
    signed_up_at: r.referred_at,
    status:      r.status,
    source:      r.source,
    products_this_month:     0,  // populated by cron
    products_last_month:     0,
    total_products_lifetime: 0,
    you_earned:  earningsMap[r.va_user_id as string] || 0,
  }))

  // Cohorts by signup month
  const cohorts: Record<string, { count: number; totalEarnings: number }> = {}
  for (const r of rows) {
    const month = String(r.signed_up_at).slice(0, 7)
    if (!cohorts[month]) cohorts[month] = { count: 0, totalEarnings: 0 }
    cohorts[month].count++
    cohorts[month].totalEarnings += r.you_earned
  }

  const cohortList = Object.entries(cohorts)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, data]) => ({
      month,
      count: data.count,
      avg_products: 0,
      avg_earnings: data.count > 0 ? Math.round(data.totalEarnings / data.count * 100) / 100 : 0,
    }))

  return Response.json({ rows, cohorts: cohortList })
}
