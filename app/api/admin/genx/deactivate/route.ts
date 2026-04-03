import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
  const { lg_id } = await request.json() as { lg_id?: string }
  if (!lg_id) return Response.json({ error: 'Missing lg_id' }, { status: 400 })
  await supabase.from('lead_generators').update({ status: 'deactivated', updated_at: new Date().toISOString() }).eq('id', lg_id)
  return Response.json({ ok: true })
}
