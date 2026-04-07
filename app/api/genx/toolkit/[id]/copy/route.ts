import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const db = genxDb()
  const { data: item } = await db.from('genx_toolkit').select('usage_count').eq('id', id).single()
  if (item) {
    await db.from('genx_toolkit').update({ usage_count: ((item.usage_count as number) || 0) + 1 }).eq('id', id)
  }
  return Response.json({ ok: true })
}
