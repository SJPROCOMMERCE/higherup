import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const db = genxDb()
  // Schema uses boolean columns, not a status enum
  await db.from('lg_actions').update({ completed: true })
    .eq('id', id).eq('lg_id', session.lgId)
  return Response.json({ ok: true })
}
