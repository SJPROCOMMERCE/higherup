import { genxDb, toMonthDate } from '@/lib/genx-db'
import { getCurrentBillingMonth } from '@/lib/usage-tracker'
import { cookies } from 'next/headers'
import crypto from 'crypto'

async function checkAdmin(): Promise<boolean> {
  try {
    const cookieStore = await cookies()
    const session     = cookieStore.get('admin_session')?.value
    if (!session) return false
    const lastColon = session.lastIndexOf(':')
    const payload   = session.slice(0, lastColon)
    const sig       = session.slice(lastColon + 1)
    const secret    = process.env.ADMIN_SESSION_SECRET || ''
    const expected  = crypto.createHmac('sha256', secret).update(payload).digest('hex')
    if (sig.length !== expected.length) return false
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
  } catch { return false }
}

export async function GET() {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const currentMonth = getCurrentBillingMonth()
  const db = genxDb()

  const [lgsRes, earningsRes, payoutsRes] = await Promise.all([
    db.from('lead_generators').select('*').order('joined_at', { ascending: false }),
    db.from('lg_earnings').select('lg_id, amount').eq('billing_month', toMonthDate(currentMonth)),
    db.from('lg_payouts').select('lg_id, amount').eq('status', 'pending'),
  ])

  const lgs     = lgsRes.data || []
  const earningsMap: Record<string, number> = {}
  const payoutMap:   Record<string, number> = {}

  for (const e of earningsRes.data || []) {
    earningsMap[e.lg_id as string] = (earningsMap[e.lg_id as string] || 0) + parseFloat(String(e.amount))
  }
  for (const p of payoutsRes.data || []) {
    payoutMap[p.lg_id as string] = (payoutMap[p.lg_id as string] || 0) + parseFloat(String(p.amount))
  }

  const enriched = lgs.map(lg => ({
    ...lg,
    this_month_earnings: earningsMap[lg.id as string] || 0,
    pending_payout:      payoutMap[lg.id as string] || 0,
  }))

  const summaryEarnings = Object.values(earningsMap).reduce((s, v) => s + v, 0)
  const summaryPayout   = Object.values(payoutMap).reduce((s, v) => s + v, 0)
  const activeCount     = lgs.filter(lg => lg.status === 'active').length
  const pendingCount    = lgs.filter(lg => lg.status === 'pending').length

  return Response.json({
    lgs: enriched,
    summary: {
      active_lgs:     activeCount,
      pending_lgs:    pendingCount,
      this_month_earnings: summaryEarnings,
      pending_payouts:summaryPayout,
    },
  })
}
