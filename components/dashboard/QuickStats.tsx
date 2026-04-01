'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '@/components/LanguageProvider'

interface Stats {
  earnings: number
  clients:  number
  streak:   number
}

export function QuickStats({ vaId }: { vaId: string }) {
  const { tr }                    = useLanguage()
  const qs                        = tr.quickStats
  const [stats,     setStats]     = useState<Stats | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('higherup_quickstats_collapsed')
    if (stored === 'true') setCollapsed(true)
  }, [])

  useEffect(() => {
    if (!vaId) return
    fetch(`/api/quick-stats?vaId=${vaId}`)
      .then(r => r.json())
      .then((d: Stats) => setStats(d))
      .catch(() => {})
  }, [vaId])

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem('higherup_quickstats_collapsed', String(next))
      return next
    })
  }

  // Desktop only — hide on mobile via CSS
  return (
    <div className="quickstats-widget" style={{
      position:   'fixed',
      bottom:     24,
      right:      24,
      zIndex:     200,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {collapsed ? (
        // Collapsed pill
        <button
          onClick={toggleCollapsed}
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          6,
            background:   'var(--bg-primary)',
            border:       '1px solid var(--border-light)',
            borderRadius: 100,
            padding:      '8px 16px',
            cursor:       'pointer',
            boxShadow:    '0 4px 20px rgba(0,0,0,0.10)',
            fontSize:     12,
            fontWeight:   500,
            color:        'var(--text-primary)',
            whiteSpace:   'nowrap',
          }}
        >
          <span style={{ fontSize: 14 }}>📊</span>
          <span>{qs.title}</span>
          {stats && (
            <span style={{ color: '#2DB87E', fontWeight: 600 }}>
              ${stats.earnings.toLocaleString()}
            </span>
          )}
        </button>
      ) : (
        // Expanded card
        <div style={{
          background:   'var(--bg-primary)',
          border:       '1px solid var(--border-light)',
          borderRadius: 16,
          padding:      '16px 20px',
          boxShadow:    '0 4px 24px rgba(0,0,0,0.10)',
          minWidth:     200,
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {qs.title}
            </span>
            <button
              onClick={toggleCollapsed}
              aria-label={qs.collapse}
              style={{
                background:   'none',
                border:       'none',
                cursor:       'pointer',
                padding:      2,
                color:        'var(--text-muted)',
                lineHeight:   1,
                fontSize:     14,
                display:      'flex',
                alignItems:   'center',
              }}
            >
              {/* Chevron down */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>

          {/* Stats */}
          {!stats ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[80, 60, 50].map((w, i) => (
                <div key={i} style={{ height: 12, width: w, background: 'var(--bg-tertiary)', borderRadius: 4 }} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Stat label={qs.earnings} value={`$${stats.earnings.toLocaleString()}`} accent />
              <Stat label={qs.clients}  value={String(stats.clients)} />
              <Stat
                label={qs.streak}
                value={`${stats.streak} ${qs.weeks}`}
                accent={stats.streak >= 3}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{
        fontSize:   13,
        fontWeight: 600,
        color:      accent ? '#2DB87E' : 'var(--text-primary)',
      }}>
        {value}
      </span>
    </div>
  )
}
