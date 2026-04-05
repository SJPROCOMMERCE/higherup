import { getGenxSession } from '@/lib/genx-auth'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const lgId = session.lgId

  const [lgRes, clicksRes, referralsRes] = await Promise.all([
    supabase.from('lead_generators').select('referral_code, total_vas').eq('id', lgId).single(),
    supabase.from('referral_clicks').select('id', { count: 'exact' }).eq('lg_id', lgId),
    supabase.from('referral_tracking').select('va_user_id, status, referred_at').eq('lg_id', lgId),
  ])

  const lg          = lgRes.data
  const totalClicks = clicksRes.count || 0
  const referrals   = referralsRes.data || []

  const signups = referrals.length
  const active  = referrals.filter((r: Record<string, unknown>) => r.status === 'active').length

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const [clicksLast7Res, signupsLast7Res] = await Promise.all([
    supabase.from('referral_clicks').select('id', { count: 'exact', head: true }).eq('lg_id', lgId).gte('clicked_at', sevenDaysAgo),
    supabase.from('referral_tracking').select('id', { count: 'exact', head: true }).eq('lg_id', lgId).gte('referred_at', sevenDaysAgo),
  ])

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://higherup.me'

  return Response.json({
    referral_code: lg?.referral_code,
    referral_link: `${baseUrl}/ref/${lg?.referral_code}`,
    funnel: { clicks: totalClicks, signups, first_uploads: active, active },
    last7:  { clicks: clicksLast7Res.count || 0, signups: signupsLast7Res.count || 0 },
  })
}
