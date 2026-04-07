import { genxDb } from '@/lib/genx-db'

export async function POST(req: Request) {
  const { lg_id } = await req.json()
  await genxDb().from('lead_generators').update({ status: 'deactivated', updated_at: new Date().toISOString() }).eq('id', lg_id)
  return Response.json({ ok: true })
}
