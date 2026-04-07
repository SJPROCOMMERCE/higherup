import { NextResponse } from 'next/server'
import { genxDb } from '@/lib/genx-db'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = genxDb()
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()

  // Expire speed log entries waiting > 72 hours
  await db
    .from('admin_response_speed_log')
    .update({ status: 'expired' })
    .eq('status', 'waiting')
    .lt('reply_at', cutoff)

  const { count: expired } = await db
    .from('admin_response_speed_log')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'expired')

  // Sync has_unreplied flag — clear if no more waiting entries
  const { data: stillWaiting } = await db
    .from('admin_response_speed_log')
    .select('prospect_id')
    .eq('status', 'waiting')

  const waitingIds = new Set((stillWaiting || []).map(w => w.prospect_id))

  const { data: unrepliedProspects } = await db
    .from('admin_prospects')
    .select('id')
    .eq('has_unreplied', true)

  for (const p of unrepliedProspects || []) {
    if (!waitingIds.has(p.id)) {
      await db.from('admin_prospects').update({ has_unreplied: false }).eq('id', p.id)
    }
  }

  console.log(`[response-speed-cleanup] Expired ${expired || 0} entries`)
  return NextResponse.json({ ok: true, expired: expired || 0 })
}
