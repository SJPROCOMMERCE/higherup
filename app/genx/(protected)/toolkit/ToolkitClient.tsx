'use client'
import { useState } from 'react'

type Item = {
  id: string; category: string; subcategory: string | null; channel: string | null
  title: string; content: string; description: string | null
  attachment_url: string | null; attachment_name: string | null; usage_count: number
}

const S = {
  label: { fontSize: 11, fontWeight: 500, color: '#555555', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  mono: { fontFamily: "'JetBrains Mono', monospace" },
  card: { background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 24 } as React.CSSProperties,
}

const CATEGORIES = [
  { key: 'script', label: 'Scripts' },
  { key: 'asset', label: 'Assets' },
  { key: 'faq', label: 'FAQ' },
  { key: 'playbook', label: 'Playbooks' },
]

export default function ToolkitClient({ items }: { items: Item[] }) {
  const [expandedCategory, setExpandedCategory] = useState<string|null>('script')
  const [expandedItem, setExpandedItem] = useState<string|null>(null)
  const [copiedId, setCopiedId] = useState<string|null>(null)

  async function copyContent(item: Item) {
    await navigator.clipboard.writeText(item.content)
    setCopiedId(item.id)
    setTimeout(() => setCopiedId(null), 2000)
    // Increment usage count (fire and forget)
    fetch(`/api/genx/toolkit/${item.id}/copy`, { method: 'POST' }).catch(() => {})
  }

  return (
    <div>
      {CATEGORIES.map(cat => {
        const catItems = items.filter(i => i.category === cat.key)
        if (catItems.length === 0 && cat.key !== 'script') return null // always show scripts
        const isOpen = expandedCategory === cat.key

        // Group by subcategory
        const bySubcat: Record<string, Item[]> = {}
        for (const item of catItems) {
          const sub = item.subcategory || 'general'
          if (!bySubcat[sub]) bySubcat[sub] = []
          bySubcat[sub].push(item)
        }

        return (
          <div key={cat.key} style={{ marginBottom: 16 }}>
            <button onClick={() => setExpandedCategory(isOpen ? null : cat.key)} style={{
              width: '100%', background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8,
              padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <span style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cat.label}</span>
                <span style={{ ...S.mono, fontSize: 12, color: '#555555' }}>{catItems.length} items</span>
              </div>
              <span style={{ color: '#555555', fontSize: 14 }}>{isOpen ? '−' : '+'}</span>
            </button>

            {isOpen && (
              <div style={{ background: '#141414', border: '1px solid #1F1F1F', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '8px 0' }}>
                {catItems.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#555555', fontSize: 13 }}>
                    No {cat.label.toLowerCase()} yet. Admin can add content here.
                  </div>
                ) : (
                  Object.entries(bySubcat).map(([subcat, subItems]) => (
                    <div key={subcat}>
                      {Object.keys(bySubcat).length > 1 && (
                        <div style={{ padding: '10px 24px 4px', fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {subcat.replace(/_/g, ' ')}
                        </div>
                      )}
                      {subItems.map(item => (
                        <div key={item.id} style={{ borderTop: '1px solid #1F1F1F' }}>
                          <div style={{ padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}>
                              <span style={{ color: '#FFFFFF', fontSize: 13 }}>{item.title}</span>
                              {item.description && (
                                <span style={{ fontSize: 12, color: '#555555', marginLeft: 12 }}>{item.description}</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginLeft: 16 }}>
                              {item.attachment_url ? (
                                <a href={item.attachment_url} download={item.attachment_name || undefined} style={{
                                  background: '#1A1A1A', border: '1px solid #333', borderRadius: 4,
                                  padding: '6px 12px', fontSize: 11, color: '#888888', textDecoration: 'none',
                                }}>Download</a>
                              ) : (
                                <button onClick={() => copyContent(item)} style={{
                                  background: copiedId === item.id ? '#FFFFFF' : '#1A1A1A',
                                  color: copiedId === item.id ? '#0A0A0A' : '#888888',
                                  border: '1px solid #333', borderRadius: 4, padding: '6px 12px', fontSize: 11, cursor: 'pointer',
                                }}>
                                  {copiedId === item.id ? 'Copied' : 'Copy'}
                                </button>
                              )}
                            </div>
                          </div>
                          {expandedItem === item.id && (
                            <div style={{ padding: '0 24px 16px', borderTop: '1px solid #0F0F0F' }}>
                              <pre style={{
                                ...S.mono, fontSize: 12, color: '#888888', whiteSpace: 'pre-wrap',
                                background: '#0A0A0A', border: '1px solid #1F1F1F', borderRadius: 6,
                                padding: 16, lineHeight: 1.6, margin: 0,
                              }}>{item.content}</pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
