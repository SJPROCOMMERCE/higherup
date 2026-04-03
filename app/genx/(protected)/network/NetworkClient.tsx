'use client'
import { useState } from 'react'

type Row = {
  va_id: string; va_name: string; signed_up_at: string; status: string; source: string
  products_this_month: number; products_last_month: number; velocity_percent: number
  total_products_lifetime: number; health_score: number; risk_flag: string|null
  risk_reason: string|null; you_earned: number; is_new: boolean; first_upload_at: string|null
}
type Cohort = { month: string; count: number; avg_products: number; avg_earned: number }
type Source = { source: string; total: number; active: number; avg_products: number }
type Filter = 'all' | 'active' | 'slow' | 'risk' | 'new'
type SortKey = 'va_name' | 'signed_up_at' | 'products_this_month' | 'velocity_percent' | 'health_score' | 'you_earned'

const S = {
  label: { fontSize: 11, fontWeight: 500, color: '#555555', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  mono: { fontFamily: "'JetBrains Mono', monospace" },
  card: { background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 24 } as React.CSSProperties,
  th: { fontSize: 10, fontWeight: 500, color: '#555555', textTransform: 'uppercase' as const, letterSpacing: '0.05em', padding: '8px 12px', textAlign: 'left' as const, cursor: 'pointer', userSelect: 'none' as const, whiteSpace: 'nowrap' as const },
  td: { padding: '10px 12px', borderBottom: '1px solid #1F1F1F', verticalAlign: 'top' as const },
}

function relDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en', { month: 'short', day: 'numeric' })
}
function fmtMonth(m: string) {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo)-1, 1).toLocaleString('en', { month: 'long', year: 'numeric' })
}
function healthColor(s: number) {
  if (s >= 80) return '#FFFFFF'
  if (s >= 50) return '#888888'
  return '#EF4444'
}
function velocityColor(v: number) {
  if (v > 5) return '#22C55E'
  if (v < -5) return '#EF4444'
  return '#888888'
}
function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }

