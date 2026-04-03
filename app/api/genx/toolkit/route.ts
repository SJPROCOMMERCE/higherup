import { getGenxSession } from '@/lib/genx-auth'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await supabase.from('genx_toolkit').select('*').eq('is_active', true).order('sort_order')
  return Response.json({ items: data || [] })
}
