import { redirect } from 'next/navigation'
import { getGenxSession } from '@/lib/genx-auth'
import { genxDb, toMonthDate } from '@/lib/genx-db'
import { getCurrentBillingMonth, getPreviousBillingMonth } from '@/lib/usage-tracker'
import NetworkClient from './NetworkClient'

export default async function NetworkPage() {
  const session = await getGenxSession()
  if (!session) redirect('/genx/login')
  const db = genxDb()
  const lgId = session.lgId
  const currentMonth = getCurrentBillingMonth()
  const lastMonth    = getPreviousBillingMonth()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const monthStart   = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  // 1. All referrals for this LG
  const { data: referrals } = await db
    .from('referral_tracking')
    .select('id, va_user_id, referred_at, status, source')
    .eq('lg_id', lgId)
    .order('referred_at', { ascending: false })

  const vaIds = (referrals || []).map(r => r.va_user_id as string)

  // 2. Parallel: earnings this month, earnings last month, VA names, lifetime uploads
  const [earningsThisRes, earningsLastRes, vasRes, uploadsRes] = await Promise.all([
    vaIds.length > 0
      ? db.from('lg_earnings')
          .select('va_user_id, amount, products')
          .eq('lg_id', lgId)
          .eq('billing_month', toMonthDate(currentMonth))
          .in('va_user_id', vaIds)
      : Promise.resolve({ data: [] }),

    vaIds.length > 0
      ? db.from('lg_earnings')
          .select('va_user_id, products')
          .eq('lg_id', lgId)
          .eq('billing_month', toMonthDate(lastMonth))
          .in('va_user_id', vaIds)
      : Promise.resolve({ data: [] }),

    vaIds.length > 0
      ? db.from('vas').select('id, name').in('id', vaIds)
      : Promise.resolve({ data: [] }),

    // Lifetime totals + first/last upload from uploads table
    vaIds.length > 0
      ? db.from('uploads')
          .select('va_id, products_optimized, processing_completed_at')
          .in('va_id', vaIds)
          .eq('status', 'done')
      : Promise.resolve({ data: [] }),
  ])

  // Build lookup maps
  const vaNames: Record<string, string> = Object.fromEntries(
    (vasRes.data || []).map(v => [v.id as string, v.name as string])
  )

  // This month: earnings + products per VA
  const earningsMap:    Record<string, number> = {}
  const prodThisMap:    Record<string, number> = {}
  for (const e of earningsThisRes.data || []) {
    const k = e.va_user_id as string
    earningsMap[k] = (earningsMap[k] || 0) + parseFloat(String(e.amount))
    prodThisMap[k] = (prodThisMap[k] || 0) + ((e.products as number) || 0)
  }

  // Last month: products per VA
  const prodLastMap: Record<string, number> = {}
  for (const e of earningsLastRes.data || []) {
    const k = e.va_user_id as string
    prodLastMap[k] = (prodLastMap[k] || 0) + ((e.products as number) || 0)
  }

  // Lifetime from uploads: total products, first upload, last active
  const uploadMap: Record<string, { total: number; first: string | null; last: string | null; thisMonth: number }> = {}
  for (const u of uploadsRes.data || []) {
    const k = u.va_id as string
    if (!uploadMap[k]) uploadMap[k] = { total: 0, first: null, last: null, thisMonth: 0 }
    const count = (u.products_optimized as number) || 0
    const ts    = u.processing_completed_at as string | null
    uploadMap[k].total += count
    if (ts) {
      if (!uploadMap[k].first || ts < uploadMap[k].first!) uploadMap[k].first = ts
      if (!uploadMap[k].last  || ts > uploadMap[k].last!)  uploadMap[k].last  = ts
      if (ts >= monthStart) uploadMap[k].thisMonth += count
    }
  }

  const isNew = (referredAt: string) => new Date(referredAt) >= new Date(sevenDaysAgo)

  const rows = (referrals || []).map(r => {
    const vaId        = r.va_user_id as string
    const thisMonth   = prodThisMap[vaId] || uploadMap[vaId]?.thisMonth || 0
    const lastMonthP  = prodLastMap[vaId] || 0
    const lifetime    = uploadMap[vaId]?.total || 0
    const earned      = earningsMap[vaId] || 0
    const velocity    = lastMonthP > 0
      ? Math.round((thisMonth - lastMonthP) / lastMonthP * 100)
      : 0
    // Health: activity score 0-100 based on lifetime products + active status
    const health = r.status === 'active'
      ? Math.min(100, 20 + Math.min(60, Math.round(lifetime / 5)) + (thisMonth > 0 ? 20 : 0))
      : Math.min(40, Math.round(lifetime / 10))

    return {
      va_id:                   vaId,
      va_name:                 vaNames[vaId] || 'Unknown VA',
      signed_up_at:            r.referred_at as string,
      status:                  r.status as string,
      source:                  (r.source as string) || 'direct',
      products_this_month:     thisMonth,
      products_last_month:     lastMonthP,
      velocity_percent:        velocity,
      total_products_lifetime: lifetime,
      health_score:            health,
      risk_flag:               lifetime === 0 && !isNew(r.referred_at as string) ? 'inactive' : null,
      risk_reason:             lifetime === 0 && !isNew(r.referred_at as string) ? 'No uploads yet' : null,
      you_earned:              earned,
      is_new:                  isNew(r.referred_at as string),
      first_upload_at:         uploadMap[vaId]?.first || null,
    }
  })

  // Cohorts by signup month (with real avg products)
  const cohorts: Record<string, { count: number; totalProducts: number; totalEarnings: number }> = {}
  for (const r of rows) {
    const month = r.signed_up_at.slice(0, 7)
    if (!cohorts[month]) cohorts[month] = { count: 0, totalProducts: 0, totalEarnings: 0 }
    cohorts[month].count++
    cohorts[month].totalProducts += r.total_products_lifetime
    cohorts[month].totalEarnings += r.you_earned
  }
  const cohortList = Object.entries(cohorts)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, d]) => ({
      month,
      count:        d.count,
      avg_products: d.count > 0 ? Math.round(d.totalProducts / d.count) : 0,
      avg_earned:   d.count > 0 ? Math.round((d.totalEarnings / d.count) * 100) / 100 : 0,
    }))

  // Sources breakdown (with real avg products)
  const sources: Record<string, { total: number; active: number; totalProducts: number }> = {}
  for (const r of rows) {
    const src = r.source || 'direct'
    if (!sources[src]) sources[src] = { total: 0, active: 0, totalProducts: 0 }
    sources[src].total++
    if (r.status === 'active') sources[src].active++
    sources[src].totalProducts += r.total_products_lifetime
  }
  const sourceList = Object.entries(sources)
    .sort(([, a], [, b]) => b.active - a.active)
    .map(([source, d]) => ({
      source,
      total:        d.total,
      active:       d.active,
      avg_products: d.total > 0 ? Math.round(d.totalProducts / d.total) : 0,
    }))

  return <NetworkClient rows={rows} cohorts={cohortList} sources={sourceList} />
}
