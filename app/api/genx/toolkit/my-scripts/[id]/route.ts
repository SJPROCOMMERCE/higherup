import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const allowed = ['title', 'content', 'category', 'channel', 'notes', 'is_pinned', 'sort_order',
                   'times_replied', 'times_converted', 'best_channel']
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  const db = genxDb()
  const { data, error } = await db
    .from('lg_custom_scripts')
    .update(update)
    .eq('id', id)
    .eq('lg_id', session.lgId)
    .select()
    .single()

  if (error) {
    console.error('[genx/toolkit/my-scripts/[id]] PATCH error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ script: data })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const db = genxDb()
  const { error } = await db
    .from('lg_custom_scripts')
    .delete()
    .eq('id', id)
    .eq('lg_id', session.lgId)

  if (error) {
    console.error('[genx/toolkit/my-scripts/[id]] DELETE error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
