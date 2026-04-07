import { genxDb } from '@/lib/genx-db'

export async function POST(req: Request) {
  const { lg_id } = await req.json()
  const db = genxDb()
  await db.from('lead_generators').update({
    status: 'active',
    approved_at: new Date().toISOString(),
    onboarding_status: 'in_progress',
    updated_at: new Date().toISOString(),
  }).eq('id', lg_id)
  // Seed onboarding checklist
  await db.rpc('seed_lg_checklist', { p_lg_id: lg_id })
  // Log to timeline
  await db.from('admin_lg_timeline').insert({
    lg_id,
    event_type: 'approved',
    description: 'Lead Generator goedgekeurd en geactiveerd',
  })
  return Response.json({ ok: true })
}
