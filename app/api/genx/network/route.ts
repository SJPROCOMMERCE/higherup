import { getGenxSession } from '@/lib/genx-auth'
import { genxDb, toMonthDate } from '@/lib/genx-db'
import { getCurrentBillingMonth, getPreviousBillingMonth } from '@/lib/usage-tracker'

export async function GET() {
  const db = genxDb()
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const lgId      = session.lgId
  const curMonth  = getCurrentBillingMonth()
  const prevMonth = getPreviousBillingMonth()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const monthStart   = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const { data: referrals } = await db
    .from('referral_tracking')
    .select('va_user_id, referred_at, status, source')
    .eq('lg_id', lgId)
    .order('referred_at', { ascending: false })

  const vaIds = (referrals || []).map((r: Record<string, unknown>) => r.va_user_id as string)

  const [earningsThisRes, earningsLastRes, vasRes, uploadsRes] = await Promise.all([
    vaIds.length > 0
      ? db.from('lg_earnings').select('va_user_id, amount, products')
          .eq('lg_id', lgId).eq('billing_month', toMonthDate(curMonth)).in('va_user_id', vaIds)
      : Promise.resolve({ data: [] }),
    vaIds.length > 0
      ? db.from('lg_earnings').select('va_user_id, products')
          .eq('lg_id', lgId).eq('billing_month', toMonthDate(prevMonth)).in('va_user_id', vaIds)
      : Promise.resolve({ data: [] }),
    vaIds.length > 0
      ? db.from('vas').select('id, name').in('id', vaIds)
      : Promise.resolve({ data: [] }),
    vaIds.length > 0
      ? db.from('uploads').select('va_id, products_optimized, processing_completed_at')
          .in('va_id', vaIds).eq('status', 'done')
      : Promise.resolve({ data: [] }),
  ])

  const vaNames: Record<string, string> = Object.fromEntries(
    (vasRes.data || []).map((v: Record<string, unknown>) => [v.id as string, v.name as string])
  )
  const earningsMap:  Record<string, number> = {}
  const prodThisMap:  Record<string, number> = {}
  const prodLastMap:  Record<string, number> = {}
  for (const e of earningsThisRes.data || []) {
    const k = (e as Record<string, unknown>).va_user_id as string
    earningsMap[k] = (earningsMap[k] || 0) + parseFloat(String((e as Record<string, unknown>).amount))
    prodThisMap[k] = (prodThisMap[k] || 0) + (((e as Record<string, unknown>).products as number) || 0)
  }
  for (const e of earningsLastRes.data || []) {
    const k = (e as Record<string, unknown>).va_user_id as string
    prodLastMap[k] = (prodLastMap[k] || 0) + (((e as Record<string, unknown>).products as number) || 0)
  }

  const uploadMap: Record<string, { total: number; first: string | null; last: string | null; thisMonth: number }> = {}
  for (const u of uploadsRes.data || []) {
    const k = (u as Record<string, unknown>).va_id as string
    if (!uploadMap[k]) uploadMap[k] = { total: 0, first: null, last: null, thisMonth: 0 }
    const count = ((u as Record<string, unknown>).products_optimized as number) || 0
    const ts    = (u as Record<string, unknown>).processing_completed_at as string | null
    uploadMap[k].total += count
    if (ts) {
      if (!uploadMap[k].first || ts < uploadMap[k].first!) uploadMap[k].first = ts
      if (!uploadMap[k].last  || ts > uploadMap[k].last!)  uploadMap[k].last  = ts
      if (ts >= monthStart) uploadMap[k].thisMonth += count
    }
  }

  const isNew = (referredAt: string) => new Date(referredAt) >= new Date(sevenDaysAgo)

  const rows = (referrals || []).map((r: Record<string, unknown>) => {
    const vaId       = r.va_user_id as string
    const thisMonth  = prodThisMap[vaId] || uploadMap[vaId]?.thisMonth || 0
    const lastMonthP = prodLastMap[vaId] || 0
    const lifetime   = uploadMap[vaId]?.total || 0
    const velocity   = lastMonthP > 0 ? Math.round((thisMonth - lastMonthP) / lastMonthP * 100) : 0
    const health     = r.status === 'active'
      ? Math.min(100, 20 + Math.min(60, Math.round(lifetime / 5)) + (thisMonth > 0 ? 20 : 0))
      : Math.min(40, Math.round(lifetime / 10))
    const referredAt = r.referred_at as string
    return {
      va_id:                   vaId,
      va_name:                 vaNames[vaId] || 'Unknown VA',
      signed_up_at:            referredAt,
      status:                  r.status,
      source:                  (r.source as string) || 'direct',
      products_this_month:     thisMonth,
      products_last_month:     lastMonthP,
      velocity_percent:        velocity,
      total_products_lifetime: lifetime,
      health_score:            health,
      risk_flag:               lifetime === 0 && !isNew(referredAt) ? 'inactive' : null,
      risk_reason:             lifetime === 0 && !isNew(referredAt) ? 'No uploads yet' : null,
      you_earned:              earningsMap[vaId] || 0,
      is_new:                  isNew(referredAt),
      first_upload_at:         uploadMap[vaId]?.first || null,
    }
  })

  const cohorts: Record<string, { count: number; totalProducts: number; totalEarnings: number }> = {}
  for (const r of rows) {
    const month = (r.signed_up_at as string).slice(0, 7)
    if (!cohorts[month]) cohorts[month] = { count: 0, totalProducts: 0, totalEarnings: 0 }
    cohorts[month].count++
    cohorts[month].totalProducts += r.total_products_lifetime as number
    cohorts[month].totalEarnings += r.you_earned as number
  }
  const cohortList = Object.entries(cohorts)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, d]) => ({
      month,
      count:        d.count,
      avg_products: d.count > 0 ? Math.round(d.totalProducts / d.count) : 0,
      avg_earnings: d.count > 0 ? Math.round(d.totalEarnings / d.count * 100) / 100 : 0,
    }))

  return Response.json({ rows, cohorts: cohortList })
}
