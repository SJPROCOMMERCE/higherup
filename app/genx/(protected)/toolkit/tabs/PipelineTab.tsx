'use client'
import { useState } from 'react'
import type { Contact } from '../ToolkitClient'

const CHANNELS = ['WhatsApp','Instagram','Facebook','LinkedIn','Telegram','TikTok','Email','Other']
const STATUSES = ['prospect','contacted','interested','signed_up','active','lost'] as const
type Status = typeof STATUSES[number]

const STATUS_COLORS: Record<Status | string, string> = {
  prospect: '#555555', contacted: '#888888', interested: '#FFFFFF',
  signed_up: '#22C55E', active: '#22C55E', lost: '#EF4444',
}
const STATUS_BORDER: Record<Status | string, string> = {
  prospect: '#333333', contacted: '#555555', interested: '#FFFFFF',
  signed_up: '#22C55E', active: '#22C55E', lost: '#EF4444',
}

function relTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function daysUntil(iso: string | null): string {
  if (!iso) return ''
  const diff = new Date(iso).getTime() - Date.now()
  const days = Math.ceil(diff / 86400000)
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days}d`
}

type AddForm = { name: string; channel: string; handle: string; status: string; notes: string; next_followup_at: string }

export default function PipelineTab({
  contacts, setContacts, S,
}: {
  contacts: Contact[]
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>
  S: Record<string, React.CSSProperties | Record<string, unknown>>
}) {
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [timeline, setTimeline] = useState<Record<string, Array<{id:string;activity_type:string;note:string|null;created_at:string}>>>({})
  const [loadingTimeline, setLoadingTimeline] = useState<string | null>(null)
  const [noteInput, setNoteInput] = useState<Record<string, string>>({})
  const [form, setForm] = useState<AddForm>({
    name: '', channel: 'WhatsApp', handle: '', status: 'prospect', notes: '', next_followup_at: '',
  })

  const filtered = contacts.filter(c => {
    if (filter !== 'all' && c.status !== filter) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) &&
        !(c.handle || '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const counts: Record<string, number> = { all: contacts.length }
  for (const s of STATUSES) counts[s] = contacts.filter(c => c.status === s).length

  async function addContact() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/genx/toolkit/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          channel: form.channel,
          handle: form.handle || null,
          status: form.status,
          notes: form.notes || null,
          next_followup_at: form.next_followup_at || null,
        }),
      })
      const data = await res.json()
      if (data.contact) setContacts(prev => [data.contact, ...prev])
      setShowAdd(false)
      setForm({ name: '', channel: 'WhatsApp', handle: '', status: 'prospect', notes: '', next_followup_at: '' })
    } catch (e) {
      console.error('addContact error:', e)
    }
    setSaving(false)
  }

  async function updateStatus(id: string, status: string) {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, status, updated_at: new Date().toISOString() } : c))
    await fetch(`/api/genx/toolkit/contacts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(e => console.error('updateStatus error:', e))
  }

  async function archiveContact(id: string) {
    setContacts(prev => prev.filter(c => c.id !== id))
    await fetch(`/api/genx/toolkit/contacts/${id}`, { method: 'DELETE' })
      .catch(e => console.error('archiveContact error:', e))
    if (expanded === id) setExpanded(null)
  }

  async function loadTimeline(id: string) {
    if (timeline[id]) return
    setLoadingTimeline(id)
    try {
      const res = await fetch(`/api/genx/toolkit/contacts/${id}/timeline`)
      const data = await res.json()
      setTimeline(prev => ({ ...prev, [id]: data.activities || [] }))
    } catch (e) {
      console.error('loadTimeline error:', e)
    }
    setLoadingTimeline(null)
  }

  async function logActivity(id: string, type: string, note?: string) {
    try {
      const res = await fetch(`/api/genx/toolkit/contacts/${id}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity_type: type, note: note || null }),
      })
      const data = await res.json()
      if (data.activity) {
        setTimeline(prev => ({ ...prev, [id]: [data.activity, ...(prev[id] || [])] }))
        setContacts(prev => prev.map(c =>
          c.id === id ? { ...c, last_contacted_at: new Date().toISOString(), updated_at: new Date().toISOString() } : c
        ))
      }
      setNoteInput(prev => ({ ...prev, [id]: '' }))
    } catch (e) {
      console.error('logActivity error:', e)
    }
  }

  async function toggleExpand(id: string) {
    if (expanded === id) {
      setExpanded(null)
    } else {
      setExpanded(id)
      await loadTimeline(id)
    }
  }

  const mono = { fontFamily: "'JetBrains Mono', monospace" }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['all', ...STATUSES] as const).map(s => (
            <button key={s} onClick={() => setFilter(s as string)} style={{
              background: filter === s ? '#FFFFFF' : '#141414',
              color: filter === s ? '#0A0A0A' : '#555555',
              border: '1px solid ' + (filter === s ? '#FFFFFF' : '#1F1F1F'),
              borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
              textTransform: 'capitalize',
            }}>
              {s} {counts[s] !== undefined ? <span style={{ ...mono, opacity: 0.6 }}>({counts[s]})</span> : null}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            placeholder="Search contacts…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 6, padding: '7px 12px', color: '#FFFFFF', fontSize: 12, outline: 'none', width: 180 }}
          />
          <button onClick={() => setShowAdd(!showAdd)} style={S.btn as React.CSSProperties}>
            + Add
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Name *</label>
              <input style={S.input as React.CSSProperties} placeholder="Contact name" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Channel</label>
              <select style={S.input as React.CSSProperties} value={form.channel} onChange={e => setForm(p => ({...p, channel: e.target.value}))}>
                {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Handle / phone</label>
              <input style={S.input as React.CSSProperties} placeholder="@username or number" value={form.handle} onChange={e => setForm(p => ({...p, handle: e.target.value}))} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Status</label>
              <select style={S.input as React.CSSProperties} value={form.status} onChange={e => setForm(p => ({...p, status: e.target.value}))}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Follow-up date</label>
              <input type="date" style={S.input as React.CSSProperties} value={form.next_followup_at} onChange={e => setForm(p => ({...p, next_followup_at: e.target.value}))} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Notes</label>
              <input style={S.input as React.CSSProperties} placeholder="Optional" value={form.notes} onChange={e => setForm(p => ({...p, notes: e.target.value}))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addContact} disabled={saving || !form.name.trim()} style={{ ...(S.btn as React.CSSProperties), opacity: !form.name.trim() ? 0.4 : 1 }}>Save</button>
            <button onClick={() => setShowAdd(false)} style={S.btnGhost as React.CSSProperties}>Cancel</button>
          </div>
        </div>
      )}

      {/* Contact list */}
      <div style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#555555', fontSize: 13 }}>
            {contacts.length === 0 ? 'No contacts yet. Add your first prospect.' : 'No contacts match the current filter.'}
          </div>
        ) : (
          filtered.map((c, i) => {
            const isOpen = expanded === c.id
            const overdue = c.next_followup_at && new Date(c.next_followup_at) < new Date()
            return (
              <div key={c.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #1F1F1F' : 'none', borderLeft: `3px solid ${STATUS_BORDER[c.status] || '#333'}` }}>
                {/* Row */}
                <div
                  onClick={() => toggleExpand(c.id)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', gap: 12 }}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                    <span style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: '#555555', flexShrink: 0 }}>{c.channel}</span>
                    {c.is_starred && <span style={{ fontSize: 11, color: '#F59E0B' }}>★</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
                    {c.next_followup_at && (
                      <span style={{ ...mono, fontSize: 11, color: overdue ? '#EF4444' : '#888888' }}>
                        {daysUntil(c.next_followup_at)}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: STATUS_COLORS[c.status] || '#555555', textTransform: 'capitalize', fontWeight: 500 }}>{c.status}</span>
                    <span style={{ ...mono, fontSize: 11, color: '#555555' }}>{relTime(c.last_contacted_at)}</span>
                    <span style={{ color: '#555555', fontSize: 12 }}>{isOpen ? '−' : '+'}</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div style={{ padding: '0 16px 16px', borderTop: '1px solid #0F0F0F' }}>
                    {c.handle && <div style={{ fontSize: 12, color: '#888888', marginBottom: 6, marginTop: 10 }}>{c.handle}</div>}
                    {c.notes && <div style={{ fontSize: 12, color: '#888888', marginBottom: 10 }}>{c.notes}</div>}

                    {/* Status buttons */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, marginTop: c.handle || c.notes ? 0 : 12 }}>
                      {STATUSES.map(s => (
                        <button key={s} onClick={e => { e.stopPropagation(); updateStatus(c.id, s) }} style={{
                          background: c.status === s ? '#FFFFFF' : '#0A0A0A',
                          color: c.status === s ? '#0A0A0A' : '#888888',
                          border: '1px solid ' + (c.status === s ? '#FFFFFF' : '#1F1F1F'),
                          borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer', textTransform: 'capitalize',
                        }}>{s}</button>
                      ))}
                      <button onClick={e => { e.stopPropagation(); archiveContact(c.id) }} style={{
                        background: '#0A0A0A', color: '#EF4444', border: '1px solid #1F1F1F',
                        borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer', marginLeft: 'auto',
                      }}>Archive</button>
                    </div>

                    {/* Log activity */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                      <input
                        placeholder="Log a note…"
                        value={noteInput[c.id] || ''}
                        onChange={e => setNoteInput(prev => ({...prev, [c.id]: e.target.value}))}
                        onClick={e => e.stopPropagation()}
                        style={{ flex: 1, minWidth: 160, background: '#0A0A0A', border: '1px solid #1F1F1F', borderRadius: 6, padding: '7px 10px', color: '#FFFFFF', fontSize: 12, outline: 'none' }}
                      />
                      {(['dm_sent','call','follow_up','replied','objection'] as const).map(type => (
                        <button key={type} onClick={e => { e.stopPropagation(); logActivity(c.id, type, noteInput[c.id]) }} style={{
                          background: '#0A0A0A', border: '1px solid #1F1F1F', borderRadius: 4, padding: '6px 10px',
                          fontSize: 10, color: '#888888', cursor: 'pointer', letterSpacing: '0.04em',
                        }}>{type.replace('_', ' ')}</button>
                      ))}
                    </div>

                    {/* Timeline */}
                    {loadingTimeline === c.id ? (
                      <div style={{ fontSize: 12, color: '#555555', padding: '8px 0' }}>Loading…</div>
                    ) : (timeline[c.id] || []).length > 0 ? (
                      <div style={{ borderLeft: '1px solid #1F1F1F', marginLeft: 6, paddingLeft: 12 }}>
                        {(timeline[c.id] || []).map(a => (
                          <div key={a.id} style={{ marginBottom: 10 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: '#FFFFFF', textTransform: 'capitalize' }}>{a.activity_type.replace('_', ' ')}</span>
                              <span style={{ ...mono, fontSize: 10, color: '#555555' }}>
                                {new Date(a.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            {a.note && <div style={{ fontSize: 11, color: '#888888', marginTop: 2 }}>{a.note}</div>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: '#555555' }}>No activity yet — log your first contact above.</div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
