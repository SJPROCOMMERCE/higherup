import { redirect } from 'next/navigation'
import { getGenxSession } from '@/lib/genx-auth'
import { supabase } from '@/lib/supabase'
import { getCurrentBillingMonth } from '@/lib/usage-tracker'
import NetworkClient from './NetworkClient'

export default async function NetworkPage() {
  const session = await getGenxSession()
  if (!session) redirect('/genx/login')
  const lgId = session.lgId
  const currentMonth = getCurrentBillingMonth()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [referralsRes, earningsRes] = await Promise.all([
    supabase.from('referral_tracking')
      .select('id, va_id, signed_up_at, status, products_this_month, products_last_month, velocity_percent, total_products_lifetime, health_score, risk_flag, risk_reason, source, first_upload_at')
      .eq('lg_id', lgId)
      .order('products_this_month', { ascending: false }),
    supabase.from('lg_earnings').select('va_id, amount').eq('lg_id', lgId).eq('billing_month', currentMonth),
  ])

  const referrals = referralsRes.data || []
  const earningsMap: Record<string, number> = {}
  for (const e of earningsRes.data || []) {
    earningsMap[e.va_id as string] = (earningsMap[e.va_id as string] || 0) + parseFloat(String(e.amount))
  }

  const vaIds = referrals.map(r => r.va_id as string)
  let vaNames: Record<string, string> = {}
  if (vaIds.length > 0) {
    const { data: vas } = await supabase.from('vas').select('id, name').in('id', vaIds)
    vaNames = Object.fromEntries((vas || []).map(v => [v.id as string, v.name as string]))
  }

  const isNew = (signedUpAt: string) => new Date(signedUpAt) >= new Date(sevenDaysAgo)

  const rows = referrals.map(r => ({
    va_id: r.va_id as string,
    va_name: vaNames[r.va_id as string] || 'Unknown VA',
    signed_up_at: r.signed_up_at as string,
    status: r.status as string,
    source: (r.source as string) || 'direct',
    products_this_month: (r.products_this_month as number) || 0,
    products_last_month: (r.products_last_month as number) || 0,
    velocity_percent: (r.velocity_percent as number) || 0,
    total_products_lifetime: (r.total_products_lifetime as number) || 0,
    health_score: (r.health_score as number) || 0,
    risk_flag: r.risk_flag as string | null,
    risk_reason: r.risk_reason as string | null,
    you_earned: earningsMap[r.va_id as string] || 0,
    is_new: isNew(r.signed_up_at as string),
    first_upload_at: r.first_upload_at as string | null,
  }))

  // Cohorts
  const cohorts: Record<string, { count: number; totalProducts: number; totalEarnings: number }> = {}
  for (const r of rows) {
    const month = r.signed_up_at.slice(0, 7)
    if (!cohorts[month]) cohorts[month] = { count: 0, totalProducts: 0, totalEarnings: 0 }
    cohorts[month].count++
    cohorts[month].totalProducts += r.products_this_month
    cohorts[month].totalEarnings += r.you_earned
  }
  const cohortList = Object.entries(cohorts).sort(([a],[b]) => b.localeCompare(a)).map(([month, d]) => ({
    month, count: d.count,
    avg_products: d.count > 0 ? Math.round(d.totalProducts / d.count) : 0,
    avg_earned: d.count > 0 ? Math.round((d.totalEarnings / d.count) * 100) / 100 : 0,
  }))

  // Sources
  const sources: Record<string, { total: number; active: number; totalProducts: number }> = {}
  for (const r of rows) {
    const src = r.source || 'direct'
    if (!sources[src]) sources[src] = { total: 0, active: 0, totalProducts: 0 }
    sources[src].total++
    if (r.status === 'active' || r.status === 'slow') sources[src].active++
    sources[src].totalProducts += r.products_this_month
  }
  const sourceList = Object.entries(sources).sort(([,a],[,b]) => b.active - a.active).map(([source, d]) => ({
    source,
    total: d.total,
    active: d.active,
    avg_products: d.active > 0 ? Math.round(d.totalProducts / d.active) : 0,
  }))

  return <NetworkClient rows={rows} cohorts={cohortList} sources={sourceList} />
}
