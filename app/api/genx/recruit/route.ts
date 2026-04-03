import { getGenxSession } from '@/lib/genx-auth'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const lgId = session.lgId

  const [lgRes, clicksRes, referralsRes] = await Promise.all([
    supabase.from('lead_generators').select('referral_code, total_referred').eq('id', lgId).single(),
    supabase.from('referral_clicks').select('created_at', { count: 'exact' }).eq('lg_id', lgId),
    supabase.from('referral_tracking')
      .select('va_id, first_upload_at, products_this_month, signed_up_at')
      .eq('lg_id', lgId),
  ])

  const lg         = lgRes.data
  const totalClicks= clicksRes.count || 0
  const referrals  = referralsRes.data || []

  const signups       = referrals.length
  const firstUploads  = referrals.filter((r: Record<string, unknown>) => r.first_upload_at).length
  const active        = referrals.filter((r: Record<string, unknown>) => (r.products_this_month as number) >= 50).length

  // Last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count: clicksLast7 } = await supabase
    .from('referral_clicks')
    .select('id', { count: 'exact', head: true })
    .eq('lg_id', lgId)
    .gte('created_at', sevenDaysAgo)

  const { count: signupsLast7 } = await supabase
    .from('referral_tracking')
    .select('id', { count: 'exact', head: true })
    .eq('lg_id', lgId)
    .gte('signed_up_at', sevenDaysAgo)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://higherup.me'

  return Response.json({
    referral_code: lg?.referral_code,
    referral_link: `${baseUrl}/ref/${lg?.referral_code}`,
    funnel: {
      clicks:       totalClicks,
      signups,
      first_uploads: firstUploads,
      active,
    },
    last7: {
      clicks:  clicksLast7 || 0,
      signups: signupsLast7 || 0,
    },
  })
}
