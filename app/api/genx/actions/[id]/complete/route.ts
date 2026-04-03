import { getGenxSession } from '@/lib/genx-auth'
import { supabase } from '@/lib/supabase'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await supabase.from('lg_actions').update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', params.id).eq('lg_id', session.lgId)
  return Response.json({ ok: true })
}
