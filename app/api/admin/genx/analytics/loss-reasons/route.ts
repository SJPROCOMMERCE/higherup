import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

const REASON_LABELS: Record<string, string> = {
  wants_fixed_fee: 'Wants a fixed monthly fee',
  thinks_scam: 'Thinks it is a scam',
  thinks_mlm: 'Thinks it is MLM',
  no_network: 'Has no VA network',
  no_time: 'No time to recruit',
  no_reply_5plus: 'No reply after 5+ attempts',
  no_reply_initial: 'No reply to first message',
  uses_competitor: 'Already uses a competitor',
  not_interested_listing: 'Not interested in listing work',
  too_complicated: 'Thinks it is too complicated',
  bad_timing: 'Bad timing',
  other: 'Other',
}

function generateRecommendations(reasons: { reason: string; percentage: number }[]): string[] {
  const recs: string[] = []
  for (const r of reasons) {
    if (r.percentage < 25) continue
    switch (r.reason) {
      case 'wants_fixed_fee':
        recs.push(`${r.percentage}% of lost prospects want a fixed fee. Your commission pitch needs work. Use the fixed vs commission presentation in every pitch call.`)
        break
      case 'thinks_scam':
      case 'thinks_mlm':
        recs.push(`${r.percentage}% think it's a scam or MLM. Lead with social proof: real earnings screenshots, real VA testimonials, link to higherup.me.`)
        break
      case 'no_reply_5plus':
      case 'no_reply_initial':
        recs.push(`${r.percentage}% never replied. Test different first-contact scripts. Try a different channel for the same prospects.`)
        break
      case 'no_network':
      case 'not_interested_listing':
        recs.push(`${r.percentage}% were the wrong prospect type. Improve your targeting. Focus on VA community leaders and agency owners.`)
        break
      case 'no_time':
        recs.push(`${r.percentage}% said no time. Emphasize that it takes only 30 minutes per day. Send the daily scorecard example.`)
        break
      case 'too_complicated':
        recs.push(`${r.percentage}% found it too complicated. Simplify your explanation. Use the "LG in 60 seconds" pitch.`)
        break
      case 'uses_competitor':
        recs.push(`${r.percentage}% already use an alternative. Prepare competitive comparisons and send them proactively.`)
        break
      case 'bad_timing':
        recs.push(`${r.percentage}% had bad timing. These are your easiest reactivations. Follow up in 2-4 weeks.`)
        break
    }
  }
  return recs
}

export async function GET() {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const db = genxDb()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
  const eightWeeksAgo = new Date(Date.now() - 56 * 86400000).toISOString()

  // 1. Loss history last 30 days
  const { data: losses } = await db
    .from('admin_prospect_loss_history')
    .select('loss_reason, channel, days_in_pipeline, stage_before')
    .gte('lost_at', thirtyDaysAgo)

  const reasonCounts: Record<string, number> = {}
  const byChannel: Record<string, Record<string, number>> = {}
  let totalLost = 0
  let totalDays = 0

  for (const r of losses || []) {
    totalLost++
    reasonCounts[r.loss_reason] = (reasonCounts[r.loss_reason] || 0) + 1
    totalDays += r.days_in_pipeline || 0
    if (r.channel) {
      if (!byChannel[r.channel]) byChannel[r.channel] = {}
      byChannel[r.channel][r.loss_reason] = (byChannel[r.channel][r.loss_reason] || 0) + 1
    }
  }

  const sortedReasons = Object.entries(reasonCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([reason, count]) => ({
      reason,
      label: REASON_LABELS[reason] || reason,
      count,
      percentage: totalLost > 0 ? Math.round((count / totalLost) * 100) : 0,
    }))

  // 2. Weekly trend
  const { data: trendData } = await db
    .from('admin_prospect_loss_history')
    .select('lost_at')
    .gte('lost_at', eightWeeksAgo)

  const weekBuckets: Record<string, number> = {}
  for (const d of trendData || []) {
    const dt = new Date(d.lost_at)
    const day = dt.getDay()
    const diff = dt.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(dt)
    monday.setDate(diff)
    const key = monday.toISOString().slice(0, 10)
    weekBuckets[key] = (weekBuckets[key] || 0) + 1
  }

  // 3. Reactivation due
  const { data: reactivationDue } = await db
    .from('admin_prospects')
    .select('id, name, loss_reason, lost_at, revisit_at, platform, times_lost')
    .not('revisit_at', 'is', null)
    .lte('revisit_at', new Date().toISOString())
    .in('stage', ['lost', 'declined'])
    .order('revisit_at', { ascending: true })

  return Response.json({
    total_lost: totalLost,
    reasons: sortedReasons,
    top_reason: sortedReasons[0] || null,
    by_channel: byChannel,
    avg_days_in_pipeline: totalLost > 0 ? Math.round(totalDays / totalLost) : 0,
    recommendations: generateRecommendations(sortedReasons),
    weekly_trend: Object.entries(weekBuckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, count]) => ({ week, count })),
    reactivation_due: (reactivationDue || []).map(r => ({
      id: r.id,
      name: r.name,
      loss_reason: r.loss_reason,
      lost_at: r.lost_at,
      revisit_at: r.revisit_at,
      platform: r.platform,
      times_lost: r.times_lost || 1,
      days_since_lost: r.lost_at ? Math.round((Date.now() - new Date(r.lost_at).getTime()) / 86400000) : 0,
      loss_reason_label: REASON_LABELS[r.loss_reason] || r.loss_reason,
    })),
  })
}
