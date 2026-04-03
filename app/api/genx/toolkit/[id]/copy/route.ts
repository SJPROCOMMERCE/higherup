import { getGenxSession } from '@/lib/genx-auth'
import { supabase } from '@/lib/supabase'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  // Increment usage count
  try { await supabase.rpc('increment_toolkit_usage', { item_id: params.id }) } catch {}
  return Response.json({ ok: true })
}
