import { genxDb, toMonthDate } from '@/lib/genx-db'
import { getCurrentBillingMonth } from '@/lib/usage-tracker'
import { cookies } from 'next/headers'

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

export async function GET() {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const db = genxDb()
  const currentMonth = getCurrentBillingMonth()
  const today = new Date().toISOString().slice(0, 10)

  const [
    lgsRes,
    prospectsRes,
    communitiesRes,
    earningsRes,
    payoutsRes,
    scorecardRes,
    recentActivityRes,
  ] = await Promise.all([
    db.from('lead_generators').select('id, status, display_name, created_at, total_earnings, total_referred, active_referred, onboarding_status, lg_tier'),
    db.from('admin_prospects').select('id, stage, priority, follow_up_date, created_at'),
    db.from('admin_communities').select('id, status'),
    db.from('lg_earnings').select('amount').eq('billing_month', toMonthDate(currentMonth)),
    db.from('lg_payouts').select('amount').eq('status', 'pending'),
    db.from('admin_daily_scorecard').select('*').eq('score_date', today).maybeSingle(),
    db.from('admin_prospect_activities').select('*, admin_prospects(name)').order('created_at', { ascending: false }).limit(20),
  ])

  const lgs = lgsRes.data || []
  const prospects = prospectsRes.data || []
  const communities = communitiesRes.data || []

  // Pipeline funnel
  const stages = ['lead', 'contacted', 'interested', 'scheduled', 'converted', 'lost']
  const pipeline: Record<string, number> = {}
  for (const s of stages) pipeline[s] = 0
  for (const p of prospects) pipeline[p.stage as string] = (pipeline[p.stage as string] || 0) + 1

  // Overdue follow-ups
  const overdue = prospects.filter(p =>
    p.follow_up_date && p.follow_up_date < today && !['converted', 'lost'].includes(p.stage as string)
  ).length

  // High priority prospects
  const highPriority = prospects.filter(p =>
    (p.priority === 'high' || p.priority === 'urgent') && !['converted', 'lost'].includes(p.stage as string)
  ).length

  // This month earnings
  const monthEarnings = (earningsRes.data || []).reduce((s, e) => s + parseFloat(String(e.amount)), 0)
  const pendingPayouts = (payoutsRes.data || []).reduce((s, p) => s + parseFloat(String(p.amount)), 0)

  // LG stats
  const activeLGs = lgs.filter(l => l.status === 'active').length
  const pendingLGs = lgs.filter(l => l.status === 'pending').length

  // Conversion rate
  const totalProspects = prospects.length
  const converted = pipeline['converted'] || 0
  const conversionRate = totalProspects > 0 ? ((converted / totalProspects) * 100).toFixed(1) : '0.0'

  return Response.json({
    kpis: {
      active_lgs: activeLGs,
      pending_lgs: pendingLGs,
      total_prospects: totalProspects,
      active_prospects: totalProspects - (pipeline['converted'] || 0) - (pipeline['lost'] || 0),
      conversion_rate: conversionRate,
      month_earnings: monthEarnings,
      pending_payouts: pendingPayouts,
      overdue_follow_ups: overdue,
      high_priority: highPriority,
      active_communities: communities.filter(c => c.status === 'active').length,
    },
    pipeline,
    today_scorecard: scorecardRes.data || null,
    recent_activities: recentActivityRes.data || [],
  })
}
