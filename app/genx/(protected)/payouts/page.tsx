import { redirect } from 'next/navigation'
import { getGenxSession } from '@/lib/genx-auth'
import { supabase } from '@/lib/supabase'
import { getCurrentBillingMonth } from '@/lib/usage-tracker'
import PayoutsClient from './PayoutsClient'

export default async function PayoutsPage() {
  const session = await getGenxSession()
  if (!session) redirect('/genx/login')
  const lgId = session.lgId
  const currentMonth = getCurrentBillingMonth()

  const [lgRes, currentEarningsRes, payoutsRes, leaderboardRes] = await Promise.all([
    supabase.from('lead_generators').select('payout_method, minimum_payout').eq('id', lgId).single(),
    supabase.from('lg_earnings').select('amount').eq('lg_id', lgId).eq('billing_month', currentMonth),
    supabase.from('lg_payouts').select('*').eq('lg_id', lgId).order('billing_month', { ascending: false }).limit(12),
    supabase.from('lg_leaderboard').select('rank_earnings, active_vas, earnings, new_signups').eq('lg_id', lgId).eq('period_type', 'month').eq('period', currentMonth).single(),
  ])

  // Get all LGs' leaderboard for current month (for ranking context)
  const { data: allLBRows } = await supabase
    .from('lg_leaderboard')
    .select('lg_id, active_vas, earnings, rank_earnings')
    .eq('period_type', 'month')
    .eq('period', currentMonth)
    .order('earnings', { ascending: false })

  const pending = (currentEarningsRes.data || []).reduce((s, r) => s + parseFloat(String(r.amount)), 0)
  const myRank = (leaderboardRes.data?.rank_earnings as number) || null
  const totalLGs = (allLBRows || []).length

  return (
    <PayoutsClient
      pending={pending}
      currentMonth={currentMonth}
      payouts={payoutsRes.data || []}
      leaderboardRows={allLBRows || []}
      myLgId={lgId}
      myRank={myRank}
      totalLGs={totalLGs}
      payoutMethod={lgRes.data?.payout_method as Record<string,string>|null}
      minimumPayout={parseFloat(String(lgRes.data?.minimum_payout || 10))}
    />
  )
}
