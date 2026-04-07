'use client'
import { useState } from 'react'
import type { DefaultScript, MyScript } from '../ToolkitClient'

const SUBCATS: Record<string, string> = {
  first_contact: 'First Contact',
  follow_up: 'Follow-Up',
  va_onboarding: 'VA Onboarding',
  reengagement: 'Reengagement',
  objection: 'Objections',
  community_post: 'Community Posts',
  competitive: 'Competitive',
  closing: 'Closing',
}

const CHANNELS = ['general','whatsapp','instagram','facebook','linkedin','telegram','tiktok','email']

export default function ScriptsTab({
  defaultScripts, myScripts, setMyScripts, S,
}: {
  defaultScripts: DefaultScript[]
  myScripts: MyScript[]
  setMyScripts: React.Dispatch<React.SetStateAction<MyScript[]>>
  S: Record<string, React.CSSProperties | Record<string, unknown>>
}) {
  const [view, setView] = useState<'library' | 'mine'>('library')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterSubcat, setFilterSubcat] = useState<string>('all')
  const [filterChannel, setFilterChannel] = useState<string>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', content: '', category: 'first_contact', channel: 'general', notes: '' })
  const mono = { fontFamily: "'JetBrains Mono', monospace" }

  const filteredDefault = defaultScripts.filter(s => {
    if (filterSubcat !== 'all' && s.subcategory !== filterSubcat) return false
    if (filterChannel !== 'all' && s.channel !== filterChannel) return false
    return true
  })

  const grouped: Record<string, DefaultScript[]> = {}
  for (const s of filteredDefault) {
    const sub = s.subcategory || 'general'
    if (!grouped[sub]) grouped[sub] = []
    grouped[sub].push(s)
  }

  async function copyScript(id: string, content: string, isCustom = false) {
    await navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
    if (isCustom) {
      fetch(`/api/genx/toolkit/my-scripts/${id}/track`, { method: 'POST' }).catch(() => {})
      setMyScripts(prev => prev.map(s => s.id === id ? { ...s, times_used: s.times_used + 1 } : s))
    } else {
      fetch(`/api/genx/toolkit/${id}/copy`, { method: 'POST' }).catch(() => {})
    }
  }

  async function createScript() {
    if (!form.title.trim() || !form.content.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/genx/toolkit/my-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.script) setMyScripts(prev => [data.script, ...prev])
      setShowCreate(false)
      setForm({ title: '', content: '', category: 'first_contact', channel: 'general', notes: '' })
      setView('mine')
    } catch (e) {
      console.error('createScript error:', e)
    }
    setSaving(false)
  }

  async function saveEdit(id: string, patch: { title: string; content: string; notes: string }) {
    try {
      const res = await fetch(`/api/genx/toolkit/my-scripts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
      })
      const data = await res.json()
      if (data.script) setMyScripts(prev => prev.map(s => s.id === id ? data.script : s))
      setEditingId(null)
    } catch (e) {
      console.error('saveEdit error:', e)
    }
  }

  async function togglePin(id: string, pinned: boolean) {
    setMyScripts(prev => prev.map(s => s.id === id ? { ...s, is_pinned: !pinned } : s))
    fetch(`/api/genx/toolkit/my-scripts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_pinned: !pinned }),
    }).catch(e => console.error('togglePin error:', e))
  }

  async function deleteScript(id: string) {
    setMyScripts(prev => prev.filter(s => s.id !== id))
    fetch(`/api/genx/toolkit/my-scripts/${id}`, { method: 'DELETE' })
      .catch(e => console.error('deleteScript error:', e))
  }

  return (
    <div>
      {/* View toggle + Create */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 0, background: '#141414', border: '1px solid #1F1F1F', borderRadius: 6, overflow: 'hidden' }}>
          {(['library', 'mine'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              background: view === v ? '#FFFFFF' : 'transparent',
              color: view === v ? '#0A0A0A' : '#555555',
              border: 'none', padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
              {v === 'library' ? `Library (${defaultScripts.length})` : `My Scripts (${myScripts.length})`}
            </button>
          ))}
        </div>
        <button onClick={() => setShowCreate(true)} style={S.btn as React.CSSProperties}>+ New Script</button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Title *</label>
              <input style={S.input as React.CSSProperties} placeholder="Script title" value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Category</label>
              <select style={S.input as React.CSSProperties} value={form.category} onChange={e => setForm(p => ({...p, category: e.target.value}))}>
                {Object.entries(SUBCATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Channel</label>
              <select style={S.input as React.CSSProperties} value={form.channel} onChange={e => setForm(p => ({...p, channel: e.target.value}))}>
                {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Content *</label>
              <textarea
                style={{ ...S.input as React.CSSProperties, ...mono, minHeight: 140, resize: 'vertical' }}
                placeholder="Script content…"
                value={form.content}
                onChange={e => setForm(p => ({...p, content: e.target.value}))}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Notes</label>
              <input style={S.input as React.CSSProperties} placeholder="When to use…" value={form.notes} onChange={e => setForm(p => ({...p, notes: e.target.value}))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={createScript} disabled={saving || !form.title.trim() || !form.content.trim()} style={{ ...(S.btn as React.CSSProperties), opacity: (!form.title.trim() || !form.content.trim()) ? 0.4 : 1 }}>Save</button>
            <button onClick={() => setShowCreate(false)} style={S.btnGhost as React.CSSProperties}>Cancel</button>
          </div>
        </div>
      )}

      {/* Library view */}
      {view === 'library' && (
        <div>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <select
              value={filterSubcat}
              onChange={e => setFilterSubcat(e.target.value)}
              style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 4, padding: '5px 8px', color: '#888888', fontSize: 11, cursor: 'pointer', outline: 'none' }}
            >
              <option value="all">All categories</option>
              {Object.entries(SUBCATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select
              value={filterChannel}
              onChange={e => setFilterChannel(e.target.value)}
              style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 4, padding: '5px 8px', color: '#888888', fontSize: 11, cursor: 'pointer', outline: 'none' }}
            >
              <option value="all">All channels</option>
              {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {Object.entries(grouped).map(([subcat, items]) => (
            <div key={subcat} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                {SUBCATS[subcat] || subcat}
                <span style={{ ...mono, opacity: 0.5 }}>({items.length})</span>
              </div>
              <div style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, overflow: 'hidden' }}>
                {items.map((s, i) => {
                  const isOpen = expandedId === s.id
                  return (
                    <div key={s.id} style={{ borderBottom: i < items.length - 1 ? '1px solid #1F1F1F' : 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
                        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setExpandedId(isOpen ? null : s.id)}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ color: '#FFFFFF', fontSize: 13 }}>{s.title}</span>
                            {s.channel && s.channel !== 'general' && (
                              <span style={{ fontSize: 10, color: '#555555', background: '#0A0A0A', border: '1px solid #1F1F1F', borderRadius: 3, padding: '2px 6px', textTransform: 'capitalize' }}>{s.channel}</span>
                            )}
                            {s.is_featured && <span style={{ fontSize: 10, color: '#F59E0B' }}>★</span>}
                          </div>
                          {s.description && <div style={{ fontSize: 12, color: '#555555', marginTop: 2 }}>{s.description}</div>}
                          {s.estimated_response_rate && <div style={{ fontSize: 11, color: '#22C55E', marginTop: 2 }}>~{s.estimated_response_rate} reply rate</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginLeft: 12 }}>
                          <button onClick={() => copyScript(s.id, s.content)} style={{
                            background: copiedId === s.id ? '#FFFFFF' : '#1A1A1A',
                            color: copiedId === s.id ? '#0A0A0A' : '#888888',
                            border: '1px solid #333', borderRadius: 4, padding: '6px 12px', fontSize: 11, cursor: 'pointer',
                          }}>
                            {copiedId === s.id ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>
                      {isOpen && (
                        <div style={{ padding: '0 16px 16px', borderTop: '1px solid #0F0F0F' }}>
                          {s.situation && <div style={{ fontSize: 11, color: '#555555', marginBottom: 8, marginTop: 10 }}>When: {s.situation}</div>}
                          <pre style={{ ...mono, fontSize: 12, color: '#888888', whiteSpace: 'pre-wrap', background: '#0A0A0A', border: '1px solid #1F1F1F', borderRadius: 6, padding: 16, lineHeight: 1.6, margin: 0 }}>
                            {s.content}
                          </pre>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* My Scripts view */}
      {view === 'mine' && (
        <div>
          {myScripts.length === 0 ? (
            <div style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 40, textAlign: 'center', color: '#555555', fontSize: 13 }}>
              No custom scripts yet. Create one or customize a library script.
            </div>
          ) : (
            <div style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, overflow: 'hidden' }}>
              {myScripts.map((s, i) => {
                const isOpen = expandedId === s.id
                const isEditing = editingId === s.id
                return (
                  <div key={s.id} style={{ borderBottom: i < myScripts.length - 1 ? '1px solid #1F1F1F' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
                      <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setExpandedId(isOpen ? null : s.id)}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {s.is_pinned && <span style={{ fontSize: 11, color: '#F59E0B' }}>📌</span>}
                          <span style={{ color: '#FFFFFF', fontSize: 13 }}>{s.title}</span>
                          {s.channel !== 'general' && (
                            <span style={{ fontSize: 10, color: '#555555', background: '#0A0A0A', border: '1px solid #1F1F1F', borderRadius: 3, padding: '2px 6px' }}>{s.channel}</span>
                          )}
                        </div>
                        <div style={{ ...mono, fontSize: 11, color: '#555555', marginTop: 2 }}>
                          {s.times_used} used · {s.times_converted} converted
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginLeft: 12 }}>
                        <button onClick={() => togglePin(s.id, s.is_pinned)} style={{ background: '#0A0A0A', border: '1px solid #1F1F1F', borderRadius: 4, padding: '5px 8px', fontSize: 11, color: s.is_pinned ? '#F59E0B' : '#555555', cursor: 'pointer' }}>
                          {s.is_pinned ? 'Unpin' : 'Pin'}
                        </button>
                        <button onClick={() => setEditingId(s.id)} style={{ background: '#0A0A0A', border: '1px solid #1F1F1F', borderRadius: 4, padding: '5px 8px', fontSize: 11, color: '#888888', cursor: 'pointer' }}>
                          Edit
                        </button>
                        <button onClick={() => copyScript(s.id, s.content, true)} style={{
                          background: copiedId === s.id ? '#FFFFFF' : '#1A1A1A',
                          color: copiedId === s.id ? '#0A0A0A' : '#888888',
                          border: '1px solid #333', borderRadius: 4, padding: '5px 10px', fontSize: 11, cursor: 'pointer',
                        }}>
                          {copiedId === s.id ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                    {isOpen && !isEditing && (
                      <div style={{ padding: '0 16px 16px', borderTop: '1px solid #0F0F0F' }}>
                        {s.notes && <div style={{ fontSize: 11, color: '#555555', marginBottom: 8, marginTop: 10 }}>Note: {s.notes}</div>}
                        <pre style={{ ...mono, fontSize: 12, color: '#888888', whiteSpace: 'pre-wrap', background: '#0A0A0A', border: '1px solid #1F1F1F', borderRadius: 6, padding: 16, lineHeight: 1.6, margin: 0 }}>
                          {s.content}
                        </pre>
                        <button onClick={() => deleteScript(s.id)} style={{ marginTop: 10, background: 'none', border: 'none', color: '#EF4444', fontSize: 11, cursor: 'pointer' }}>Delete script</button>
                      </div>
                    )}
                    {isEditing && <EditForm script={s} onSave={saveEdit} onCancel={() => setEditingId(null)} S={S} />}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EditForm({
  script, onSave, onCancel, S,
}: {
  script: MyScript
  onSave: (id: string, patch: { title: string; content: string; notes: string }) => void
  onCancel: () => void
  S: Record<string, React.CSSProperties | Record<string, unknown>>
}) {
  const [title, setTitle] = useState(script.title)
  const [content, setContent] = useState(script.content)
  const [notes, setNotes] = useState(script.notes || '')
  const mono = { fontFamily: "'JetBrains Mono', monospace" }

  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid #0F0F0F', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input style={S.input as React.CSSProperties} value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" />
      <textarea style={{ ...S.input as React.CSSProperties, ...mono, minHeight: 120, resize: 'vertical' }} value={content} onChange={e => setContent(e.target.value)} />
      <input style={S.input as React.CSSProperties} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes" />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onSave(script.id, { title, content, notes })} style={S.btn as React.CSSProperties}>Save</button>
        <button onClick={onCancel} style={S.btnGhost as React.CSSProperties}>Cancel</button>
      </div>
    </div>
  )
}
