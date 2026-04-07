'use client'
import type { Asset } from '../ToolkitClient'

const ASSET_ICONS: Record<string, string> = {
  pdf: '📄', spreadsheet: '📊', template: '📝', video: '🎥', image: '🖼', guide: '📚', other: '📦',
}

export default function AssetsTab({ assets, S }: { assets: Asset[]; S: Record<string, React.CSSProperties | Record<string, unknown>> }) {
  const mono = { fontFamily: "'JetBrains Mono', monospace" }

  async function download(asset: Asset) {
    if (asset.file_url) {
      window.open(asset.file_url, '_blank')
    }
    // Fire and forget download count increment
    fetch(`/api/genx/toolkit/assets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: asset.id }) }).catch(() => {})
  }

  if (assets.length === 0) {
    return (
      <div style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📦</div>
        <div style={{ color: '#555555', fontSize: 13 }}>No assets available yet. The HigherUp team will add resources here.</div>
      </div>
    )
  }

  // Group by category
  const categories: Record<string, Asset[]> = {}
  for (const a of assets) {
    const cat = a.category || 'general'
    if (!categories[cat]) categories[cat] = []
    categories[cat].push(a)
  }

  return (
    <div>
      {Object.entries(categories).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>{cat}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {items.map(asset => (
              <div key={asset.id} style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{ASSET_ICONS[asset.asset_type] || '📦'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 500 }}>{asset.title}</div>
                    {asset.description && <div style={{ fontSize: 12, color: '#888888', marginTop: 4 }}>{asset.description}</div>}
                  </div>
                </div>
                {(asset.earnings_amount || asset.va_count) && (
                  <div style={{ display: 'flex', gap: 12 }}>
                    {asset.earnings_amount && (
                      <span style={{ ...mono, fontSize: 11, color: '#22C55E' }}>+${asset.earnings_amount}</span>
                    )}
                    {asset.va_count && (
                      <span style={{ fontSize: 11, color: '#888888' }}>{asset.va_count} VAs using this</span>
                    )}
                  </div>
                )}
                <button
                  onClick={() => download(asset)}
                  disabled={!asset.file_url}
                  style={{
                    background: asset.file_url ? '#FFFFFF' : '#1F1F1F',
                    color: asset.file_url ? '#0A0A0A' : '#555555',
                    border: 'none', borderRadius: 6, padding: '8px 0', fontSize: 12, fontWeight: 600,
                    cursor: asset.file_url ? 'pointer' : 'default',
                    marginTop: 'auto',
                  }}
                >
                  {asset.file_url ? 'Download' : 'Coming soon'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
