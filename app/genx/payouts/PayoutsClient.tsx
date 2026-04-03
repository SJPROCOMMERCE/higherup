'use client'

const S = {
  label: { fontSize: 11, fontWeight: 500, color: '#555555', textTransform: 'uppercase' as const, letterSpacing: '0.05em', display: 'block', marginBottom: 8 },
  mono:  { fontFamily: "'JetBrains Mono', monospace" },
  card:  { background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 24 } as React.CSSProperties,
}

type Payout = {
  id: string; billing_month: string; payout_amount: number; total_earnings: number
  rolled_over: number; total_products: number; total_active_vas: number
  status: string; paid_at: string | null; payment_reference: string | null; notes: string | null
}

function formatMonth(m: string) {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' })
}

function statusBadge(s: string) {
  const colors: Record<string, string> = {
    paid:        '#22C55E',
    pending:     '#EAB308',
    rolled_over: '#888888',
  }
  return (
    <span style={{ ...S.mono, fontSize: 11, color: colors[s] || '#888888', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {s.replace('_', ' ')}
    </span>
  )
}

export default function PayoutsClient({ currentMonth, pendingEarnings, rolledOver, minimumPayout, lifetimeEarnings, payouts }: {
  currentMonth: string; pendingEarnings: number; rolledOver: number
  minimumPayout: number; lifetimeEarnings: number; payouts: Record<string, unknown>[]
}) {
  const total    = pendingEarnings + rolledOver
  const meetsMin = total >= minimumPayout
  const paidList = payouts as unknown as Payout[]

  // Build SVG chart data (last 6 payouts)
  const chartData = paidList
    .filter(p => p.status !== 'rolled_over')
    .slice(0, 6)
    .reverse()
  const maxAmt = Math.max(...chartData.map(p => parseFloat(String(p.payout_amount))), 1)

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: '#FFFFFF', margin: '0 0 32px' }}>Payouts</h1>

      {/* Pending */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <span style={S.label}>Pending — {formatMonth(currentMonth)}</span>
        <div style={{ ...S.mono, fontSize: 40, fontWeight: 700, color: '#FFFFFF', marginBottom: 8 }}>
          ${total.toFixed(2)}
        </div>
        <div style={{ fontSize: 13, color: '#888888' }}>
          ${pendingEarnings.toFixed(2)} this month
          {rolledOver > 0 && <> + <span style={{ color: '#FFFFFF' }}>${rolledOver.toFixed(2)}</span> rolled over</>}
        </div>
        {!meetsMin && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#555555' }}>
            Need <span style={{ ...S.mono, color: '#FFFFFF' }}>${(minimumPayout - total).toFixed(2)}</span> more to reach the ${minimumPayout} minimum. Earnings roll over automatically.
          </div>
        )}
      </div>

      {/* SVG Trajectory chart */}
      {chartData.length > 1 && (
        <div style={{ ...S.card, marginBottom: 32 }}>
          <span style={S.label}>Trajectory</span>
          <svg viewBox={`0 0 ${chartData.length * 100} 80`} style={{ width: '100%', height: 80, overflow: 'visible' }}>
            <polyline
              points={chartData.map((p, i) => {
                const x = i * 100 + 50
                const y = 70 - (parseFloat(String(p.payout_amount)) / maxAmt) * 60
                return `${x},${y}`
              }).join(' ')}
              fill="none" stroke="#FFFFFF" strokeWidth="1.5"
            />
            {chartData.map((p, i) => {
              const x = i * 100 + 50
              const y = 70 - (parseFloat(String(p.payout_amount)) / maxAmt) * 60
              return (
                <g key={i}>
                  <circle cx={x} cy={y} r={3} fill="#FFFFFF" />
                  <text x={x} y={y - 8} textAnchor="middle" fontSize={9} fill="#888888" fontFamily="JetBrains Mono, monospace">
                    ${parseFloat(String(p.payout_amount)).toFixed(0)}
                  </text>
                  <text x={x} y={76} textAnchor="middle" fontSize={9} fill="#555555" fontFamily="JetBrains Mono, monospace">
                    {p.billing_month.slice(5)}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      )}

      {/* Payout history */}
      {paidList.length > 0 && (
        <div style={{ border: '1px solid #1F1F1F', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ background: '#141414', borderBottom: '1px solid #1F1F1F', padding: '10px 16px', display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px' }}>
            {['MONTH', 'PRODUCTS', 'AMOUNT', 'STATUS'].map(h => (
              <span key={h} style={S.label}>{h}</span>
            ))}
          </div>
          {paidList.map((p, i) => (
            <div key={p.id} style={{ padding: '12px 16px', borderBottom: i < paidList.length - 1 ? '1px solid #1F1F1F' : 'none', display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#FFFFFF' }}>{formatMonth(p.billing_month)}</span>
              <span style={{ ...S.mono, fontSize: 12, color: '#888888' }}>{p.total_products}</span>
              <span style={{ ...S.mono, fontSize: 13, color: p.status === 'paid' ? '#22C55E' : '#888888' }}>
                ${parseFloat(String(p.payout_amount)).toFixed(2)}
              </span>
              {statusBadge(p.status)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
