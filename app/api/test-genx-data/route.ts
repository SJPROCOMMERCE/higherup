import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>

export async function GET() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const results: Record<string, AnyRecord> = {}

  // 1. Lead generators
  const { data: lgs, error: lgErr } = await db.from('lead_generators').select('*')
  results.lead_generators = { count: lgs?.length ?? 0, data: lgs, error: lgErr?.message }

  // 2. Referral tracking
  const { data: refs, error: refErr } = await db.from('referral_tracking').select('*')
  results.referral_tracking = { count: refs?.length ?? 0, data: refs, error: refErr?.message }

  // 3. Referral tracking joined with VAs
  const { data: refsJoined, error: joinErr } = await db
    .from('referral_tracking')
    .select('*, vas:va_user_id(id, name, email)')
  results.referral_with_vas = { count: refsJoined?.length ?? 0, data: refsJoined, error: joinErr?.message }

  // 4. Earnings
  const { data: earnings, error: earnErr } = await db.from('lg_earnings').select('*')
  results.lg_earnings = { count: earnings?.length ?? 0, data: earnings, error: earnErr?.message }

  // 5. Pulse events
  const { data: pulse, error: pulseErr } = await db.from('lg_pulse_events').select('*').limit(20)
  results.lg_pulse_events = { count: pulse?.length ?? 0, data: pulse, error: pulseErr?.message }

  // 6. Actions
  const { data: actions, error: actErr } = await db.from('lg_actions').select('*').limit(20)
  results.lg_actions = { count: actions?.length ?? 0, data: actions, error: actErr?.message }

  // 7. Uploads (to see what VA has processed)
  const { data: uploads, error: uploadErr } = await db
    .from('uploads')
    .select('id, va_id, client_id, status, unique_product_count, products_optimized, processing_completed_at')
    .eq('status', 'done')
    .order('processing_completed_at', { ascending: false })
    .limit(10)
  results.recent_done_uploads = { count: uploads?.length ?? 0, data: uploads, error: uploadErr?.message }

  // 8. Columns of key tables
  const tables = ['referral_tracking', 'lead_generators', 'lg_earnings', 'lg_pulse_events', 'lg_actions']
  const colResults: Record<string, string[]> = {}
  for (const t of tables) {
    const { data: cols } = await db
      .from('information_schema.columns' as string)
      .select('column_name')
      .eq('table_schema', 'public')
      .eq('table_name', t)
      .order('ordinal_position' as string)
    colResults[t] = (cols || []).map((c: AnyRecord) => c.column_name as string)
  }
  results.table_columns = colResults as unknown as AnyRecord

  // 9. Anon client check (same queries, different client — reveals RLS issues)
  const anonDb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: anonRefs, error: anonRefErr } = await anonDb.from('referral_tracking').select('*')
  const { data: anonEarn, error: anonEarnErr } = await anonDb.from('lg_earnings').select('*')
  results.anon_rls_check = {
    referral_tracking: { count: anonRefs?.length ?? 0, error: anonRefErr?.message },
    lg_earnings:       { count: anonEarn?.length ?? 0, error: anonEarnErr?.message },
    conclusion: (!anonRefErr && !anonEarnErr) ? 'RLS is open (anon can read)' : 'RLS IS BLOCKING anon client — this is the bug',
  }

  return NextResponse.json(results, { status: 200 })
}
