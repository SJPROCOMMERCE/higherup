import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AdminGenxClient from './AdminGenxClient'

export default async function AdminGenxPage() {
  // Basic admin check via cookie
  const cookieStore = await cookies()
  const adminSession = cookieStore.get('admin_session')?.value
  if (!adminSession) redirect('/admin/login')

  const [lgsRes, pendingRes, payoutsRes] = await Promise.all([
    supabase.from('lead_generators').select('*').order('created_at', { ascending: false }),
    supabase.from('lead_generators').select('*').eq('status', 'pending').order('created_at', { ascending: true }),
    supabase.from('lg_payouts').select('*').eq('status', 'pending').order('billing_month', { ascending: false }),
  ])

  // Get referral counts per LG
  const lgIds = (lgsRes.data || []).map(lg => lg.id as string)
  const referralCounts: Record<string, number> = {}
  if (lgIds.length > 0) {
    const { data: refs } = await supabase.from('referral_tracking').select('lg_id').in('lg_id', lgIds)
    for (const r of refs || []) {
      referralCounts[r.lg_id as string] = (referralCounts[r.lg_id as string] || 0) + 1
    }
  }

  return (
    <AdminGenxClient
      lgs={(lgsRes.data || []).map(lg => ({ ...lg, referral_count: referralCounts[lg.id as string] || 0 }))}
      pendingPayouts={payoutsRes.data || []}
    />
  )
}
