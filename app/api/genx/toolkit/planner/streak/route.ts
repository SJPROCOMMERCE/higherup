import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

export async function GET() {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const db = genxDb()

  // Get all weekly activity ordered by week desc
  const { data, error } = await db
    .from('lg_weekly_activity')
    .select('week_start, dms_sent, posts_made, followups_sent, calls_made')
    .eq('lg_id', session.lgId)
    .order('week_start', { ascending: false })
    .limit(52)

  if (error) {
    console.error('[genx/toolkit/planner/streak] GET error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Group by week and sum activity
  const weekMap: Record<string, number> = {}
  for (const row of data || []) {
    const ws = row.week_start as string
    const total = (row.dms_sent as number || 0)
      + (row.posts_made as number || 0)
      + (row.followups_sent as number || 0)
      + (row.calls_made as number || 0)
    weekMap[ws] = (weekMap[ws] || 0) + total
  }

  // Calculate current week streak (consecutive active weeks ending this week)
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const thisMonday = new Date(now)
  thisMonday.setDate(diff)

  let streak = 0
  const cursor = new Date(thisMonday)

  while (true) {
    const key = cursor.toISOString().slice(0, 10)
    if (weekMap[key] && weekMap[key] > 0) {
      streak++
      cursor.setDate(cursor.getDate() - 7)
    } else {
      break
    }
  }

  // Total activity this week
  const thisWeekKey = thisMonday.toISOString().slice(0, 10)
  const thisWeekTotal = weekMap[thisWeekKey] || 0

  return Response.json({ streak, this_week_total: thisWeekTotal })
}
