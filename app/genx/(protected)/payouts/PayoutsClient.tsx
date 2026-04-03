'use client'
import { useState } from 'react'

type Payout = {
  id: string; billing_month: string; total_earnings: number; payout_amount: number
  rolled_over: number; total_products: number; total_active_vas: number
  status: string; paid_at: string | null; payment_reference: string | null
}
type LBRow = { lg_id: string; active_vas: number; earnings: number; rank_earnings: number | null }

const S = {
  label: { fontSize: 11, fontWeight: 500, color: '#555555', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8, display: 'block' },
  mono: { fontFamily: "'JetBrains Mono', monospace" },
  card: { background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 24 } as React.CSSProperties,
}

function fmtMonth(m: string) {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo)-1, 1).toLocaleString('en', { month: 'long', year: 'numeric' })
}

function statusColor(s: string) {
  if (s === 'paid') return '#22C55E'
  if (s === 'rolled_over') return '#888888'
  return '#FFFFFF'
}

function TrajectoryChart({ payouts }: { payouts: Payout[] }) {
  const sorted = [...payouts].sort((a,b) => a.billing_month.localeCompare(b.billing_month)).slice(-6)
  if (sorted.length < 2) return null

  const amounts = sorted.map(p => parseFloat(String(p.total_earnings)))
  const maxAmt = Math.max(...amounts, 1)
  const W = 480; const H = 80; const PADDING = 40

  const pts = sorted.map((p, i) => {
    const x = PADDING + (i / (sorted.length - 1)) * (W - PADDING * 2)
    const y = H - 20 - ((parseFloat(String(p.total_earnings)) / maxAmt) * (H - 40))
    return { x, y, amt: parseFloat(String(p.total_earnings)), month: p.billing_month }
  })

  const growth = amounts.length >= 2
    ? ((amounts[amounts.length-1] - amounts[amounts.length-2]) / (amounts[amounts.length-2] || 1) * 100)
    : 0

  const d = pts.map((p,i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ')

  return (
    <div style={S.card}>
      <span style={S.label}>Trajectory</span>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H+20}`} style={{ width: '100%', minWidth: 300 }}>
          <path d={d} stroke="#FFFFFF" strokeWidth="1.5" fill="none" />
          {pts.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="3" fill="#FFFFFF" />
              <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize="9" fill="#555555">
                ${p.amt.toFixed(0)}
              </text>
              <text x={p.x} y={H+16} textAnchor="middle" fontSize="9" fill="#555555">
                {p.month.slice(5)}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div style={{ ...S.mono, fontSize: 12, marginTop: 8, color: growth >= 0 ? '#22C55E' : '#EF4444' }}>
        {growth >= 0 ? '+' : ''}{growth.toFixed(1)}% month over month
      </div>
    </div>
  )
}

export default function PayoutsClient({ pending, currentMonth, payouts, leaderboardRows, myLgId, myRank, totalLGs, payoutMethod, minimumPayout }: {
  pending: number; currentMonth: string; payouts: Payout[]
  leaderboardRows: LBRow[]; myLgId: string; myRank: number|null; totalLGs: number
  payoutMethod: Record<string,string>|null; minimumPayout: number
}) {
  const [_tab] = useState('payouts')

  const nextPayoutDate = (() => {
    const [y, mo] = currentMonth.split('-').map(Number)
    const next = new Date(y, mo, 1) // first of next month
    return next.toLocaleString('en', { month: 'long', day: 'numeric', year: 'numeric' })
  })()

  return (
    <div style={{ maxWidth: 840 }}>
      {/* Pending payout */}
      <div style={{ marginBottom: 32 }}>
        <span style={S.label}>Next Payout</span>
        <div style={{ ...S.mono, fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 8 }}>
          ${pending.toFixed(2)}
        </div>
        <div style={{ fontSize: 12, color: '#888888' }}>
          Pending for {fmtMonth(currentMonth)} · Payout date: {nextPayoutDate}
        </div>
        {pending < minimumPayout && (
          <div style={{ fontSize: 12, color: '#555555', marginTop: 4 }}>
            ${(minimumPayout - pending).toFixed(2)} more needed to reach minimum payout (${minimumPayout.toFixed(2)})
          </div>
        )}
      </div>

      {/* Leaderboard */}
      {leaderboardRows.length > 0 && (
        <div style={{ ...S.card, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={S.label}>Leaderboard</span>
            <span style={{ ...S.mono, fontSize: 11, color: '#555555' }}>{fmtMonth(currentMonth)}</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['#','','ACTIVE VAs','EARNINGS'].map((h,i) => (
                  <th key={i} style={{ fontSize: 10, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 0', textAlign: i < 2 ? 'left' : 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaderboardRows.map((row, i) => {
                const isMe = row.lg_id === myLgId
                return (
                  <tr key={row.lg_id} style={{
                    borderTop: '1px solid #1F1F1F',
                    background: isMe ? '#1A1A1A' : 'transparent',
                    borderLeft: isMe ? '2px solid #FFFFFF' : 'none',
                  }}>
                    <td style={{ ...S.mono, padding: '10px 8px', fontSize: 12, color: isMe ? '#FFFFFF' : '#555555', width: 32 }}>#{i+1}</td>
                    <td style={{ padding: '10px 8px', fontSize: 13, color: '#888888' }}>{isMe ? 'You' : 'Anonymous'}</td>
                    <td style={{ ...S.mono, padding: '10px 8px', fontSize: 12, color: '#FFFFFF', textAlign: 'right' }}>{row.active_vas}</td>
                    <td style={{ ...S.mono, padding: '10px 8px', fontSize: 12, color: '#22C55E', textAlign: 'right' }}>${parseFloat(String(row.earnings)).toFixed(2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {myRank && (
            <div style={{ ...S.mono, fontSize: 12, color: '#555555', marginTop: 12 }}>
              Your rank: #{myRank} of {totalLGs} active lead generators
            </div>
          )}
        </div>
      )}

      {/* Trajectory */}
      {payouts.length >= 2 && (
        <div style={{ marginBottom: 24 }}>
          <TrajectoryChart payouts={payouts} />
        </div>
      )}

      {/* History */}
      {payouts.length > 0 && (
        <div style={S.card}>
          <span style={S.label}>History</span>
          {payouts.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: i < payouts.length - 1 ? '1px solid #1F1F1F' : 'none' }}>
              <div>
                <span style={{ color: '#FFFFFF', fontSize: 13 }}>{fmtMonth(p.billing_month)}</span>
                <span style={{ ...S.mono, fontSize: 12, color: '#555555', marginLeft: 12 }}>
                  {p.total_active_vas} VAs · {p.total_products.toLocaleString()} products
                </span>
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <span style={{ ...S.mono, fontSize: 13, color: '#22C55E' }}>${parseFloat(String(p.total_earnings)).toFixed(2)}</span>
                <span style={{ fontSize: 11, color: statusColor(p.status), textTransform: 'uppercase', letterSpacing: '0.04em' }}>{p.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payment method */}
      <div style={{ ...S.card, marginTop: 24 }}>
        <span style={S.label}>Payment Method</span>
        {payoutMethod ? (
          <div style={{ fontSize: 13, color: '#888888' }}>
            {payoutMethod.type || 'Unknown'}{payoutMethod.account_ending ? ` · ending in ${payoutMethod.account_ending}` : ''}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#555555' }}>No payment method set. Contact admin to set up your payout details.</div>
        )}
      </div>
    </div>
  )
}
