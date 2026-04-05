import { redirect } from 'next/navigation'
import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'
import { getCurrentBillingMonth } from '@/lib/usage-tracker'
import NetworkClient from './NetworkClient'

export default async function NetworkPage() {
  const session = await getGenxSession()
  if (!session) redirect('/genx/login')
  const db = genxDb()
  const lgId = session.lgId
  const currentMonth = getCurrentBillingMonth()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [referralsRes, earningsRes] = await Promise.all([
    db.from('referral_tracking')
      .select('id, va_user_id, referred_at, status, source')
      .eq('lg_id', lgId)
      .order('referred_at', { ascending: false }),
    db.from('lg_earnings')
      .select('va_user_id, amount')
      .eq('lg_id', lgId)
      .eq('billing_month', currentMonth),
  ])

  const referrals = referralsRes.data || []

  const earningsMap: Record<string, number> = {}
  for (const e of earningsRes.data || []) {
    const key = e.va_user_id as string
    earningsMap[key] = (earningsMap[key] || 0) + parseFloat(String(e.amount))
  }

  const vaIds = referrals.map(r => r.va_user_id as string)
  let vaNames: Record<string, string> = {}
  if (vaIds.length > 0) {
    const { data: vas } = await db.from('vas').select('id, name').in('id', vaIds)
    vaNames = Object.fromEntries((vas || []).map(v => [v.id as string, v.name as string]))
  }

  const isNew = (referredAt: string) => new Date(referredAt) >= new Date(sevenDaysAgo)

  const rows = referrals.map(r => ({
    va_id:                   r.va_user_id as string,
    va_name:                 vaNames[r.va_user_id as string] || 'Unknown VA',
    signed_up_at:            r.referred_at as string,
    status:                  r.status as string,
    source:                  (r.source as string) || 'direct',
    products_this_month:     0,
    products_last_month:     0,
    velocity_percent:        0,
    total_products_lifetime: 0,
    health_score:            0,
    risk_flag:               null,
    risk_reason:             null,
    you_earned:              earningsMap[r.va_user_id as string] || 0,
    is_new:                  isNew(r.referred_at as string),
    first_upload_at:         null,
  }))

  const cohorts: Record<string, { count: number; totalProducts: number; totalEarnings: number }> = {}
  for (const r of rows) {
    const month = r.signed_up_at.slice(0, 7)
    if (!cohorts[month]) cohorts[month] = { count: 0, totalProducts: 0, totalEarnings: 0 }
    cohorts[month].count++
    cohorts[month].totalEarnings += r.you_earned
  }
  const cohortList = Object.entries(cohorts).sort(([a],[b]) => b.localeCompare(a)).map(([month, d]) => ({
    month, count: d.count,
    avg_products: 0,
    avg_earned: d.count > 0 ? Math.round((d.totalEarnings / d.count) * 100) / 100 : 0,
  }))

  const sources: Record<string, { total: number; active: number; totalProducts: number }> = {}
  for (const r of rows) {
    const src = r.source || 'direct'
    if (!sources[src]) sources[src] = { total: 0, active: 0, totalProducts: 0 }
    sources[src].total++
    if (r.status === 'active') sources[src].active++
  }
  const sourceList = Object.entries(sources).sort(([,a],[,b]) => b.active - a.active).map(([source, d]) => ({
    source, total: d.total, active: d.active, avg_products: 0,
  }))

  return <NetworkClient rows={rows} cohorts={cohortList} sources={sourceList} />
}
