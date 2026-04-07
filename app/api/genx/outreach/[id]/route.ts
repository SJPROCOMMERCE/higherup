import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const allowed = ['pipeline_status', 'contact_handle', 'notes', 'last_contacted_at', 'next_followup_at']
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key]
  }
  const { data, error } = await genxDb().from('lg_outreach').update(update)
    .eq('id', id).eq('lg_id', session.lgId).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ contact: data })
}
