import { redirect } from 'next/navigation'
import { getGenxSession } from '@/lib/genx-auth'
import { supabase } from '@/lib/supabase'
import { getCurrentBillingMonth, getPreviousBillingMonth } from '@/lib/usage-tracker'

const S = {
  label: { fontSize: 11, fontWeight: 500, color: '#555555', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8, display: 'block' },
  mono:  { fontFamily: "'JetBrains Mono', monospace" },
  card:  { background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 24 } as React.CSSProperties,
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
  const lgId         = session.lgId
  const currentMonth = getCurrentBillingMonth()
  const lastMonth    = getPreviousBillingMonth()
  const twoAgo       = prevMonth(lastMonth)

  const [lgRes, thisRes, lastRes, twoRes, activeRes, attentionRes] = await Promise.all([
    supabase.from('lead_generators').select('total_earnings, total_referred').eq('id', lgId).single(),
    supabase.from('lg_earnings').select('amount, product_count').eq('lg_id', lgId).eq('billing_month', currentMonth),
    supabase.from('lg_earnings').select('amount, product_count').eq('lg_id', lgId).eq('billing_month', lastMonth),
    supabase.from('lg_earnings').select('amount').eq('lg_id', lgId).eq('billing_month', twoAgo),
    supabase.from('referral_tracking').select('id').eq('lg_id', lgId).in('status', ['active', 'slow']),
    supabase.from('referral_tracking')
      .select('va_id, status, velocity_percent, products_this_month, products_last_month')
      .eq('lg_id', lgId)
      .or('status.eq.inactive,status.eq.slow')
      .order('products_last_month', { ascending: false })
      .limit(5),
  ])

  const sumAmt  = (rows: { amount: unknown }[]) => (rows || []).reduce((s, r) => s + parseFloat(String(r.amount)), 0)
  const sumProd = (rows: { product_count: number }[]) => (rows || []).reduce((s, r) => s + (r.product_count || 0), 0)

  const thisEarnings = sumAmt(thisRes.data || [])
  const lastEarnings = sumAmt(lastRes.data || [])
  const twoEarnings  = sumAmt(twoRes.data || [])
  const thisProducts = sumProd((thisRes.data || []) as { product_count: number }[])
  const lastProducts = sumProd((lastRes.data || []) as { product_count: number }[])
  const activeCount  = (activeRes.data || []).length
  const total        = (lgRes.data?.total_referred as number) || 0
  const lifetime     = parseFloat(String(lgRes.data?.total_earnings || 0))
  const momGrowth    = lastEarnings > 0 ? ((thisEarnings - lastEarnings) / lastEarnings * 100) : 0
  const avgGrowth    = (thisEarnings - twoEarnings) / 2
  const projection   = Math.max(0, thisEarnings + avgGrowth)
  const activeRatio  = total > 0 ? activeCount / total : 0
  const healthScore  = Math.min(100, Math.round(activeRatio * 50 + Math.min(1, thisProducts / (activeCount * 200 || 1)) * 30 + 20))

  // Attention VA names
  const attention = attentionRes.data || []
  const vaIds     = attention.map((r: { va_id: string }) => r.va_id)
  let vaNames: Record<string, string> = {}
  if (vaIds.length) {
    const { data: vas } = await supabase.from('vas').select('id, name').in('id', vaIds)
    vaNames = Object.fromEntries((vas || []).map(v => [v.id, v.name]))
  }

  return (
    <div style={{ maxWidth: 840 }}>
      {/* Lifetime */}
      <div style={{ marginBottom: 48 }}>
        <span style={S.label}>Lifetime Earnings</span>
        <div style={{ ...S.mono, fontSize: 56, fontWeight: 700, color: '#FFFFFF', lineHeight: 1 }}>
          {fmt(lifetime)}
        </div>
      </div>

      {/* This month / Last month */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={S.card}>
          <span style={S.label}>This Month</span>
          <div style={{ ...S.mono, fontSize: 28, fontWeight: 700, color: '#FFFFFF', marginBottom: 4 }}>{fmt(thisEarnings)}</div>
          {Math.abs(momGrowth) > 0.5 && (
            <div style={{ ...S.mono, fontSize: 12, color: momGrowth > 0 ? '#22C55E' : '#EF4444', marginBottom: 8 }}>
              {momGrowth > 0 ? '+' : ''}{momGrowth.toFixed(1)}% vs last month
            </div>
          )}
          <div style={{ ...S.mono, fontSize: 12, color: '#888888' }}>{thisProducts} products · {activeCount} active VAs</div>
        </div>
        <div style={S.card}>
          <span style={S.label}>Last Month</span>
          <div style={{ ...S.mono, fontSize: 28, fontWeight: 700, color: '#FFFFFF', marginBottom: 4 }}>{fmt(lastEarnings)}</div>
          <div style={{ ...S.mono, fontSize: 12, color: '#888888', marginTop: 8 }}>{lastProducts} products</div>
        </div>
      </div>

      {/* Network health */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <span style={S.label}>Network Health</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div style={{ flex: 1, height: 6, background: '#1F1F1F', borderRadius: 3 }}>
            <div style={{ height: 6, background: '#FFFFFF', borderRadius: 3, width: `${healthScore}%` }} />
          </div>
          <span style={{ ...S.mono, fontSize: 13, color: '#FFFFFF', minWidth: 28 }}>{healthScore}</span>
        </div>
        <div style={{ ...S.mono, fontSize: 12, color: '#888888' }}>
          {activeCount} active · {Math.max(0, total - activeCount)} inactive · {total} total
        </div>
      </div>

      {/* 30-day projection */}
      <div style={{ ...S.card, marginBottom: 24 }}>
        <span style={S.label}>30-Day Projection</span>
        <div style={{ fontSize: 13, color: '#888888' }}>
          Based on current trajectory, next month{' '}
          <span style={{ ...S.mono, color: '#FFFFFF', fontWeight: 700 }}>{fmt(projection)}</span>
          {projection >= thisEarnings
            ? <span style={{ color: '#22C55E' }}> ↑</span>
            : <span style={{ color: '#EF4444' }}> ↓</span>}
        </div>
      </div>

      {/* Attention needed */}
      {attention.length > 0 && (
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={S.label}>Attention Needed</span>
            <span style={{ background: '#FFFFFF', color: '#0A0A0A', fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '2px 6px' }}>
              {attention.length}
            </span>
          </div>
          {(attention as { va_id: string; status: string; velocity_percent: number; products_this_month: number }[]).map((va, i) => (
            <div key={i} style={{ padding: '10px 0', borderBottom: i < attention.length - 1 ? '1px solid #1F1F1F' : 'none', display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <span style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 500 }}>{vaNames[va.va_id] || 'Unknown'}</span>
                <span style={{ color: '#888888', fontSize: 13 }}> — {va.status}</span>
              </div>
              <span style={{ ...S.mono, fontSize: 12, color: (va.velocity_percent || 0) < -40 ? '#EF4444' : '#888888' }}>
                {va.products_this_month} products
                {(va.velocity_percent || 0) !== 0 && <> · {(va.velocity_percent || 0) > 0 ? '+' : ''}{(va.velocity_percent || 0).toFixed(0)}%</>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
