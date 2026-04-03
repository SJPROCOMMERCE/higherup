import { getGenxSession } from '@/lib/genx-auth'
import { supabase } from '@/lib/supabase'
import { getCurrentBillingMonth, getPreviousBillingMonth } from '@/lib/usage-tracker'

function prevMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function GET() {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const lgId         = session.lgId
  const currentMonth = getCurrentBillingMonth()
  const lastMonth    = getPreviousBillingMonth()
  const twoAgo       = prevMonth(lastMonth)

  const [lgRes, thisRes, lastRes, twoRes, activeRes, attentionRes] = await Promise.all([
    supabase.from('lead_generators').select('total_earnings, total_referred, active_referred').eq('id', lgId).single(),
    supabase.from('lg_earnings').select('amount, product_count').eq('lg_id', lgId).eq('billing_month', currentMonth),
    supabase.from('lg_earnings').select('amount, product_count').eq('lg_id', lgId).eq('billing_month', lastMonth),
    supabase.from('lg_earnings').select('amount, product_count').eq('lg_id', lgId).eq('billing_month', twoAgo),
    supabase.from('referral_tracking').select('id').eq('lg_id', lgId).in('status', ['active', 'slow']),
    supabase.from('referral_tracking')
      .select('va_id, status, last_active_at, products_this_month, products_last_month, velocity_percent')
      .eq('lg_id', lgId)
      .or('status.eq.inactive,status.eq.slow')
      .order('products_last_month', { ascending: false })
      .limit(5),
  ])

  const sum = (rows: { amount: string | number }[]) =>
    (rows || []).reduce((s, r) => s + parseFloat(String(r.amount)), 0)
  const sumProd = (rows: { product_count: number }[]) =>
    (rows || []).reduce((s, r) => s + r.product_count, 0)

  const thisMonth    = { earnings: sum(thisRes.data || []), products: sumProd(thisRes.data as never || []) }
  const lastMonthD   = { earnings: sum(lastRes.data || []), products: sumProd(lastRes.data as never || []) }
  const twoAgoD      = { earnings: sum(twoRes.data || []) }
  const activeCount  = (activeRes.data || []).length
  const totalReferred= (lgRes.data?.total_referred as number) || 0

  const momGrowth = lastMonthD.earnings > 0
    ? ((thisMonth.earnings - lastMonthD.earnings) / lastMonthD.earnings * 100)
    : 0

  // Health score
  const activeRatio    = totalReferred > 0 ? activeCount / totalReferred : 0
  const avgProducts    = activeCount > 0 ? thisMonth.products / activeCount : 0
  const growthScore    = Math.min(1, Math.max(0, (momGrowth + 50) / 100))
  const healthScore    = Math.min(100, Math.round(
    activeRatio * 40 + growthScore * 25 + Math.min(1, avgProducts / 200) * 25 + 10
  ))

  // 30-day projection: simple 3-point average trend
  const months3      = [twoAgoD.earnings, lastMonthD.earnings, thisMonth.earnings]
  const avgGrowth    = months3.length > 1
    ? (months3[months3.length - 1] - months3[0]) / (months3.length - 1)
    : 0
  const projection   = Math.max(0, thisMonth.earnings + avgGrowth)

  // Get VA names for attention needed
  const attention = attentionRes.data || []
  const vaIds     = attention.map((r: Record<string, unknown>) => r.va_id as string)
  let vaNames: Record<string, string> = {}
  if (vaIds.length > 0) {
    const { data: vas } = await supabase.from('vas').select('id, name').in('id', vaIds)
    vaNames = Object.fromEntries((vas || []).map(v => [v.id, v.name]))
  }

  const attentionNamed = attention.map((r: Record<string, unknown>) => ({
    ...r,
    va_name: vaNames[r.va_id as string] || 'Unknown VA',
  }))

  return Response.json({
    lifetimeEarnings: parseFloat(String(lgRes.data?.total_earnings || 0)),
    thisMonth,
    lastMonth: lastMonthD,
    momGrowth,
    activeVACount: activeCount,
    totalReferred,
    healthScore,
    attentionNeeded: attentionNamed,
    projection,
    currentMonth,
  })
}
