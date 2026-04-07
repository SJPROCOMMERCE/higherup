import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateActions, updateReferralStats } from '@/lib/genx-intelligence'
import { getCurrentBillingMonth, getPreviousBillingMonth } from '@/lib/usage-tracker'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const currentMonth = getCurrentBillingMonth()

  // Get all active LGs
  const { data: lgs } = await supabase
    .from('lead_generators')
    .select('id')
    .in('status', ['active', 'pending'])

  let processed = 0
  for (const lg of lgs || []) {
    try {
      await updateReferralStats(lg.id)
      await generateActions(lg.id)
      processed++
    } catch (e) {
      console.error(`[genx-daily] Error for LG ${lg.id}:`, e)
    }
  }

  // Update referral_links stats
  const { data: links } = await supabase.from('referral_links').select('id, lg_id, link_code')
  for (const link of links || []) {
    const [clicksRes, signupsRes] = await Promise.all([
      supabase.from('referral_clicks').select('id', { count: 'exact', head: true }).eq('link_id', link.id),
      supabase.from('referral_tracking').select('id, status', { count: 'exact' }).eq('referral_code_used', link.link_code),
    ])
    const { data: activeVAs } = await supabase
      .from('referral_tracking')
      .select('id')
      .eq('referral_code_used', link.link_code)
      .in('status', ['active', 'slow'])

    await supabase.from('referral_links').update({
      click_count: clicksRes.count || 0,
      signup_count: signupsRes.count || 0,
      active_count: (activeVAs || []).length,
    }).eq('id', link.id)
  }

  // Reactivation: expire cycles not executed within 14 days of scheduled date
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()
  const { data: expiredCycles } = await supabase.from('admin_reactivation_cycles').update({
    status: 'expired',
    result_note: 'Expired — not executed within 14 days of scheduled date',
  }).eq('status', 'scheduled').lt('scheduled_at', fourteenDaysAgo).select('id')
  console.log(`[genx-daily] Expired ${expiredCycles?.length || 0} reactivation cycles`)

  // Cleanup: pulse events older than 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  await supabase.from('lg_pulse_events').delete().lt('created_at', sevenDaysAgo)

  // Cleanup: expired pending actions
  await supabase.from('lg_actions').delete().eq('status', 'pending').lt('expires_at', new Date().toISOString())

  console.log(`[genx-daily] Processed ${processed} LGs`)
  return NextResponse.json({ ok: true, processed, month: currentMonth })
}
