import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

export async function GET() {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const db = genxDb()
  const now = new Date().toISOString()
  const fourteenDays = new Date(Date.now() + 14 * 86400000).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

  // 1. Due now — scheduled_at has passed, still status = scheduled
  const { data: dueNow } = await db
    .from('admin_reactivation_cycles')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })

  // Get prospect data for due cycles
  const dueProspectIds = [...new Set((dueNow || []).map(c => c.prospect_id))]
  const { data: dueProspects } = dueProspectIds.length > 0
    ? await db.from('admin_prospects').select('id, name, platform, handle, loss_reason, times_lost, times_reactivated').in('id', dueProspectIds)
    : { data: [] }
  const prospectMap: Record<string, { name: string; platform: string | null; handle: string | null; loss_reason: string | null; times_lost: number; times_reactivated: number }> = {}
  for (const p of dueProspects || []) {
    prospectMap[p.id] = { name: p.name, platform: p.platform, handle: p.handle, loss_reason: p.loss_reason, times_lost: p.times_lost || 0, times_reactivated: p.times_reactivated || 0 }
  }

  // 2. Upcoming — next 14 days
  const { data: upcoming } = await db
    .from('admin_reactivation_cycles')
    .select('*')
    .eq('status', 'scheduled')
    .gt('scheduled_at', now)
    .lte('scheduled_at', fourteenDays)
    .order('scheduled_at', { ascending: true })

  const upcomingProspectIds = [...new Set((upcoming || []).map(c => c.prospect_id))]
  const { data: upcomingProspects } = upcomingProspectIds.length > 0
    ? await db.from('admin_prospects').select('id, name, loss_reason').in('id', upcomingProspectIds)
    : { data: [] }
  const upProspectMap: Record<string, { name: string; loss_reason: string | null }> = {}
  for (const p of upcomingProspects || []) {
    upProspectMap[p.id] = { name: p.name, loss_reason: p.loss_reason }
  }

  // 3. Recent results — last 30 days
  const { data: recentResults } = await db
    .from('admin_reactivation_cycles')
    .select('*')
    .in('status', ['sent', 'converted', 'declined_again', 'skipped'])
    .gte('executed_at', thirtyDaysAgo)
    .order('executed_at', { ascending: false })

  const recentProspectIds = [...new Set((recentResults || []).map(c => c.prospect_id))]
  const { data: recentProspects } = recentProspectIds.length > 0
    ? await db.from('admin_prospects').select('id, name, loss_reason').in('id', recentProspectIds)
    : { data: [] }
  const recentMap: Record<string, { name: string; loss_reason: string | null }> = {}
  for (const p of recentProspects || []) {
    recentMap[p.id] = { name: p.name, loss_reason: p.loss_reason }
  }

  // 4. Stats
  const totalSent = (recentResults || []).filter(r => ['sent', 'converted', 'declined_again'].includes(r.status)).length
  const totalConverted = (recentResults || []).filter(r => r.status === 'converted').length
  const totalDeclinedAgain = (recentResults || []).filter(r => r.status === 'declined_again').length
  const conversionRate = totalSent > 0 ? Math.round(totalConverted / totalSent * 100) : 0

  const convertedByReason: Record<string, number> = {}
  for (const r of recentResults || []) {
    if (r.status === 'converted') {
      const lossReason = recentMap[r.prospect_id]?.loss_reason
      if (lossReason) convertedByReason[lossReason] = (convertedByReason[lossReason] || 0) + 1
    }
  }

  // 5. Platform stats for placeholder filling
  const { data: activeLgs } = await db
    .from('lead_generators')
    .select('id, total_earned')
    .eq('status', 'active')

  const activeLgCount = activeLgs?.length || 0
  const topEarner = activeLgs?.reduce((max, lg) => {
    const earned = parseFloat(String(lg.total_earned || 0))
    return earned > max ? earned : max
  }, 0) || 0

  return Response.json({
    due_now: {
      count: dueNow?.length || 0,
      cycles: (dueNow || []).map(c => ({
        ...c,
        days_overdue: Math.round((Date.now() - new Date(c.scheduled_at).getTime()) / 86400000),
        prospect_name: prospectMap[c.prospect_id]?.name,
        prospect_platform: prospectMap[c.prospect_id]?.platform,
        prospect_handle: prospectMap[c.prospect_id]?.handle,
        prospect_loss_reason: prospectMap[c.prospect_id]?.loss_reason,
        prospect_times_lost: prospectMap[c.prospect_id]?.times_lost,
        prospect_times_reactivated: prospectMap[c.prospect_id]?.times_reactivated,
      })),
    },
    upcoming: {
      count: upcoming?.length || 0,
      cycles: (upcoming || []).map(c => ({
        ...c,
        days_until: Math.round((new Date(c.scheduled_at).getTime() - Date.now()) / 86400000),
        prospect_name: upProspectMap[c.prospect_id]?.name,
        prospect_loss_reason: upProspectMap[c.prospect_id]?.loss_reason,
      })),
    },
    stats: {
      sent_last_30_days: totalSent,
      converted: totalConverted,
      declined_again: totalDeclinedAgain,
      conversion_rate: conversionRate,
      converted_by_reason: convertedByReason,
    },
    recent_results: (recentResults || []).map(r => ({
      ...r,
      prospect_name: recentMap[r.prospect_id]?.name,
      prospect_loss_reason: recentMap[r.prospect_id]?.loss_reason,
    })),
    platform_stats: {
      active_lgs: activeLgCount,
      top_earner_amount: topEarner > 0 ? `$${topEarner.toFixed(0)}` : '$0',
    },
  })
}
