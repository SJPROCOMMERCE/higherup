import { getGenxSession } from '@/lib/genx-auth'
import { supabase } from '@/lib/supabase'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try { await supabase.rpc('increment_toolkit_usage', { item_id: id }) } catch {}
  return Response.json({ ok: true })
}
