import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const allowed = [
    'name', 'channel', 'handle', 'status', 'notes', 'source',
    'last_message_sent', 'last_objection', 'next_followup_at',
    'last_contacted_at', 'last_replied_at', 'first_contacted_at',
    'is_starred', 'is_archived', 'tags', 'followup_count',
  ]

  const now = new Date().toISOString()
  const update: Record<string, unknown> = { updated_at: now }

  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  // Auto-update last_contacted_at when status changes to something active
  if (body.status && body.status !== 'prospect' && body.status !== 'lost') {
    if (!('last_contacted_at' in body)) update.last_contacted_at = now
  }

  const db = genxDb()
  const { data, error } = await db
    .from('lg_contacts')
    .update(update)
    .eq('id', id)
    .eq('lg_id', session.lgId)
    .select()
    .single()

  if (error) {
    console.error('[genx/toolkit/contacts/[id]] PATCH error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ contact: data })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const db = genxDb()
  const { error } = await db
    .from('lg_contacts')
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('lg_id', session.lgId)

  if (error) {
    console.error('[genx/toolkit/contacts/[id]] DELETE error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
