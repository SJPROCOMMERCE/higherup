'use client'
import { useState } from 'react'
import type { LinkRow } from '../ToolkitClient'

const CHANNELS = ['WhatsApp','Instagram','Facebook','LinkedIn','Telegram','Reddit','TikTok','Email','Other']

export default function LinksTab({
  referralCode, defaultLink, links, setLinks, totalClicks, S,
}: {
  referralCode: string
  defaultLink: string
  links: LinkRow[]
  setLinks: React.Dispatch<React.SetStateAction<LinkRow[]>>
  totalClicks: number
  S: Record<string, React.CSSProperties | Record<string, unknown>>
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [source, setSource] = useState('')
  const [saving, setSaving] = useState(false)
  const mono = { fontFamily: "'JetBrains Mono', monospace" }

  async function copyLink(url: string, id: string) {
    await navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function createLink() {
    if (!source.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/genx/toolkit/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      })
      const data = await res.json()
      if (data.link) setLinks(prev => [...prev, data.link])
      setShowAdd(false)
      setSource('')
    } catch (e) {
      console.error('createLink error:', e)
    }
    setSaving(false)
  }

  const totalSignups = links.reduce((s, l) => s + (l.signup_count || 0), 0)

  return (
    <div>
      {/* Main link */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Your Main Link</div>
        <div style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 20 }}>
          <div style={{ ...mono, fontSize: 14, color: '#FFFFFF', marginBottom: 6 }}>{defaultLink}</div>
          <div style={{ fontSize: 12, color: '#555555', marginBottom: 12 }}>
            This is your default link. Use the channel-specific links below for tracking.
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ ...mono, fontSize: 12, color: '#555555' }}>{totalClicks} total clicks · {totalSignups} signups</span>
            <button onClick={() => copyLink(defaultLink, 'main')} style={{
              background: copiedId === 'main' ? '#22C55E' : '#FFFFFF',
              color: '#0A0A0A', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
              {copiedId === 'main' ? 'COPIED' : 'COPY'}
            </button>
          </div>
        </div>
      </div>

      {/* Channel links */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Channel Links</div>
        <button onClick={() => setShowAdd(!showAdd)} style={S.btnGhost as React.CSSProperties}>+ Add channel</button>
      </div>

      {showAdd && (
        <div style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#888888', marginBottom: 10 }}>Select a channel to generate a tracking link:</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {CHANNELS.map(ch => (
              <button key={ch} onClick={() => setSource(ch)} style={{
                background: source === ch ? '#FFFFFF' : '#0A0A0A',
                color: source === ch ? '#0A0A0A' : '#888888',
                border: '1px solid ' + (source === ch ? '#FFFFFF' : '#1F1F1F'),
                borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
              }}>{ch}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={createLink} disabled={saving || !source} style={{ ...(S.btn as React.CSSProperties), opacity: !source ? 0.4 : 1 }}>Generate</button>
            <button onClick={() => { setShowAdd(false); setSource('') }} style={S.btnGhost as React.CSSProperties}>Cancel</button>
          </div>
        </div>
      )}

      {links.length === 0 ? (
        <div style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 32, textAlign: 'center', color: '#555555', fontSize: 13 }}>
          No tracking links yet. Create one per channel to see where your signups come from.
        </div>
      ) : (
        <>
          {links.map(link => (
            <div key={link.id} style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 16, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#555555', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{link.source}</div>
                <div style={{ ...mono, fontSize: 13, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.full_url}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ ...mono, fontSize: 12, color: '#888888' }}>{link.click_count || 0} clicks</div>
                  <div style={{ ...mono, fontSize: 12, color: '#22C55E' }}>{link.signup_count || 0} signups</div>
                </div>
                <button onClick={() => copyLink(link.full_url, link.id)} style={{
                  background: copiedId === link.id ? '#22C55E' : '#FFFFFF',
                  color: '#0A0A0A', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}>
                  {copiedId === link.id ? 'COPIED' : 'COPY'}
                </button>
              </div>
            </div>
          ))}

          {/* Funnel table */}
          {links.length > 1 && (
            <div style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 20, marginTop: 16 }}>
              <div style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Source Comparison</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ fontSize: 10, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 0', textAlign: 'left' }}>Source</th>
                      <th style={{ fontSize: 10, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 8px', textAlign: 'right' }}>Clicks</th>
                      <th style={{ fontSize: 10, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 8px', textAlign: 'right' }}>Signups</th>
                      <th style={{ fontSize: 10, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 8px', textAlign: 'right' }}>Conv %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {links.map(l => {
                      const rate = (l.click_count || 0) > 0 ? (((l.signup_count || 0) / (l.click_count || 1)) * 100).toFixed(1) : '—'
                      return (
                        <tr key={l.id} style={{ borderTop: '1px solid #1F1F1F' }}>
                          <td style={{ padding: '8px 0', fontSize: 12, color: '#888888', textTransform: 'capitalize' }}>{l.source}</td>
                          <td style={{ ...mono, fontSize: 12, color: '#888888', padding: '8px 8px', textAlign: 'right' }}>{l.click_count || 0}</td>
                          <td style={{ ...mono, fontSize: 12, color: '#22C55E', padding: '8px 8px', textAlign: 'right' }}>{l.signup_count || 0}</td>
                          <td style={{ ...mono, fontSize: 12, color: '#888888', padding: '8px 8px', textAlign: 'right' }}>{rate}{rate !== '—' ? '%' : ''}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
