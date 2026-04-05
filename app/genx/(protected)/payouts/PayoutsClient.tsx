'use client'
import { useState } from 'react'

type Payout = {
  id: string; period_start: string; period_end: string; amount: number
  status: string; paid_at: string | null; reference: string | null; notes: string | null
}
type LBRow = { lg_id: string; active_vas: number; total_earned: number; rank: number | null }

const S = {
  label: { fontSize: 11, fontWeight: 500, color: '#555555', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8, display: 'block' },
  mono:  { fontFamily: "'JetBrains Mono', monospace" },
  card:  { background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 24 } as React.CSSProperties,
}

function fmtPeriod(start: string) {
  const d = new Date(start)
  return d.toLocaleString('en', { month: 'long', year: 'numeric' })
}

function statusColor(s: string) {
  if (s === 'paid')       return '#22C55E'
  if (s === 'processing') return '#FFFFFF'
  if (s === 'failed')     return '#EF4444'
  return '#888888'
}

function TrajectoryChart({ payouts }: { payouts: Payout[] }) {
  const sorted = [...payouts].sort((a, b) => a.period_start.localeCompare(b.period_start)).slice(-6)
  if (sorted.length < 2) return null

  const amounts = sorted.map(p => parseFloat(String(p.amount)))
  const maxAmt  = Math.max(...amounts, 1)
  const W = 480; const H = 80; const PAD = 40

  const pts = sorted.map((p, i) => ({
    x:     PAD + (i / (sorted.length - 1)) * (W - PAD * 2),
    y:     H - 20 - ((parseFloat(String(p.amount)) / maxAmt) * (H - 40)),
    amt:   parseFloat(String(p.amount)),
    month: p.period_start.slice(0, 7),
  }))

  const growth = amounts.length >= 2
    ? ((amounts[amounts.length-1] - amounts[amounts.length-2]) / (amounts[amounts.length-2] || 1) * 100)
    : 0

  const d = pts.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ')

  return (
    <div style={S.card}>
      <span style={S.label}>Trajectory</span>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H+20}`} style={{ width: '100%', minWidth: 300 }}>
          <path d={d} stroke="#FFFFFF" strokeWidth="1.5" fill="none" />
          {pts.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="3" fill="#FFFFFF" />
              <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize="9" fill="#555555">${p.amt.toFixed(0)}</text>
              <text x={p.x} y={H+16} textAnchor="middle" fontSize="9" fill="#555555">{p.month.slice(5)}</text>
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

export default function PayoutsClient({ pending, currentMonth, payouts, leaderboardRows, myLgId, myRank, totalLGs }: {
  pending: number; currentMonth: string; payouts: Payout[]
  leaderboardRows: LBRow[]; myLgId: string; myRank: number|null; totalLGs: number
}) {
  void useState

  const nextPayoutDate = (() => {
    const [y, mo] = currentMonth.split('-').map(Number)
    return new Date(y, mo, 1).toLocaleString('en', { month: 'long', day: 'numeric', year: 'numeric' })
  })()

  return (
    <div style={{ maxWidth: 840 }}>
      {/* Pending */}
      <div style={{ marginBottom: 32 }}>
        <span style={S.label}>Next Payout</span>
        <div style={{ ...S.mono, fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 8 }}>
          ${pending.toFixed(2)}
        </div>
        <div style={{ fontSize: 12, color: '#888888' }}>
          Pending for {fmtPeriod(`${currentMonth}-01`)} · Payout date: {nextPayoutDate}
        </div>
        {pending < 10 && pending > 0 && (
          <div style={{ fontSize: 12, color: '#555555', marginTop: 4 }}>
            ${(10 - pending).toFixed(2)} more needed to reach minimum payout ($10.00)
          </div>
        )}
      </div>

      {/* Leaderboard */}
      {leaderboardRows.length > 0 && (
        <div style={{ ...S.card, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={S.label}>Leaderboard</span>
            <span style={{ ...S.mono, fontSize: 11, color: '#555555' }}>{fmtPeriod(`${currentMonth}-01`)}</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['#', '', 'ACTIVE VAs', 'EARNINGS'].map((h, i) => (
                  <th key={i} style={{ fontSize: 10, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 0', textAlign: i < 2 ? 'left' : 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaderboardRows.map((row, i) => {
                const isMe = row.lg_id === myLgId
                return (
                  <tr key={row.lg_id} style={{ borderTop: '1px solid #1F1F1F', background: isMe ? '#1A1A1A' : 'transparent', borderLeft: isMe ? '2px solid #FFFFFF' : 'none' }}>
                    <td style={{ ...S.mono, padding: '10px 8px', fontSize: 12, color: isMe ? '#FFFFFF' : '#555555', width: 32 }}>#{i+1}</td>
                    <td style={{ padding: '10px 8px', fontSize: 13, color: '#888888' }}>{isMe ? 'You' : 'Anonymous'}</td>
                    <td style={{ ...S.mono, padding: '10px 8px', fontSize: 12, color: '#FFFFFF', textAlign: 'right' }}>{row.active_vas}</td>
                    <td style={{ ...S.mono, padding: '10px 8px', fontSize: 12, color: '#22C55E', textAlign: 'right' }}>${parseFloat(String(row.total_earned)).toFixed(2)}</td>
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
                <span style={{ color: '#FFFFFF', fontSize: 13 }}>{fmtPeriod(p.period_start)}</span>
                {p.reference && (
                  <span style={{ ...S.mono, fontSize: 12, color: '#555555', marginLeft: 12 }}>ref: {p.reference}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <span style={{ ...S.mono, fontSize: 13, color: '#22C55E' }}>${parseFloat(String(p.amount)).toFixed(2)}</span>
                <span style={{ fontSize: 11, color: statusColor(p.status), textTransform: 'uppercase', letterSpacing: '0.04em' }}>{p.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...S.card, marginTop: 24 }}>
        <span style={S.label}>Payment Method</span>
        <div style={{ fontSize: 13, color: '#555555' }}>Contact admin to set up your payout details.</div>
      </div>
    </div>
  )
}
