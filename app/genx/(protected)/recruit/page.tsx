import { redirect } from 'next/navigation'
import { getGenxSession } from '@/lib/genx-auth'
import { supabase } from '@/lib/supabase'
import RecruitClient from './RecruitClient'

export default async function RecruitPage() {
  const session = await getGenxSession()
  if (!session) redirect('/genx/login')
  const lgId = session.lgId

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [lgRes, clicksRes, referralsRes, clicksL7, signupsL7] = await Promise.all([
    supabase.from('lead_generators').select('referral_code').eq('id', lgId).single(),
    supabase.from('referral_clicks').select('id', { count: 'exact', head: true }).eq('lg_id', lgId),
    supabase.from('referral_tracking')
      .select('va_id, first_upload_at, products_this_month, signed_up_at')
      .eq('lg_id', lgId),
    supabase.from('referral_clicks').select('id', { count: 'exact', head: true }).eq('lg_id', lgId).gte('created_at', sevenDaysAgo),
    supabase.from('referral_tracking').select('id', { count: 'exact', head: true }).eq('lg_id', lgId).gte('signed_up_at', sevenDaysAgo),
  ])

  const code       = lgRes.data?.referral_code as string || ''
  const referrals  = referralsRes.data || []
  const clicks     = clicksRes.count || 0
  const signups    = referrals.length
  const first      = referrals.filter((r: Record<string, unknown>) => r.first_upload_at).length
  const active     = referrals.filter((r: Record<string, unknown>) => (r.products_this_month as number) >= 50).length
  const baseUrl    = process.env.NEXT_PUBLIC_APP_URL || 'https://higherup.me'

  return (
    <RecruitClient
      referralCode={code}
      referralLink={`${baseUrl}/ref/${code}`}
      funnel={{ clicks, signups, first_uploads: first, active }}
      last7={{ clicks: clicksL7.count || 0, signups: signupsL7.count || 0 }}
    />
  )
}
