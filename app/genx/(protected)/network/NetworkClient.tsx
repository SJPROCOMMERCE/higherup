'use client'

import { useState } from 'react'

type Row = {
  va_id: string; va_name: string; signed_up_at: string; status: string
  products_this_month: number; products_last_month: number
  velocity_percent: number; total_products_lifetime: number; you_earned: number
}
type Cohort = { month: string; count: number; avg_products: number; avg_earned: number }
type SortKey = 'va_name' | 'signed_up_at' | 'products_this_month' | 'velocity_percent' | 'you_earned'
type Filter   = 'all' | 'active' | 'slow' | 'inactive'

const S = {
  label: { fontSize: 11, fontWeight: 500, color: '#555555', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  mono:  { fontFamily: "'JetBrains Mono', monospace" },
  card:  { background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 24 } as React.CSSProperties,
}

function statusColor(s: string) {
  if (s === 'active')   return '#22C55E'
  if (s === 'slow')     return '#EAB308'
  if (s === 'inactive') return '#EF4444'
  return '#555555'
}

function relDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en', { month: 'short', day: 'numeric' })
}

function formatMonth(m: string) {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString('en', { month: 'short', year: 'numeric' })
}

export default function NetworkClient({ rows, cohorts }: { rows: Row[]; cohorts: Cohort[] }) {
  const [filter, setFilter]   = useState<Filter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('you_earned')
  const [sortAsc, setSortAsc] = useState(false)

  const counts = {
    all:      rows.length,
    active:   rows.filter(r => r.status === 'active').length,
    slow:     rows.filter(r => r.status === 'slow').length,
    inactive: rows.filter(r => r.status === 'inactive' || r.status === 'signed_up').length,
  }

  const filtered = rows
    .filter(r => {
      if (filter === 'all')      return true
      if (filter === 'inactive') return r.status === 'inactive' || r.status === 'signed_up'
      return r.status === filter
    })
    .sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(false) }
  }

  const FILTERS: { key: Filter; label: string; dot: string }[] = [
    { key: 'all',      label: `ALL ${counts.all}`,      dot: '' },
    { key: 'active',   label: `${counts.active}`,        dot: '#22C55E' },
    { key: 'slow',     label: `${counts.slow}`,          dot: '#EAB308' },
    { key: 'inactive', label: `${counts.inactive}`,      dot: '#EF4444' },
  ]

  return (
    <div>
      <div style={{ marginBottom: 32, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#FFFFFF', margin: 0 }}>Network</h1>
        <span style={{ ...S.mono, fontSize: 12, color: '#555555' }}>{rows.length} total VAs</span>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: filter === f.key ? '#FFFFFF' : '#141414',
            color: filter === f.key ? '#0A0A0A' : '#888888',
            border: '1px solid',
            borderColor: filter === f.key ? 'transparent' : '#1F1F1F',
            borderRadius: 6, padding: '6px 12px', fontSize: 12,
            fontWeight: filter === f.key ? 600 : 400, cursor: 'pointer',
          }}>
            {f.dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: f.dot, display: 'inline-block' }} />}
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ border: '1px solid #1F1F1F', borderRadius: 8, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 100px 100px 90px 100px', gap: 0, background: '#141414', borderBottom: '1px solid #1F1F1F', padding: '10px 16px' }}>
          {(['va_name', 'signed_up_at', 'products_this_month', 'velocity_percent', 'you_earned'] as SortKey[]).map((key, idx) => {
            const labels = ['NAME', 'JOINED', 'PRODUCTS', 'VELOCITY', 'YOU EARNED']
            return (
              <button key={key} onClick={() => toggleSort(key)} style={{
                ...S.label, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                textAlign: idx === 0 ? 'left' : 'right',
                color: sortKey === key ? '#FFFFFF' : '#555555',
              }}>
                {labels[idx]}{sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : ''}
              </button>
            )
          })}
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div style={{ padding: 24, color: '#555555', fontSize: 13, textAlign: 'center' }}>No VAs in this category</div>
        ) : filtered.map((r, i) => (
          <div key={r.va_id} style={{
            display: 'grid', gridTemplateColumns: '2fr 100px 100px 90px 100px',
            padding: '12px 16px',
            borderBottom: i < filtered.length - 1 ? '1px solid #1F1F1F' : 'none',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(r.status), display: 'inline-block', flexShrink: 0 }} />
              <span style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 500 }}>{r.va_name}</span>
            </div>
            <div style={{ ...S.mono, fontSize: 12, color: '#888888', textAlign: 'right' }}>{relDate(r.signed_up_at)}</div>
            <div style={{ ...S.mono, fontSize: 13, color: '#FFFFFF', textAlign: 'right' }}>{r.products_this_month}</div>
            <div style={{ ...S.mono, fontSize: 12, textAlign: 'right', color: r.velocity_percent > 0 ? '#22C55E' : r.velocity_percent < 0 ? '#EF4444' : '#888888' }}>
              {r.velocity_percent !== 0 ? `${r.velocity_percent > 0 ? '+' : ''}${r.velocity_percent.toFixed(0)}%` : '—'}
            </div>
            <div style={{ ...S.mono, fontSize: 13, color: '#22C55E', textAlign: 'right' }}>
              ${r.you_earned.toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {/* Cohort performance */}
      {cohorts.length > 0 && (
        <div style={{ ...S.card, marginTop: 40 }}>
          <span style={{ ...S.label, display: 'block', marginBottom: 16 }}>Cohort Performance</span>
          {cohorts.map((c, i) => (
            <div key={c.month} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < cohorts.length - 1 ? '1px solid #1F1F1F' : 'none' }}>
              <span style={{ fontSize: 13, color: '#888888' }}>
                {formatMonth(c.month)}
                <span style={{ color: '#555555' }}> · {c.count} VA{c.count !== 1 ? 's' : ''}</span>
              </span>
              <div style={{ display: 'flex', gap: 24 }}>
                <span style={{ ...S.mono, fontSize: 12, color: '#888888' }}>
                  avg <span style={{ color: '#FFFFFF' }}>{c.avg_products}</span> products
                </span>
                <span style={{ ...S.mono, fontSize: 12, color: '#22C55E' }}>
                  ${c.avg_earned.toFixed(2)} avg
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
