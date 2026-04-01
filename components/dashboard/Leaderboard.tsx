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

const RANK_COLOR: Record<number, string> = {
  1: '#F59E0B',
  2: '#9CA3AF',
  3: '#B45309',
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
      <div style={{ background: '#FAFAFA', borderRadius: 16, padding: 24 }}>
        <div style={{ height: 14, width: 100, background: '#F0F0F0', borderRadius: 4 }} />
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ height: 28, background: '#F0F0F0', borderRadius: 6 }} />
          ))}
        </div>
      </div>
    )
  }

  if (!data) return null

  const { entries, myRank, totalOperators } = data
  const topPct    = Math.round((myRank / totalOperators) * 100)
  const myEntry   = entries.find(e => e.isYou)
  const top10Last = entries.find(e => e.rank === 10)
  const gapToTop10 = top10Last && myEntry ? top10Last.earned - myEntry.earned : 0

  return (
    <div style={{ background: '#FAFAFA', borderRadius: 16, padding: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: '#999999', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
          Leaderboard
        </p>
        <p style={{ fontSize: 11, color: '#CCCCCC', margin: 0 }}>Last 30 days</p>
      </div>

      {/* Your rank */}
      <div style={{ marginTop: 16, background: '#FFFFFF', borderRadius: 12, padding: 16, border: '1px solid #E8E8E8' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 11, color: '#CCCCCC', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>
              Your rank
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 32, fontWeight: 600, color: '#111111', lineHeight: 1 }}>
                #{myRank}
              </span>
              <span style={{ fontSize: 14, color: '#CCCCCC' }}>of {totalOperators}</span>
            </div>
          </div>
          <div>
            {topPct <= 10 && (
              <span style={{ fontSize: 11, fontWeight: 500, color: '#059669', background: '#D1FAE5', padding: '4px 12px', borderRadius: 100 }}>
                Top 10%
              </span>
            )}
            {topPct > 10 && topPct <= 25 && (
              <span style={{ fontSize: 11, fontWeight: 500, color: '#2563EB', background: '#DBEAFE', padding: '4px 12px', borderRadius: 100 }}>
                Top 25%
              </span>
            )}
            {topPct > 25 && topPct <= 50 && (
              <span style={{ fontSize: 11, fontWeight: 500, color: '#999999', background: '#F3F4F6', padding: '4px 12px', borderRadius: 100 }}>
                Top 50%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Top operators */}
      <div style={{ marginTop: 20 }}>
        <p style={{ fontSize: 10, color: '#CCCCCC', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
          Top operators
        </p>

        {entries.map((entry, i) => {
          const isYou      = entry.isYou
          const isSeparator = myRank > 10 && i === 10 // gap before "you" row
          const rankColor  = RANK_COLOR[entry.rank] ?? '#CCCCCC'

          return (
            <div key={`${entry.rank}-${isYou}`}>
              {isSeparator && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <div style={{ flex: 1, borderTop: '1px dashed #EEEEEE' }} />
                  <span style={{ fontSize: 10, color: '#DDDDDD' }}>···</span>
                  <div style={{ flex: 1, borderTop: '1px dashed #EEEEEE' }} />
                </div>
              )}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: isYou ? '8px 8px' : '8px 0',
                borderTop: !isSeparator && i > 0 ? '1px solid #F0F0F0' : 'none',
                background: isYou ? '#FFFFFF' : 'transparent',
                borderRadius: isYou ? 8 : 0,
                margin: isYou ? '0 -8px' : 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 20, fontSize: 13, fontWeight: 600, color: rankColor, flexShrink: 0 }}>
                    {entry.rank}
                  </span>
                  <span style={{ fontSize: 13, color: isYou ? '#111111' : '#999999', fontWeight: isYou ? 500 : 400 }}>
                    {isYou ? 'You' : `Operator #${entry.rank}`}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 11, color: '#CCCCCC' }}>{entry.clients}c</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: isYou ? '#10B981' : '#111111' }}>
                    ${entry.earned.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Motivator */}
      {myRank > 10 && gapToTop10 > 0 && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #F0F0F0', textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: '#CCCCCC', margin: 0 }}>
            ${gapToTop10.toLocaleString()} more to reach the top 10
          </p>
        </div>
      )}

    </div>
  )
}
