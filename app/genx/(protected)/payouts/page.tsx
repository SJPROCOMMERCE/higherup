import { redirect } from 'next/navigation'
import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'
import { getCurrentBillingMonth } from '@/lib/usage-tracker'
import PayoutsClient from './PayoutsClient'

export default async function PayoutsPage() {
  const session = await getGenxSession()
  if (!session) redirect('/genx/login')
  const db = genxDb()
  const lgId = session.lgId
  const currentMonth = getCurrentBillingMonth()

  const [currentEarningsRes, payoutsRes, myLBRes] = await Promise.all([
    db.from('lg_earnings').select('amount').eq('lg_id', lgId).eq('billing_month', currentMonth),
    db.from('lg_payouts').select('*').eq('lg_id', lgId).order('created_at', { ascending: false }).limit(12),
    db.from('lg_leaderboard').select('rank, active_vas, total_earned').eq('lg_id', lgId).eq('billing_month', currentMonth).single(),
  ])

  const { data: allLBRows } = await db
    .from('lg_leaderboard')
    .select('lg_id, active_vas, total_earned, rank')
    .eq('billing_month', currentMonth)
    .order('rank', { ascending: true })

  const pending  = (currentEarningsRes.data || []).reduce((s, r) => s + parseFloat(String(r.amount)), 0)
  const myRank   = (myLBRes.data?.rank as number) || null
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
    />
  )
}
