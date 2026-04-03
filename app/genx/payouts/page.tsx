import { redirect } from 'next/navigation'
import { getGenxSession } from '@/lib/genx-auth'
import { supabase } from '@/lib/supabase'
import { getCurrentBillingMonth, getPreviousBillingMonth } from '@/lib/usage-tracker'
import PayoutsClient from './PayoutsClient'

export default async function PayoutsPage() {
  const session = await getGenxSession()
  if (!session) redirect('/genx/login')
  const lgId = session.lgId

  const currentMonth = getCurrentBillingMonth()
  const [currentEarningsRes, payoutsRes, lgRes] = await Promise.all([
    supabase.from('lg_earnings').select('amount').eq('lg_id', lgId).eq('billing_month', currentMonth),
    supabase.from('lg_payouts').select('*').eq('lg_id', lgId).order('billing_month', { ascending: false }).limit(12),
    supabase.from('lead_generators').select('minimum_payout, total_earnings').eq('id', lgId).single(),
  ])

  const pendingEarnings = (currentEarningsRes.data || []).reduce((s, r) => s + parseFloat(String(r.amount)), 0)
  const payouts         = payoutsRes.data || []
  const rolledOver      = payouts.filter((p: Record<string, unknown>) => p.status === 'rolled_over')
    .reduce((s, p: Record<string, unknown>) => s + parseFloat(String(p.rolled_over)), 0)

  return (
    <PayoutsClient
      currentMonth={currentMonth}
      pendingEarnings={pendingEarnings}
      rolledOver={rolledOver}
      minimumPayout={parseFloat(String(lgRes.data?.minimum_payout || 10))}
      lifetimeEarnings={parseFloat(String(lgRes.data?.total_earnings || 0))}
      payouts={payouts as Record<string, unknown>[]}
    />
  )
}
