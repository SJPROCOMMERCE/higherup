import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import AdminGenxClient from './AdminGenxClient'

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function AdminGenxPage() {
  const cookieStore = await cookies()
  const adminSession = cookieStore.get('admin_session')?.value
  if (!adminSession) redirect('/admin/login')

  const db = adminDb()
  const today = new Date().toISOString().slice(0, 10)
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [
    lgsRes,
    rtRes,
    earningsRes,
    payoutsRes,
    prospectsRes,
    communitiesRes,
    scorecardsRes,
    recentActivityRes,
    todayScorecardRes,
  ] = await Promise.all([
    db.from('lead_generators')
      .select('*')
      .order('joined_at', { ascending: false }),
    db.from('referral_tracking').select('lg_id, status'),
    db.from('lg_earnings').select('lg_id, amount'),
    db.from('lg_payouts').select('id, lg_id, period_start, amount, status').eq('status', 'pending').order('period_start', { ascending: false }),
    db.from('admin_prospects').select('*, admin_communities(name)').order('updated_at', { ascending: false }),
    db.from('admin_communities').select('*').order('created_at', { ascending: false }),
    db.from('admin_daily_scorecard').select('*').gte('score_date', monthAgo).order('score_date', { ascending: false }),
    db.from('admin_prospect_activities').select('*, admin_prospects(name)').order('created_at', { ascending: false }).limit(20),
    db.from('admin_daily_scorecard').select('*').eq('score_date', today).maybeSingle(),
  ])

  // Build lookup maps
  const totalVasMap:  Record<string, number> = {}
  const activeVasMap: Record<string, number> = {}
  const earnedMap:    Record<string, number> = {}

  for (const r of rtRes.data || []) {
    const id = r.lg_id as string
    totalVasMap[id] = (totalVasMap[id] || 0) + 1
    if ((r.status as string) === 'active') {
      activeVasMap[id] = (activeVasMap[id] || 0) + 1
    }
  }
  for (const e of earningsRes.data || []) {
    const id = e.lg_id as string
    earnedMap[id] = (earnedMap[id] || 0) + parseFloat(String(e.amount || 0))
  }

  const lgs = (lgsRes.data || []).map(lg => ({
    id:                (lg.id as string) || '',
    display_name:      (lg.display_name as string) || '',
    login_code:        (lg.login_code as string) || '',
    email:             (lg.email as string) || null,
    status:            (lg.status as string) || 'pending',
    referral_code:     (lg.referral_code as string) || '',
    joined_at:         (lg.joined_at as string) || (lg.created_at as string) || null,
    total_vas:         totalVasMap[lg.id as string]  || 0,
    active_vas:        activeVasMap[lg.id as string] || 0,
    total_earned:      Math.round((earnedMap[lg.id as string] || 0) * 100) / 100,
    referral_count:    totalVasMap[lg.id as string]  || 0,
    onboarding_status: (lg.onboarding_status as string) || null,
    lg_tier:           (lg.lg_tier as string) || null,
    community_id:      (lg.community_id as string) || null,
    recruiter_notes:   (lg.recruiter_notes as string) || null,
    last_active_at:    (lg.last_active_at as string) || null,
  }))

  const prospects = prospectsRes.data || []

  // Pipeline counts
  const stages = ['lead', 'contacted', 'interested', 'scheduled', 'converted', 'lost']
  const pipeline: Record<string, number> = {}
  for (const s of stages) pipeline[s] = 0
  for (const p of prospects) pipeline[p.stage as string] = (pipeline[p.stage as string] || 0) + 1

  // KPIs
  const totalEarnings = Object.values(earnedMap).reduce((s, v) => s + v, 0)
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
      month_earnings: totalEarnings,
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
      lgs={lgs}
      prospects={prospectsRes.data || []}
      communities={communitiesRes.data || []}
      scorecards={scorecardsRes.data || []}
      pendingPayouts={payoutsRes.data || []}
      dashboardData={dashboardData}
    />
  )
}
