// Increment copies column — vervangt de niet-bestaande increment_toolkit_usage RPC
import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const db = genxDb()
  // Haal huidige copies op en verhoog met 1
  const { data } = await db.from('genx_toolkit').select('copies').eq('id', id).single()
  const current = (data?.copies as number) || 0
  await db.from('genx_toolkit').update({ copies: current + 1 }).eq('id', id)

  return Response.json({ ok: true })
}
