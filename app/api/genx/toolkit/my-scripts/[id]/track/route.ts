import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const db = genxDb()

  // Increment times_used
  const { data: existing } = await db
    .from('lg_custom_scripts')
    .select('times_used')
    .eq('id', id)
    .eq('lg_id', session.lgId)
    .single()

  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 })

  const { error } = await db
    .from('lg_custom_scripts')
    .update({
      times_used: (existing.times_used || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    console.error('[genx/toolkit/my-scripts/track] POST error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
