// Increment times_used voor een custom script
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
  const { data } = await db
    .from('lg_custom_scripts')
    .select('times_used')
    .eq('id', id)
    .eq('lg_id', session.lgId)
    .single()

  const current = (data?.times_used as number) || 0
  await db
    .from('lg_custom_scripts')
    .update({ times_used: current + 1, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('lg_id', session.lgId)

  return Response.json({ ok: true })
}
