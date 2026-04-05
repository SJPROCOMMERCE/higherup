import { getGenxSession } from '@/lib/genx-auth'
import { genxDb, toMonthDate } from '@/lib/genx-db'
import { getCurrentBillingMonth, getPreviousBillingMonth } from '@/lib/usage-tracker'

function prevMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function GET() {
  const db = genxDb()
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const lgId         = session.lgId
  const currentMonth = getCurrentBillingMonth()
  const lastMonth    = getPreviousBillingMonth()
  const twoAgo       = prevMonth(lastMonth)

  const [lgRes, thisRes, lastRes, twoRes, activeRes, attentionRes] = await Promise.all([
    db.from('lead_generators').select('total_earned, total_vas, active_vas').eq('id', lgId).single(),
    db.from('lg_earnings').select('amount, products').eq('lg_id', lgId).eq('billing_month', toMonthDate(currentMonth)),
    db.from('lg_earnings').select('amount, products').eq('lg_id', lgId).eq('billing_month', toMonthDate(lastMonth)),
    db.from('lg_earnings').select('amount').eq('lg_id', lgId).eq('billing_month', toMonthDate(twoAgo)),
    db.from('referral_tracking').select('id').eq('lg_id', lgId).eq('status', 'active'),
    db.from('referral_tracking')
      .select('va_user_id, status, referred_at')
      .eq('lg_id', lgId)
      .order('referred_at', { ascending: false })
      .limit(5),
  ])

  const sum     = (rows: { amount: string | number }[]) =>
    (rows || []).reduce((s, r) => s + parseFloat(String(r.amount)), 0)
  const sumProd = (rows: { products: number }[]) =>
    (rows || []).reduce((s, r) => s + (r.products || 0), 0)

  const thisMonth  = { earnings: sum(thisRes.data || []), products: sumProd(thisRes.data as never || []) }
  const lastMonthD = { earnings: sum(lastRes.data || []), products: sumProd(lastRes.data as never || []) }
  const twoAgoD    = { earnings: sum(twoRes.data || []) }
  const activeCount = (activeRes.data || []).length
  const totalVas    = (lgRes.data?.total_vas as number) || 0

  const momGrowth = lastMonthD.earnings > 0
    ? ((thisMonth.earnings - lastMonthD.earnings) / lastMonthD.earnings * 100)
    : 0

  const activeRatio  = totalVas > 0 ? activeCount / totalVas : 0
  const avgProducts  = activeCount > 0 ? thisMonth.products / activeCount : 0
  const growthScore  = Math.min(1, Math.max(0, (momGrowth + 50) / 100))
  const healthScore  = Math.min(100, Math.round(
    activeRatio * 40 + growthScore * 25 + Math.min(1, avgProducts / 200) * 25 + 10
  ))

  const months3   = [twoAgoD.earnings, lastMonthD.earnings, thisMonth.earnings]
  const avgGrowth = months3.length > 1
    ? (months3[months3.length - 1] - months3[0]) / (months3.length - 1)
    : 0
  const projection = Math.max(0, thisMonth.earnings + avgGrowth)

  // Get VA names for attention list
  const attention = attentionRes.data || []
  const vaIds = attention.map((r: Record<string, unknown>) => r.va_user_id as string)
  let vaNames: Record<string, string> = {}
  if (vaIds.length > 0) {
    const { data: vas } = await db.from('vas').select('id, name').in('id', vaIds)
    vaNames = Object.fromEntries((vas || []).map(v => [v.id, v.name]))
  }

  const attentionNamed = attention.map((r: Record<string, unknown>) => ({
    va_id:   r.va_user_id,
    va_name: vaNames[r.va_user_id as string] || 'Unknown VA',
    status:  r.status,
  }))

  return Response.json({
    lifetimeEarnings: parseFloat(String(lgRes.data?.total_earned || 0)),
    thisMonth,
    lastMonth: lastMonthD,
    momGrowth,
    activeVACount: activeCount,
    totalReferred: totalVas,
    healthScore,
    attentionNeeded: attentionNamed,
    projection,
    currentMonth,
  })
}
