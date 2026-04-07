'use client'
import { useState, useEffect } from 'react'
import { S, SCRIPT_CATEGORIES, PROSPECT_TYPES, type OutreachScript } from '../shared'

const CHANNELS = ['general', 'whatsapp', 'facebook', 'instagram', 'linkedin', 'telegram', 'email']

export default function ScriptsTab() {
  const [scripts, setScripts] = useState<OutreachScript[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCat, setFilterCat] = useState('all')
  const [filterChannel, setFilterChannel] = useState('all')
  const [filterTarget, setFilterTarget] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // New script modal
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ title: '', content: '', category: 'first_contact', channel: 'general', target_prospect_type: 'any', description: '', created_by: '' })

  // Edit state
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ title: '', content: '', category: '', channel: '', target_prospect_type: '', description: '' })

  useEffect(() => {
    loadScripts()
  }, [])

  async function loadScripts() {
    setLoading(true)
    const res = await fetch('/api/admin/genx/outreach-scripts')
    if (res.ok) {
      const data = await res.json()
      setScripts(data.scripts || [])
    }
    setLoading(false)
  }

  async function createScript() {
    if (!newForm.title.trim() || !newForm.content.trim()) return
    const res = await fetch('/api/admin/genx/outreach-scripts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newForm),
    })
    if (res.ok) {
      setShowNew(false)
      setNewForm({ title: '', content: '', category: 'first_contact', channel: 'general', target_prospect_type: 'any', description: '', created_by: '' })
      loadScripts()
    }
  }

  async function saveEdit(id: string) {
    await fetch(`/api/admin/genx/outreach-scripts/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setEditId(null)
    loadScripts()
  }

  async function deleteScript(id: string) {
    await fetch(`/api/admin/genx/outreach-scripts/${id}`, { method: 'DELETE' })
    loadScripts()
  }

  async function copyContent(id: string, content: string) {
    await navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const filtered = scripts.filter(s => {
    if (filterCat !== 'all' && s.category !== filterCat) return false
    if (filterChannel !== 'all' && s.channel !== filterChannel) return false
    if (filterTarget !== 'all' && s.target_prospect_type !== filterTarget) return false
    return true
  })

  // Group by category
  const grouped: Record<string, OutreachScript[]> = {}
  for (const s of filtered) {
    if (!grouped[s.category]) grouped[s.category] = []
    grouped[s.category].push(s)
  }

  const catLabel = (cat: string) => SCRIPT_CATEGORIES.find(c => c.key === cat)?.label || cat.replace(/_/g, ' ')

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, background: S.bg }}>
            <option value="all">All Categories</option>
            {SCRIPT_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <select value={filterChannel} onChange={e => setFilterChannel(e.target.value)}
            style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, background: S.bg }}>
            <option value="all">All Channels</option>
            {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterTarget} onChange={e => setFilterTarget(e.target.value)}
            style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, background: S.bg }}>
            <option value="all">All Targets</option>
            {PROSPECT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <span style={{ fontSize: 12, color: S.textMuted }}>{filtered.length} scripts</span>
        </div>
        <button onClick={() => setShowNew(true)}
          style={{ background: S.accent, color: '#fff', border: 'none', borderRadius: S.radiusSm, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + New Script
        </button>
      </div>

      {/* New Script Modal */}
      {showNew && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)',
        }} onClick={() => setShowNew(false)}>
          <div style={{
            background: '#fff', borderRadius: 14, padding: 28, width: 520,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: S.text, margin: '0 0 16px' }}>New Outreach Script</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
              <select value={newForm.category} onChange={e => setNewForm({ ...newForm, category: e.target.value })}
                style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, background: S.bg }}>
                {SCRIPT_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <select value={newForm.channel} onChange={e => setNewForm({ ...newForm, channel: e.target.value })}
                style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, background: S.bg }}>
                {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={newForm.target_prospect_type} onChange={e => setNewForm({ ...newForm, target_prospect_type: e.target.value })}
                style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, background: S.bg }}>
                {PROSPECT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>

            <input placeholder="Script title *" value={newForm.title} onChange={e => setNewForm({ ...newForm, title: e.target.value })}
              style={{ width: '100%', border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, marginBottom: 12, boxSizing: 'border-box' }} />

            <textarea value={newForm.content} onChange={e => setNewForm({ ...newForm, content: e.target.value })} rows={5}
              placeholder="The actual message content *"
              style={{ width: '100%', border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, marginBottom: 12, fontFamily: S.font, boxSizing: 'border-box', resize: 'vertical' }} />

            <input placeholder="Description / notes (optional)" value={newForm.description} onChange={e => setNewForm({ ...newForm, description: e.target.value })}
              style={{ width: '100%', border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, marginBottom: 12, boxSizing: 'border-box' }} />

            <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
              <span style={{ fontSize: 12, color: S.textSecondary, lineHeight: '32px' }}>Created by:</span>
              {['safouane', 'joep'].map(s => (
                <button key={s} onClick={() => setNewForm({ ...newForm, created_by: s })}
                  style={{
                    padding: '6px 16px', fontSize: 12, fontWeight: newForm.created_by === s ? 600 : 400,
                    borderRadius: S.radiusSm, cursor: 'pointer', textTransform: 'capitalize',
                    border: `1px solid ${newForm.created_by === s ? S.accent : S.border}`,
                    background: newForm.created_by === s ? S.accentLight : S.bg,
                    color: newForm.created_by === s ? S.accent : S.textSecondary,
                  }}>{s}</button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowNew(false)}
                style={{ padding: '8px 20px', fontSize: 13, borderRadius: S.radiusSm, border: `1px solid ${S.border}`, background: S.bg, color: S.textSecondary, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={createScript} disabled={!newForm.title.trim() || !newForm.content.trim()}
                style={{
                  padding: '8px 20px', fontSize: 13, fontWeight: 600, borderRadius: S.radiusSm,
                  border: 'none', cursor: newForm.title && newForm.content ? 'pointer' : 'not-allowed',
                  background: newForm.title && newForm.content ? S.accent : S.border,
                  color: newForm.title && newForm.content ? '#fff' : S.textMuted,
                }}>
                Save Script
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Script Library */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: S.textMuted, fontSize: 13 }}>Loading scripts...</div>
      ) : (
        <div>
          {Object.entries(grouped).map(([cat, catScripts]) => (
            <div key={cat} style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: S.text, margin: 0, textTransform: 'uppercase' }}>{catLabel(cat)}</h3>
                <span style={{ fontSize: 12, color: S.textMuted }}>{catScripts.length} scripts</span>
              </div>

              <div style={{ background: S.surface, borderRadius: S.radius, border: `1px solid ${S.border}`, overflow: 'hidden' }}>
                {catScripts.map((s, i) => (
                  <div key={s.id} style={{ borderBottom: i < catScripts.length - 1 ? `1px solid ${S.borderLight}` : 'none' }}>
                    {/* Row header */}
                    <div
                      onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                      style={{
                        display: 'grid', gridTemplateColumns: '3fr 80px 80px 60px 60px 80px',
                        padding: '12px 16px', cursor: 'pointer', alignItems: 'center',
                        background: expandedId === s.id ? S.accentLight : S.bg,
                      }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{s.title}</div>
                        {s.description && <div style={{ fontSize: 11, color: S.textMuted, marginTop: 1 }}>{s.description}</div>}
                      </div>
                      <div style={{ fontSize: 11, color: S.textSecondary, textTransform: 'capitalize' }}>{s.channel}</div>
                      <div style={{ fontSize: 11, color: S.textSecondary, textTransform: 'capitalize' }}>{s.target_prospect_type.replace(/_/g, ' ')}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: s.reply_rate >= 50 ? S.green : s.reply_rate >= 30 ? S.yellow : s.times_used > 0 ? S.red : S.textMuted }}>
                        {s.reply_rate > 0 ? `${s.reply_rate}%` : '—'}
                      </div>
                      <div style={{ fontSize: 12, color: S.textSecondary }}>{s.times_used > 0 ? `${s.times_used}x` : '—'}</div>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={e => { e.stopPropagation(); copyContent(s.id, s.content) }}
                          style={{ fontSize: 11, color: copiedId === s.id ? S.green : S.accent, background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                          {copiedId === s.id ? 'Copied!' : 'Copy'}
                        </button>
                        <button onClick={e => {
                          e.stopPropagation()
                          setEditId(s.id)
                          setEditForm({ title: s.title, content: s.content, category: s.category, channel: s.channel, target_prospect_type: s.target_prospect_type, description: s.description || '' })
                        }}
                          style={{ fontSize: 11, color: S.textSecondary, background: 'transparent', border: 'none', cursor: 'pointer' }}>
                          Edit
                        </button>
                      </div>
                    </div>

                    {/* Expanded: show full content */}
                    {expandedId === s.id && editId !== s.id && (
                      <div style={{ padding: '0 16px 16px', background: S.accentLight }}>
                        <div style={{
                          background: '#fff', borderRadius: S.radiusSm, padding: '12px 16px',
                          fontSize: 13, color: S.text, lineHeight: 1.7, whiteSpace: 'pre-wrap',
                          border: `1px solid ${S.borderLight}`,
                        }}>
                          {s.content}
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 11, color: S.textMuted }}>
                          <span>Used {s.times_used}x</span>
                          <span>{s.times_replied} replies</span>
                          <span>{s.times_converted} conversions</span>
                          {s.created_by && <span>By {s.created_by}</span>}
                          {!s.is_default && (
                            <button onClick={() => deleteScript(s.id)}
                              style={{ color: S.red, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11 }}>
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Edit mode */}
                    {editId === s.id && (
                      <div style={{ padding: '12px 16px', background: S.yellowLight }}>
                        <input value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                          style={{ width: '100%', border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '6px 10px', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} />
                        <textarea value={editForm.content} onChange={e => setEditForm({ ...editForm, content: e.target.value })} rows={4}
                          style={{ width: '100%', border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '6px 10px', fontSize: 13, marginBottom: 8, fontFamily: S.font, boxSizing: 'border-box', resize: 'vertical' }} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                          <select value={editForm.channel} onChange={e => setEditForm({ ...editForm, channel: e.target.value })}
                            style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '6px 10px', fontSize: 12, background: S.bg }}>
                            {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <select value={editForm.target_prospect_type} onChange={e => setEditForm({ ...editForm, target_prospect_type: e.target.value })}
                            style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '6px 10px', fontSize: 12, background: S.bg }}>
                            {PROSPECT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                          </select>
                          <input value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                            placeholder="Description" style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '6px 10px', fontSize: 12 }} />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => setEditId(null)}
                            style={{ padding: '6px 14px', fontSize: 12, borderRadius: S.radiusSm, border: `1px solid ${S.border}`, background: S.bg, color: S.textSecondary, cursor: 'pointer' }}>Cancel</button>
                          <button onClick={() => saveEdit(s.id)}
                            style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: S.radiusSm, border: 'none', background: S.accent, color: '#fff', cursor: 'pointer' }}>Save</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: S.textMuted, fontSize: 13 }}>
              No scripts found. Create one with the + New Script button.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
