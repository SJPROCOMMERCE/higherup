import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

const STAGE_TS: Record<string, string> = {
  identified: 'identified_at', contacted: 'contacted_at', replied: 'replied_at',
  interested: 'interested_at', pitch_sent: 'pitch_sent_at', call_scheduled: 'call_scheduled_at',
  call_done: 'call_done_at', signed_up: 'signed_up_at', onboarding: 'onboarding_at',
  active_lg: 'active_lg_at', declined: 'declined_at', lost: 'lost_at', revisit_later: 'revisit_later_at',
}

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const db = genxDb()
  const [prospectRes, activitiesRes] = await Promise.all([
    db.from('admin_prospects').select('*').eq('id', id).single(),
    db.from('admin_prospect_activities').select('*').eq('prospect_id', id).order('created_at', { ascending: false }),
  ])
  if (!prospectRes.data) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ prospect: prospectRes.data, activities: activitiesRes.data || [] })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const db = genxDb()

  const allowed = [
    'name', 'email', 'phone', 'platform', 'handle', 'source', 'community_id',
    'stage', 'priority', 'follow_up_date', 'lost_reason', 'notes', 'tags', 'stage_index',
  ]
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key]
  }

  // Track stage changes with timestamps
  if (body.stage && body.old_stage && body.stage !== body.old_stage) {
    const now = new Date().toISOString()

    // Set the timestamp for the new stage
    const tsField = STAGE_TS[body.stage]
    if (tsField) update[tsField] = now

    // Log activity
    await db.from('admin_prospect_activities').insert({
      prospect_id: id,
      activity_type: 'status_change',
      description: `Stage: ${body.old_stage} → ${body.stage}`,
      old_stage: body.old_stage,
      new_stage: body.stage,
    })
  }

  await db.from('admin_prospects').update(update).eq('id', id)
  return Response.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await genxDb().from('admin_prospects').delete().eq('id', id)
  return Response.json({ ok: true })
}
