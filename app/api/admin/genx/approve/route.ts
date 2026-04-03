import { supabase } from '@/lib/supabase'

export async function POST(req: Request) {
  const { lg_id } = await req.json()
  await supabase.from('lead_generators').update({ status: 'active', approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', lg_id)
  return Response.json({ ok: true })
}
