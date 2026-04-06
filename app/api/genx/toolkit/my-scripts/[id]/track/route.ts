import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { result } = await req.json() // 'reply' | 'convert' | 'used'
  const db = genxDb()

  const { data: s } = await db
    .from('lg_custom_scripts')
    .select('times_used, times_replied, times_converted')
    .eq('id', id)
    .eq('lg_id', session.lgId)
    .single()

  if (!s) return Response.json({ error: 'Not found' }, { status: 404 })

  const update: Record<string, number> = {
    times_used: (s.times_used || 0) + 1,
  }
  if (result === 'reply') {
    update.times_replied = (s.times_replied || 0) + 1
  }
  if (result === 'convert') {
    update.times_replied = (s.times_replied || 0) + 1
    update.times_converted = (s.times_converted || 0) + 1
  }

  const { data, error } = await db
    .from('lg_custom_scripts')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('lg_id', session.lgId)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ script: data })
}
