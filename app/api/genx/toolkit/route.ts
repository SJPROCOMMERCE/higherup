import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

export async function GET() {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await genxDb().from('genx_toolkit').select('*').eq('is_active', true).order('sort_order')
  return Response.json({ items: data || [] })
}
