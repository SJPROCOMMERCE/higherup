import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const db = genxDb()
  const [prospectRes, activitiesRes] = await Promise.all([
    db.from('admin_prospects').select('*, admin_communities(name)').eq('id', id).single(),
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

  const allowed = ['name', 'email', 'phone', 'platform', 'handle', 'source', 'community_id', 'stage', 'priority', 'follow_up_date', 'lost_reason', 'notes', 'tags', 'stage_index']
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key]
  }

  // Track stage changes
  if (body.stage && body.old_stage && body.stage !== body.old_stage) {
    await db.from('admin_prospect_activities').insert({
      prospect_id: id,
      activity_type: 'status_change',
      description: `Stage: ${body.old_stage} → ${body.stage}`,
      old_stage: body.old_stage,
      new_stage: body.stage,
    })
    if (body.stage === 'converted') update.converted_at = new Date().toISOString()
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
