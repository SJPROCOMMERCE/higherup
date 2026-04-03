import { getGenxSession } from '@/lib/genx-auth'
import { supabase } from '@/lib/supabase'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await supabase.from('lg_actions').update({ status: 'dismissed', completed_at: new Date().toISOString() })
    .eq('id', id).eq('lg_id', session.lgId)
  return Response.json({ ok: true })
}
