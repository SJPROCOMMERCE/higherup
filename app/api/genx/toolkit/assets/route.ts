import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

export async function GET() {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const db = genxDb()
  const { data, error } = await db
    .from('genx_assets')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[genx/toolkit/assets] GET error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ assets: data || [] })
}
