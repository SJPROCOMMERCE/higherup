// Planner route — proxies to the existing weekly route logic
// Kept separate for V2 URL structure; weekly route still works too

import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'
import { NextRequest } from 'next/server'

function getWeekStart(): string {
  const now = new Date()
  const day = now.getUTCDay()
  const diff = day === 0 ? 6 : day - 1
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - diff)
  return monday.toISOString().split('T')[0]
}

export async function GET() {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const weekStart = getWeekStart()
  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7)

  const db = genxDb()

  const [activityRes, signupsRes] = await Promise.all([
    db.from('lg_weekly_activity')
      .select('day_of_week, dms_sent, posts_made, followups_sent')
      .eq('lg_id', session.lgId)
      .eq('week_start', weekStart),
    db.from('referral_tracking')
      .select('id')
      .eq('lg_id', session.lgId)
      .gte('referred_at', weekStart)
      .lt('referred_at', weekEnd.toISOString()),
  ])

  const days = Array.from({ length: 7 }, (_, i) => {
    const found = (activityRes.data || []).find((r: Record<string, unknown>) => r.day_of_week === i)
    return {
      day_of_week:    i,
      dms_sent:       (found?.dms_sent as number) || 0,
      posts_made:     (found?.posts_made as number) || 0,
      followups_sent: (found?.followups_sent as number) || 0,
    }
  })

  return Response.json({
    week_start: weekStart,
    days,
    signups_this_week: (signupsRes.data || []).length,
  })
}

export async function PATCH(req: NextRequest) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { day_of_week, field, increment } = await req.json()
  if (typeof day_of_week !== 'number' || !['dms_sent', 'posts_made', 'followups_sent'].includes(field)) {
    return Response.json({ error: 'invalid params' }, { status: 400 })
  }

  const weekStart = getWeekStart()
  const db = genxDb()

  const { data: existing } = await db
    .from('lg_weekly_activity')
    .select('id, dms_sent, posts_made, followups_sent')
    .eq('lg_id', session.lgId)
    .eq('week_start', weekStart)
    .eq('day_of_week', day_of_week)
    .maybeSingle()

  const currentVal = ((existing as Record<string, unknown>)?.[field] as number) || 0
  const newVal = Math.max(0, currentVal + (increment || 1))
  const now = new Date().toISOString()

  if (existing) {
    await db
      .from('lg_weekly_activity')
      .update({ [field]: newVal, updated_at: now })
      .eq('id', (existing as Record<string, unknown>).id as string)
  } else {
    await db
      .from('lg_weekly_activity')
      .insert({ lg_id: session.lgId, week_start: weekStart, day_of_week, [field]: newVal })
  }

  return Response.json({ ok: true, new_value: newVal })
}
