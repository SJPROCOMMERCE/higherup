import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`
  if (m < 1440) return `${(m / 60).toFixed(1)} hours`
  return `${(m / 1440).toFixed(1)} days`
}

function formatWaiting(m: number): string {
  if (m < 60) return `${m} min ago`
  if (m < 1440) return `${Math.round(m / 60)}h ago`
  return `${Math.round(m / 1440)}d ago`
}

export async function GET() {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const db = genxDb()
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // 1. Unreplied — waiting responses
  const { data: waitingLogs } = await db
    .from('admin_response_speed_log')
    .select('id, prospect_id, reply_at, reply_channel')
    .eq('status', 'waiting')
    .order('reply_at', { ascending: true })

  // Get prospect names for waiting
  const waitingProspectIds = (waitingLogs || []).map(w => w.prospect_id)
  let prospectNames: Record<string, string> = {}
  if (waitingProspectIds.length > 0) {
    const { data: prospects } = await db
      .from('admin_prospects')
      .select('id, name')
      .in('id', waitingProspectIds)
    for (const p of prospects || []) {
      prospectNames[p.id] = p.name
    }
  }

  const unreplied = {
    count: (waitingLogs || []).length,
    prospects: (waitingLogs || []).map(w => {
      const waitingMinutes = Math.round((now.getTime() - new Date(w.reply_at).getTime()) / 60000)
      return {
        id: w.prospect_id,
        name: prospectNames[w.prospect_id] || 'Unknown',
        channel: w.reply_channel,
        waiting_minutes: waitingMinutes,
        waiting_display: formatWaiting(waitingMinutes),
      }
    }),
  }

  // 2. Speed stats — last 30 days responded entries
  const { data: respondedLogs } = await db
    .from('admin_response_speed_log')
    .select('response_time_minutes, response_by, reply_at')
    .eq('status', 'responded')
    .gte('reply_at', thirtyDaysAgo)
    .not('response_time_minutes', 'is', null)

  const responded = respondedLogs || []
  const totalReplies = responded.length
  const allMinutes = responded.map(r => r.response_time_minutes as number)
  const avgMinutes = totalReplies > 0 ? Math.round(allMinutes.reduce((a, b) => a + b, 0) / totalReplies) : 0

  const within5 = allMinutes.filter(m => m <= 5).length
  const within1hr = allMinutes.filter(m => m <= 60).length
  const within24hr = allMinutes.filter(m => m <= 1440).length

  // Expired count
  const { count: expiredCount } = await db
    .from('admin_response_speed_log')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'expired')

  const speed_stats = {
    avg_minutes: avgMinutes,
    avg_display: totalReplies > 0 ? formatMinutes(avgMinutes) : 'N/A',
    total_replies: totalReplies,
    within_5min: within5,
    within_5min_pct: totalReplies > 0 ? Math.round((within5 / totalReplies) * 100) : 0,
    within_1hr: within1hr,
    within_1hr_pct: totalReplies > 0 ? Math.round((within1hr / totalReplies) * 100) : 0,
    within_24hr: within24hr,
    within_24hr_pct: totalReplies > 0 ? Math.round((within24hr / totalReplies) * 100) : 0,
    expired_count: expiredCount || 0,
  }

  // 3. Per person stats
  const per_person: Record<string, { avg_minutes: number; count: number }> = {}
  for (const r of responded) {
    const by = r.response_by || 'unknown'
    if (!per_person[by]) per_person[by] = { avg_minutes: 0, count: 0 }
    per_person[by].avg_minutes += r.response_time_minutes as number
    per_person[by].count += 1
  }
  for (const key of Object.keys(per_person)) {
    per_person[key].avg_minutes = Math.round(per_person[key].avg_minutes / per_person[key].count)
  }

  // 4. Weekly trend (last 8 weeks)
  const eightWeeksAgo = new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000).toISOString()
  const { data: trendLogs } = await db
    .from('admin_response_speed_log')
    .select('reply_at, response_time_minutes')
    .eq('status', 'responded')
    .gte('reply_at', eightWeeksAgo)
    .not('response_time_minutes', 'is', null)

  // Group by ISO week start (Monday)
  const weekBuckets: Record<string, { total: number; count: number }> = {}
  for (const r of trendLogs || []) {
    const d = new Date(r.reply_at)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
    const monday = new Date(d)
    monday.setDate(diff)
    const weekKey = monday.toISOString().slice(0, 10)
    if (!weekBuckets[weekKey]) weekBuckets[weekKey] = { total: 0, count: 0 }
    weekBuckets[weekKey].total += r.response_time_minutes as number
    weekBuckets[weekKey].count += 1
  }

  const trend = Object.entries(weekBuckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, { total, count }]) => ({
      week,
      avg_minutes: Math.round(total / count),
      count,
    }))

  return Response.json({ unreplied, speed_stats, per_person, trend })
}
