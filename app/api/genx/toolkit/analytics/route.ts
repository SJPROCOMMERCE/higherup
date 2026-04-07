import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

function getWeekStart(weeksAgo = 0): string {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) - weeksAgo * 7
  const monday = new Date(now)
  monday.setDate(diff)
  return monday.toISOString().slice(0, 10)
}

export async function GET() {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const lgId = session.lgId
  const db = genxDb()

  const [contactsRes, myScriptsRes, plannerRes] = await Promise.all([
    db.from('lg_contacts').select('status, channel, created_at').eq('lg_id', lgId).eq('is_archived', false),
    db.from('lg_custom_scripts').select('title, times_used, times_replied, times_converted').eq('lg_id', lgId),
    db.from('lg_weekly_activity')
      .select('week_start, dms_sent, posts_made, followups_sent, calls_made')
      .eq('lg_id', lgId)
      .gte('week_start', getWeekStart(3))
      .order('week_start', { ascending: true }),
  ])

  const contacts = contactsRes.data || []

  // Conversion funnel
  const statusOrder = ['prospect', 'contacted', 'interested', 'signed_up', 'active', 'lost']
  const funnelCounts: Record<string, number> = {}
  for (const s of statusOrder) funnelCounts[s] = 0
  for (const c of contacts) {
    const s = c.status as string
    funnelCounts[s] = (funnelCounts[s] || 0) + 1
  }
  const funnel = statusOrder.map(s => ({ status: s, count: funnelCounts[s] || 0 }))

  // Channel performance
  const channelMap: Record<string, { total: number; converted: number }> = {}
  for (const c of contacts) {
    const ch = (c.channel as string) || 'other'
    if (!channelMap[ch]) channelMap[ch] = { total: 0, converted: 0 }
    channelMap[ch].total++
    if (c.status === 'signed_up' || c.status === 'active') channelMap[ch].converted++
  }
  const channels = Object.entries(channelMap)
    .map(([channel, d]) => ({
      channel,
      total: d.total,
      converted: d.converted,
      rate: d.total > 0 ? Math.round(d.converted / d.total * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)

  // Script performance (top 10 used)
  const scripts = (myScriptsRes.data || [])
    .filter(s => (s.times_used as number) > 0)
    .sort((a, b) => (b.times_used as number) - (a.times_used as number))
    .slice(0, 10)
    .map(s => ({
      title: s.title,
      used: s.times_used,
      replied: s.times_replied,
      converted: s.times_converted,
      reply_rate: (s.times_used as number) > 0 ? Math.round((s.times_replied as number) / (s.times_used as number) * 100) : 0,
      conv_rate: (s.times_used as number) > 0 ? Math.round((s.times_converted as number) / (s.times_used as number) * 100) : 0,
    }))

  // Weekly activity (last 4 weeks)
  const weekMap: Record<string, { dms: number; posts: number; followups: number; calls: number }> = {}
  for (let w = 3; w >= 0; w--) {
    const key = getWeekStart(w)
    weekMap[key] = { dms: 0, posts: 0, followups: 0, calls: 0 }
  }
  for (const row of plannerRes.data || []) {
    const key = row.week_start as string
    if (weekMap[key]) {
      weekMap[key].dms += (row.dms_sent as number) || 0
      weekMap[key].posts += (row.posts_made as number) || 0
      weekMap[key].followups += (row.followups_sent as number) || 0
      weekMap[key].calls += (row.calls_made as number) || 0
    }
  }
  const weeklyActivity = Object.entries(weekMap).map(([week, d]) => ({
    week,
    total: d.dms + d.posts + d.followups + d.calls,
    ...d,
  }))

  return Response.json({
    funnel,
    channels,
    scripts,
    weekly_activity: weeklyActivity,
    totals: {
      contacts: contacts.length,
      contacted: funnelCounts['contacted'] || 0,
      interested: funnelCounts['interested'] || 0,
      signed_up: (funnelCounts['signed_up'] || 0) + (funnelCounts['active'] || 0),
      conversion_rate: contacts.length > 0
        ? Math.round(((funnelCounts['signed_up'] || 0) + (funnelCounts['active'] || 0)) / contacts.length * 100)
        : 0,
    },
  })
}
