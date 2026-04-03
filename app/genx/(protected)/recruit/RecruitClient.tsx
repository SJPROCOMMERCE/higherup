'use client'
import { useState } from 'react'

type LinkRow = {
  id: string; source: string; link_code: string; full_url: string
  click_count: number; signup_count: number; active_count: number
  conversion_rate: number; activation_rate: number
}
type Contact = {
  id: string; contact_name: string; contact_channel: string; contact_handle: string | null
  pipeline_status: string; last_contacted_at: string | null; next_followup_at: string | null; notes: string | null
}

const S = {
  label: { fontSize: 11, fontWeight: 500, color: '#555555', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8, display: 'block' },
  mono: { fontFamily: "'JetBrains Mono', monospace" },
  card: { background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 24 } as React.CSSProperties,
  input: { width: '100%', background: '#0A0A0A', border: '1px solid #1F1F1F', borderRadius: 6, padding: '10px 12px', color: '#FFFFFF', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const },
  btn: { background: '#FFFFFF', color: '#0A0A0A', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
  btnGhost: { background: '#141414', border: '1px solid #1F1F1F', borderRadius: 6, padding: '8px 16px', fontSize: 12, color: '#888888', cursor: 'pointer' } as React.CSSProperties,
}

const CHANNELS = ['WhatsApp','Instagram','Facebook','LinkedIn','Telegram','Reddit','TikTok','Email','Other']
const STATUS_COLORS: Record<string, string> = { prospect:'#555555', contacted:'#888888', interested:'#FFFFFF', signed_up:'#22C55E', lost:'#EF4444' }

function relTime(iso: string | null) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

export default function RecruitClient({ lgId: _, referralCode: __, defaultLink, appUrl: _appUrl, links: initLinks, totalClicks, contacts: initContacts }: {
  lgId: string; referralCode: string; defaultLink: string; appUrl: string
  links: LinkRow[]; totalClicks: number; contacts: Contact[]
}) {
  const [links, setLinks] = useState(initLinks)
  const [contacts, setContacts] = useState(initContacts)
  const [copiedId, setCopiedId] = useState<string|null>(null)
  const [showAddLink, setShowAddLink] = useState(false)
  const [showAddContact, setShowAddContact] = useState(false)
  const [expandedContact, setExpandedContact] = useState<string|null>(null)
  const [newLinkSource, setNewLinkSource] = useState('')
  const [newContact, setNewContact] = useState({ contact_name: '', contact_channel: 'WhatsApp', contact_handle: '', notes: '' })
  const [saving, setSaving] = useState(false)

  async function copyLink(url: string, id: string) {
    await navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function addLink() {
    if (!newLinkSource.trim()) return
    setSaving(true)
    const res = await fetch('/api/genx/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: newLinkSource.toLowerCase() }),
    })
    const data = await res.json()
    if (data.link) setLinks(prev => [...prev, data.link])
    setShowAddLink(false)
    setNewLinkSource('')
    setSaving(false)
  }

  async function addContact() {
    if (!newContact.contact_name.trim()) return
    setSaving(true)
    const res = await fetch('/api/genx/outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newContact),
    })
    const data = await res.json()
    if (data.contact) setContacts(prev => [data.contact, ...prev])
    setShowAddContact(false)
    setNewContact({ contact_name: '', contact_channel: 'WhatsApp', contact_handle: '', notes: '' })
    setSaving(false)
  }

  async function updateStatus(id: string, pipeline_status: string) {
    await fetch(`/api/genx/outreach/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipeline_status }),
    })
    setContacts(prev => prev.map(c => c.id === id ? { ...c, pipeline_status } : c))
  }

  const totalSignups = links.reduce((s, l) => s + l.signup_count, 0)

  return (
    <div>
      {/* YOUR LINKS */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={S.label}>Your Links</span>
          <button onClick={() => setShowAddLink(!showAddLink)} style={S.btnGhost}>+ Add channel</button>
        </div>

        {/* Default link */}
        <div style={{ ...S.card, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: '#555555', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Direct (all sources)</div>
            <div style={{ ...S.mono, fontSize: 13, color: '#FFFFFF' }}>{defaultLink}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ ...S.mono, fontSize: 12, color: '#555555' }}>{totalClicks} clicks · {totalSignups} signups</span>
            <button onClick={() => copyLink(defaultLink, 'default')} style={S.btn}>
              {copiedId === 'default' ? 'COPIED' : 'COPY'}
            </button>
          </div>
        </div>

        {links.map(link => (
          <div key={link.id} style={{ ...S.card, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#555555', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{link.source}</div>
              <div style={{ ...S.mono, fontSize: 13, color: '#FFFFFF' }}>{link.full_url}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ ...S.mono, fontSize: 12, color: '#555555' }}>{link.click_count} clicks · {link.signup_count} signups</span>
              <button onClick={() => copyLink(link.full_url, link.id)} style={S.btn}>
                {copiedId === link.id ? 'COPIED' : 'COPY'}
              </button>
            </div>
          </div>
        ))}

        {showAddLink && (
          <div style={{ ...S.card, marginTop: 8 }}>
            <div style={{ fontSize: 12, color: '#888888', marginBottom: 12 }}>Select a channel to generate a tracking link:</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {CHANNELS.map(ch => (
                <button key={ch} onClick={() => setNewLinkSource(ch)} style={{
                  background: newLinkSource === ch ? '#FFFFFF' : '#0A0A0A',
                  color: newLinkSource === ch ? '#0A0A0A' : '#888888',
                  border: '1px solid ' + (newLinkSource === ch ? '#FFFFFF' : '#1F1F1F'),
                  borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
                }}>{ch}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addLink} disabled={saving || !newLinkSource} style={{ ...S.btn, opacity: !newLinkSource ? 0.4 : 1 }}>Generate</button>
              <button onClick={() => setShowAddLink(false)} style={S.btnGhost}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* FUNNEL */}
      {links.length > 0 && (
        <div style={{ ...S.card, marginBottom: 32 }}>
          <span style={S.label}>Funnel by source</span>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ fontSize: 10, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 0', textAlign: 'left' }}></th>
                  {links.map(l => (
                    <th key={l.id} style={{ fontSize: 10, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 12px', textAlign: 'right' }}>{l.source}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Clicks', key: 'click_count' as keyof LinkRow },
                  { label: 'Sign-ups', key: 'signup_count' as keyof LinkRow },
                  { label: 'Active', key: 'active_count' as keyof LinkRow },
                ].map((row) => (
                  <tr key={row.label} style={{ borderTop: '1px solid #1F1F1F' }}>
                    <td style={{ padding: '10px 0', fontSize: 12, color: '#888888' }}>{row.label}</td>
                    {links.map(l => {
                      const val = l[row.key] as number
                      const maxVal = Math.max(...links.map(x => x[row.key] as number), 1)
                      const isBest = val === maxVal && links.length > 1
                      return (
                        <td key={l.id} style={{ ...S.mono, fontSize: 12, color: isBest ? '#FFFFFF' : '#888888', padding: '10px 12px', textAlign: 'right' }}>{val}</td>
                      )
                    })}
                  </tr>
                ))}
                <tr style={{ borderTop: '1px solid #1F1F1F' }}>
                  <td style={{ padding: '10px 0', fontSize: 12, color: '#888888' }}>Conversion</td>
                  {links.map(l => {
                    const rate = l.click_count > 0 ? ((l.signup_count / l.click_count) * 100).toFixed(1) : '—'
                    return <td key={l.id} style={{ ...S.mono, fontSize: 12, color: '#888888', padding: '10px 12px', textAlign: 'right' }}>{rate}{rate !== '—' ? '%' : ''}</td>
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* OUTREACH */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={S.label}>Outreach</span>
          <button onClick={() => setShowAddContact(true)} style={S.btn}>+ New contact</button>
        </div>

        {showAddContact && (
          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Name *</label>
                <input style={S.input} placeholder="Contact name" value={newContact.contact_name} onChange={e => setNewContact(p => ({...p, contact_name: e.target.value}))} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Channel</label>
                <select style={{ ...S.input }} value={newContact.contact_channel} onChange={e => setNewContact(p => ({...p, contact_channel: e.target.value}))}>
                  {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Handle</label>
                <input style={S.input} placeholder="@username or phone" value={newContact.contact_handle} onChange={e => setNewContact(p => ({...p, contact_handle: e.target.value}))} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Notes</label>
                <input style={S.input} placeholder="Optional" value={newContact.notes} onChange={e => setNewContact(p => ({...p, notes: e.target.value}))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addContact} disabled={saving || !newContact.contact_name.trim()} style={{ ...S.btn, opacity: !newContact.contact_name.trim() ? 0.4 : 1 }}>Save</button>
              <button onClick={() => setShowAddContact(false)} style={S.btnGhost}>Cancel</button>
            </div>
          </div>
        )}

        <div style={S.card}>
          {contacts.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#555555', fontSize: 13, padding: 24 }}>No contacts yet. Add your first outreach contact.</div>
          ) : (
            <div>
              {contacts.slice(0, expandedContact ? contacts.length : 10).map((c, i) => (
                <div key={c.id} style={{ borderBottom: i < contacts.length - 1 ? '1px solid #1F1F1F' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', cursor: 'pointer' }} onClick={() => setExpandedContact(expandedContact === c.id ? null : c.id)}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[c.pipeline_status] || '#555555', flexShrink: 0 }} />
                      <span style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 500 }}>{c.contact_name}</span>
                      <span style={{ fontSize: 12, color: '#555555' }}>{c.contact_channel}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: STATUS_COLORS[c.pipeline_status] || '#555555' }}>{c.pipeline_status}</span>
                      <span style={{ ...S.mono, fontSize: 11, color: '#555555' }}>{relTime(c.last_contacted_at)}</span>
                    </div>
                  </div>
                  {expandedContact === c.id && (
                    <div style={{ paddingBottom: 16, paddingLeft: 18 }}>
                      {c.contact_handle && <div style={{ fontSize: 12, color: '#888888', marginBottom: 8 }}>{c.contact_handle}</div>}
                      {c.notes && <div style={{ fontSize: 12, color: '#888888', marginBottom: 12 }}>{c.notes}</div>}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {['prospect','contacted','interested','signed_up','lost'].map(s => (
                          <button key={s} onClick={() => updateStatus(c.id, s)} style={{
                            background: c.pipeline_status === s ? '#FFFFFF' : '#0A0A0A',
                            color: c.pipeline_status === s ? '#0A0A0A' : '#888888',
                            border: '1px solid ' + (c.pipeline_status === s ? '#FFFFFF' : '#1F1F1F'),
                            borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                          }}>{s}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
