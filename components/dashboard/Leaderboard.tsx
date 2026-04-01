'use client'

import { useEffect, useState } from 'react'

interface LeaderboardEntry {
  rank:    number
  earned:  number
  clients: number
  isYou:   boolean
}

interface LeaderboardData {
  entries:        LeaderboardEntry[]
  myRank:         number
  totalOperators: number
}

const C = {
  border:   '#EEEEEE',
  bgSecond: '#FAFAFA',
  bgThird:  '#F5F5F5',
  textPri:  '#111111',
  textSec:  '#555555',
  textTer:  '#999999',
  textMut:  '#CCCCCC',
  green:    '#2DB87E',
  greenDk:  '#059669',
  mintBg:   '#F0FDF9',
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span style={{ fontSize: 16 }}>🥇</span>
  if (rank === 2) return <span style={{ fontSize: 16 }}>🥈</span>
  if (rank === 3) return <span style={{ fontSize: 16 }}>🥉</span>
  return <span style={{ fontSize: 13, fontWeight: 500, color: C.textMut }}>{rank}</span>
}

export function Leaderboard({ vaId }: { vaId: string }) {
  const [data,    setData]    = useState<LeaderboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!vaId) return
    fetch(`/api/leaderboard?vaId=${vaId}`)
      .then(r => r.json())
      .then((d: LeaderboardData) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [vaId])

  if (loading) {
    return (
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '20px 20px 16px' }}>
          <div style={{ height: 12, width: 90, background: C.bgThird, borderRadius: 4 }} />
        </div>
        <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: 24, background: C.bgThird, borderRadius: 6 }} />
          ))}
        </div>
      </div>
    )
  }

  if (!data) return null

  const { entries, myRank, totalOperators } = data
  const topPct         = totalOperators > 0 ? Math.round((myRank / totalOperators) * 100) : 100
  const myEntry        = entries.find(e => e.isYou)
  const top10Entries   = entries.filter(e => e.rank <= 10)
  const showSeparator  = myRank > 10
  const top10Threshold = entries.find(e => e.rank === 10)?.earned ?? 0
  const toTop10        = myEntry ? Math.max(0, top10Threshold - myEntry.earned) : 0
  const progressPct    = top10Threshold > 0 ? Math.min(100, ((myEntry?.earned ?? 0) / top10Threshold) * 100) : 0

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
          Leaderboard
        </p>
        <p style={{ fontSize: 11, color: C.textMut, margin: 0 }}>Last 30 days</p>
      </div>

      {/* Your rank card */}
      <div style={{ margin: '16px 16px 16px', background: C.bgSecond, borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 10, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>
              Your rank
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 28, fontWeight: 600, color: C.textPri, lineHeight: 1, letterSpacing: '-0.02em' }}>
                #{myRank}
              </span>
              <span style={{ fontSize: 13, color: C.textMut }}>/ {totalOperators}</span>
            </div>
          </div>
          <div>
            {topPct <= 10 && (
              <span style={{ fontSize: 11, fontWeight: 600, color: C.greenDk, background: '#D1FAE5', padding: '5px 12px', borderRadius: 100 }}>
                Top 10%
              </span>
            )}
            {topPct > 10 && topPct <= 25 && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#2563EB', background: '#DBEAFE', padding: '5px 12px', borderRadius: 100 }}>
                Top 25%
              </span>
            )}
            {topPct > 25 && topPct <= 50 && (
              <span style={{ fontSize: 11, fontWeight: 600, color: C.textSec, background: C.bgThird, padding: '5px 12px', borderRadius: 100 }}>
                Top 50%
              </span>
            )}
          </div>
        </div>

        {/* Progress bar — only when outside top 10 */}
        {myRank > 10 && toTop10 > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ height: 4, borderRadius: 4, background: C.border, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, borderRadius: 4, background: C.green, transition: 'width 0.7s ease' }} />
            </div>
            <p style={{ marginTop: 6, fontSize: 11, color: C.textMut }}>
              ${toTop10.toLocaleString()} to reach top 10
            </p>
          </div>
        )}
      </div>

      {/* List header */}
      <div style={{ padding: '0 20px 8px' }}>
        <p style={{ fontSize: 10, color: C.textMut, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
          Top operators
        </p>
      </div>

      {/* Rows */}
      <div>
        {top10Entries.map((entry, i) => (
          <div
            key={entry.rank}
            style={{
              display: 'flex', alignItems: 'center',
              padding: '9px 20px',
              background: entry.isYou ? C.mintBg : i % 2 === 0 ? '#FFFFFF' : C.bgSecond,
            }}
          >
            <div style={{ width: 28, flexShrink: 0 }}>
              <RankBadge rank={entry.rank} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontSize: 13, margin: 0,
                fontWeight: entry.isYou ? 600 : 400,
                color: entry.isYou ? C.greenDk : C.textSec,
              }}>
                {entry.isYou ? 'You' : `Anonymous #${entry.rank}`}
              </p>
            </div>
            <p style={{ fontSize: 12, color: C.textMut, width: 28, textAlign: 'right', flexShrink: 0, margin: 0 }}>
              {entry.clients}c
            </p>
            <p style={{
              fontSize: 13, fontWeight: 500,
              color: entry.isYou ? C.green : C.textPri,
              width: 72, textAlign: 'right', flexShrink: 0, margin: 0,
            }}>
              ${entry.earned.toLocaleString()}
            </p>
          </div>
        ))}

        {/* Separator + own row if outside top 10 */}
        {showSeparator && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', padding: '6px 20px' }}>
              <div style={{ flex: 1, borderTop: `1px dashed ${C.border}` }} />
              <span style={{ padding: '0 10px', fontSize: 11, color: C.textMut }}>···</span>
              <div style={{ flex: 1, borderTop: `1px dashed ${C.border}` }} />
            </div>
            {myEntry && (
              <div style={{ display: 'flex', alignItems: 'center', padding: '9px 20px', background: C.mintBg }}>
                <div style={{ width: 28, flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: C.textMut }}>{myEntry.rank}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.greenDk, margin: 0 }}>You</p>
                </div>
                <p style={{ fontSize: 12, color: C.textMut, width: 28, textAlign: 'right', flexShrink: 0, margin: 0 }}>
                  {myEntry.clients}c
                </p>
                <p style={{ fontSize: 13, fontWeight: 500, color: C.green, width: 72, textAlign: 'right', flexShrink: 0, margin: 0 }}>
                  ${myEntry.earned.toLocaleString()}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
        <p style={{ fontSize: 11, color: C.textMut, margin: 0 }}>
          {totalOperators} operators active this month
        </p>
      </div>

    </div>
  )
}
