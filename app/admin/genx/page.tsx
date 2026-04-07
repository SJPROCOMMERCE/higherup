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

async function safeQuery(promise: PromiseLike<{ data: unknown; error: unknown }>) {
  try {
    const res = await promise
    return res.data
  } catch {
    return null
  }
}

export default async function AdminGenxPage() {
  const cookieStore = await cookies()
  const adminSession = cookieStore.get('admin_session')?.value
  if (!adminSession) redirect('/admin/login')

  try {
    const db = adminDb()
    const today = new Date().toISOString().slice(0, 10)
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    // Fetch all data safely — no joins to avoid PostgREST FK issues
    const [lgsData, rtData, earningsData, payoutsData, prospectsData, communitiesData, scorecardsData, activitiesData, todayScoreData] = await Promise.all([
      safeQuery(db.from('lead_generators').select('*').order('joined_at', { ascending: false })),
      safeQuery(db.from('referral_tracking').select('lg_id, status')),
      safeQuery(db.from('lg_earnings').select('lg_id, amount')),
      safeQuery(db.from('lg_payouts').select('id, lg_id, period_start, amount, status').eq('status', 'pending').order('period_start', { ascending: false })),
      safeQuery(db.from('admin_prospects').select('*').order('updated_at', { ascending: false })),
      safeQuery(db.from('admin_communities').select('*').order('created_at', { ascending: false })),
      safeQuery(db.from('admin_daily_scorecard').select('*').gte('score_date', monthAgo).order('score_date', { ascending: false })),
      safeQuery(db.from('admin_prospect_activities').select('*').order('created_at', { ascending: false }).limit(20)),
      safeQuery(db.from('admin_daily_scorecard').select('*').eq('score_date', today).maybeSingle()),
    ])

    const rawLgs = (lgsData as Record<string, unknown>[]) || []
    const rawRt = (rtData as Record<string, unknown>[]) || []
    const rawEarnings = (earningsData as Record<string, unknown>[]) || []
    const rawPayouts = (payoutsData as Record<string, unknown>[]) || []
    const rawProspects = (prospectsData as Record<string, unknown>[]) || []
    const rawCommunities = (communitiesData as Record<string, unknown>[]) || []
    const rawScorecards = (scorecardsData as Record<string, unknown>[]) || []
    const rawActivities = (activitiesData as Record<string, unknown>[]) || []

    // Build lookup maps
    const totalVasMap:  Record<string, number> = {}
    const activeVasMap: Record<string, number> = {}
    const earnedMap:    Record<string, number> = {}

    for (const r of rawRt) {
      const id = r.lg_id as string
      totalVasMap[id] = (totalVasMap[id] || 0) + 1
      if ((r.status as string) === 'active') {
        activeVasMap[id] = (activeVasMap[id] || 0) + 1
      }
    }
    for (const e of rawEarnings) {
      const id = e.lg_id as string
      earnedMap[id] = (earnedMap[id] || 0) + parseFloat(String(e.amount || 0))
    }

    // Build community name lookup for prospects
    const communityNames: Record<string, string> = {}
    for (const c of rawCommunities) {
      communityNames[c.id as string] = c.name as string
    }

    const lgs = rawLgs.map(lg => ({
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

    // Enrich prospects with community names
    const prospects = rawProspects.map(p => ({
      ...p,
      admin_communities: p.community_id ? { name: communityNames[p.community_id as string] || null } : null,
    }))

    // Enrich activities with prospect names
    const prospectNames: Record<string, string> = {}
    for (const p of rawProspects) {
      prospectNames[p.id as string] = p.name as string
    }
    const activities = rawActivities.map(a => ({
      ...a,
      admin_prospects: a.prospect_id ? { name: prospectNames[a.prospect_id as string] || 'Prospect' } : null,
    }))

    // Pipeline counts
    const stages = ['lead', 'contacted', 'interested', 'scheduled', 'converted', 'lost']
    const pipeline: Record<string, number> = {}
    for (const s of stages) pipeline[s] = 0
    for (const p of rawProspects) pipeline[p.stage as string] = (pipeline[p.stage as string] || 0) + 1

    // KPIs
    const totalEarnings = Object.values(earnedMap).reduce((s, v) => s + v, 0)
    const pendingPayoutsAmount = rawPayouts.reduce((s, p) => s + parseFloat(String(p.amount || 0)), 0)
    const activeLGs = lgs.filter(l => l.status === 'active').length
    const pendingLGs = lgs.filter(l => l.status === 'pending').length
    const totalProspects = rawProspects.length
    const converted = pipeline['converted'] || 0
    const conversionRate = totalProspects > 0 ? ((converted / totalProspects) * 100).toFixed(1) : '0.0'
    const overdue = rawProspects.filter(p =>
      p.follow_up_date && (p.follow_up_date as string) < today && !['converted', 'lost'].includes(p.stage as string)
    ).length
    const highPriority = rawProspects.filter(p =>
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
        active_communities: rawCommunities.filter(c => c.status === 'active').length,
      },
      pipeline,
      today_scorecard: (todayScoreData as Record<string, unknown>) || null,
      recent_activities: activities,
    }

    return (
      <AdminGenxClient
        lgs={lgs}
        prospects={prospects as never[]}
        communities={rawCommunities as never[]}
        scorecards={rawScorecards as never[]}
        pendingPayouts={rawPayouts as never[]}
        dashboardData={dashboardData as never}
      />
    )
  } catch (err) {
    // Fallback: show basic page with error info
    return (
      <div style={{ padding: 40, fontFamily: 'Inter, sans-serif' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>GENX CRM — Loading Error</h1>
        <p style={{ color: '#666', marginTop: 12 }}>Er is een fout opgetreden bij het laden van de data:</p>
        <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, fontSize: 13, marginTop: 12, overflow: 'auto' }}>
          {String(err)}
        </pre>
        <p style={{ color: '#666', marginTop: 12 }}>Controleer of alle SQL migraties zijn uitgevoerd in Supabase.</p>
        <a href="/admin/genx" style={{ color: '#2563EB', marginTop: 16, display: 'inline-block' }}>Probeer opnieuw</a>
      </div>
    )
  }
}
