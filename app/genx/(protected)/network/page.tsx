import { redirect } from 'next/navigation'
import { getGenxSession } from '@/lib/genx-auth'
import NetworkClient from './NetworkClient'
import { supabase } from '@/lib/supabase'
import { getCurrentBillingMonth } from '@/lib/usage-tracker'

export default async function NetworkPage() {
  const session = await getGenxSession()
  if (!session) redirect('/genx/login')
  const lgId = session.lgId

  const [referralsRes, earningsRes] = await Promise.all([
    supabase.from('referral_tracking')
      .select('va_id, signed_up_at, status, products_this_month, products_last_month, velocity_percent, total_products_lifetime')
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

  const vaIds = referrals.map((r: { va_id: string }) => r.va_id)
  let vaNames: Record<string, string> = {}
  if (vaIds.length) {
    const { data: vas } = await supabase.from('vas').select('id, name').in('id', vaIds)
    vaNames = Object.fromEntries((vas || []).map(v => [v.id, v.name]))
  }

  const rows = referrals.map((r: Record<string, unknown>) => ({
    va_id:                  r.va_id as string,
    va_name:                vaNames[r.va_id as string] || 'Unknown VA',
    signed_up_at:           r.signed_up_at as string,
    status:                 r.status as string,
    products_this_month:    r.products_this_month as number || 0,
    products_last_month:    r.products_last_month as number || 0,
    velocity_percent:       r.velocity_percent as number || 0,
    total_products_lifetime:r.total_products_lifetime as number || 0,
    you_earned:             earningsMap[r.va_id as string] || 0,
  }))

  // Cohorts
  const cohorts: Record<string, { count: number; totalProducts: number; totalEarned: number }> = {}
  for (const r of rows) {
    const month = r.signed_up_at.slice(0, 7)
    if (!cohorts[month]) cohorts[month] = { count: 0, totalProducts: 0, totalEarned: 0 }
    cohorts[month].count++
    cohorts[month].totalProducts += r.products_this_month
    cohorts[month].totalEarned   += r.you_earned
  }
  const cohortList = Object.entries(cohorts)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, d]) => ({
      month,
      count: d.count,
      avg_products: d.count > 0 ? Math.round(d.totalProducts / d.count) : 0,
      avg_earned:   d.count > 0 ? Math.round(d.totalEarned / d.count * 100) / 100 : 0,
    }))

  return <NetworkClient rows={rows} cohorts={cohortList} />
}
