import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

export async function GET(req: Request) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const days = parseInt(url.searchParams.get('days') || '30')
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data } = await genxDb()
    .from('admin_daily_scorecard')
    .select('*')
    .gte('score_date', since)
    .order('score_date', { ascending: false })
  return Response.json({ scorecards: data || [] })
}

export async function POST(req: Request) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const date = body.score_date || new Date().toISOString().slice(0, 10)
  const db = genxDb()

  // Upsert — update if exists, insert if not
  const { data: existing } = await db.from('admin_daily_scorecard')
    .select('id').eq('score_date', date).maybeSingle()

  const fields = {
    score_date: date,
    calls_made: body.calls_made ?? 0,
    dms_sent: body.dms_sent ?? 0,
    emails_sent: body.emails_sent ?? 0,
    prospects_added: body.prospects_added ?? 0,
    follow_ups_done: body.follow_ups_done ?? 0,
    appointments_set: body.appointments_set ?? 0,
    conversions: body.conversions ?? 0,
    communities_posted: body.communities_posted ?? 0,
    notes: body.notes || null,
    updated_at: new Date().toISOString(),
  }

  if (existing) {
    await db.from('admin_daily_scorecard').update(fields).eq('id', existing.id)
  } else {
    await db.from('admin_daily_scorecard').insert(fields)
  }

  return Response.json({ ok: true })
}

export async function PATCH(req: Request) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const date = body.score_date || new Date().toISOString().slice(0, 10)
  const db = genxDb()

  const { data: existing } = await db.from('admin_daily_scorecard')
    .select('*').eq('score_date', date).maybeSingle()

  if (!existing) {
    // Create with the incremented field
    const fields: Record<string, unknown> = { score_date: date }
    if (body.field && body.delta) {
      fields[body.field] = Math.max(0, (body.delta as number))
    }
    await db.from('admin_daily_scorecard').insert(fields)
  } else {
    // Increment specific field
    if (body.field && body.delta !== undefined) {
      const current = (existing[body.field] as number) || 0
      await db.from('admin_daily_scorecard').update({
        [body.field]: Math.max(0, current + body.delta),
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
    }
  }

  return Response.json({ ok: true })
}