export default function NetworkClient({ rows, cohorts, sources }: { rows: Row[]; cohorts: Cohort[]; sources: Source[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('you_earned')
  const [sortAsc, setSortAsc] = useState(false)
  const [expandedId, setExpandedId] = useState<string|null>(null)

  const counts = {
    all: rows.length,
    active: rows.filter(r => r.status === 'active').length,
    slow: rows.filter(r => r.status === 'slow').length,
    risk: rows.filter(r => r.risk_flag !== null).length,
    new: rows.filter(r => r.is_new).length,
  }

  const filtered = rows
    .filter(r => {
      if (filter === 'all') return true
      if (filter === 'active') return r.status === 'active'
      if (filter === 'slow') return r.status === 'slow'
      if (filter === 'risk') return r.risk_flag !== null
      if (filter === 'new') return r.is_new
      return true
    })
    .sort((a, b) => {
      const aVal = a[sortKey]; const bVal = b[sortKey]
      if (typeof aVal === 'string' && typeof bVal === 'string') return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
    })

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(false) }
  }

  const filterTabs: { key: Filter; label: string }[] = [
    { key: 'all', label: `ALL ${counts.all}` },
    { key: 'active', label: `ACTIVE ${counts.active}` },
    { key: 'slow', label: `SLOW ${counts.slow}` },
    { key: 'risk', label: `AT RISK ${counts.risk}` },
    { key: 'new', label: `NEW ${counts.new}` },
  ]

  const bestSource = sources.reduce((best, s) => (!best || s.avg_products > best.avg_products ? s : best), null as Source|null)
  const worstSource = sources.reduce((worst, s) => (!worst || s.avg_products < worst.avg_products ? s : worst), null as Source|null)

  return (
    <div>
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {filterTabs.map(tab => (
          <button key={tab.key} onClick={() => setFilter(tab.key)} style={{
            background: filter === tab.key ? '#FFFFFF' : '#141414',
            color: filter === tab.key ? '#0A0A0A' : '#888888',
            border: '1px solid ' + (filter === tab.key ? '#FFFFFF' : '#1F1F1F'),
            borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 500,
            letterSpacing: '0.05em', cursor: 'pointer',
          }}>{tab.label}</button>
        ))}
      </div>

      {/* Table */}
      <div style={{ ...S.card, padding: 0, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1F1F1F' }}>
                {([
                  ['va_name','NAME'],['signed_up_at','JOINED'],['products_this_month','PRODUCTS'],
                  ['velocity_percent','VELOCITY'],['health_score','HEALTH'],['you_earned','EARNED'],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th key={key} style={S.th} onClick={() => toggleSort(key)}>
                    {label}{sortKey===key ? (sortAsc?' ↑':' ↓') : ''}
                  </th>
                ))}
                <th style={{ ...S.th, cursor: 'default' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => (
                <>
                  <tr key={row.va_id} style={{ cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === row.va_id ? null : row.va_id)}>
                    <td style={S.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {row.risk_flag && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />}
                        {row.is_new && !row.risk_flag && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} />}
                        <span style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 500 }}>{row.va_name}</span>
                      </div>
                    </td>
                    <td style={S.td}><span style={{ ...S.mono, fontSize: 12, color: '#888888' }}>{relDate(row.signed_up_at)}</span></td>
                    <td style={S.td}><span style={{ ...S.mono, fontSize: 12, color: '#FFFFFF' }}>{row.products_this_month.toLocaleString()}</span></td>
                    <td style={S.td}>
                      <span style={{ ...S.mono, fontSize: 12, color: velocityColor(row.velocity_percent) }}>
                        {row.velocity_percent === 0 ? '—' : `${row.velocity_percent > 0 ? '+' : ''}${row.velocity_percent.toFixed(0)}%`}
                      </span>
                    </td>
                    <td style={S.td}><span style={{ ...S.mono, fontSize: 12, color: healthColor(row.health_score) }}>{row.health_score}</span></td>
                    <td style={S.td}><span style={{ ...S.mono, fontSize: 12, color: '#22C55E' }}>${row.you_earned.toFixed(2)}</span></td>
                    <td style={S.td}><span style={{ fontSize: 12, color: '#555555' }}>···</span></td>
                  </tr>
                  {expandedId === row.va_id && (
                    <tr key={row.va_id + '-expanded'}>
                      <td colSpan={7} style={{ padding: '12px 24px 16px', background: '#0F0F0F', borderBottom: '1px solid #1F1F1F' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                          <div>
                            <div style={{ ...S.label, marginBottom: 6 }}>Source</div>
                            <div style={{ fontSize: 13, color: '#888888' }}>{capitalize(row.source)}</div>
                          </div>
                          <div>
                            <div style={{ ...S.label, marginBottom: 6 }}>Lifetime Products</div>
                            <div style={{ ...S.mono, fontSize: 13, color: '#FFFFFF' }}>{row.total_products_lifetime.toLocaleString()}</div>
                          </div>
                          <div>
                            <div style={{ ...S.label, marginBottom: 6 }}>First Upload</div>
                            <div style={{ fontSize: 13, color: '#888888' }}>{row.first_upload_at ? relDate(row.first_upload_at) : 'Never'}</div>
                          </div>
                          {row.risk_flag && (
                            <div style={{ gridColumn: '1 / -1' }}>
                              <div style={{ ...S.label, marginBottom: 6 }}>Risk</div>
                              <div style={{ fontSize: 12, color: '#EF4444' }}>{row.risk_reason || row.risk_flag}</div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#555555', fontSize: 13 }}>No VAs in this category</div>
        )}
      </div>

      {/* Cohort performance */}
      {cohorts.length > 0 && (
        <div style={{ ...S.card, marginBottom: 24 }}>
          <div style={{ ...S.label, marginBottom: 16 }}>Cohorts</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {cohorts.map((c, i) => (
              <div key={c.month} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < cohorts.length - 1 ? '1px solid #1F1F1F' : 'none' }}>
                <span style={{ fontSize: 13, color: '#888888' }}>{fmtMonth(c.month)} <span style={{ color: '#555555' }}>({c.count} VAs)</span></span>
                <div style={{ display: 'flex', gap: 24 }}>
                  <span style={{ ...S.mono, fontSize: 12, color: '#888888' }}>avg <span style={{ color: '#FFFFFF' }}>{c.avg_products}</span> prod/mo</span>
                  <span style={{ ...S.mono, fontSize: 12, color: '#22C55E' }}>${c.avg_earned.toFixed(2)}/VA</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Source performance */}
      {sources.length > 0 && (
        <div style={S.card}>
          <div style={{ ...S.label, marginBottom: 16 }}>Sources</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {sources.map((src, i) => (
              <div key={src.source} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < sources.length - 1 ? '1px solid #1F1F1F' : 'none' }}>
                <div>
                  <span style={{ fontSize: 13, color: '#FFFFFF', fontWeight: 500 }}>{capitalize(src.source)}</span>
                  <span style={{ ...S.mono, fontSize: 12, color: '#555555', marginLeft: 12 }}>{src.total} VAs · {src.active} active</span>
                </div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <span style={{ ...S.mono, fontSize: 12, color: '#888888' }}>avg {src.avg_products} prod/mo</span>
                  {bestSource && src.source === bestSource.source && (
                    <span style={{ fontSize: 11, color: '#22C55E', letterSpacing: '0.04em' }}>Best</span>
                  )}
                  {worstSource && src.source === worstSource.source && sources.length > 1 && (
                    <span style={{ fontSize: 11, color: '#EF4444', letterSpacing: '0.04em' }}>Low quality</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
