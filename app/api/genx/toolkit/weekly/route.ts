// Weekly planner — lg_weekly_activity + signups this week from referral_tracking
import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

// Geeft de maandag van de huidige week (UTC) terug als YYYY-MM-DD
function getWeekStart(): string {
  const now = new Date()
  const day = now.getUTCDay() // 0=sun,1=mon...
  const diff = day === 0 ? 6 : day - 1 // dagen terug naar maandag
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

  // Als de tabel niet bestaat (migratie niet gedraaid), geef lege data terug
  const migrationNeeded = activityRes.error?.message?.includes('does not exist')

  const days = Array.from({ length: 7 }, (_, i) => {
    const found = (activityRes.data || []).find((r: Record<string, unknown>) => r.day_of_week === i)
    return {
      day_of_week:   i,
      dms_sent:      (found?.dms_sent as number) || 0,
      posts_made:    (found?.posts_made as number) || 0,
      followups_sent: (found?.followups_sent as number) || 0,
    }
  })

  return Response.json({
    week_start:        weekStart,
    days,
    signups_this_week: (signupsRes.data || []).length,
    migration_needed:  migrationNeeded || false,
  })
}

export async function PATCH(req: Request) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { day_of_week, field, increment } = await req.json()
  if (typeof day_of_week !== 'number' || !['dms_sent', 'posts_made', 'followups_sent'].includes(field)) {
    return Response.json({ error: 'invalid params' }, { status: 400 })
  }

  const weekStart = getWeekStart()
  const db = genxDb()

  // Haal bestaande rij op of maak aan
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
      .insert({
        lg_id:       session.lgId,
        week_start:  weekStart,
        day_of_week,
        [field]:     newVal,
      })
  }

  return Response.json({ ok: true, new_value: newVal })
}
