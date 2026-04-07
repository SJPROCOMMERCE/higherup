import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { genxDb, toMonthDate } from '@/lib/genx-db'
import { getCurrentBillingMonth } from '@/lib/usage-tracker'
import AdminGenxClient from './AdminGenxClient'

export default async function AdminGenxPage() {
  const cookieStore = await cookies()
  const adminSession = cookieStore.get('admin_session')?.value
  if (!adminSession) redirect('/admin/login')

  const db = genxDb()
  const currentMonth = getCurrentBillingMonth()
  const today = new Date().toISOString().slice(0, 10)
  const weekAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [
    lgsRes,
    prospectsRes,
    communitiesRes,
    scorecardsRes,
    payoutsRes,
    earningsRes,
    recentActivityRes,
    todayScorecardRes,
  ] = await Promise.all([
    db.from('lead_generators').select('*').order('created_at', { ascending: false }),
    db.from('admin_prospects').select('*, admin_communities(name)').order('updated_at', { ascending: false }),
    db.from('admin_communities').select('*').order('created_at', { ascending: false }),
    db.from('admin_daily_scorecard').select('*').gte('score_date', weekAgo).order('score_date', { ascending: false }),
    db.from('lg_payouts').select('*').eq('status', 'pending').order('period_start', { ascending: false }),
    db.from('lg_earnings').select('amount').eq('billing_month', toMonthDate(currentMonth)),
    db.from('admin_prospect_activities').select('*, admin_prospects(name)').order('created_at', { ascending: false }).limit(20),
    db.from('admin_daily_scorecard').select('*').eq('score_date', today).maybeSingle(),
  ])

  const lgs = lgsRes.data || []
  const prospects = prospectsRes.data || []

  // Build pipeline counts
  const stages = ['lead', 'contacted', 'interested', 'scheduled', 'converted', 'lost']
  const pipeline: Record<string, number> = {}
  for (const s of stages) pipeline[s] = 0
  for (const p of prospects) pipeline[p.stage as string] = (pipeline[p.stage as string] || 0) + 1

  // KPIs
  const monthEarnings = (earningsRes.data || []).reduce((s, e) => s + parseFloat(String(e.amount)), 0)
  const pendingPayoutsAmount = (payoutsRes.data || []).reduce((s, p) => s + parseFloat(String(p.amount)), 0)
  const activeLGs = lgs.filter(l => l.status === 'active').length
  const pendingLGs = lgs.filter(l => l.status === 'pending').length
  const totalProspects = prospects.length
  const converted = pipeline['converted'] || 0
  const conversionRate = totalProspects > 0 ? ((converted / totalProspects) * 100).toFixed(1) : '0.0'
  const overdue = prospects.filter(p =>
    p.follow_up_date && (p.follow_up_date as string) < today && !['converted', 'lost'].includes(p.stage as string)
  ).length
  const highPriority = prospects.filter(p =>
    (p.priority === 'high' || p.priority === 'urgent') && !['converted', 'lost'].includes(p.stage as string)
  ).length

  const dashboardData = {
    kpis: {
      active_lgs: activeLGs,
      pending_lgs: pendingLGs,
      total_prospects: totalProspects,
      active_prospects: totalProspects - (pipeline['converted'] || 0) - (pipeline['lost'] || 0),
      conversion_rate: conversionRate,
      month_earnings: monthEarnings,
      pending_payouts: pendingPayoutsAmount,
      overdue_follow_ups: overdue,
      high_priority: highPriority,
      active_communities: (communitiesRes.data || []).filter(c => c.status === 'active').length,
    },
    pipeline,
    today_scorecard: todayScorecardRes.data || null,
    recent_activities: recentActivityRes.data || [],
  }

  return (
    <AdminGenxClient
      lgs={lgsRes.data || []}
      prospects={prospectsRes.data || []}
      communities={communitiesRes.data || []}
      scorecards={scorecardsRes.data || []}
      pendingPayouts={payoutsRes.data || []}
      dashboardData={dashboardData}
    />
  )
}
