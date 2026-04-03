import { getGenxSession } from '@/lib/genx-auth'
import { supabase } from '@/lib/supabase'

export async function PATCH(req: Request) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const allowed = ['weekly_target_signups', 'weekly_target_activations', 'monthly_target_active_vas']
  const update: Record<string, number> = {}
  for (const key of allowed) {
    if (body[key] !== undefined && typeof body[key] === 'number') update[key] = body[key]
  }
  if (Object.keys(update).length === 0) return Response.json({ error: 'No valid fields' }, { status: 400 })
  await supabase.from('lead_generators').update({ ...update, updated_at: new Date().toISOString() }).eq('id', session.lgId)
  return Response.json({ ok: true })
}
