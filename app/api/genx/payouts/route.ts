import { getGenxSession } from '@/lib/genx-auth'
import { supabase } from '@/lib/supabase'
import { getCurrentBillingMonth } from '@/lib/usage-tracker'

export async function GET() {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const lgId = session.lgId

  const currentMonth = getCurrentBillingMonth()

  const [currentEarningsRes, payoutsRes, lgRes] = await Promise.all([
    supabase.from('lg_earnings').select('amount').eq('lg_id', lgId).eq('billing_month', currentMonth),
    supabase.from('lg_payouts').select('*').eq('lg_id', lgId).order('billing_month', { ascending: false }).limit(12),
    supabase.from('lead_generators').select('minimum_payout, total_earnings').eq('id', lgId).single(),
  ])

  const pendingEarnings = (currentEarningsRes.data || [])
    .reduce((s, r) => s + parseFloat(String(r.amount)), 0)

  const rolledOver = (payoutsRes.data || [])
    .filter((p: Record<string, unknown>) => p.status === 'rolled_over')
    .reduce((s, p: Record<string, unknown>) => s + parseFloat(String(p.rolled_over)), 0)

  return Response.json({
    current_month:    currentMonth,
    pending_earnings: pendingEarnings,
    rolled_over:      rolledOver,
    pending_total:    pendingEarnings + rolledOver,
    minimum_payout:   parseFloat(String(lgRes.data?.minimum_payout || 10)),
    lifetime_earnings:parseFloat(String(lgRes.data?.total_earnings || 0)),
    payouts:          payoutsRes.data || [],
  })
}
