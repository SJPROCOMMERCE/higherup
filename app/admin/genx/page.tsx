// Kolom namen gebaseerd op lib/genx-schema.md — gegenereerd via live database dump 2026-04-06
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import AdminGenxClient from './AdminGenxClient'

// Service role client — bypasses RLS, enige manier om lead_generators te lezen
function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function AdminGenxPage() {
  const cookieStore = await cookies()
  const adminSession = cookieStore.get('admin_session')?.value
  if (!adminSession) redirect('/admin/login')

  const db = adminDb()

  // Laad alles parallel
  const [lgsRes, rtRes, earningsRes, payoutsRes] = await Promise.all([
    // Kolommen: id, display_name, login_code, email, status, referral_code, joined_at
    db.from('lead_generators')
      .select('id, display_name, login_code, email, phone, status, referral_code, joined_at, source')
      .order('joined_at', { ascending: false }),

    // Kolommen: lg_id, status
    db.from('referral_tracking')
      .select('lg_id, status'),

    // Kolommen: lg_id, amount
    db.from('lg_earnings')
      .select('lg_id, amount'),

    // Uitbetalingen met status 'pending'
    db.from('lg_payouts')
      .select('id, lg_id, period_start, amount, status')
      .eq('status', 'pending')
      .order('period_start', { ascending: false }),
  ])

  // Bouw lookup maps op basis van bewezen queries (zie STAP 3 resultaat)
  const totalVasMap:  Record<string, number> = {}
  const activeVasMap: Record<string, number> = {}
  const earnedMap:    Record<string, number> = {}

  for (const r of rtRes.data || []) {
    const id = r.lg_id as string
    totalVasMap[id] = (totalVasMap[id] || 0) + 1
    if ((r.status as string) === 'active') {
      activeVasMap[id] = (activeVasMap[id] || 0) + 1
    }
  }

  for (const e of earningsRes.data || []) {
    const id = e.lg_id as string
    earnedMap[id] = (earnedMap[id] || 0) + parseFloat(String(e.amount || 0))
  }

  const lgs = (lgsRes.data || []).map(lg => ({
    id:             lg.id as string,
    display_name:   lg.display_name as string,
    login_code:     lg.login_code as string,
    email:          (lg.email as string) || null,
    status:         lg.status as string,
    referral_code:  lg.referral_code as string,
    joined_at:      (lg.joined_at as string) || null,
    // Live counts — niet de stale cached kolommen
    total_vas:      totalVasMap[lg.id as string]  || 0,
    active_vas:     activeVasMap[lg.id as string] || 0,
    total_earned:   Math.round((earnedMap[lg.id as string] || 0) * 100) / 100,
    referral_count: totalVasMap[lg.id as string]  || 0,
  }))

  return (
    <AdminGenxClient
      lgs={lgs}
      pendingPayouts={payoutsRes.data || []}
    />
  )
}
