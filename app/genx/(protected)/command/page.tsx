import { redirect } from 'next/navigation'
import { getGenxSession } from '@/lib/genx-auth'
import { supabase } from '@/lib/supabase'
import { getCurrentBillingMonth, getPreviousBillingMonth } from '@/lib/usage-tracker'
import ActionFeed from './ActionFeed'
import WeeklyTargets from './WeeklyTargets'

const S = {
  label: { fontSize: 11, fontWeight: 500, color: '#555555', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8, display: 'block' },
  mono: { fontFamily: "'JetBrains Mono', monospace" },
  card: { background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 24 } as React.CSSProperties,
}

function fmt(n: number) { return `$${n.toFixed(2)}` }
function prevMonth(m: string) {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default async function CommandPage() {
  const session = await getGenxSession()
  if (!session) redirect('/genx/login')
  const lgId = session.lgId
  const currentMonth = getCurrentBillingMonth()
  const lastMonth = getPreviousBillingMonth()
  const twoAgo = prevMonth(lastMonth)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [lgRes, thisRes, lastRes, twoRes, activeRes, actionsRes, signupsRes, activationsRes] = await Promise.all([
    supabase.from('lead_generators').select('total_earnings, total_referred, weekly_target_signups, weekly_target_activations').eq('id', lgId).single(),
    supabase.from('lg_earnings').select('amount, product_count').eq('lg_id', lgId).eq('billing_month', currentMonth),
    supabase.from('lg_earnings').select('amount, product_count').eq('lg_id', lgId).eq('billing_month', lastMonth),
    supabase.from('lg_earnings').select('amount').eq('lg_id', lgId).eq('billing_month', twoAgo),
    supabase.from('referral_tracking').select('id').eq('lg_id', lgId).in('status', ['active', 'slow']),
    supabase.from('lg_actions').select('*').eq('lg_id', lgId).eq('status', 'pending').order('priority', { ascending: false }).limit(10),
    supabase.from('referral_tracking').select('id').eq('lg_id', lgId).gte('signed_up_at', weekAgo),
    supabase.from('referral_tracking').select('id').eq('lg_id', lgId).gte('first_upload_at', weekAgo),
  ])

  const sumAmt = (rows: {amount: unknown}[]) => (rows||[]).reduce((s,r) => s + parseFloat(String(r.amount)), 0)
  const sumProd = (rows: {product_count: number}[]) => (rows||[]).reduce((s,r) => s + (r.product_count||0), 0)

  const thisEarnings = sumAmt(thisRes.data || [])
  const lastEarnings = sumAmt(lastRes.data || [])
  const twoEarnings = sumAmt(twoRes.data || [])
  const thisProducts = sumProd((thisRes.data||[]) as {product_count:number}[])
  const lastProducts = sumProd((lastRes.data||[]) as {product_count:number}[])
  const activeCount = (activeRes.data||[]).length
  const total = (lgRes.data?.total_referred as number) || 0
  const lifetime = parseFloat(String(lgRes.data?.total_earnings || 0))
  const momGrowth = lastEarnings > 0 ? ((thisEarnings - lastEarnings) / lastEarnings * 100) : 0
  const avgGrowth = (thisEarnings - twoEarnings) / 2
  const projection = Math.max(0, thisEarnings + avgGrowth)
  const activeRatio = total > 0 ? activeCount / total : 0
  const healthScore = Math.min(100, Math.round(activeRatio * 50 + Math.min(1, thisProducts / (activeCount * 200 || 1)) * 30 + 20))
  const weeklySignups = (signupsRes.data||[]).length
  const weeklyActivations = (activationsRes.data||[]).length
  const targetSignups = (lgRes.data?.weekly_target_signups as number) || 5
  const targetActivations = (lgRes.data?.weekly_target_activations as number) || 3
  const actions = actionsRes.data || []

  return (
    <div style={{ maxWidth: 840 }}>
      {/* Lifetime */}
      <div style={{ marginBottom: 48 }}>
        <span style={S.label}>Lifetime Earnings</span>
        <div style={{ ...S.mono, fontSize: 60, fontWeight: 700, color: '#FFFFFF', lineHeight: 1 }}>
          {fmt(lifetime)}
        </div>
      </div>

      {/* Action Feed */}
      {actions.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ ...S.label, marginBottom: 0 }}>Actions</span>
            <span style={{ background: '#FFFFFF', color: '#0A0A0A', fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '2px 6px' }}>
              {actions.length}
            </span>
          </div>
          <ActionFeed actions={actions} />
        </div>
      )}

      {/* This month / Last month */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={S.card}>
          <span style={S.label}>This Month</span>
          <div style={{ ...S.mono, fontSize: 28, fontWeight: 700, color: '#FFFFFF', marginBottom: 4 }}>{fmt(thisEarnings)}</div>
          {Math.abs(momGrowth) > 0.1 && (
            <div style={{ ...S.mono, fontSize: 12, color: momGrowth > 0 ? '#22C55E' : '#EF4444', marginBottom: 8 }}>
              {momGrowth > 0 ? '+' : ''}{momGrowth.toFixed(1)}%
            </div>
          )}
          <div style={{ ...S.mono, fontSize: 12, color: '#888888' }}>{thisProducts.toLocaleString()} products · {activeCount} active VAs</div>
        </div>
        <div style={S.card}>
          <span style={S.label}>Last Month</span>
          <div style={{ ...S.mono, fontSize: 28, fontWeight: 700, color: '#FFFFFF', marginBottom: 4 }}>{fmt(lastEarnings)}</div>
          <div style={{ ...S.mono, fontSize: 12, color: '#888888', marginTop: 8 }}>{lastProducts.toLocaleString()} products</div>
        </div>
      </div>

      {/* Weekly targets */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <WeeklyTargets
          lgId={lgId}
          weeklySignups={weeklySignups}
          weeklyActivations={weeklyActivations}
          targetSignups={targetSignups}
          targetActivations={targetActivations}
        />
      </div>

      {/* Network health + projection */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={S.card}>
          <span style={S.label}>Network Health</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1, height: 4, background: '#1F1F1F', borderRadius: 2 }}>
              <div style={{ height: 4, background: '#FFFFFF', borderRadius: 2, width: `${healthScore}%`, transition: 'width 0.3s' }} />
            </div>
            <span style={{ ...S.mono, fontSize: 14, color: '#FFFFFF', minWidth: 28 }}>{healthScore}</span>
          </div>
          <div style={{ ...S.mono, fontSize: 12, color: '#888888' }}>
            {activeCount} active · {Math.max(0, total - activeCount)} other · {total} total
          </div>
        </div>
        <div style={S.card}>
          <span style={S.label}>30-Day Projection</span>
          <div style={{ ...S.mono, fontSize: 24, fontWeight: 700, color: '#FFFFFF', marginBottom: 4 }}>
            {fmt(projection)}
            {projection >= thisEarnings
              ? <span style={{ fontSize: 14, color: '#22C55E', marginLeft: 8 }}>↑</span>
              : <span style={{ fontSize: 14, color: '#EF4444', marginLeft: 8 }}>↓</span>}
          </div>
          <div style={{ fontSize: 12, color: '#888888' }}>Based on 3-month trend</div>
        </div>
      </div>
    </div>
  )
}
