import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

function getWeekStart(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now)
  monday.setDate(diff)
  return monday.toISOString().slice(0, 10)
}

export async function GET() {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const weekStart = getWeekStart()
  const db = genxDb()
  const { data, error } = await db
    .from('lg_weekly_activity')
    .select('*')
    .eq('lg_id', session.lgId)
    .eq('week_start', weekStart)
    .order('day_of_week', { ascending: true })

  if (error) {
    console.error('[genx/toolkit/planner] GET error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ week_start: weekStart, days: data || [] })
}

export async function PATCH(req: Request) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { day_of_week, field, delta } = body

  if (day_of_week === undefined || !field || delta === undefined) {
    return Response.json({ error: 'day_of_week, field, and delta are required' }, { status: 400 })
  }

  const allowed = ['dms_sent', 'posts_made', 'followups_sent', 'calls_made']
  if (!allowed.includes(field)) {
    return Response.json({ error: 'Invalid field' }, { status: 400 })
  }

  const weekStart = getWeekStart()
  const db = genxDb()

  // Get existing row or create it
  const { data: existing } = await db
    .from('lg_weekly_activity')
    .select('*')
    .eq('lg_id', session.lgId)
    .eq('week_start', weekStart)
    .eq('day_of_week', day_of_week)
    .single()

  const now = new Date().toISOString()

  if (!existing) {
    const row: Record<string, unknown> = {
      lg_id: session.lgId,
      week_start: weekStart,
      day_of_week,
      dms_sent: 0,
      posts_made: 0,
      followups_sent: 0,
      calls_made: 0,
    }
    row[field] = Math.max(0, delta)
    const { data, error } = await db
      .from('lg_weekly_activity')
      .insert(row)
      .select()
      .single()
    if (error) {
      console.error('[genx/toolkit/planner] INSERT error:', error)
      return Response.json({ error: error.message }, { status: 500 })
    }
    return Response.json({ day: data })
  }

  const currentVal = (existing[field] as number) || 0
  const newVal = Math.max(0, currentVal + delta)

  const { data, error } = await db
    .from('lg_weekly_activity')
    .update({ [field]: newVal, updated_at: now })
    .eq('id', (existing as { id: string }).id)
    .select()
    .single()

  if (error) {
    console.error('[genx/toolkit/planner] UPDATE error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ day: data })
}
