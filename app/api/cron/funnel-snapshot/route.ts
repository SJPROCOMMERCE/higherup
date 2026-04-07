import { createClient } from '@supabase/supabase-js'

const ALL_STAGES = ['identified','contacted','replied','interested','pitch_sent','call_scheduled','call_done','signed_up','onboarding','active_lg','declined','lost','revisit_later']

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const today = new Date().toISOString().slice(0, 10)
  const { data: prospects } = await db.from('admin_prospects').select('stage')
  const rows = prospects || []

  // Count per stage
  const counts: Record<string, number> = {}
  for (const s of ALL_STAGES) counts[s] = 0
  for (const p of rows) counts[p.stage] = (counts[p.stage] || 0) + 1

  // Upsert snapshot for each stage
  for (const stage of ALL_STAGES) {
    await db.from('admin_funnel_snapshots').upsert({
      snapshot_date: today,
      stage,
      count: counts[stage],
    }, { onConflict: 'snapshot_date,stage' })
  }

  return Response.json({ ok: true, date: today, counts })
}
