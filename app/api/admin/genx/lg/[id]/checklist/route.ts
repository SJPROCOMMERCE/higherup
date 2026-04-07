import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: lgId } = await params
  const { step_key, completed } = await req.json()
  const db = genxDb()

  await db.from('admin_lg_checklist').update({
    completed,
    completed_at: completed ? new Date().toISOString() : null,
  }).eq('lg_id', lgId).eq('step_key', step_key)

  // Log to timeline
  if (completed) {
    await db.from('admin_lg_timeline').insert({
      lg_id: lgId,
      event_type: 'checklist_complete',
      description: `Checklist stap voltooid: ${step_key}`,
    })
  }

  // Check if all steps completed
  const { data: remaining } = await db.from('admin_lg_checklist')
    .select('id').eq('lg_id', lgId).eq('completed', false).limit(1)
  if (remaining && remaining.length === 0) {
    await db.from('lead_generators').update({ onboarding_status: 'completed', updated_at: new Date().toISOString() }).eq('id', lgId)
    await db.from('admin_lg_timeline').insert({
      lg_id: lgId,
      event_type: 'milestone',
      description: 'Onboarding volledig afgerond!',
    })
  }

  return Response.json({ ok: true })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: lgId } = await params
  // Seed default checklist
  await genxDb().rpc('seed_lg_checklist', { p_lg_id: lgId })
  const { data } = await genxDb().from('admin_lg_checklist').select('*').eq('lg_id', lgId).order('sort_order')
  return Response.json({ checklist: data || [] })
}
